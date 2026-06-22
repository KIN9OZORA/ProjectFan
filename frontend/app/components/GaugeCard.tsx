"use client";

import React from "react";

interface GaugeCardProps {
  title: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg" | "xl";
  type?: "temperature" | "humidity" | "default";
}

export default function GaugeCard({
  title,
  value,
  min,
  max,
  unit,
  subtitle,
  size = "md",
  type = "default",
}: GaugeCardProps) {
  const sizeConfig = {
    sm: {
      card: "h-[220px] p-4",
      gaugeSize: 180,
      title: "text-sm",
      valueFont: 26,
      unitFont: 11,
    },
    md: {
      card: "h-[220px] p-4",
      gaugeSize: 210,
      title: "text-sm",
      valueFont: 20,
      unitFont: 12,
},
    lg: {
      card: "h-[320px] p-6",
      gaugeSize: 280,
      title: "text-lg",
      valueFont: 35,
      unitFont: 25,
    },
    xl: {
      card: "h-[400px] p-8",
      gaugeSize: 340,
      title: "text-xl",
      valueFont: 35,
      unitFont: 25,
    },
  };

  const config = sizeConfig[size];
  const gaugeSize = config.gaugeSize;

  const percentage = ((value - min) / (max - min)) * 100;
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  const svgWidth = gaugeSize;
  const svgHeight = gaugeSize * 0.6; // Adjusted height for the semi-circle gauge

  const centerX = svgWidth / 2;
  const centerY = svgHeight * 0.78;

  const radius = gaugeSize * 0.36;

  const startX = centerX - radius;
  const startY = centerY;
  const endX = centerX + radius;
  const endY = centerY;

  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clampedPercentage / 100);

  const valueY = centerY + 15;

  const getColor = () => {
    if (type === "temperature") {
      if (value < 30) return "#10b981";
      if (value < 36) return "#f59e0b";
      return "#ef4444";
    }

    if (type === "humidity") {
      if (value < 40) return "#3b82f6";
      if (value < 65) return "#10b981";
      return "#ef4444";
    }

    if (clampedPercentage < 33) return "#10b981";
    if (clampedPercentage < 66) return "#f59e0b";
    return "#ef4444";
  };

  const color = getColor();

  return (
    <div
      className={`
        rounded-2xl border border-slate-200 bg-white shadow-sm
        ${config.card}
        flex flex-col
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className={`font-bold text-slate-900 ${config.title}`}>
            {title}
          </h3>

          {subtitle && (
            <p className="mt-1 text-xs font-medium text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        <span className="text-xs font-semibold text-slate-400">
          {clampedPercentage.toFixed(0)}%
        </span>
      </div>

      {/* Gauge */}
      <div className="flex flex-1 items-center justify-center">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="overflow-visible"
        >
          {/* Background Arc */}
          <path
            d={`
              M ${startX} ${startY}
              A ${radius} ${radius} 0 0 1 ${endX} ${endY}
            `}
            fill="none"
            stroke="#e5eaf2"
            strokeWidth="18"
            strokeLinecap="round"
          />

          {/* Active Arc */}
          <path
            d={`
              M ${startX} ${startY}
              A ${radius} ${radius} 0 0 1 ${endX} ${endY}
            `}
            fill="none"
            stroke={color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
            }}
          />

          {/* Min */}
          <text
            x={startX+5}
            y={startY + 30}
            fontSize="15"
            fontWeight="600"
            fill="#94a3b8"
            textAnchor="middle"
          >
            {min}
          </text>

          {/* Max */}
          <text
            x={endX-5}
            y={endY + 30}
            fontSize="15"
            fontWeight="600"
            fill="#94a3b8"
            textAnchor="middle"
          >
            {max}
          </text>

          <text
            x={centerX}
            y={valueY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#0f172a"
          >
            <tspan fontSize={config.valueFont} fontWeight="800">
              {value.toFixed(1)}
            </tspan>

            <tspan
              dx="5"
              fontSize={config.unitFont}
              fontWeight="700"
              fill="#64748b"
            >
              {unit}
            </tspan>
          </text>
        </svg>
      </div>
    </div>
  );
}