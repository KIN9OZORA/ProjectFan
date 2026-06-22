from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Device, DeviceSession

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.get("")
def get_sessions(db: Session = Depends(get_db)):
    devices = db.query(Device).order_by(Device.id.desc()).all()

    return [
        {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "ip_address": device.ip_address,
            "mqtt_status": device.mqtt_status,
            "wifi_rssi": device.wifi_rssi,
            "last_seen": device.last_seen,
            "created_at": device.created_at,
        }
        for device in devices
    ]


@router.get("/{device_id}")
def get_device_session(device_id: str, db: Session = Depends(get_db)):
    session = (
        db.query(DeviceSession)
        .filter(DeviceSession.device_id == device_id)
        .order_by(DeviceSession.id.desc())
        .first()
    )

    if not session:
        return {
            "device_id": device_id,
            "status": "offline",
            "message": "No session found"
        }

    return {
        "device_id": session.device_id,
        "ip_address": session.ip_address,
        "status": session.status,
        "mqtt_status": session.mqtt_status,
        "wifi_rssi": session.wifi_rssi,
        "connected_at": session.connected_at,
        "last_seen": session.last_seen,
    }