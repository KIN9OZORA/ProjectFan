"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Eye, EyeOff, Fan, AlertCircle } from "lucide-react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username dan password wajib diisi");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await login(username, password);
      if (response.token) {
        localStorage.setItem("token", response.token);
        localStorage.setItem("username", response.user.username);
        // Redirect to dashboard
        router.push("/realtime");
      } else {
        setError("Token tidak valid dari server");
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.message?.includes("401")
          ? "Username atau password salah"
          : "Gagal terhubung ke server backend. Pastikan backend sudah aktif."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f19] px-4 py-12 sm:px-6 lg:px-8">
      {/* Background Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
      
      {/* Decorative Grid Pattern */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none"
      ></div>

      <div className="relative w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/10">
            <Fan className="h-8 w-8 text-white animate-[spin_4s_linear_infinite] hover:animate-[spin_1s_linear_infinite] transition-all cursor-pointer" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            IoT Fan Monitor
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Masuk untuk mengakses dashboard pemantauan SHT31
          </p>
        </div>

        {/* Card Container */}
        <div className="backdrop-blur-xl bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-blue-500/5 ring-1 ring-white/5">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 animate-[shake_0.4s_ease-in-out]">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Gagal masuk</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Username Input */}
            <div className="space-y-2">
              <label htmlFor="username" className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                Username / Email
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950/40 py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200 focus:border-blue-500 focus:bg-slate-950/60 focus:ring-2 focus:ring-blue-500/15"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-slate-400 tracking-wide uppercase">
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-800 bg-slate-950/40 py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none transition-all duration-200 focus:border-blue-500 focus:bg-slate-950/60 focus:ring-2 focus:ring-blue-500/15"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions: Remember me & Hint */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500/20"
                />
                Ingat saya
              </label>
            
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="relative flex w-full justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/15 transition-all duration-200 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/25 hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  <span>Memverifikasi...</span>
                </div>
              ) : (
                "Masuk"
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500">
          IoT Fan Monitoring System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
