from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DeviceLatest, DeviceSetting
from datetime import datetime, timezone
router = APIRouter(prefix="/api/realtime", tags=["Realtime"])


@router.get("/{device_id}")
def get_realtime(device_id: str, db: Session = Depends(get_db)):
    latest = (
        db.query(DeviceLatest)
        .filter(DeviceLatest.device_id == device_id)
        .first()
    )

    if not latest:
        raise HTTPException(status_code=404, detail="No latest data found")

    # ===== OFFLINE CHECK =====
    # A device is considered offline if:
    #   1. mqtt_status is explicitly "offline" (device sent a will/disconnect message), OR
    #   2. No fresh telemetry has been received for > 90 seconds
    offline = False
    age_seconds = 9999

    if latest.updated_at:
        now_utc = datetime.now(timezone.utc)
        updated = latest.updated_at
        # Ensure both are tz-aware for comparison
        if updated.tzinfo is None:
            from datetime import timezone as tz
            updated = updated.replace(tzinfo=tz.utc)
        age_seconds = (now_utc - updated).total_seconds()

    if latest.mqtt_status == "offline":
        offline = True
    elif age_seconds > 90:
        offline = True

    return {
        "device_id": latest.device_id,
        "temperature": latest.temperature,
        "humidity": latest.humidity,
        "fan_status": latest.fan_status,
        "alarm_status": latest.alarm_status,
        "mode": latest.mode,
        "setpoint_on": latest.setpoint_on,
        "setpoint_off": latest.setpoint_off,
        "manual_fan_status": latest.manual_fan_status,
        "manual_alarm_status": latest.manual_alarm_status,
        "manual_timer_seconds": latest.manual_timer_seconds,
        "manual_timer_active": latest.manual_timer_active,
        "timer_remaining_seconds": latest.timer_remaining_seconds,
        "fan_runtime_seconds": latest.fan_runtime_seconds,
        "fan_runtime_text": latest.fan_runtime_text,
        "ip_address": latest.ip_address,
        "wifi_rssi": latest.wifi_rssi,
        "mqtt_status": latest.mqtt_status,
        "uptime_seconds": latest.uptime_seconds,
        "free_heap": latest.free_heap,
        "restart_reason": latest.restart_reason,
        "updated_at": latest.updated_at,

        # tambahan
        "offline": offline,
        "last_seen_seconds": int(age_seconds),
    }


@router.get("/{device_id}/settings")
def get_device_settings(device_id: str, db: Session = Depends(get_db)):
    setting = (
        db.query(DeviceSetting)
        .filter(DeviceSetting.device_id == device_id)
        .first()
    )

    if not setting:
        raise HTTPException(status_code=404, detail="No setting found")

    return {
        "device_id": setting.device_id,
        "mode": setting.mode,
        "setpoint_on": setting.setpoint_on,
        "setpoint_off": setting.setpoint_off,
        "manual_fan_status": setting.manual_fan_status,
        "manual_alarm_status": setting.manual_alarm_status,
        "manual_timer_seconds": setting.manual_timer_seconds,
        "updated_at": setting.updated_at,
    }