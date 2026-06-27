import os
import orjson
import logging
import re
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    TelemetryLog,
    Device,
    DeviceSetting,
    DeviceSession,
    DeviceLatest,
    TelemetrySummary1Min,
)

load_dotenv()

logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# Parse DEVICE_IDS untuk subscribe
DEVICE_IDS = [
    d.strip()
    for d in os.getenv("DEVICE_ID", "FAN-001").split(",")
    if d.strip()
]

# Parse allowed devices whitelist - support both exact match dan pattern
allowed_devices_str = os.getenv("ALLOWED_DEVICES", "FAN-*")
ALLOWED_DEVICES = {d.strip() for d in allowed_devices_str.split(",") if d.strip()}

logger.info(f"Allowed devices: {ALLOWED_DEVICES}")

def is_device_allowed(device_id: str) -> bool:
    """
    Check if device_id is allowed.
    Supports:
    - Exact match: "FAN-001"
    - Pattern match: "FAN-*" (matches FAN-001, FAN-02, FAN-ABC, etc)
    
    Examples:
    - ALLOWED_DEVICES = {"FAN-*"} → allows FAN-001, FAN-02, FAN-ABC
    - ALLOWED_DEVICES = {"FAN-*", "PUMP-001"} → allows FAN-XX and PUMP-001
    - ALLOWED_DEVICES = {"FAN-001", "FAN-002"} → exact match only
    """
    # 1. Exact match
    if device_id in ALLOWED_DEVICES:
        return True
    
    # 2. Pattern match dengan wildcard (*)
    for pattern in ALLOWED_DEVICES:
        if "*" in pattern:
            # Convert pattern to regex: FAN-* becomes ^FAN-.*$
            regex_pattern = pattern.replace(".", r"\.")  # Escape dots
            regex_pattern = regex_pattern.replace("*", ".*")
            regex_pattern = f"^{regex_pattern}$"
            
            if re.match(regex_pattern, device_id):
                logger.debug(f"Device {device_id} matched pattern {pattern}")
                return True
    
    logger.warning(f"Device {device_id} not in whitelist")
    return False

RAW_SAVE_INTERVAL_SECONDS = 10
RAW_RETENTION_DAYS = 3
SUMMARY_RETENTION_DAYS = 365

last_raw_save_by_device = {}

# ThreadPoolExecutor to handle database updates in the background, preventing MQTT callback lag
db_executor = ThreadPoolExecutor(max_workers=1)

mqtt_client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION1,
    client_id="fastapi-backend-iot-fan"
)

def mqtt_is_connected() -> bool:
    """Cek apakah MQTT client sedang terhubung ke broker."""
    return mqtt_client.is_connected()


def publish_command(device_id: str, payload: dict,
                    max_retries: int = 6, retry_delay: float = 0.5):
    """
    Publish command ke device via MQTT dengan retry otomatis.

    Jika MQTT sedang reconnect, fungsi ini menunggu sampai connected
    sebelum mengirim (max_retries x retry_delay = 3 detik default).
    QoS 1 dipakai agar broker menjamin at-least-once delivery ke device.

    Raises RuntimeError jika koneksi tidak tersedia setelah semua retry habis.
    """
    topic = f"device/{device_id}/command"
    message = orjson.dumps(payload).decode()

    # Tunggu sampai MQTT connected, maksimal max_retries kali
    for attempt in range(1, max_retries + 1):
        if mqtt_client.is_connected():
            break
        logger.warning(
            f"[CMD] MQTT not connected, waiting... "
            f"(attempt {attempt}/{max_retries})"
        )
        time.sleep(retry_delay)
    else:
        # Semua retry habis dan masih belum connected
        logger.error(f"[CMD] Gagal kirim command ke {device_id}: MQTT tidak connected setelah {max_retries} retry")
        raise RuntimeError("MQTT broker tidak terhubung. Command tidak terkirim.")

    # Publish dengan QoS 1 = at-least-once delivery ke broker
    result = mqtt_client.publish(topic, message, qos=1)

    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        logger.error(f"[CMD] Publish GAGAL ke {topic} — rc={result.rc}: {message}")
        raise RuntimeError(f"MQTT publish gagal (rc={result.rc})")

    logger.info(f"[CMD] OK → {topic}: {message}")
    return result


