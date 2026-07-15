"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "登录失败");
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <div className="panel w-full p-6 sm:p-8">
        <h1 className="text-2xl font-bold">管理后台登录</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">上传文件、生成兑换码、导出映射表</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">用户名</span>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">密码</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        {error ? (
          <div className="mt-4 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
