from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DeviceSetting
from schemas import ModeRequest, FanRequest, AlarmRequest, SetpointRequest, TimerRequest
from mqtt_service import publish_command, cleanup_old_raw_data, cleanup_old_summary_data

router = APIRouter(prefix="/api/device", tags=["Control"])


def get_or_create_setting(db: Session, device_id: str):
    setting = db.query(DeviceSetting).filter(DeviceSetting.device_id == device_id).first()

    if not setting:
        setting = DeviceSetting(device_id=device_id)
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


@router.post("/{device_id}/mode")
def set_mode(device_id: str, request: ModeRequest, db: Session = Depends(get_db)):
    mode = request.mode.upper()

    if mode not in ["AUTO", "MANUAL"]:
        raise HTTPException(status_code=400, detail="Mode must be AUTO or MANUAL")

    setting = get_or_create_setting(db, device_id)
    setting.mode = mode
    db.commit()

    publish_command(device_id, {
        "command": "SET_MODE",
        "mode": mode
    })

    return {
        "message": "Mode command sent",
        "device_id": device_id,
        "mode": mode
    }


@router.post("/{device_id}/fan")
def set_fan(device_id: str, request: FanRequest, db: Session = Depends(get_db)):
    setting = get_or_create_setting(db, device_id)
    setting.manual_fan_status = request.fan_status
    db.commit()

    publish_command(device_id, {
        "command": "SET_FAN",
        "fan_status": request.fan_status
    })

    return {
        "message": "Fan command sent",
        "device_id": device_id,
        "fan_status": request.fan_status
    }


@router.post("/{device_id}/alarm")
def set_alarm(device_id: str, request: AlarmRequest, db: Session = Depends(get_db)):
    setting = get_or_create_setting(db, device_id)
    setting.manual_alarm_status = request.alarm_status
    db.commit()

    publish_command(device_id, {
        "command": "SET_ALARM",
        "alarm_status": request.alarm_status
    })

    return {
        "message": "Alarm command sent",
        "device_id": device_id,
        "alarm_status": request.alarm_status
    }


@router.post("/{device_id}/setpoint")
def set_setpoint(device_id: str, request: SetpointRequest, db: Session = Depends(get_db)):
    if request.setpoint_on <= request.setpoint_off:
        raise HTTPException(
            status_code=400,
            detail="setpoint_on must be greater than setpoint_off"
        )

    setting = get_or_create_setting(db, device_id)
    setting.setpoint_on = request.setpoint_on
    setting.setpoint_off = request.setpoint_off
    db.commit()

    publish_command(device_id, {
        "command": "SET_SETPOINT",
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
def set_timer(device_id: str, request: TimerRequest, db: Session = Depends(get_db)):
    if request.timer_seconds < 0:
        raise HTTPException(status_code=400, detail="timer_seconds must be >= 0")

    setting = get_or_create_setting(db, device_id)
    setting.manual_timer_seconds = request.timer_seconds
    db.commit()

    publish_command(device_id, {
        "command": "SET_TIMER",
        "timer_seconds": request.timer_seconds
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

    publish_command(device_id, {
        "command": "START_FAN_TIMER",
        "timer_seconds": request.timer_seconds
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