def upsert_device(db: Session, data: dict):
    device_id = data.get("device_id")

    device = db.query(Device).filter(Device.device_id == device_id).first()

    if not device:
        device = Device(
            device_id=device_id,
            device_name=device_id
        )
        db.add(device)

    ip = data.get("ip_address")
    status = data.get("mqtt_status", "connected")
    rssi = data.get("wifi_rssi")
    now = datetime.now(timezone.utc)

    last_seen_diff = 9999
    if device.last_seen:
        last_seen = device.last_seen
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        last_seen_diff = (now - last_seen).total_seconds()

    # Only update if there are changes or if last_seen is older than 60s
    if (device.ip_address != ip or
        device.mqtt_status != status or
        device.wifi_rssi != rssi or
        last_seen_diff > 60):
        device.ip_address = ip
        device.mqtt_status = status
        device.wifi_rssi = rssi
        device.last_seen = now

    return device


def upsert_setting(db: Session, data: dict):
    device_id = data.get("device_id")

    setting = db.query(DeviceSetting).filter(DeviceSetting.device_id == device_id).first()

    if not setting:
        setting = DeviceSetting(device_id=device_id)
        db.add(setting)

    mode = data.get("mode", setting.mode)
    setpoint_on = data.get("setpoint_on", setting.setpoint_on)
    setpoint_off = data.get("setpoint_off", setting.setpoint_off)
    manual_fan_status = data.get("manual_fan_status", setting.manual_fan_status)
    manual_alarm_status = data.get("manual_alarm_status", setting.manual_alarm_status)
    manual_timer_seconds = data.get("manual_timer_seconds", setting.manual_timer_seconds)

    # Only update if settings reported from device are different
    if (setting.mode != mode or
        setting.setpoint_on != setpoint_on or
        setting.setpoint_off != setpoint_off or
        setting.manual_fan_status != manual_fan_status or
        setting.manual_alarm_status != manual_alarm_status or
        setting.manual_timer_seconds != manual_timer_seconds):
        
        setting.mode = mode
        setting.setpoint_on = setpoint_on
        setting.setpoint_off = setpoint_off
        setting.manual_fan_status = manual_fan_status
        setting.manual_alarm_status = manual_alarm_status
        setting.manual_timer_seconds = manual_timer_seconds

    return setting


def upsert_session(db: Session, data: dict):
    device_id = data.get("device_id")

    session = (
        db.query(DeviceSession)
        .filter(DeviceSession.device_id == device_id)
        .order_by(DeviceSession.id.desc())
        .first()
    )

    if not session:
        session = DeviceSession(device_id=device_id)
        db.add(session)

    ip = data.get("ip_address")
    status = "connected"
    mqtt_status = data.get("mqtt_status", "connected")
    rssi = data.get("wifi_rssi")
    now = datetime.now(timezone.utc)

    last_seen_diff = 9999
    if session.last_seen:
        last_seen = session.last_seen
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        last_seen_diff = (now - last_seen).total_seconds()

    # Only update session if connection metadata changed or older than 60s
    if (session.ip_address != ip or
        session.status != status or
        session.mqtt_status != mqtt_status or
        session.wifi_rssi != rssi or
        last_seen_diff > 60):
        
        session.ip_address = ip
        session.status = status
        session.mqtt_status = mqtt_status
        session.wifi_rssi = rssi
        session.last_seen = now

    return session

