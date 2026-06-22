"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { DeviceProvider } from "./DeviceContext";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/loginpage";

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists in localStorage
    const token = localStorage.getItem("token");

    if (!token) {
      setAuthorized(false);
      if (!isLoginPage) {
        router.push("/loginpage");
      } else {
        setLoading(false);
      }
    } else {
      setAuthorized(true);
      if (isLoginPage) {
        router.push("/realtime");
      } else {
        setLoading(false);
      }
    }
  }, [pathname, isLoginPage, router]);

  // If loading or not authorized on a protected route, show a beautiful loading screen
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-blue-500"></div>
          <p className="text-xs text-slate-500 font-medium tracking-wide">
            Memuat dashboard...
          </p>
        </div>
      </div>
    );
  }

  // If rute is loginpage, render children without sidebar or bottomnav
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Render dashboard layout
  return (
    <DeviceProvider>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />
        <main className="min-h-screen flex-1 overflow-x-hidden px-3 pb-24 pt-3 sm:px-5 sm:pt-5 lg:p-6">
          {children}
        </main>
        <BottomNav />
      </div>
    </DeviceProvider>
  );
}

