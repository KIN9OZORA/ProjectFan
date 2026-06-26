"use client";

import { useEffect, useState, useRef } from "react";
import {
  AlertTriangle,
  Fan,
  Gauge,
  Power,
  RefreshCcw,
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import GaugeCard from "../components/GaugeCard";
import SectionCard from "../components/SectionCard";
import RealtimeChart from "../components/RealtimeChart";
import { useDevice } from "../components/DeviceContext";
import {
  RealtimeData,
  getRealtime,
  setMode,
  setFan,
  setAlarm,
  setSetpoint,
  setTimer,
  startFanTimer,
  resetRuntime,
  restartDevice,
} from "@/lib/api";

function useChartDataCache(pageKey: string) {
  const [chartData, setChartData] = useState<
    Array<{
      time: string;
      temperature: number;
      humidity: number;
    }>
  >([]);

  useEffect(() => {
    const cached = sessionStorage.getItem(`chart_cache_${pageKey}`);
    if (cached) {
      try {
        setChartData(JSON.parse(cached));
      } catch (e) {
        console.error("Failed to parse cached chart data", e);
      }
    } else {
      setChartData([]);
    }
  }, [pageKey]);

  const updateChartData = (newEntry: {
    time: string;
    temperature: number;
    humidity: number;
  }) => {
    setChartData((prev) => {
      const updated = [...prev, newEntry];
      const limited = updated.slice(-120);

      try {
        sessionStorage.setItem(
          `chart_cache_${pageKey}`,
          JSON.stringify(limited)
        );
      } catch (e) {
        console.error("Failed to save to sessionStorage", e);
      }

      return limited;
    });
  };

  const clearCache = () => {
    setChartData([]);
    sessionStorage.removeItem(`chart_cache_${pageKey}`);
  };

  return { chartData, updateChartData, clearCache };
}

export default function RealtimePage() {
  const { selectedDeviceId } = useDevice();

  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "loading" | "success" | "error";
    text: string;
  } | null>(null);

  const lastUpdateTimeRef = useRef<number>(Date.now());

  const [setpointOnInput, setSetpointOnInput] = useState(36);
  const [setpointOffInput, setSetpointOffInput] = useState(35);
  const [timerSecondsInput, setTimerSecondsInput] = useState(60);

  const [currentSetpointOn, setCurrentSetpointOn] = useState(36);
  const [currentSetpointOff, setCurrentSetpointOff] = useState(35);
  const [currentTimerSeconds, setCurrentTimerSeconds] = useState(60);

  const [timerAlarmMode, setTimerAlarmMode] = useState<"ON" | "OFF" | null>(
    null
  );

  const { chartData, updateChartData } = useChartDataCache(selectedDeviceId);

  async function loadData() {
    try {
      const res = await getRealtime(selectedDeviceId);
      setData(res);

      const lastUpdate = res.updated_at
        ? new Date(res.updated_at).getTime()
        : 0;

      const timeSinceLastUpdate = Date.now() - lastUpdate;
      const OFFLINE_THRESHOLD = 5 * 60 * 1000;

      const offline =
        lastUpdate === 0 || timeSinceLastUpdate > OFFLINE_THRESHOLD;

      setIsOffline(offline);
      lastUpdateTimeRef.current = Date.now();

      setCurrentSetpointOn(res.setpoint_on ?? 36);
      setCurrentSetpointOff(res.setpoint_off ?? 35);
      setCurrentTimerSeconds(res.manual_timer_seconds ?? 60);

      if (res.manual_timer_active) {
        setTimerAlarmMode(res.manual_alarm_status ? "ON" : "OFF");
      }

      const now = new Date();
      const timeString = now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      if (!offline) {
        updateChartData({
          time: timeString,
          temperature: res.temperature ?? 0,
          humidity: res.humidity ?? 0,
        });
      }
    } catch (err) {
      console.error(err);
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }

  async function action(label: string, fn: () => Promise<unknown>) {
    if (actionLoading) return;

    try {
      setActionLoading(label);
      setToast({
        type: "loading",
        text: `${label}...`,
      });

      await fn();

      // Fast-poll after command: check every 400ms up to 10x (4 seconds)
      // Wrapped in Promise so actionLoading (button spinner) stays active
      // until we actually get the device's response — not just until POST returns
      await new Promise<void>((resolve) => {
        let attempts = 0;
        const fastPoll = setInterval(async () => {
          attempts++;
          await loadData();
          if (attempts >= 10) {
            clearInterval(fastPoll);
            resolve();
          }
        }, 400);
      });

      setToast({
        type: "success",
        text: `${label} berhasil dikirim`,
      });

      setTimeout(() => setToast(null), 1500);
    } catch (err) {
      console.error(err);

      setToast({
        type: "error",
        text: `${label} gagal`,
      });

      setTimeout(() => {
        setToast(null);
      }, 2500);
    } finally {
      // Hanya terpanggil setelah fast-poll selesai,
      // jadi loading button tetap aktif selama menunggu respons ESP32
      setActionLoading(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadData();

    const interval = setInterval(loadData, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [selectedDeviceId]);

  const mode = data?.mode ?? "-";
  const isManual = mode === "MANUAL";
  const shouldShowChart = chartData.length > 0;

  const fanIsOn = data?.fan_status === true;
  const fanIsOff = data?.fan_status === false;
  const timerIsActive = data?.manual_timer_active === true;
  const isActionLoading = actionLoading !== null;

  return (
    <div className="mx-auto w-full min-w-[360px] max-w-5xl space-y-2 px-1 sm:px-0">
      {/* Floating Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-[9999] w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-start gap-2">
            {toast.type === "loading" && (
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-blue-600" />
            )}

            {toast.type === "success" && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            )}

            {toast.type === "error" && (
              <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
            )}

            <div>
              <p className="text-xs font-bold text-slate-900">
                {toast.type === "loading"
                  ? "Mengirim command"
                  : toast.type === "success"
                  ? "Berhasil"
                  : "Gagal"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{toast.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold text-slate-900 sm:text-lg">
              Realtime Monitoring
            </h1>

            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                !isOffline && data?.mqtt_status === "connected"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {isOffline
                ? "OFFLINE"
                : data?.mqtt_status === "connected"
                ? "ONLINE"
                : "OFFLINE"}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-[11px]">
            Device {selectedDeviceId} · refresh tiap 5 detik
            {isOffline && (
              <span className="ml-2 font-semibold text-red-600">
                ⚠️ Tidak ada data selama 5 menit terakhir
              </span>
            )}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isActionLoading}
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {isActionLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCcw size={13} />
          )}
          Refresh
        </button>
      </div>

      {/* Offline Alert */}
      {isOffline && (
        <div className="animate-pulse rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          ⚠️ DEVICE OFFLINE - Tidak ada data masuk dari MQTT selama 5 menit
          terakhir. Kontrol dinonaktifkan.
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
          Loading...
        </div>
      ) : (
        <>
          {/* Gauge */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <GaugeCard
                title="Temperature"
                value={data?.temperature ?? 0}
                min={0}
                max={100}
                unit="°C"
                subtitle="SHT31"
                size="md"
              />
            </div>

            <div className="min-w-0">
              <GaugeCard
                title="Humidity"
                value={data?.humidity ?? 0}
                min={0}
                max={100}
                unit="%"
                subtitle="SHT31"
                size="md"
              />
            </div>
          </div>

          {/* Chart */}
          {shouldShowChart ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
              <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                  Temperature Realtime
                  {isOffline && (
                    <span className="ml-1.5 font-bold text-red-500">
                      (Offline - Beku)
                    </span>
                  )}
                </p>
              </div>

              <RealtimeChart data={chartData} height={125} showGrid={true} />

              <p className="mt-0.5 text-center text-[9px] text-slate-400 sm:mt-1 sm:text-[10px]">
                Update setiap 5 detik • {chartData.length} data point •{" "}
                {((chartData.length * 5) / 60).toFixed(1)} menit history
              </p>
            </div>
          ) : isOffline ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center shadow-sm sm:rounded-xl sm:p-4">
              <p className="text-xs font-semibold text-slate-600">
                📊 Chart tidak berjalan
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Menunggu koneksi MQTT terhubung kembali
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
              <div className="mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Temperature Realtime
                </p>
              </div>

              <div className="flex h-[125px] items-center justify-center rounded-lg bg-slate-50 sm:h-[155px]">
                <p className="text-xs text-slate-500">
                  ⏳ Menunggu data minimal 2 data point...
                </p>
              </div>
            </div>
          )}

          {/* Status + Auto Setpoint */}
          <div className="grid grid-cols-2 gap-2">
            {/* Status & Mode */}
            <div className="relative min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
              {isOffline && <OfflineOverlay />}

              <div className="mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                  Status & Mode
                </p>
              </div>

              <div className="mb-2 space-y-1.5">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <Fan
                      size={14}
                      className={
                        fanIsOn
                          ? "shrink-0 text-emerald-600"
                          : "shrink-0 text-slate-400"
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-[9px] text-slate-500 sm:text-[10px]">
                        Fan Status
                      </p>
                      <p className="truncate text-[11px] font-semibold text-slate-900 sm:text-xs">
                        {fanIsOn ? "ON" : "OFF"}
                      </p>
                    </div>
                  </div>

                  <span className="truncate text-[9px] font-medium text-slate-400 sm:text-[10px]">
                    {data?.fan_runtime_text ?? "00:00:00"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <Gauge
                      size={14}
                      className={
                        mode === "AUTO"
                          ? "shrink-0 text-blue-600"
                          : "shrink-0 text-amber-600"
                      }
                    />

                    <div className="min-w-0">
                      <p className="text-[9px] text-slate-500 sm:text-[10px]">
                        Mode
                      </p>
                      <p className="truncate text-[11px] font-semibold text-slate-900 sm:text-xs">
                        {mode}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`truncate text-[9px] font-semibold sm:text-[10px] ${
                      data?.alarm_status
                        ? "text-amber-600"
                        : "text-slate-400"
                    }`}
                  >
                    Alarm {data?.alarm_status ? "ON" : "OFF"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <button
                  disabled={isActionLoading}
                  onClick={() =>
                    action("Set AUTO", () => setMode(selectedDeviceId, "AUTO"))
                  }
                  className={`cursor-pointer rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:py-2 sm:text-xs ${
                    mode === "AUTO"
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {actionLoading === "Set AUTO" ? "..." : "AUTO"}
                </button>

                <button
                  disabled={isActionLoading}
                  onClick={() =>
                    action("Set MANUAL", () =>
                      setMode(selectedDeviceId, "MANUAL")
                    )
                  }
                  className={`cursor-pointer rounded-lg px-2 py-1.5 text-[10px] font-bold transition-all disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:py-2 sm:text-xs ${
                    mode === "MANUAL"
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {actionLoading === "Set MANUAL" ? "..." : "MANUAL"}
                </button>
              </div>
            </div>

            {/* Auto Setpoint */}
            <div className="relative min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
              {isOffline && <OfflineOverlay />}

              <div className="mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">
                  Auto Setpoint
                </p>
                <p className="mt-0.5 hidden text-[10px] text-slate-500 sm:block">
                  Fan dan alarm otomatis mengikuti batas suhu.
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
                    <p className="text-[9px] font-medium text-slate-500 sm:text-[10px]">
                      Setpoint ON
                    </p>
                    <p className="text-xs font-bold text-slate-900 sm:text-base">
                      {currentSetpointOn}°C
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
                    <p className="text-[9px] font-medium text-slate-500 sm:text-[10px]">
                      Setpoint OFF
                    </p>
                    <p className="text-xs font-bold text-slate-900 sm:text-base">
                      {currentSetpointOff}°C
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <label className="space-y-1">
                    <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px]">
                      ON Input
                    </span>
                    <input
                      type="number"
                      value={setpointOnInput}
                      onChange={(e) =>
                        setSetpointOnInput(Number(e.target.value))
                      }
                      className={`w-full rounded-lg border px-2 py-1.5 text-[10px] outline-none focus:border-blue-500 sm:text-xs ${
                        setpointOnInput > setpointOffInput
                          ? "border-emerald-300"
                          : "border-red-300"
                      }`}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px]">
                      OFF Input
                    </span>
                    <input
                      type="number"
                      value={setpointOffInput}
                      onChange={(e) =>
                        setSetpointOffInput(Number(e.target.value))
                      }
                      className={`w-full rounded-lg border px-2 py-1.5 text-[10px] outline-none focus:border-blue-500 sm:text-xs ${
                        setpointOnInput > setpointOffInput
                          ? "border-emerald-300"
                          : "border-red-300"
                      }`}
                    />
                  </label>
                </div>

                <button
                  disabled={
                    isActionLoading ||
                    isManual ||
                    setpointOnInput <= setpointOffInput
                  }
                  onClick={() =>
                    action("Save setpoint", () =>
                      setSetpoint(
                        selectedDeviceId,
                        setpointOnInput,
                        setpointOffInput
                      )
                    )
                  }
                  className={`w-full cursor-pointer rounded-lg px-3 py-1.5 text-[10px] font-bold text-white transition-all sm:py-2 sm:text-xs ${
                    isActionLoading || isManual || setpointOnInput <= setpointOffInput
                      ? "cursor-not-allowed bg-slate-300"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {actionLoading === "Save setpoint" ? "..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Manual Fan + Alarm Timer */}
          <div className="grid grid-cols-2 gap-2">
            {/* Manual Fan */}
            <SectionCard
              title="Manual Fan"
              description="Kontrol fan saat mode MANUAL."
            >
              <div className="relative">
                {isOffline && <OfflineOverlay />}

                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    disabled={!isManual || isOffline || fanIsOn || isActionLoading}
                    onClick={() =>
                      action("Fan ON", async () => {
                        await setFan(selectedDeviceId, true);
                        setTimerAlarmMode(null);
                      })
                    }
                    className={`cursor-pointer rounded-lg px-2 py-2 text-[10px] font-bold text-white transition sm:px-3 sm:text-xs ${
                      !isManual || isOffline || fanIsOn || isActionLoading
                        ? "cursor-not-allowed bg-slate-300"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {actionLoading === "Fan ON" ? "..." : "FAN ON"}
                  </button>

                  <button
                    disabled={!isManual || isOffline || fanIsOff || isActionLoading}
                    onClick={() =>
                      action("Fan OFF", async () => {
                        await setFan(selectedDeviceId, false);
                        setTimerAlarmMode(null);
                      })
                    }
                    className={`cursor-pointer rounded-lg px-2 py-2 text-[10px] font-bold text-white transition sm:px-3 sm:text-xs ${
                      !isManual || isOffline || fanIsOff || isActionLoading
                        ? "cursor-not-allowed bg-slate-300"
                        : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {actionLoading === "Fan OFF" ? "..." : "FAN OFF"}
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:gap-2">
                  <button
                    disabled={!isManual || isOffline || isActionLoading}
                    onClick={() =>
                      action("Reset runtime", async () => {
                        await resetRuntime(selectedDeviceId);
                        setTimerAlarmMode(null);
                      })
                    }
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:text-xs"
                  >
                    <Power size={13} />
                    {actionLoading === "Reset runtime"
                      ? "Resetting..."
                      : "Reset Runtime / Reset Timer"}
                  </button>

                  <button
                    disabled={isActionLoading}
                    onClick={() =>
                      action("Restart device", () =>
                        restartDevice(selectedDeviceId)
                      )
                    }
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-50 px-2 py-2 text-[10px] font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:text-xs"
                  >
                    <AlertTriangle size={13} />
                    {actionLoading === "Restart device"
                      ? "Restarting..."
                      : "Restart Device"}
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* Alarm & Timer */}
            <SectionCard
              title="Alarm & Timer"
              description="Kontrol alarm dan timer manual."
            >
              <div className="relative">
                {isOffline && <OfflineOverlay />}

                <div className="mb-2 rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
                  <p className="text-[9px] font-medium text-slate-500 sm:text-[10px]">
                    Timer Device
                  </p>

                  <p className="text-[11px] font-bold text-slate-900 sm:text-xs">
                    {timerIsActive
                      ? `${data?.timer_remaining_seconds ?? 0} detik tersisa`
                      : `${currentTimerSeconds} detik`}
                  </p>

                  <p className="mt-1 text-[9px] font-medium text-slate-400 sm:text-[10px]">
                    {timerIsActive
                      ? `Timer aktif · ALARM ${
                          data?.manual_alarm_status ? "ON" : "OFF"
                        }`
                      : timerAlarmMode
                      ? `Dipilih: ALARM ${timerAlarmMode}`
                      : "Pilih ALARM lalu Start"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <button
                    disabled={
                      !isManual ||
                      isOffline ||
                      timerIsActive ||
                      isActionLoading
                    }
                    onClick={() =>
                      action("Set Alarm ON", async () => {
                        await setAlarm(selectedDeviceId, true);
                        setTimerAlarmMode("ON");
                      })
                    }
                    className={`cursor-pointer rounded-lg px-2 py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:text-xs ${
                      timerAlarmMode === "ON" ||
                      (timerIsActive && data?.manual_alarm_status)
                        ? "bg-amber-500 text-white shadow-md"
                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    }`}
                  >
                    {actionLoading === "Set Alarm ON" ? "..." : "ALARM ON"}
                  </button>

                  <button
                    disabled={
                      !isManual ||
                      isOffline ||
                      timerIsActive ||
                      isActionLoading
                    }
                    onClick={() =>
                      action("Set Alarm OFF", async () => {
                        await setAlarm(selectedDeviceId, false);
                        setTimerAlarmMode("OFF");
                      })
                    }
                    className={`cursor-pointer rounded-lg px-2 py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:text-xs ${
                      timerAlarmMode === "OFF" ||
                      (timerIsActive && !data?.manual_alarm_status)
                        ? "bg-slate-800 text-white shadow-md"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {actionLoading === "Set Alarm OFF" ? "..." : "ALARM OFF"}
                  </button>
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  <label className="space-y-1">
                    <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px]">
                      Timer Input, detik
                    </span>

                    <input
                      type="number"
                      disabled={!isManual || isOffline || timerIsActive || isActionLoading}
                      value={timerSecondsInput}
                      onChange={(e) =>
                        setTimerSecondsInput(Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[10px] outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400 sm:text-xs"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <button
                      disabled={
                        !isManual ||
                        isOffline ||
                        timerAlarmMode === null ||
                        timerIsActive ||
                        isActionLoading
                      }
                      onClick={() =>
                        action("Start fan timer", () =>
                          startFanTimer(selectedDeviceId, timerSecondsInput)
                        )
                      }
                      className={`cursor-pointer rounded-lg px-2 py-1.5 text-[10px] font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-3 sm:text-xs ${
                        timerAlarmMode === "ON"
                          ? "bg-amber-500 hover:bg-amber-600"
                          : timerAlarmMode === "OFF"
                          ? "bg-slate-900 hover:bg-slate-800"
                          : "bg-slate-300"
                      }`}
                    >
                      {actionLoading === "Start fan timer" ? "..." : "Start"}
                    </button>

                    <button
                      disabled={
                        !isManual ||
                        isOffline ||
                        timerIsActive ||
                        isActionLoading
                      }
                      onClick={() =>
                        action("Save timer", () =>
                          setTimer(selectedDeviceId, timerSecondsInput)
                        )
                      }
                      className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:px-3 sm:text-xs"
                    >
                      {actionLoading === "Save timer" ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Device Information */}
          <SectionCard title="Device Information">
            <div className="grid grid-cols-4 gap-2 text-[10px] sm:text-xs">
              <InfoItem label="IP Address" value={data?.ip_address ?? "-"} />
              <InfoItem
                label="WiFi RSSI"
                value={`${data?.wifi_rssi ?? "-"} dBm`}
              />
              <InfoItem label="MQTT" value={data?.mqtt_status ?? "-"} />
              <InfoItem
                label="Last Update"
                value={
                  data?.updated_at
                    ? new Date(data.updated_at).toLocaleString("id-ID")
                    : "-"
                }
              />
              <InfoItem label="Free Heap" value={data?.free_heap ?? "-"} />
              <InfoItem
                label="Uptime"
                value={`${data?.uptime_seconds ?? 0}s`}
              />
              <InfoItem
                label="Timer Remaining"
                value={`${data?.timer_remaining_seconds ?? 0}s`}
              />
              <InfoItem label="Device ID" value={selectedDeviceId} />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

function OfflineOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/80 p-3 text-center backdrop-blur-[1px] sm:rounded-xl">
      <Lock className="mb-1 h-4 w-4 text-slate-500" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700 sm:text-[11px]">
        Device Offline
      </p>
      <p className="mt-0.5 text-[10px] text-slate-500">
        Kontrol dinonaktifkan
      </p>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
      <p className="truncate text-[9px] text-slate-500 sm:text-[10px]">
        {label}
      </p>
      <p className="truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
}