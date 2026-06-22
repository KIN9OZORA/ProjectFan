from pydantic import BaseModel


class ModeRequest(BaseModel):
    mode: str


class FanRequest(BaseModel):
    fan_status: bool


class AlarmRequest(BaseModel):
    alarm_status: bool


class SetpointRequest(BaseModel):
    setpoint_on: float
    setpoint_off: float


class TimerRequest(BaseModel):
    timer_seconds: int