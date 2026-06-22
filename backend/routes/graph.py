from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime

from database import get_db
from models import TelemetrySummary1Min

router = APIRouter(prefix="/api/graph", tags=["Graph"])


@router.get("/{device_id}")
def get_graph_data(
    device_id: str,
    start: str | None = None,
    end: str | None = None,
    limit: int = 500,
    db: Session = Depends(get_db)
):
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

    rows = (
        query
        .order_by(TelemetrySummary1Min.bucket_time.desc())
        .limit(limit)
        .all()
    )

    rows = list(reversed(rows))

    return [
        {
            "id": row.id,
            "device_id": row.device_id,
            "bucket_time": row.bucket_time,
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
        }
        for row in rows
    ]