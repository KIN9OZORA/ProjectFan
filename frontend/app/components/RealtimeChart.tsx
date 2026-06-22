"use client";

import React, { useMemo } from "react";

interface ChartDataPoint {
  time: string;
  temperature: number;
  humidity?: number;
}

interface RealtimeChartProps {
  data: ChartDataPoint[];
  height?: number;
  showGrid?: boolean;
}

export default function RealtimeChart({
  data,
  height = 220,
  showGrid = true,
}: RealtimeChartProps) {
  const PADDING_LEFT = 38;
  const PADDING_RIGHT = 12;
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 30;

  const viewWidth = 900;
  const viewHeight = height;

  const chartWidth = viewWidth - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = viewHeight - PADDING_TOP - PADDING_BOTTOM;

  const calculations = useMemo(() => {
    if (data.length === 0) {
      return {
        tempMin: 0,
        tempMax: 50,
        points: [],
      };
    }

    const temps = data.map((d) => d.temperature);

    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);

    const range = maxTemp - minTemp || 2;

    const tempMin = minTemp - range * 0.25;
    const tempMax = maxTemp + range * 0.25;

    const points = data.map((d, i) => {
      const x =
        PADDING_LEFT + (i / Math.max(data.length - 1, 1)) * chartWidth;

      const y =
        PADDING_TOP +
        chartHeight -
        ((d.temperature - tempMin) / (tempMax - tempMin)) * chartHeight;

      return {
        x,
        y,
        time: d.time,
        temperature: d.temperature,
      };
    });

    return {
      tempMin,
      tempMax,
      points,
    };
  }, [data, chartWidth, chartHeight]);

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-slate-50"
        style={{ height }}
      >
        <p className="text-xs font-medium text-slate-400">
          Menunggu data temperature...
        </p>
      </div>
    );
  }

  const tempPath = calculations.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `
    ${tempPath}
    L ${calculations.points[calculations.points.length - 1].x} ${
      PADDING_TOP + chartHeight
    }
    L ${calculations.points[0].x} ${PADDING_TOP + chartHeight}
    Z
  `;

  const yGridLines = [];
  const yLabels = [];

  if (showGrid) {
    for (let i = 0; i <= 4; i++) {
      const y = PADDING_TOP + (chartHeight * i) / 4;

      const value =
        calculations.tempMax -
        (calculations.tempMax - calculations.tempMin) * (i / 4);

      yGridLines.push(y);
      yLabels.push(value);
    }
  }

  const timeLabelStep = Math.max(
    1,
    Math.floor(calculations.points.length / 4)
  );

  return (
    <div className="w-full rounded-xl bg-slate-50 p-3">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="none"
        className="block w-full"
      >
        <defs>
          <linearGradient
            id="temperatureGradient"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect
          x={PADDING_LEFT}
          y={PADDING_TOP}
          width={chartWidth}
          height={chartHeight}
          fill="white"
          rx="8"
        />

        {/* Grid */}
        {showGrid &&
          yGridLines.map((y, i) => (
            <line
              key={`grid-${i}`}
              x1={PADDING_LEFT}
              y1={y}
              x2={PADDING_LEFT + chartWidth}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray="5 5"
            />
          ))}

        {/* Y Labels */}
        {showGrid &&
          yLabels.map((value, i) => (
            <text
              key={`temp-label-${i}`}
              x={PADDING_LEFT - 8}
              y={PADDING_TOP + (chartHeight * i) / 4 + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill="#64748b"
            >
              {value.toFixed(1)}°C
            </text>
          ))}

        {/* Area */}
        <path d={areaPath} fill="url(#temperatureGradient)" />

        {/* Line */}
        <path
          d={tempPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {calculations.points.map((p, i) => (
          <circle
            key={`temp-point-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === calculations.points.length - 1 ? 4 : 2.5}
            fill="#10b981"
            opacity={i === calculations.points.length - 1 ? 1 : 0.45}
          />
        ))}

        {/* X Axis */}
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP + chartHeight}
          x2={PADDING_LEFT + chartWidth}
          y2={PADDING_TOP + chartHeight}
          stroke="#cbd5e1"
          strokeWidth="1"
        />

        {/* Time Labels */}
        {calculations.points.map((p, i) => {
          const showLabel =
            i === 0 ||
            i === calculations.points.length - 1 ||
            i % timeLabelStep === 0;

          if (!showLabel) return null;

          return (
            <text
              key={`time-label-${i}`}
              x={p.x}
              y={PADDING_TOP + chartHeight + 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#64748b"
            >
              {p.time}
            </text>
          );
        })}
      </svg>

      <div className="mt-2 flex justify-center">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-600">
            Temperature (°C)
          </span>
        </div>
      </div>
    </div>
  );
}