from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime
import pandas as pd
import os

from database import get_db
from models import TelemetryLog, TelemetrySummary1Min

router = APIRouter(prefix="/api/export", tags=["Export"])


def clean_excel_datetime(df: pd.DataFrame) -> pd.DataFrame:
    """
    Excel/openpyxl tidak support datetime yang punya timezone.
    Function ini mengubah semua datetime menjadi string format normal.
    """
    for col in df.columns:
        df[col] = df[col].apply(
            lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if hasattr(x, "strftime") else x
        )

    return df


@router.get("/{device_id}")
def export_excel(
    device_id: str,
    data_type: str = "summary",
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db)
):
    os.makedirs("exports", exist_ok=True)

    data = []

    if data_type == "raw":
        query = db.query(TelemetryLog).filter(
            TelemetryLog.device_id == device_id
        )

        if start and end:
            start_dt = datetime.fromisoformat(start)
            end_dt = datetime.fromisoformat(end)

            query = query.filter(
                and_(
                    TelemetryLog.created_at >= start_dt,
                    TelemetryLog.created_at <= end_dt
                )
            )

        rows = query.order_by(TelemetryLog.id.asc()).all()

        for row in rows:
            data.append({
                "timestamp": row.created_at,
                "device_id": row.device_id,
                "temperature": row.temperature,
                "humidity": row.humidity,
                "fan_status": row.fan_status,
                "alarm_status": row.alarm_status,
                "mode": row.mode,
                "setpoint_on": row.setpoint_on,
                "setpoint_off": row.setpoint_off,
                "manual_fan_status": row.manual_fan_status,
                "manual_alarm_status": row.manual_alarm_status,
                "manual_timer_seconds": row.manual_timer_seconds,
                "manual_timer_active": row.manual_timer_active,
                "timer_remaining_seconds": row.timer_remaining_seconds,
                "fan_runtime_seconds": row.fan_runtime_seconds,
                "fan_runtime_text": row.fan_runtime_text,
                "ip_address": row.ip_address,
                "wifi_rssi": row.wifi_rssi,
                "mqtt_status": row.mqtt_status,
                "uptime_seconds": row.uptime_seconds,
            })

        filename = f"exports/{device_id}_raw_export.xlsx"

    else:
        query = db.query(TelemetrySummary1Min).filter(
            TelemetrySummary1Min.device_id == device_id
        )

        if start and end:
            start_dt = datetime.fromisoformat(start)
            end_dt = datetime.fromisoformat(end)

            query = query.filter(
                and_(
                    TelemetrySummary1Min.bucket_time >= start_dt,
                    TelemetrySummary1Min.bucket_time <= end_dt
                )
            )

        rows = query.order_by(TelemetrySummary1Min.bucket_time.asc()).all()

        for row in rows:
            data.append({
                "bucket_time": row.bucket_time,
                "device_id": row.device_id,
                "avg_temperature": row.avg_temperature,
                "min_temperature": row.min_temperature,
                "max_temperature": row.max_temperature,
                "avg_humidity": row.avg_humidity,
                "min_humidity": row.min_humidity,
                "max_humidity": row.max_humidity,
                "fan_on_count": row.fan_on_count,
                "alarm_on_count": row.alarm_on_count,
                "total_samples": row.total_samples,
                "mode": row.mode,
                "created_at": row.created_at,
            })

        filename = f"exports/{device_id}_summary_export.xlsx"

    df = pd.DataFrame(data)

    if df.empty:
        df = pd.DataFrame([{
            "message": "No data found",
            "device_id": device_id,
            "data_type": data_type
        }])
    else:
        df = clean_excel_datetime(df)

    df.to_excel(filename, index=False)

    return FileResponse(
        filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(filename)
    )