def upsert_device_latest(db: Session, data: dict, existing_latest=None, is_retained: bool = False):
    device_id = data.get("device_id")

    latest = existing_latest
    if not latest:
        latest = db.query(DeviceLatest).filter(DeviceLatest.device_id == device_id).first()

    if not latest:
        latest = DeviceLatest(device_id=device_id)
        db.add(latest)

    latest.temperature = data.get("temperature")
    latest.humidity = data.get("humidity")

    latest.fan_status = data.get("fan_status", False)
    latest.alarm_status = data.get("alarm_status", False)
    latest.mode = data.get("mode", "AUTO")

    latest.setpoint_on = data.get("setpoint_on", 36.0)
    latest.setpoint_off = data.get("setpoint_off", 35.0)

    latest.manual_fan_status = data.get("manual_fan_status", False)
    latest.manual_alarm_status = data.get("manual_alarm_status", False)

    latest.manual_timer_seconds = data.get("manual_timer_seconds", 0)
    latest.manual_timer_active = data.get("manual_timer_active", False)
    latest.timer_remaining_seconds = data.get("timer_remaining_seconds", 0)

    latest.fan_runtime_seconds = data.get("fan_runtime", data.get("fan_runtime_seconds", 0))
    latest.fan_runtime_text = data.get("fan_runtime_text")

    latest.ip_address = data.get("ip_address")
    latest.wifi_rssi = data.get("wifi_rssi")
    latest.mqtt_status = data.get("mqtt_status", "connected")
    latest.uptime_seconds = data.get("uptime", data.get("uptime_seconds", 0))

    latest.free_heap = data.get("free_heap")
    latest.restart_reason = data.get("restart_reason")

    # Only advance updated_at for FRESH messages (not retained/replayed broker messages)
    if not is_retained:
        latest.updated_at = datetime.now(timezone.utc)

    return latest

def should_save_raw(device_id: str):
    now = datetime.now(timezone.utc)
    last_save = last_raw_save_by_device.get(device_id)

    if not last_save:
        last_raw_save_by_device[device_id] = now
        return True

    diff_seconds = (now - last_save).total_seconds()

    if diff_seconds >= RAW_SAVE_INTERVAL_SECONDS:
        last_raw_save_by_device[device_id] = now
        return True

    return False

def get_minute_bucket(dt: datetime):
    return dt.replace(second=0, microsecond=0)


def update_summary_1min(db: Session, data: dict):
    device_id = data.get("device_id")
    now = datetime.now(timezone.utc)
    bucket_time = get_minute_bucket(now)

    summary = (
        db.query(TelemetrySummary1Min)
        .filter(
            TelemetrySummary1Min.device_id == device_id,
            TelemetrySummary1Min.bucket_time == bucket_time
        )
        .first()
    )

    temperature = data.get("temperature")
    humidity = data.get("humidity")
    fan_status = data.get("fan_status", False)
    alarm_status = data.get("alarm_status", False)
    mode = data.get("mode", "AUTO")

    if summary is None:
        summary = TelemetrySummary1Min(
            device_id=device_id,
            bucket_time=bucket_time,
            avg_temperature=temperature,
            min_temperature=temperature,
            max_temperature=temperature,
            avg_humidity=humidity,
            min_humidity=humidity,
            max_humidity=humidity,
            fan_on_count=1 if fan_status else 0,
            alarm_on_count=1 if alarm_status else 0,
            total_samples=1,
            mode=mode,
        )
        db.add(summary)
        return summary

    old_count = summary.total_samples or 0
    new_count = old_count + 1

    if temperature is not None:
        if summary.avg_temperature is None:
            summary.avg_temperature = temperature
            summary.min_temperature = temperature
            summary.max_temperature = temperature
        else:
            summary.avg_temperature = ((summary.avg_temperature * old_count) + temperature) / new_count
            summary.min_temperature = min(summary.min_temperature, temperature)
            summary.max_temperature = max(summary.max_temperature, temperature)

    if humidity is not None:
        if summary.avg_humidity is None:
            summary.avg_humidity = humidity
            summary.min_humidity = humidity
            summary.max_humidity = humidity
        else:
            summary.avg_humidity = ((summary.avg_humidity * old_count) + humidity) / new_count
            summary.min_humidity = min(summary.min_humidity, humidity)
            summary.max_humidity = max(summary.max_humidity, humidity)

    summary.fan_on_count = (summary.fan_on_count or 0) + (1 if fan_status else 0)
    summary.alarm_on_count = (summary.alarm_on_count or 0) + (1 if alarm_status else 0)
    summary.total_samples = new_count
    summary.mode = mode

    return summary

