import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest):
    expected_username = os.getenv("DASHBOARD_USERNAME", "admin")
    expected_password = os.getenv("DASHBOARD_PASSWORD", "admin123")

    if payload.username == expected_username and payload.password == expected_password:
        return {
            "status": "success",
            "token": "session-token-iot-fan-monitoring-dashboard",
            "user": {
                "username": expected_username,
                "role": "admin"
            }
        }
    else:
        raise HTTPException(
            status_code=401,
            detail="Username atau password salah"
        )
