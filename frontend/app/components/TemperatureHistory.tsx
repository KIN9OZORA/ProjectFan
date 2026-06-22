"use client";

import { useEffect, useRef } from "react";

interface RealtimeTempChartProps {
  temperature: number;
}

export default function TemperatureHistory({ temperature }: RealtimeTempChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataPointsRef = useRef<number[]>([temperature]);
  const timestampsRef = useRef<string[]>([new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })]);

  useEffect(() => {
    // Add new data point every 1 minute
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      
      dataPointsRef.current.push(temperature);
      timestampsRef.current.push(timeStr);

      // Keep only last 360 data points (6 hours = 360 minutes)
      if (dataPointsRef.current.length > 360) {
        dataPointsRef.current.shift();
        timestampsRef.current.shift();
      }
    }, 60000); // 1 minute interval

    return () => clearInterval(interval);
  }, [temperature]);

  useEffect(() => {
    // Update data point immediately when temperature changes
    if (dataPointsRef.current.length === 0 || dataPointsRef.current[dataPointsRef.current.length - 1] !== temperature) {
      dataPointsRef.current[dataPointsRef.current.length - 1] = temperature;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#f8fafc");
    gradient.addColorStop(1, "#f1f5f9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const data = dataPointsRef.current;
    if (data.length === 0) return;

    // Calculate dynamic min/max based on actual data
    const minData = Math.min(...data);
    const maxData = Math.max(...data);
    const rangePadding = Math.max((maxData - minData) * 0.3, 2); // At least 2 degree padding
    const minTemp = Math.max(0, Math.floor(minData - rangePadding));
    const maxTemp = Math.ceil(maxData + rangePadding);
    const tempRange = maxTemp - minTemp;

    // Draw grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    const gridStep = Math.ceil(tempRange / 5); // 5 grid lines
    for (let i = minTemp; i <= maxTemp; i += gridStep) {
      const y = height - padding - ((i - minTemp) / tempRange) * (height - padding * 2);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();

      // Y-axis label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${i}°`, padding - 8, y + 4);
    }

    // Draw X-axis
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - 20, height - padding);
    ctx.stroke();

    const getColor = (temp: number) => {
      if (temp < 25) return "#10b981"; // green
      if (temp < 28) return "#f59e0b"; // amber
      return "#ef4444"; // red
    };

    // Draw line chart with smooth curve
    const chartWidth = width - padding - 20;
    const chartHeight = height - padding * 2;

    if (data.length > 1) {
      // Draw area under curve with gradient
      const areaGradient = ctx.createLinearGradient(0, 0, 0, height - padding);
      areaGradient.addColorStop(0, "rgba(59, 130, 246, 0.1)");
      areaGradient.addColorStop(1, "rgba(59, 130, 246, 0.01)");
      ctx.fillStyle = areaGradient;
      ctx.beginPath();
      
      const startX = padding + (chartWidth / (data.length - 1)) * 0;
      const startY = height - padding - ((data[0] - minTemp) / tempRange) * chartHeight;
      ctx.moveTo(startX, startY);

      for (let i = 1; i < data.length; i++) {
        const x = padding + (chartWidth / (data.length - 1)) * i;
        const y = height - padding - ((data[i] - minTemp) / tempRange) * chartHeight;
        ctx.lineTo(x, y);
      }
      
      ctx.lineTo(padding + chartWidth, height - padding);
      ctx.lineTo(padding, height - padding);
      ctx.closePath();
      ctx.fill();

      // Draw line
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      
      for (let i = 0; i < data.length; i++) {
        const x = padding + (chartWidth / (data.length - 1)) * i;
        const y = height - padding - ((data[i] - minTemp) / tempRange) * chartHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw data points with color based on temperature
    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const y = height - padding - ((data[i] - minTemp) / tempRange) * chartHeight;
      const color = getColor(data[i]);

      // Draw shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.beginPath();
      ctx.arc(x, y + 1, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw X-axis labels (only some to avoid clutter)
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    
    const labelStep = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += labelStep) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const timeStr = timestampsRef.current[i];
      ctx.fillText(timeStr, x, height - padding + 18);
    }

  }, [temperature]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">
            Temperature Realtime
          </h3>
          <p className="mt-1 text-sm font-semibold text-blue-600">{temperature.toFixed(1)}°C</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Live Data</p>
          <p className="mt-1 text-xs font-medium text-emerald-600">● Updating</p>
        </div>
      </div>

      {/* Canvas Chart */}
      <div className="bg-white rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={400}
          height={180}
          className="w-full"
        />
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-emerald-700 font-medium">&lt; 25°C</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <span className="text-amber-700 font-medium">25-28°C</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-red-700 font-medium">&gt; 28°C</span>
        </div>
      </div>
    </div>
  );
}
