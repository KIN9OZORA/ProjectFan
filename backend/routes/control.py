from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import logging

from database import get_db, SessionLocal
from models import DeviceSetting
from schemas import ModeRequest, FanRequest, AlarmRequest, SetpointRequest, TimerRequest
from mqtt_service import publish_command, cleanup_old_raw_data, cleanup_old_summary_data

router = APIRouter(prefix="/api/device", tags=["Control"])

logger = logging.getLogger(__name__)


def get_or_create_setting(db: Session, device_id: str):
    setting = db.query(DeviceSetting).filter(DeviceSetting.device_id == device_id).first()

    if not setting:
        setting = DeviceSetting(device_id=device_id)
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


def update_db_setting_task(device_id: str, updates: dict):
    db = SessionLocal()
    try:
        setting = get_or_create_setting(db, device_id)
        for key, val in updates.items():
            setattr(setting, key, val)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception(f"Background settings update failed: {e}")
    finally:
        db.close()


@router.post("/{device_id}/mode")
def set_mode(device_id: str, request: ModeRequest, background_tasks: BackgroundTasks):
    mode = request.mode.upper()

    if mode not in ["AUTO", "MANUAL"]:
        raise HTTPException(status_code=400, detail="Mode must be AUTO or MANUAL")

    try:
        # 1. Publish command immediately to MQTT for maximum speed
        publish_command(device_id, {
            "command": "SET_MODE",
            "mode": mode
        })
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 2. Update database asynchronously in background task
    background_tasks.add_task(update_db_setting_task, device_id, {"mode": mode})

    return {
        "message": "Mode command sent",
        "device_id": device_id,
        "mode": mode
    }


@router.post("/{device_id}/fan")
def set_fan(device_id: str, request: FanRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Publish command immediately to MQTT
        publish_command(device_id, {"fan": request.fan_status})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 2. Update database asynchronously
    background_tasks.add_task(update_db_setting_task, device_id, {"manual_fan_status": request.fan_status})

    return {
        "message": "Fan command sent",
        "device_id": device_id,
        "fan_status": request.fan_status
    }


@router.post("/{device_id}/alarm")
def set_alarm(device_id: str, request: AlarmRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Publish command immediately to MQTT
        publish_command(device_id, {"alarm": request.alarm_status})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 2. Update database asynchronously
    background_tasks.add_task(update_db_setting_task, device_id, {"manual_alarm_status": request.alarm_status})

    return {
        "message": "Alarm command sent",
        "device_id": device_id,
        "alarm_status": request.alarm_status
    }


@router.post("/{device_id}/setpoint")
def set_setpoint(device_id: str, request: SetpointRequest, background_tasks: BackgroundTasks):
    if request.setpoint_on <= request.setpoint_off:
        raise HTTPException(
            status_code=400,
            detail="setpoint_on must be greater than setpoint_off"
        )

    try:
        # 1. Publish command immediately to MQTT
        publish_command(device_id, {
            "command": "SET_SETPOINT",
            "setpoint_on": request.setpoint_on,
            "setpoint_off": request.setpoint_off
        })
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 2. Update database asynchronously
    background_tasks.add_task(update_db_setting_task, device_id, {
        "setpoint_on": request.setpoint_on,
        "setpoint_off": request.setpoint_off
    })

    return {
        "message": "Setpoint command sent",
        "device_id": device_id,
        "setpoint_on": request.setpoint_on,
        "setpoint_off": request.setpoint_off
    }


@router.post("/{device_id}/timer")
def set_timer(device_id: str, request: TimerRequest, background_tasks: BackgroundTasks):
    if request.timer_seconds < 0:
        raise HTTPException(status_code=400, detail="timer_seconds must be >= 0")

    try:
        # 1. Publish command immediately to MQTT
        publish_command(device_id, {"timer": request.timer_seconds})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # 2. Update database asynchronously
    background_tasks.add_task(update_db_setting_task, device_id, {
        "manual_timer_seconds": request.timer_seconds
    })

    return {
        "message": "Timer command sent",
        "device_id": device_id,
        "timer_seconds": request.timer_seconds
    }


@router.post("/{device_id}/start-fan-timer")
def start_fan_timer(device_id: str, request: TimerRequest):
    if request.timer_seconds < 0:
        raise HTTPException(status_code=400, detail="timer_seconds must be >= 0")

    # ESP32 handleMqttCommand checks doc.containsKey("start_timer") and doc["start_timer"].as<bool>()
    publish_command(device_id, {
        "timer": request.timer_seconds,
        "start_timer": True
    })

    return {
        "message": "Start fan timer command sent",
        "device_id": device_id,
        "timer_seconds": request.timer_seconds
    }


@router.post("/{device_id}/reset-runtime")
def reset_runtime(device_id: str):
    publish_command(device_id, {
        "command": "RESET_RUNTIME"
    })

    return {
        "message": "Reset runtime command sent",
        "device_id": device_id
    }


@router.post("/{device_id}/request-status")
def request_status(device_id: str):
    publish_command(device_id, {
        "command": "REQUEST_STATUS"
    })

    return {
        "message": "Request status command sent",
        "device_id": device_id
    }

@router.post("/{device_id}/restart")
def restart_device(device_id: str):
    publish_command(device_id, {
        "command": "RESTART_DEVICE"
    })

    return {
        "message": "Restart device command sent",
        "device_id": device_id
    }


@router.post("/maintenance/cleanup-raw")
def cleanup_raw_data():
    cleanup_old_raw_data()

    return {
        "message": "Cleanup raw telemetry executed"
    }


@router.post("/maintenance/cleanup-summary")
def cleanup_summary_data():
    cleanup_old_summary_data()

    return {
        "message": "Cleanup summary telemetry executed"
    }