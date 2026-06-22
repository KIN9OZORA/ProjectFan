"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BarChart3, Radio, Cpu, LogOut } from "lucide-react";
import { useDevice } from "./DeviceContext";
import { SessionData, getSessions } from "@/lib/api";

const menus = [
  {
    name: "Realtime",
    href: "/realtime",
    icon: Activity,
  },
  {
    name: "Graph",
    href: "/graph",
    icon: BarChart3,
  },
  {
    name: "Sessions",
    href: "/sessions",
    icon: Radio,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const { selectedDeviceId, setSelectedDeviceId } = useDevice();
  const [devices, setDevices] = useState<SessionData[]>([]);

  const allowedDeviceIds = useMemo(() => {
    return (process.env.NEXT_PUBLIC_DEVICE_ID ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, []);

  useEffect(() => {
    async function fetchDevices() {
      try {
        const res = await getSessions();

        const filteredDevices = res.filter((device) =>
          allowedDeviceIds.includes(device.device_id)
        );

        setDevices(filteredDevices);
      } catch (err) {
        console.error("Failed to fetch devices in sidebar", err);
      }
    }

    fetchDevices();

    const interval = setInterval(fetchDevices, 15000);

    return () => clearInterval(interval);
  }, [allowedDeviceIds]);

  useEffect(() => {
    if (allowedDeviceIds.length === 0) return;

    if (!allowedDeviceIds.includes(selectedDeviceId)) {
      setSelectedDeviceId(allowedDeviceIds[0]);
    }
  }, [allowedDeviceIds, selectedDeviceId, setSelectedDeviceId]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    router.push("/loginpage");
  };

  return (
    <aside className="hidden min-h-screen w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:flex">
      <div className="mb-7 flex items-center gap-3 rounded-2xl bg-slate-900 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <Cpu size={22} />
        </div>

        <div>
          <h1 className="text-sm font-bold tracking-tight">
            IoT Fan Monitor
          </h1>
          <p className="text-xs text-slate-400">ESP32 SHT31</p>
        </div>
      </div>

      <nav className="space-y-2">
        {menus.map((menu) => {
          const Icon = menu.icon;

          const active =
            pathname === menu.href ||
            (pathname === "/" && menu.href === "/realtime");

          return (
            <Link
              key={menu.href}
              href={menu.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {menu.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4">
        <button
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-950/30 hover:text-red-400"
        >
          <LogOut size={18} />
          Keluar
        </button>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Active Device</p>

          <div className="relative mt-2">
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 outline-none focus:border-blue-600"
            >
              {allowedDeviceIds.length === 0 ? (
                <option value={selectedDeviceId}>
                  ENV DEVICE_ID kosong
                </option>
              ) : (
                allowedDeviceIds.map((deviceId) => {
                  const found = devices.find(
                    (device) => device.device_id === deviceId
                  );

                  const status = found?.mqtt_status || "offline";
                  const name = found?.device_name || deviceId;

                  return (
                    <option key={deviceId} value={deviceId}>
                      {name} ({status})
                    </option>
                  );
                })
              )}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
              <span className="text-[9px]">▼</span>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-slate-500">
            Realtime 5s · Raw 10s · Graph 1min
          </p>
        </div>
      </div>
    </aside>
  );
}