def save_telemetry(data: dict):
    db = SessionLocal()

    try:
        device_id = data.get("device_id")
        incoming_uptime = data.get("uptime", data.get("uptime_seconds", -1))

        # Detect retained/replayed MQTT messages: same uptime means ESP32 hasn't rebooted
        # and the broker is just replaying the last stored message
        existing = db.query(DeviceLatest).filter(DeviceLatest.device_id == device_id).first()
        is_retained = (
            existing is not None
            and existing.uptime_seconds is not None
            and incoming_uptime >= 0
            and int(incoming_uptime) == int(existing.uptime_seconds)
        )

        if is_retained:
            logger.info(f"Retained/stale message detected for {device_id} (uptime={incoming_uptime} unchanged) — skip updating updated_at")

        # 1. Selalu update latest untuk realtime dashboard (reuse existing to avoid query)
        upsert_device_latest(db, data, existing_latest=existing, is_retained=is_retained)

        # 2. Selalu update metadata device, setting, session
        upsert_device(db, data)
        upsert_setting(db, data)
        upsert_session(db, data)

        # 3. Selalu update summary 1 menit untuk graph (skip if retained to avoid polluting stats)
        if not is_retained:
            update_summary_1min(db, data)

        # 4. Raw data hanya disimpan tiap 10 detik dan jika bukan retained
        if not is_retained and should_save_raw(device_id):
            log = TelemetryLog(
                device_id=device_id,
                temperature=data.get("temperature"),
                humidity=data.get("humidity"),

                fan_status=data.get("fan_status", False),
                alarm_status=data.get("alarm_status", False),
                mode=data.get("mode", "AUTO"),

                setpoint_on=data.get("setpoint_on", 36.0),
                setpoint_off=data.get("setpoint_off", 35.0),

                manual_fan_status=data.get("manual_fan_status", False),
                manual_alarm_status=data.get("manual_alarm_status", False),

                manual_timer_seconds=data.get("manual_timer_seconds", 0),
                manual_timer_active=data.get("manual_timer_active", False),
                timer_remaining_seconds=data.get("timer_remaining_seconds", 0),

                fan_runtime_seconds=data.get("fan_runtime", data.get("fan_runtime_seconds", 0)),
                fan_runtime_text=data.get("fan_runtime_text"),

                ip_address=data.get("ip_address"),
                wifi_rssi=data.get("wifi_rssi"),
                mqtt_status=data.get("mqtt_status", "connected"),
                uptime_seconds=data.get("uptime", data.get("uptime_seconds", 0)),
            )

            db.add(log)
            logger.info(f"Raw telemetry saved from {device_id}")
        elif is_retained:
            logger.info(f"Retained message from {device_id} — skipped raw + summary save")
        else:
            logger.info(f"Raw skipped (interval). Latest and summary updated from {device_id}")

        db.commit()

    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to save telemetry: {e}")

    finally:
        db.close()


def save_status(data: dict):
    db = SessionLocal()

    try:
        device_id = data.get("device_id")
        raw_status = data.get("status", "online")
        # Normalize to mqtt_status field values
        mqtt_status = "offline" if raw_status == "offline" else "connected"

        # Build a normalized data dict for upsert_device
        device_data = {**data, "mqtt_status": mqtt_status}

        upsert_device(db, device_data)
        upsert_session(db, device_data)

        # CRITICAL: also update DeviceLatest.mqtt_status so the
        # realtime API reflects the correct online/offline state
        latest = db.query(DeviceLatest).filter(DeviceLatest.device_id == device_id).first()
        if latest:
            latest.mqtt_status = mqtt_status
            # If going offline, do NOT advance updated_at so the 5-min
            # offline clock keeps ticking from the last real telemetry

        db.commit()
        logger.info(f"Status saved for {device_id}: {mqtt_status}")

        # === BIRTH CERTIFICATE SYNC ===
        # Saat device muncul online, kirim setpoint & mode terakhir dari DB
        # agar ESP32 tidak pakai nilai default setelah restart
        if raw_status == "online":
            from models import DeviceSetting
            setting = db.query(DeviceSetting).filter(DeviceSetting.device_id == device_id).first()
            if setting:
                try:
                    sync_payload = {
                        "setpoint_on":  setting.setpoint_on,
                        "setpoint_off": setting.setpoint_off,
                        "mode":         setting.mode,
                    }
                    publish_command(device_id, sync_payload)
                    logger.info(
                        f"[BIRTH SYNC] Sent settings to {device_id}: "
                        f"setpoint_on={setting.setpoint_on}, "
                        f"setpoint_off={setting.setpoint_off}, "
                        f"mode={setting.mode}"
                    )
                except Exception as sync_err:
                    logger.warning(f"[BIRTH SYNC] Failed to sync settings to {device_id}: {sync_err}")

    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to save status: {e}")

    finally:
        db.close()



