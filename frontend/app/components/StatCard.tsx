import { ReactNode } from "react";

type StatCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "blue";
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone = "default",
}: StatCardProps) {
  const toneMap = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-red-50 text-red-700",
    warning: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>

        {icon && (
          <div className={`rounded-xl p-2.5 ${toneMap[tone]}`}>{icon}</div>
        )}
      </div>
    </div>
  );
}