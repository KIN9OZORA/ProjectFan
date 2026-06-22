import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from mqtt_service import start_mqtt

from routes import realtime, control, graph, sessions, export, auth

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    start_mqtt()
    yield


app = FastAPI(
    title="IoT Fan Monitoring Backend",
    description="FastAPI backend for ESP32 DHT22 Fan Monitoring System",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(realtime.router)
app.include_router(control.router)
app.include_router(graph.router)
app.include_router(sessions.router)
app.include_router(export.router)


@app.get("/")
def root():
    return {
        "message": "IoT Fan Monitoring Backend is running",
        "docs": "/docs",
        "device_id": "FAN-001"
    }