def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("MQTT connected")

        for device_id in DEVICE_IDS:
            telemetry_topic = f"device/{device_id}/telemetry"
            status_topic = f"device/{device_id}/status"

            client.subscribe(telemetry_topic)
            client.subscribe(status_topic)

            logger.info(f"Subscribed to {telemetry_topic}")
            logger.info(f"Subscribed to {status_topic}")

    else:
        logger.error(f"MQTT failed to connect. rc={rc}")

def on_message(client, userdata, msg):
    try:
        # 1. Ekstrak device_id dari topik MQTT terlebih dahulu (Single Source of Truth)
        parts = msg.topic.split('/')
        if len(parts) != 3 or parts[0] != "device":
            logger.warning(f"Ignored invalid topic structure: {msg.topic}")
            return
            
        device_id = parts[1]
        sub_topic = parts[2]
        
        # 2. Cek apakah device_id terdaftar di whitelist (ALLOWED_DEVICES) dengan pattern matching
        if not is_device_allowed(device_id):
            logger.warning(f"Unauthorized access attempt blocked from device: {device_id}")
            return  # Langsung hentikan proses, abaikan payload-nya

        # 3. Jika authorized, baru decode payload JSON
        payload = msg.payload.decode()
        logger.info(f"MQTT message from authorized device {device_id} ({sub_topic}): {payload}")
        
        data = orjson.loads(payload)

        # 4. Paksa device_id di dalam data menggunakan device_id yang valid dari topik
        data["device_id"] = device_id

        # 5. Proses data secara asynchronous di background worker thread agar MQTT thread tidak terblokir
        if sub_topic == "telemetry":
            db_executor.submit(save_telemetry, data)
        elif sub_topic == "status":
            db_executor.submit(save_status, data)

    except orjson.JSONDecodeError:
        logger.error(f"Failed to decode JSON payload from topic {msg.topic}")
    except Exception as e:
        logger.exception(f"Failed to process MQTT message: {e}")

def cleanup_old_raw_data():
    db = SessionLocal()

    try:
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=RAW_RETENTION_DAYS)

        deleted = (
            db.query(TelemetryLog)
            .filter(TelemetryLog.created_at < cutoff)
            .delete()
        )

        db.commit()
        logger.info(f"Cleanup raw telemetry done. Deleted rows: {deleted}")

    except Exception as e:
        db.rollback()
        logger.exception(f"Cleanup raw telemetry failed: {e}")

    finally:
        db.close()


def cleanup_old_summary_data():
    db = SessionLocal()

    try:
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=SUMMARY_RETENTION_DAYS)

        deleted = (
            db.query(TelemetrySummary1Min)
            .filter(TelemetrySummary1Min.bucket_time < cutoff)
            .delete()
        )

        db.commit()
        logger.info(f"Cleanup summary telemetry done. Deleted rows: {deleted}")

    except Exception as e:
        db.rollback()
        logger.exception(f"Cleanup summary telemetry failed: {e}")

    finally:
        db.close()
        
def on_disconnect(client, userdata, rc):
    if rc != 0:
        logger.warning(f"MQTT unexpected disconnect (rc={rc}). Will auto-reconnect via loop_start.")
    else:
        logger.info("MQTT disconnected cleanly.")


def start_mqtt():
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.on_disconnect = on_disconnect

    # reconnect_delay_set: mulai dari 1 detik, max 30 detik, otomatis retry
    mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)

    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    logger.info(f"MQTT loop started on {MQTT_BROKER}:{MQTT_PORT}")