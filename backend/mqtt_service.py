import os
import json
import logging
from datetime import datetime, timezone

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
import os

DEVICE_IDS = [
    d.strip()
    for d in os.getenv("DEVICE_ID", "FAN-001").split(",")
    if d.strip()
]
load_dotenv()

logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
DEVICE_ID = os.getenv("DEVICE_ID", "FAN-001")

# Parse allowed devices whitelist
allowed_devices_str = os.getenv("ALLOWED_DEVICES", "FAN-001")
ALLOWED_DEVICES = {d.strip() for d in allowed_devices_str.split(",") if d.strip()}

TOPIC_TELEMETRY = f"device/{DEVICE_ID}/telemetry"
TOPIC_STATUS = f"device/{DEVICE_ID}/status"
TOPIC_COMMAND = f"device/{DEVICE_ID}/command"

RAW_SAVE_INTERVAL_SECONDS = 10
RAW_RETENTION_DAYS = 3
SUMMARY_RETENTION_DAYS = 365

last_raw_save_by_device = {}

mqtt_client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION1,
    client_id="fastapi-backend-iot-fan"
)


def publish_command(device_id: str, payload: dict):
    topic = f"device/{device_id}/command"
    message = json.dumps(payload)
    result = mqtt_client.publish(topic, message)
    logger.info(f"Publish command to {topic}: {message}")
    return result


def upsert_device(db: Session, data: dict):
    device_id = data.get("device_id", DEVICE_ID)

    device = db.query(Device).filter(Device.device_id == device_id).first()

    if not device:
        device = Device(
            device_id=device_id,
            device_name=device_id
        )
        db.add(device)

    device.ip_address = data.get("ip_address")
    device.mqtt_status = data.get("mqtt_status", "connected")
    device.wifi_rssi = data.get("wifi_rssi")
    device.last_seen = datetime.now(timezone.utc)

    return device


def upsert_setting(db: Session, data: dict):
    device_id = data.get("device_id", DEVICE_ID)

    setting = db.query(DeviceSetting).filter(DeviceSetting.device_id == device_id).first()

    if not setting:
        setting = DeviceSetting(device_id=device_id)
        db.add(setting)

    setting.mode = data.get("mode", setting.mode)
    setting.setpoint_on = data.get("setpoint_on", setting.setpoint_on)
    setting.setpoint_off = data.get("setpoint_off", setting.setpoint_off)
    setting.manual_fan_status = data.get("manual_fan_status", setting.manual_fan_status)
    setting.manual_alarm_status = data.get("manual_alarm_status", setting.manual_alarm_status)
    setting.manual_timer_seconds = data.get("manual_timer_seconds", setting.manual_timer_seconds)

    return setting


def upsert_session(db: Session, data: dict):
    device_id = data.get("device_id", DEVICE_ID)

    session = (
        db.query(DeviceSession)
        .filter(DeviceSession.device_id == device_id)
        .order_by(DeviceSession.id.desc())
        .first()
    )

    if not session:
        session = DeviceSession(device_id=device_id)
        db.add(session)

    session.ip_address = data.get("ip_address")
    session.status = "connected"
    session.mqtt_status = data.get("mqtt_status", "connected")
    session.wifi_rssi = data.get("wifi_rssi")
    session.last_seen = datetime.now(timezone.utc)

    return session

def upsert_device_latest(db: Session, data: dict):
    device_id = data.get("device_id", DEVICE_ID)

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

    latest.fan_runtime_seconds = data.get("fan_runtime_seconds", 0)
    latest.fan_runtime_text = data.get("fan_runtime_text")

    latest.ip_address = data.get("ip_address")
    latest.wifi_rssi = data.get("wifi_rssi")
    latest.mqtt_status = data.get("mqtt_status", "connected")
    latest.uptime_seconds = data.get("uptime_seconds", 0)

    latest.free_heap = data.get("free_heap")
    latest.restart_reason = data.get("restart_reason")

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
    device_id = data.get("device_id", DEVICE_ID)
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
        device_id = data.get("device_id", DEVICE_ID)

        # 1. Selalu update latest untuk realtime dashboard
        upsert_device_latest(db, data)

        # 2. Selalu update metadata device, setting, session
        upsert_device(db, data)
        upsert_setting(db, data)
        upsert_session(db, data)

        # 3. Selalu update summary 1 menit untuk graph
        update_summary_1min(db, data)

        # 4. Raw data hanya disimpan tiap 10 detik
        if should_save_raw(device_id):
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

                fan_runtime_seconds=data.get("fan_runtime_seconds", 0),
                fan_runtime_text=data.get("fan_runtime_text"),

                ip_address=data.get("ip_address"),
                wifi_rssi=data.get("wifi_rssi"),
                mqtt_status=data.get("mqtt_status", "connected"),
                uptime_seconds=data.get("uptime_seconds", 0),
            )

            db.add(log)
            logger.info(f"Raw telemetry saved from {device_id}")
        else:
            logger.info(f"Raw skipped. Latest and summary updated from {device_id}")

        db.commit()

    except Exception as e:
        db.rollback()
        logger.exception(f"Failed to save telemetry: {e}")

    finally:
        db.close()


def save_status(data: dict):
    db = SessionLocal()

    try:
        upsert_device(db, data)
        upsert_session(db, data)
        db.commit()

        logger.info(f"Status saved: {data}")

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
        
        # 2. Cek apakah device_id terdaftar di whitelist (ALLOWED_DEVICES)
        if device_id not in ALLOWED_DEVICES:
            logger.warning(f"Unauthorized access attempt blocked from device: {device_id}")
            return  # Langsung hentikan proses, abaikan payload-nya

        # 3. Jika authorized, baru decode payload JSON
        payload = msg.payload.decode()
        logger.info(f"MQTT message from authorized device {device_id} ({sub_topic}): {payload}")
        
        data = json.loads(payload)

        # 4. Paksa device_id di dalam data menggunakan device_id yang valid dari topik
        data["device_id"] = device_id

        # 5. Proses data berdasarkan sub-topik
        if sub_topic == "telemetry":
            save_telemetry(data)
        elif sub_topic == "status":
            save_status(data)

    except json.JSONDecodeError:
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
        
def start_mqtt():
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    logger.info(f"MQTT loop started on {MQTT_BROKER}:{MQTT_PORT}")