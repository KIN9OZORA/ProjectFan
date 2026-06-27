"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Download, RefreshCcw } from "lucide-react";

import SectionCard from "../components/SectionCard";
import { useDevice } from "../components/DeviceContext";
import { GraphData, exportUrl, getGraph } from "@/lib/api";

function downsample<T>(data: T[], targetSize: number): T[] {
  if (data.length <= targetSize) return data;
  const step = data.length / targetSize;
  const result: T[] = [];
  for (let i = 0; i < targetSize; i++) {
    const index = Math.min(Math.floor(i * step), data.length - 1);
    result.push(data[index]);
  }
  return result;
}

export default function GraphPage() {
  const { selectedDeviceId } = useDevice();
  const [timeframe, setTimeframe] = useState<"6h" | "1d" | "1w" | "1m">("6h");
  const [data, setData] = useState<GraphData[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      
      const now = new Date();
      let startStr = "";
      let limit = 360; // 6h default (1 data point per minute = 360 points)

      if (timeframe === "6h") {
        startStr = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
        limit = 360;
      } else if (timeframe === "1d") {
        startStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        limit = 1440;
      } else if (timeframe === "1w") {
        startStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        limit = 10080;
      } else if (timeframe === "1m") {
        startStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        limit = 43200;
      }
      
      const endStr = now.toISOString();

      const res = await getGraph(selectedDeviceId, limit, startStr, endStr);
      setData(res);
      setMessage("");
    } catch (err) {
      console.error(err);
      setMessage("Graph data belum tersedia untuk device ini.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedDeviceId, timeframe]);

  const chartData = useMemo(() => {
    const mapped = data.map((row) => {
      const isLongRange = timeframe === "1w" || timeframe === "1m";
      return {
        time: new Date(row.bucket_time).toLocaleString("id-ID", {
          month: timeframe === "1m" ? "2-digit" : undefined,
          day: isLongRange ? "2-digit" : undefined,
          hour: "2-digit",
          minute: "2-digit",
        }),
        temperature: row.avg_temperature,
        humidity: row.avg_humidity,
        fan_on_count: row.fan_on_count,
        alarm_on_count: row.alarm_on_count,
        samples: row.total_samples,
      };
    });

    // Downsample to 600 points max to keep Recharts buttery smooth
    return downsample(mapped, 600);
  }, [data, timeframe]);

  return (
    <div className="mx-auto w-full min-w-[360px] max-w-5xl space-y-2 px-1 sm:px-0">
      {/* Header Panel */}
      <div className="flex flex-row items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:rounded-xl sm:p-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-slate-900 sm:text-lg">
            Graph Monitoring ({selectedDeviceId})
          </h1>
          <p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-[11px]">
            Data grafik memakai mean per 1 menit.
          </p>
        </div>

        {/* Timeframe Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 border border-slate-200">
            {(["6h", "1d", "1w", "1m"] as const).map((tf) => {
              const label = {
                "6h": "6 Jam",
                "1d": "1 Hari",
                "1w": "1 Minggu",
                "1m": "1 Bulan",
              }[tf];
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded-md px-2 py-1 text-[10px] font-bold transition cursor-pointer sm:px-2.5 sm:py-1 sm:text-xs ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            onClick={loadData}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs cursor-pointer"
          >
            <RefreshCcw size={12} />
            Refresh
          </button>

          <a
            href={exportUrl(selectedDeviceId, "summary")}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs cursor-pointer"
          >
            <Download size={12} />
            Summary
          </a>

          <a
            href={exportUrl(selectedDeviceId, "raw")}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-300 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-xs cursor-pointer"
          >
            <Download size={12} />
            Raw
          </a>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {message}
        </div>
      )}

      <SectionCard
  title="Temperature"
  description="Trend suhu rata-rata."
>
  {loading ? (
    <div className="h-[160px] md:h-[200px] rounded-xl bg-slate-50 p-6">
      Loading...
    </div>
  ) : (
    <div className="h-[160px] md:h-[200px] px-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 10,
            right: 20,
            left: 0,
            bottom: 10,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            minTickGap={25}
          />
          <YAxis
            width={35}
            tick={{ fontSize: 10 }}
            domain={['auto', 'auto']}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )}
</SectionCard>
<SectionCard
  title="Humidity"
  description="Trend kelembaban rata-rata."
>
  {loading ? (
    <div className="h-[280px] rounded-xl bg-slate-50 p-6">
      Loading...
    </div>
  ) : (
    <div className="h-[280px] md:h-[320px] px-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 10,
            right: 20,
            left: 0,
            bottom: 10,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            minTickGap={25}
          />
          <YAxis
            width={35}
            tick={{ fontSize: 10 }}
            domain={['auto', 'auto']}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="humidity"
            stroke="#ec4899"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )}
</SectionCard>

      {/* Fan / Alarm Chart */}
      <SectionCard
        title="Fan & Alarm Activity"
        description="Jumlah sample fan/alarm ON dalam bucket 1 menit."
      >
        {chartData.length === 0 ? (
          <div className="h-[160px] md:h-[200px] rounded-xl bg-slate-50 p-6 text-slate-500 flex items-center justify-center">
            Belum ada data.
          </div>
        ) : (
          <div className="h-[160px] md:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="fan_on_count"
                  name="Fan ON count"
                  strokeWidth={2}
                  stroke="#10b981"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="alarm_on_count"
                  name="Alarm ON count"
                  strokeWidth={2}
                  stroke="#f59e0b"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  );
}