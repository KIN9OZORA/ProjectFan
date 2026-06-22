"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BarChart3, Radio, LogOut } from "lucide-react";

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

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    router.push("/loginpage");
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-2">
        {menus.map((menu) => {
          const Icon = menu.icon;
          const active =
            pathname === menu.href ||
            (pathname === "/" && menu.href === "/realtime");

          return (
            <Link
              href={menu.href}
              key={menu.href}
              className={`flex flex-col items-center justify-center rounded-xl py-2 text-xs font-semibold ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Icon size={18} />
              <span className="mt-1">{menu.name}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center rounded-xl py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          <LogOut size={18} />
          <span className="mt-1">Keluar</span>
        </button>
      </div>
    </nav>
  );
}