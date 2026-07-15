"use client";

import { FormEvent, useState } from "react";

type RedeemResult = {
  fileName: string;
  size: number;
  downloadUrl: string;
  expiresIn: number;
  expiresAt: number;
  code: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function HomePage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "兑换失败");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10">
      <div className="panel p-6 sm:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">文件兑换下载</h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            输入你收到的兑换码，验证通过后将获得对应文件的短期下载链接。
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">兑换码</span>
            <input
              className="field mono text-lg tracking-[0.18em]"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <button className="btn btn-primary w-full sm:w-auto" disabled={loading || !code.trim()}>
            {loading ? "兑换中..." : "立即兑换"}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-6 space-y-4 rounded-lg border border-[#abefc6] bg-[#ecfdf3] p-4">
            <div>
              <div className="text-sm text-[var(--muted)]">文件已解锁</div>
              <div className="mt-1 text-lg font-semibold">{result.fileName}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                大小 {formatBytes(result.size)} · 链接有效期 {Math.round(result.expiresIn / 60)} 分钟
              </div>
            </div>
            <a className="btn btn-primary" href={result.downloadUrl} target="_blank" rel="noreferrer">
              立即下载
            </a>
            <p className="text-xs text-[var(--muted)]">
              下载链接会过期。若失效，请联系管理员重新发放兑换码。
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
