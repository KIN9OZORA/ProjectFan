const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.12:8000";
const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID || "FAN-001,FAN-002,FAN-003,FAN-004,FAN-005,FAN-006,FAN-007,FAN-008,FAN-009,FAN-010,FAN-011,FAN-012,FAN-013,FAN-014,FAN-015,FAN-016,FAN-017,FAN-018,FAN-019,FAN-020";

export { API_BASE_URL, DEVICE_ID };

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

export type RealtimeData = {
  device_id: string;
  temperature: number | null;
  humidity: number | null;
  fan_status: boolean;
  alarm_status: boolean;
  mode: "AUTO" | "MANUAL" | string;
  setpoint_on: number;
  setpoint_off: number;
  manual_fan_status: boolean;
  manual_alarm_status: boolean;
  manual_timer_seconds: number;
  manual_timer_active: boolean;
  timer_remaining_seconds: number;
  fan_runtime_seconds: number;
  fan_runtime_text: string | null;
  ip_address: string | null;
  wifi_rssi: number | null;
  mqtt_status: string | null;
  uptime_seconds: number;
  free_heap?: number | null;
  restart_reason?: number | null;
  offline: boolean;
  last_seen_seconds: number;
  updated_at: string;
};

export type GraphData = {
  id: number;
  device_id: string;
  bucket_time: string;
  avg_temperature: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  avg_humidity: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  fan_on_count: number;
  alarm_on_count: number;
  total_samples: number;
  mode: string | null;
  created_at: string;
};

export type SessionData = {
  device_id: string;
  device_name: string | null;
  ip_address: string | null;
  mqtt_status: string | null;
  wifi_rssi: number | null;
  last_seen: string | null;
  created_at: string | null;
};

export function getRealtime(deviceId = DEVICE_ID) {
  return apiGet<RealtimeData>(`/api/realtime/${deviceId}`);
}

export function getGraph(
  deviceId = DEVICE_ID,
  limit = 500,
  start?: string,
  end?: string
) {
  let url = `/api/graph/${deviceId}?limit=${limit}`;
  if (start) url += `&start=${encodeURIComponent(start)}`;
  if (end) url += `&end=${encodeURIComponent(end)}`;
  return apiGet<GraphData[]>(url);
}

export function getSessions() {
  return apiGet<SessionData[]>("/api/sessions");
}

export function setMode(deviceId: string, mode: "AUTO" | "MANUAL") {
  return apiPost(`/api/device/${deviceId}/mode`, { mode });
}

export function setFan(deviceId: string, fan_status: boolean) {
  return apiPost(`/api/device/${deviceId}/fan`, { fan_status });
}

export function setAlarm(deviceId: string, alarm_status: boolean) {
  return apiPost(`/api/device/${deviceId}/alarm`, { alarm_status });
}

export function setSetpoint(
  deviceId: string,
  setpoint_on: number,
  setpoint_off: number
) {
  return apiPost(`/api/device/${deviceId}/setpoint`, {
    setpoint_on,
    setpoint_off,
  });
}

export function setTimer(deviceId: string, timer_seconds: number) {
  return apiPost(`/api/device/${deviceId}/timer`, { timer_seconds });
}

export function startFanTimer(deviceId: string, timer_seconds: number) {
  return apiPost(`/api/device/${deviceId}/start-fan-timer`, { timer_seconds });
}

export function resetRuntime(deviceId: string) {
  return apiPost(`/api/device/${deviceId}/reset-runtime`);
}

export function restartDevice(deviceId: string) {
  return apiPost(`/api/device/${deviceId}/restart`);
}

export function exportUrl(deviceId: string, dataType: "summary" | "raw") {
  return `${API_BASE_URL}/api/export/${deviceId}?data_type=${dataType}`;
}

export function login(username: string, password: string) {
  return apiPost<{
    status: string;
    token: string;
    user: { username: string; role: string };
  }>("/api/auth/login", { username, password });
}
