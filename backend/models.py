from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), unique=True, index=True, nullable=False)
    device_name = Column(String(100), nullable=True)
    ip_address = Column(String(50), nullable=True)
    mqtt_status = Column(String(20), default="offline")
    wifi_rssi = Column(Integer, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), index=True, nullable=False)

    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)

    fan_status = Column(Boolean, default=False)
    alarm_status = Column(Boolean, default=False)
    mode = Column(String(20), default="AUTO")

    setpoint_on = Column(Float, default=36.0)
    setpoint_off = Column(Float, default=35.0)

    manual_fan_status = Column(Boolean, default=False)
    manual_alarm_status = Column(Boolean, default=False)

    manual_timer_seconds = Column(Integer, default=0)
    manual_timer_active = Column(Boolean, default=False)
    timer_remaining_seconds = Column(Integer, default=0)

    fan_runtime_seconds = Column(Integer, default=0)
    fan_runtime_text = Column(String(20), nullable=True)

    ip_address = Column(String(50), nullable=True)
    wifi_rssi = Column(Integer, nullable=True)
    mqtt_status = Column(String(20), default="connected")
    uptime_seconds = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DeviceSetting(Base):
    __tablename__ = "device_settings"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), unique=True, index=True, nullable=False)

    mode = Column(String(20), default="AUTO")
    setpoint_on = Column(Float, default=36.0)
    setpoint_off = Column(Float, default=35.0)

    manual_fan_status = Column(Boolean, default=False)
    manual_alarm_status = Column(Boolean, default=False)
    manual_timer_seconds = Column(Integer, default=0)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DeviceSession(Base):
    __tablename__ = "device_sessions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), index=True, nullable=False)

    ip_address = Column(String(50), nullable=True)
    status = Column(String(20), default="connected")
    mqtt_status = Column(String(20), default="connected")
    wifi_rssi = Column(Integer, nullable=True)

    connected_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())

class DeviceLatest(Base):
    __tablename__ = "device_latest"

    device_id = Column(String(50), primary_key=True, index=True)

    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)

    fan_status = Column(Boolean, default=False)
    alarm_status = Column(Boolean, default=False)
    mode = Column(String(20), default="AUTO")

    setpoint_on = Column(Float, default=36.0)
    setpoint_off = Column(Float, default=35.0)

    manual_fan_status = Column(Boolean, default=False)
    manual_alarm_status = Column(Boolean, default=False)

    manual_timer_seconds = Column(Integer, default=0)
    manual_timer_active = Column(Boolean, default=False)
    timer_remaining_seconds = Column(Integer, default=0)

    fan_runtime_seconds = Column(Integer, default=0)
    fan_runtime_text = Column(String(20), nullable=True)

    ip_address = Column(String(50), nullable=True)
    wifi_rssi = Column(Integer, nullable=True)
    mqtt_status = Column(String(20), default="connected")
    uptime_seconds = Column(Integer, default=0)

    free_heap = Column(Integer, nullable=True)
    restart_reason = Column(Integer, nullable=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TelemetrySummary1Min(Base):
    __tablename__ = "telemetry_summary_1min"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), index=True, nullable=False)

    bucket_time = Column(DateTime(timezone=True), index=True, nullable=False)

    avg_temperature = Column(Float, nullable=True)
    min_temperature = Column(Float, nullable=True)
    max_temperature = Column(Float, nullable=True)

    avg_humidity = Column(Float, nullable=True)
    min_humidity = Column(Float, nullable=True)
    max_humidity = Column(Float, nullable=True)

    fan_on_count = Column(Integer, default=0)
    alarm_on_count = Column(Integer, default=0)
    total_samples = Column(Integer, default=0)

    mode = Column(String(20), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())