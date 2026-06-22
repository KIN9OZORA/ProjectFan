"use client";

import { useEffect, useRef } from "react";

interface HumidityHistoryProps {
  humidity: number;
}

export default function HumidityHistory({ humidity }: HumidityHistoryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataPointsRef = useRef<number[]>([humidity]);
  const timestampsRef = useRef<string[]>([new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })]);

  useEffect(() => {
    // Add new data point every 2 seconds
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      dataPointsRef.current.push(humidity);
      timestampsRef.current.push(timeStr);

      // Keep only last 30 data points (60 seconds)
      if (dataPointsRef.current.length > 30) {
        dataPointsRef.current.shift();
        timestampsRef.current.shift();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [humidity]);

  useEffect(() => {
    // Update data point immediately when humidity changes
    if (dataPointsRef.current.length === 0 || dataPointsRef.current[dataPointsRef.current.length - 1] !== humidity) {
      dataPointsRef.current[dataPointsRef.current.length - 1] = humidity;
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
    gradient.addColorStop(0, "#f0f9ff");
    gradient.addColorStop(1, "#e0f2fe");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#bae6fd";
    ctx.lineWidth = 1;
    for (let i = 50; i <= 80; i += 10) {
      const y = height - padding - ((i - 50) / 30) * (height - padding * 2);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();

      // Y-axis label
      ctx.fillStyle = "#0369a1";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${i}%`, padding - 8, y + 4);
    }

    // Draw X-axis
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - 20, height - padding);
    ctx.stroke();

    const data = dataPointsRef.current;
    if (data.length === 0) return;

    const minHumidity = 50;
    const maxHumidity = 80;
    const humidityRange = maxHumidity - minHumidity;

    const getColor = (hum: number) => {
      if (hum < 60) return "#06b6d4"; // cyan
      if (hum < 70) return "#0ea5e9"; // blue
      return "#2563eb"; // dark blue
    };

    // Draw line chart with smooth curve
    const chartWidth = width - padding - 20;
    const chartHeight = height - padding * 2;

    if (data.length > 1) {
      // Draw area under curve with gradient
      const areaGradient = ctx.createLinearGradient(0, 0, 0, height - padding);
      areaGradient.addColorStop(0, "rgba(6, 182, 212, 0.15)");
      areaGradient.addColorStop(1, "rgba(6, 182, 212, 0.02)");
      ctx.fillStyle = areaGradient;
      ctx.beginPath();
      
      const startX = padding + (chartWidth / (data.length - 1)) * 0;
      const startY = height - padding - ((data[0] - minHumidity) / humidityRange) * chartHeight;
      ctx.moveTo(startX, startY);

      for (let i = 1; i < data.length; i++) {
        const x = padding + (chartWidth / (data.length - 1)) * i;
        const y = height - padding - ((data[i] - minHumidity) / humidityRange) * chartHeight;
        ctx.lineTo(x, y);
      }
      
      ctx.lineTo(padding + chartWidth, height - padding);
      ctx.lineTo(padding, height - padding);
      ctx.closePath();
      ctx.fill();

      // Draw line
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      
      for (let i = 0; i < data.length; i++) {
        const x = padding + (chartWidth / (data.length - 1)) * i;
        const y = height - padding - ((data[i] - minHumidity) / humidityRange) * chartHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw data points with color based on humidity
    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const y = height - padding - ((data[i] - minHumidity) / humidityRange) * chartHeight;
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
    ctx.fillStyle = "#0c4a6e";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    
    const labelStep = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += labelStep) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const timeStr = timestampsRef.current[i];
      ctx.fillText(timeStr, x, height - padding + 18);
    }

  }, [humidity]);

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-700">
            Humidity Realtime
          </h3>
          <p className="mt-1 text-sm font-semibold text-cyan-600">{humidity.toFixed(1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-cyan-600">Live Data</p>
          <p className="mt-1 text-xs font-medium text-cyan-500">● Updating</p>
        </div>
      </div>

      {/* Canvas Chart */}
      <div className="bg-white rounded-lg overflow-hidden border border-cyan-100">
        <canvas
          ref={canvasRef}
          width={400}
          height={180}
          className="w-full"
        />
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-2 rounded-lg bg-cyan-100 p-2">
          <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
          <span className="text-cyan-700 font-medium">&lt; 60%</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-100 p-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-blue-700 font-medium">60-70%</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-200 p-2">
          <div className="w-2 h-2 rounded-full bg-blue-600"></div>
          <span className="text-blue-800 font-medium">&gt; 70%</span>
        </div>
      </div>
    </div>
  );
}
