"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, Wifi, WifiOff, Lock } from "lucide-react";

import SectionCard from "../components/SectionCard";
import { SessionData, getSessions } from "@/lib/api";
import { useDevice } from "../components/DeviceContext";

export default function SessionsPage() {
  const router = useRouter();
  const { selectedDeviceId, setSelectedDeviceId } = useDevice();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  const allowedDeviceIds = useMemo(() => {
    return (process.env.NEXT_PUBLIC_ALLOWED_DEVICE_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, []);

  function isDeviceAllowed(deviceId: string) {
    if (allowedDeviceIds.length === 0) return false;
    return allowedDeviceIds.includes(deviceId);
  }

  async function loadData() {
    try {
      setLoading(true);

      const res = await getSessions();

      const filteredSessions = res.filter((device) =>
        isDeviceAllowed(device.device_id)
      );

      setSessions(filteredSessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 10000);

    return () => clearInterval(interval);
  }, []);

  function isOnline(lastSeen: string | null) {
    if (!lastSeen) return false;

    const diff = Date.now() - new Date(lastSeen).getTime();

    return diff < 30000;
  }

  function activateDevice(deviceId: string) {
    if (!isDeviceAllowed(deviceId)) return;

    setSelectedDeviceId(deviceId);
    router.push("/realtime");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Device Sessions
          </h1>

          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Hanya device yang terdaftar di environment yang dapat ditampilkan.
          </p>

          <p className="mt-1 text-[11px] text-slate-400">
            Allowed Device:{" "}
            {allowedDeviceIds.length > 0
              ? allowedDeviceIds.join(", ")
              : "Belum diset di .env.local"}
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <SectionCard title="Connected Devices">
        {loading ? (
          <div className="rounded-xl bg-slate-50 p-6">Loading...</div>
        ) : allowedDeviceIds.length === 0 ? (
          <div className="rounded-xl bg-red-50 p-6 text-sm font-semibold text-red-700">
            NEXT_PUBLIC_ALLOWED_DEVICE_IDS belum diset di frontend .env.local.
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-slate-500">
            Belum ada device terhubung yang sesuai dengan env.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Device ID</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">MQTT</th>
                    <th className="px-4 py-3">RSSI</th>
                    <th className="px-4 py-3">Last Seen</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 bg-white">
                  {sessions.map((device) => {
                    const online = isOnline(device.last_seen);
                    const allowed = isDeviceAllowed(device.device_id);

                    return (
                      <tr key={device.device_id}>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                              online
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {online ? (
                              <Wifi size={14} />
                            ) : (
                              <WifiOff size={14} />
                            )}
                            {online ? "ONLINE" : "OFFLINE"}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {device.device_id}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {device.ip_address ?? "-"}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {device.mqtt_status ?? "-"}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {device.wifi_rssi
                            ? `${device.wifi_rssi} dBm`
                            : "-"}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {device.last_seen
                            ? new Date(device.last_seen).toLocaleString(
                                "id-ID"
                              )
                            : "-"}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {!allowed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                              <Lock size={12} />
                              Blocked
                            </span>
                          ) : selectedDeviceId === device.device_id ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                              Aktif
                            </span>
                          ) : (
                            <button
                              onClick={() => activateDevice(device.device_id)}
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                            >
                              Aktifkan
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card */}
            <div className="space-y-3 p-3 md:hidden">
              {sessions.map((device) => {
                const online = isOnline(device.last_seen);
                const allowed = isDeviceAllowed(device.device_id);

                return (
                  <div
                    key={device.device_id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900">
                        {device.device_id}
                      </p>

                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                          online
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">IP</p>
                        <p className="font-semibold text-slate-800">
                          {device.ip_address ?? "-"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">MQTT</p>
                        <p className="font-semibold text-slate-800">
                          {device.mqtt_status ?? "-"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">RSSI</p>
                        <p className="font-semibold text-slate-800">
                          {device.wifi_rssi
                            ? `${device.wifi_rssi} dBm`
                            : "-"}
                        </p>
                      </div>

                      <div>
                        <p className="text-slate-500">Last Seen</p>
                        <p className="font-semibold text-slate-800">
                          {device.last_seen
                            ? new Date(device.last_seen).toLocaleString(
                                "id-ID"
                              )
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                      {!allowed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                          <Lock size={12} />
                          Blocked
                        </span>
                      ) : selectedDeviceId === device.device_id ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                          Aktif
                        </span>
                      ) : (
                        <button
                          onClick={() => activateDevice(device.device_id)}
                          className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                        >
                          Aktifkan Device
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}