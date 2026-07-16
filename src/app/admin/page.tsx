"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BatchItem = {
  id: string;
  name: string;
  note: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  readyCount: number;
  totalSize: number;
  unusedCount: number;
  usedCount: number;
};

type BatchDetailItem = {
  id: string;
  originalName: string;
  size: number;
  status: string;
  createdAt: number;
  code: {
    id: string;
    code: string;
    status: string;
    usedCount: number;
    maxUses: number;
    usedAt: number | null;
  } | null;
};

type LastResult = {
  batchId: string;
  batchName: string;
  successCount: number;
  failCount: number;
  codes: string[];
  pairs: string[];
};

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
};

type SettingsData = {
  admin: {
    username: string;
    passwordSource: string;
    hasCustomPassword: boolean;
  };
  r2: {
    configured: boolean;
    source: string;
    accountId: string;
    accessKeyId: string;
    secretAccessKeyMasked: string;
    hasSecret: boolean;
    secretSource: string;
    bucket: string;
    publicBaseUrl: string;
    downloadUrlTtlSeconds: number;
  };
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(ms?: number | null) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

function statusClass(status: string) {
  return `badge badge-${status}`;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ready: "就绪",
    uploading: "上传中",
    upload_failed: "上传失败",
    disabled: "已禁用",
    unused: "未使用",
    used: "已使用",
    revoked: "已作废",
    expired: "已过期",
    active: "进行中",
  };
  return map[status] || status;
}

export default function AdminPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [activeBatchName, setActiveBatchName] = useState("");
  const [activeBatchNote, setActiveBatchNote] = useState<string | null>(null);
  const [activeCodes, setActiveCodes] = useState<string[]>([]);
  const [activePairs, setActivePairs] = useState<string[]>([]);
  const [activeItems, setActiveItems] = useState<BatchDetailItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [batchBusyId, setBatchBusyId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [copyTip, setCopyTip] = useState("");
  const [showSelectedPreview, setShowSelectedPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsTip, setSettingsTip] = useState("");
  const [settingsMeta, setSettingsMeta] = useState<SettingsData | null>(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [r2PublicBaseUrl, setR2PublicBaseUrl] = useState("");
  const [downloadUrlTtlSeconds, setDownloadUrlTtlSeconds] = useState(600);
  const [clearR2Secret, setClearR2Secret] = useState(false);

  const selectedSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles],
  );

  const loadBatches = useCallback(
    async (q = query) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/batches?q=${encodeURIComponent(q)}`);
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载任务失败");
        setBatches(data.items || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [query, router],
  );

  useEffect(() => {
    void loadBatches("");
  }, [loadBatches]);

  useEffect(() => {
    if (!detailOpen && !settingsOpen && !confirmDialog) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (confirmBusy) return;
        if (confirmDialog) setConfirmDialog(null);
        else if (settingsOpen) setSettingsOpen(false);
        else setDetailOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailOpen, settingsOpen, confirmDialog, confirmBusy]);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    setSelectedFiles((prev) => {
      const map = new Map(prev.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
      for (const file of incoming) {
        map.set(`${file.name}-${file.size}-${file.lastModified}`, file);
      }
      return Array.from(map.values());
    });
  }

  function removeSelected(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function copyText(text: string, tip = "已复制") {
    if (!text) {
      setCopyTip("没有可复制内容");
      setTimeout(() => setCopyTip(""), 1800);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyTip(tip);
      setTimeout(() => setCopyTip(""), 2200);
    } catch {
      setCopyTip("复制失败，请手动选择下方文本");
      setTimeout(() => setCopyTip(""), 2200);
    }
  }

  function closeBatchDetail() {
    setDetailOpen(false);
  }

  async function openBatch(batchId: string, options?: { openModal?: boolean }) {
    const shouldOpen = options?.openModal !== false;
    if (shouldOpen) setDetailOpen(true);
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/batches?id=${encodeURIComponent(batchId)}`);
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载任务详情失败");

      const items: BatchDetailItem[] = data.items || [];
      const codes: string[] = data.codes || [];
      const pairs = items
        .filter((item) => item.status === "ready" && item.code?.code)
        .map((item) => `${item.originalName}\t${item.code!.code}`);

      setActiveBatchId(batchId);
      setActiveBatchName(data.batch?.name || "");
      setActiveBatchNote(data.batch?.note || null);
      setActiveCodes(codes);
      setActivePairs(pairs);
      setActiveItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务详情失败");
      if (shouldOpen) setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshActiveBatch() {
    if (!activeBatchId) return;
    await Promise.all([openBatch(activeBatchId, { openModal: false }), loadBatches(query)]);
  }

  async function runConfirmAction() {
    if (!confirmDialog || confirmBusy) return;
    setConfirmBusy(true);
    setError("");
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch {
      // keep dialog open on failure so user can retry/cancel
    } finally {
      setConfirmBusy(false);
    }
  }

  function requestDeleteBatch(batch: { id: string; name: string; fileCount?: number }) {
    const fileCount = typeof batch.fileCount === "number" ? batch.fileCount : activeItems.length;
    setConfirmDialog({
      title: "删除分发任务",
      description: `确认删除任务「${batch.name}」？将一并删除关联的 ${fileCount} 个文件、兑换码，以及 R2 中的对象。此操作不可恢复。`,
      confirmLabel: "确认删除",
      tone: "danger",
      onConfirm: () => executeDeleteBatch(batch, fileCount),
    });
  }

  async function executeDeleteBatch(
    batch: { id: string; name: string },
    fileCount: number,
  ) {
    setBatchBusyId(batch.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error(data.error || "删除任务失败");

      if (activeBatchId === batch.id) {
        setDetailOpen(false);
        setActiveBatchId(null);
        setActiveBatchName("");
        setActiveBatchNote(null);
        setActiveCodes([]);
        setActivePairs([]);
        setActiveItems([]);
      }
      setLastResult((prev) => (prev?.batchId === batch.id ? null : prev));
      setCopyTip(`已删除任务「${batch.name}」及其 ${data.deletedFiles ?? fileCount} 个文件`);
      setTimeout(() => setCopyTip(""), 2200);
      await loadBatches(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除任务失败");
      throw err;
    } finally {
      setBatchBusyId(null);
    }
  }

  async function startUpload() {
    if (!batchName.trim()) {
      setError("请先填写本次分发任务名称，例如 gpt / grok");
      return;
    }
    if (selectedFiles.length === 0) {
      setError("请先选择要上传的文件");
      return;
    }

    setBusy(true);
    setError("");
    setUploadProgress(5);
    setLastResult(null);

    try {
      const form = new FormData();
      form.append("batchName", batchName.trim());
      if (batchNote.trim()) form.append("batchNote", batchNote.trim());
      for (const file of selectedFiles) {
        form.append("files", file);
      }

      const data = await new Promise<{
        batch: { id: string; name: string };
        successCount: number;
        failCount: number;
        codes: string[];
        results?: Array<{ originalName: string; status: string; code: string }>;
        error?: string;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/uploads/server");
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.max(5, Math.min(95, Math.round((event.loaded / event.total) * 100)));
          setUploadProgress(percent);
        };
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(json.error || `上传失败 HTTP ${xhr.status}`));
              return;
            }
            resolve(json);
          } catch (err) {
            reject(err instanceof Error ? err : new Error("解析上传结果失败"));
          }
        };
        xhr.onerror = () => reject(new Error("上传网络错误"));
        xhr.send(form);
      });

      const codes = data.codes || [];
      const pairs = (data.results || [])
        .filter((item) => item.status === "ready" && item.code)
        .map((item) => `${item.originalName}\t${item.code}`);

      setUploadProgress(100);
      setLastResult({
        batchId: data.batch.id,
        batchName: data.batch.name,
        successCount: data.successCount,
        failCount: data.failCount,
        codes,
        pairs,
      });
      setSelectedFiles([]);
      setShowSelectedPreview(false);
      await loadBatches(query);
      await openBatch(data.batch.id);

      if (codes.length > 0) {
        await copyText(codes.join("\n"), `已复制本批 ${codes.length} 个兑换码`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  }

  function requestRowAction(
    item: BatchDetailItem,
    action: "copy" | "reset" | "revoke" | "delete",
  ) {
    if (action === "copy") {
      void handleRowAction(item, action);
      return;
    }

    if (action === "delete") {
      setConfirmDialog({
        title: "删除文件",
        description: `确认删除文件「${item.originalName}」？将同步删除兑换码及 R2 对象，此操作不可恢复。`,
        confirmLabel: "确认删除",
        tone: "danger",
        onConfirm: () => handleRowAction(item, "delete"),
      });
      return;
    }

    if (action === "revoke") {
      setConfirmDialog({
        title: "作废兑换码",
        description: `确认作废「${item.originalName}」的兑换码？作废后用户将无法再兑换下载。`,
        confirmLabel: "确认作废",
        tone: "danger",
        onConfirm: () => handleRowAction(item, "revoke"),
      });
      return;
    }

    if (action === "reset") {
      setConfirmDialog({
        title: "重置兑换码",
        description: `确认重置「${item.originalName}」的兑换码？旧码将立即失效。`,
        confirmLabel: "确认重置",
        tone: "default",
        onConfirm: () => handleRowAction(item, "reset"),
      });
    }
  }

  async function handleRowAction(
    item: BatchDetailItem,
    action: "copy" | "reset" | "revoke" | "delete",
  ) {
    if (action === "copy") {
      if (!item.code?.code) {
        setCopyTip("该文件暂无兑换码");
        setTimeout(() => setCopyTip(""), 1800);
        return;
      }
      await copyText(item.code.code, `已复制 ${item.originalName} 的兑换码`);
      return;
    }

    setRowBusyId(item.id);
    setError("");
    try {
      if (action === "delete") {
        const res = await fetch(`/api/admin/files/${item.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) throw new Error(data.error || "删除失败");
        setCopyTip(`已删除 ${item.originalName}`);
      } else {
        const res = await fetch(`/api/admin/files/${item.id}/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: action === "revoke" ? "revoke" : "regenerate" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) throw new Error(data.error || (action === "revoke" ? "作废失败" : "重置失败"));
        setCopyTip(
          action === "revoke"
            ? `已作废 ${item.originalName} 的兑换码`
            : `已重置 ${item.originalName} 的兑换码：${data.code || ""}`,
        );
        if (action === "reset" && data.code) {
          try {
            await navigator.clipboard.writeText(String(data.code));
          } catch {
            // ignore clipboard failure after regenerate
          }
        }
      }

      setTimeout(() => setCopyTip(""), 2200);
      await refreshActiveBatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      throw err;
    } finally {
      setRowBusyId(null);
    }
  }

  function applySettingsData(data: SettingsData) {
    setSettingsMeta(data);
    setAdminUsername(data.admin.username || "admin");
    setR2AccountId(data.r2.accountId || "");
    setR2AccessKeyId(data.r2.accessKeyId || "");
    setR2Bucket(data.r2.bucket || "");
    setR2PublicBaseUrl(data.r2.publicBaseUrl || "");
    setDownloadUrlTtlSeconds(data.r2.downloadUrlTtlSeconds || 600);
    setR2SecretAccessKey("");
    setClearR2Secret(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function openSettings() {
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsError("");
    setSettingsTip("");
    try {
      const res = await fetch("/api/admin/settings");
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载设置失败");
      applySettingsData(data as SettingsData);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "加载设置失败");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsError("");
    setSettingsTip("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUsername,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
          confirmPassword: confirmPassword || undefined,
          r2AccountId,
          r2AccessKeyId,
          r2SecretAccessKey: clearR2Secret ? undefined : r2SecretAccessKey || undefined,
          r2Bucket,
          r2PublicBaseUrl,
          downloadUrlTtlSeconds: Number(downloadUrlTtlSeconds) || 600,
          clearR2Secret,
        }),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存设置失败");
      applySettingsData(data as SettingsData);
      setSettingsTip("设置已保存");
      setCopyTip("系统设置已更新");
      setTimeout(() => setCopyTip(""), 2200);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存设置失败");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/admin/login");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">文件兑换分发系统</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn btn-secondary btn-icon"
            href="https://github.com/lulistart/Files-hand-out"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库"
            title="GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
              <path
                fill="currentColor"
                d="M12 2C6.477 2 2 6.586 2 12.253c0 4.53 2.865 8.372 6.839 9.726.5.094.683-.222.683-.492 0-.243-.009-.888-.014-1.743-2.782.617-3.369-1.372-3.369-1.372-.455-1.18-1.11-1.494-1.11-1.494-.908-.635.069-.622.069-.622 1.003.072 1.531 1.053 1.531 1.053.892 1.562 2.341 1.111 2.91.85.091-.662.35-1.111.636-1.367-2.221-.258-4.555-1.137-4.555-5.061 0-1.118.39-2.032 1.03-2.749-.103-.259-.447-1.3.098-2.71 0 0 .84-.275 2.75 1.05A9.35 9.35 0 0 1 12 7.043c.85.004 1.706.117 2.505.343 1.909-1.325 2.748-1.05 2.748-1.05.546 1.41.202 2.451.1 2.71.64.717 1.028 1.631 1.028 2.749 0 3.935-2.338 4.8-4.566 5.053.359.317.679.942.679 1.9 0 1.371-.012 2.477-.012 2.814 0 .273.18.592.688.491A10.27 10.27 0 0 0 22 12.253C22 6.586 17.523 2 12 2Z"
              />
            </svg>
          </a>
          <a className="btn btn-secondary" href="/" target="_blank" rel="noreferrer">
            兑换页
          </a>
          <button className="btn btn-secondary" onClick={() => void openSettings()}>
            系统设置
          </button>
          <button className="btn btn-secondary" onClick={() => void loadBatches(query)}>
            刷新
          </button>
          <button className="btn btn-danger" onClick={() => void logout()}>
            退出
          </button>
        </div>
      </header>

      {copyTip ? (
        <div className="mb-4 rounded-lg border border-[#abefc6] bg-[#ecfdf3] px-4 py-3 text-sm text-[var(--ok)]">
          {copyTip}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <section className="panel mb-5 p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">新建分发任务</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              必填任务名 → 选文件 → 上传。成功后自动复制全部兑换码。
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">任务名称 *</span>
            <input
              className="field"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="例如：gpt / grok / 7月客户A"
              maxLength={80}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">备注（可选）</span>
            <input
              className="field"
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
              placeholder="给谁、渠道、补充说明"
              maxLength={200}
            />
          </label>
        </div>

        <div
          className={`dropzone mt-3 compact ${dragActive ? "active" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">拖入本批文件，或点击选择</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                已选 <strong>{selectedFiles.length}</strong> 个 · {formatBytes(selectedSize)}
                {selectedFiles.length > 0 ? " · 上传时不展开超长文件列表" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-secondary cursor-pointer">
                选择文件
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {selectedFiles.length > 0 ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setShowSelectedPreview((v) => !v)}
                >
                  {showSelectedPreview ? "收起已选" : "查看已选"}
                </button>
              ) : null}
              <button
                className="btn btn-secondary"
                disabled={selectedFiles.length === 0 || busy}
                onClick={() => {
                  setSelectedFiles([]);
                  setShowSelectedPreview(false);
                }}
              >
                清空
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void startUpload()}>
                {busy ? `上传中 ${uploadProgress}%` : "开始上传本批"}
              </button>
            </div>
          </div>

          {busy ? (
            <div className="progress mt-3">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          ) : null}

          {showSelectedPreview && selectedFiles.length > 0 ? (
            <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-[var(--line)] bg-white">
              {selectedFiles.slice(0, 40).map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-1.5 text-sm last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate">{file.name}</div>
                    <div className="text-xs text-[var(--muted)]">{formatBytes(file.size)}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeSelected(index)} disabled={busy}>
                    移除
                  </button>
                </div>
              ))}
              {selectedFiles.length > 40 ? (
                <div className="px-3 py-2 text-xs text-[var(--muted)]">
                  仅预览前 40 个，实际上传全部 {selectedFiles.length} 个
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {lastResult ? (
          <div className="result-panel mt-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-base font-semibold">任务「{lastResult.batchName}」上传完成</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  成功 {lastResult.successCount} · 失败 {lastResult.failCount} · 兑换码{" "}
                  {lastResult.codes.length}
                  {lastResult.codes.length > 0 ? " · 已自动复制到剪贴板" : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    void copyText(
                      lastResult.codes.join("\n"),
                      `已复制 ${lastResult.codes.length} 个兑换码`,
                    )
                  }
                  disabled={lastResult.codes.length === 0}
                >
                  复制全部兑换码
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void copyText(
                      lastResult.pairs.join("\n"),
                      `已复制 ${lastResult.pairs.length} 行 文件名+兑换码`,
                    )
                  }
                  disabled={lastResult.pairs.length === 0}
                >
                  复制 文件名+码
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void openBatch(lastResult.batchId)}
                >
                  打开任务详情
                </button>
                <a
                  className="btn btn-secondary"
                  href={`/api/admin/batches/${lastResult.batchId}/codes?format=txt`}
                >
                  下载 TXT
                </a>
                <a
                  className="btn btn-secondary"
                  href={`/api/admin/batches/${lastResult.batchId}/codes?format=csv`}
                >
                  下载 CSV
                </a>
              </div>
            </div>
            {lastResult.codes.length > 0 ? (
              <textarea
                className="field mono mt-3 min-h-32"
                readOnly
                value={lastResult.codes.join("\n")}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel mb-5 p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">历史分发任务</h2>
            <p className="text-sm text-[var(--muted)]">
              按任务名快速找回；这里只显示任务摘要，详情在弹窗中打开
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="field w-full sm:w-56"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 gpt / grok / 备注"
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadBatches(query);
              }}
            />
            <button className="btn btn-secondary" onClick={() => void loadBatches(query)}>
              搜索
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--muted)]">加载中...</div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--muted)]">还没有分发任务</div>
        ) : (
          <div className="batch-list">
            {batches.map((batch) => {
              const active = detailOpen && activeBatchId === batch.id;
              return (
                <div key={batch.id} className={`batch-row ${active ? "active" : ""}`}>
                  <button
                    type="button"
                    className="batch-main"
                    onClick={() => void openBatch(batch.id)}
                  >
                    <div className="min-w-0 text-left">
                      <div className="truncate font-semibold">{batch.name}</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {formatDateTime(batch.createdAt)}
                        {batch.note ? ` · ${batch.note}` : ""}
                      </div>
                    </div>
                    <div className="batch-stats">
                      <span>{batch.fileCount} 文件</span>
                      <span>{batch.unusedCount} 可用码</span>
                      <span>{batch.usedCount} 已用</span>
                      <span>{formatBytes(batch.totalSize)}</span>
                    </div>
                  </button>
                  <div className="batch-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={batchBusyId === batch.id}
                      onClick={() => void openBatch(batch.id)}
                    >
                      打开
                    </button>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`/api/admin/batches/${batch.id}/codes?format=txt`}
                    >
                      TXT
                    </a>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`/api/admin/batches/${batch.id}/codes?format=csv`}
                    >
                      CSV
                    </a>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={batchBusyId === batch.id}
                      onClick={() =>
                        void requestDeleteBatch({
                          id: batch.id,
                          name: batch.name,
                          fileCount: batch.fileCount,
                        })
                      }
                    >
                      {batchBusyId === batch.id ? "删除中..." : "删除"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>


      {settingsOpen ? (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="modal-panel settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="min-w-0">
                <h2 id="settings-title" className="text-lg font-semibold">
                  系统设置
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  在后台自定义 R2 配置，并可修改管理员账号密码。数据库配置优先于环境变量。
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(false)}>
                关闭
              </button>
            </div>

            {settingsLoading ? (
              <div className="py-10 text-center text-sm text-[var(--muted)]">加载设置中...</div>
            ) : (
              <div className="settings-body">
                {settingsError ? (
                  <div className="mb-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[var(--danger)]">
                    {settingsError}
                  </div>
                ) : null}
                {settingsTip ? (
                  <div className="mb-3 rounded-lg border border-[#abefc6] bg-[#ecfdf3] px-4 py-3 text-sm text-[var(--ok)]">
                    {settingsTip}
                  </div>
                ) : null}

                <section className="settings-section">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold">管理员账号</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      当前密码来源：
                      {settingsMeta?.admin.passwordSource === "db" ? "后台已自定义" : "环境变量 / 默认值"}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">管理员用户名</span>
                      <input
                        className="field"
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        maxLength={64}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">当前密码（改密必填）</span>
                      <input
                        className="field"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">新密码</span>
                      <input
                        className="field"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="至少 6 位，不改可留空"
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">确认新密码</span>
                      <input
                        className="field"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold">Cloudflare R2</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      状态：
                      {settingsMeta?.r2.configured ? "已配置" : "未配置完整"}
                      {settingsMeta ? ` · 来源 ${settingsMeta.r2.source}` : ""}
                      {settingsMeta?.r2.hasSecret
                        ? ` · Secret ${settingsMeta.r2.secretAccessKeyMasked || "已设置"}`
                        : " · Secret 未设置"}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">R2 Account ID</span>
                      <input
                        className="field mono"
                        value={r2AccountId}
                        onChange={(e) => setR2AccountId(e.target.value)}
                        placeholder="Cloudflare 账户 ID"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">R2 Bucket</span>
                      <input
                        className="field mono"
                        value={r2Bucket}
                        onChange={(e) => setR2Bucket(e.target.value)}
                        placeholder="例如 test"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">Access Key ID</span>
                      <input
                        className="field mono"
                        value={r2AccessKeyId}
                        onChange={(e) => setR2AccessKeyId(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">Secret Access Key</span>
                      <input
                        className="field mono"
                        type="password"
                        value={r2SecretAccessKey}
                        onChange={(e) => {
                          setR2SecretAccessKey(e.target.value);
                          if (e.target.value) setClearR2Secret(false);
                        }}
                        placeholder={
                          settingsMeta?.r2.hasSecret
                            ? "已保存，留空表示不修改"
                            : "填写 R2 Secret"
                        }
                        disabled={clearR2Secret}
                      />
                    </label>
                    <label className="block space-y-1.5 md:col-span-2">
                      <span className="text-sm font-medium">Public Base URL（可选）</span>
                      <input
                        className="field mono"
                        value={r2PublicBaseUrl}
                        onChange={(e) => setR2PublicBaseUrl(e.target.value)}
                        placeholder="如有自定义域名可填写"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">下载链接有效期（秒）</span>
                      <input
                        className="field"
                        type="number"
                        min={60}
                        max={86400}
                        value={downloadUrlTtlSeconds}
                        onChange={(e) => setDownloadUrlTtlSeconds(Number(e.target.value) || 600)}
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-7 text-sm">
                      <input
                        type="checkbox"
                        checked={clearR2Secret}
                        onChange={(e) => {
                          setClearR2Secret(e.target.checked);
                          if (e.target.checked) setR2SecretAccessKey("");
                        }}
                      />
                      清除已保存的 Secret，回退到环境变量
                    </label>
                  </div>
                </section>

                <div className="modal-toolbar">
                  <button
                    className="btn btn-primary"
                    disabled={settingsSaving}
                    onClick={() => void saveSettings()}
                  >
                    {settingsSaving ? "保存中..." : "保存设置"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={settingsSaving || settingsLoading}
                    onClick={() => void openSettings()}
                  >
                    重新加载
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {detailOpen && activeBatchId ? (
        <div className="modal-overlay" onClick={closeBatchDetail}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="min-w-0">
                <h2 id="batch-detail-title" className="truncate text-lg font-semibold">
                  任务详情：{activeBatchName}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {detailLoading
                    ? "加载中..."
                    : `${activeItems.length} 个文件 · ${activeCodes.length} 个兑换码可复制`}
                  {activeBatchNote ? ` · ${activeBatchNote}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!activeBatchId || batchBusyId === activeBatchId || detailLoading}
                  onClick={() => {
                    if (!activeBatchId) return;
                    void requestDeleteBatch({
                      id: activeBatchId,
                      name: activeBatchName,
                      fileCount: activeItems.length,
                    });
                  }}
                >
                  {batchBusyId === activeBatchId ? "删除中..." : "删除任务"}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={closeBatchDetail}>
                  关闭
                </button>
              </div>
            </div>

            <div className="modal-toolbar">
              <button
                className="btn btn-primary btn-sm"
                disabled={activeCodes.length === 0}
                onClick={() =>
                  void copyText(activeCodes.join("\n"), `已复制 ${activeCodes.length} 个兑换码`)
                }
              >
                复制全部兑换码
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={activePairs.length === 0}
                onClick={() =>
                  void copyText(
                    activePairs.join("\n"),
                    `已复制 ${activePairs.length} 行 文件名+兑换码`,
                  )
                }
              >
                复制 文件名+码
              </button>
              <a
                className="btn btn-secondary btn-sm"
                href={`/api/admin/batches/${activeBatchId}/codes?format=txt`}
              >
                下载 TXT
              </a>
              <a
                className="btn btn-secondary btn-sm"
                href={`/api/admin/batches/${activeBatchId}/codes?format=csv`}
              >
                下载 CSV
              </a>
              <button
                className="btn btn-secondary btn-sm"
                disabled={detailLoading || rowBusyId !== null}
                onClick={() => void refreshActiveBatch()}
              >
                刷新
              </button>
            </div>

            {activeCodes.length > 0 ? (
              <textarea
                className="field mono mb-3 min-h-24"
                readOnly
                value={activeCodes.join("\n")}
              />
            ) : (
              <div className="mb-3 rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-sm text-[var(--muted)]">
                该任务暂无可用兑换码
              </div>
            )}

            <div className="table-wrap modal-table-wrap">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>大小</th>
                    <th>状态</th>
                    <th>兑换码</th>
                    <th>码状态</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map((item) => {
                    const busyRow = rowBusyId === item.id;
                    return (
                      <tr key={item.id}>
                        <td className="max-w-[220px] truncate" title={item.originalName}>
                          {item.originalName}
                        </td>
                        <td>{formatBytes(item.size)}</td>
                        <td>
                          <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
                        </td>
                        <td className="mono whitespace-nowrap">{item.code?.code || "-"}</td>
                        <td>
                          {item.code ? (
                            <span className={statusClass(item.code.status)}>
                              {statusLabel(item.code.status)} ({item.code.usedCount}/
                              {item.code.maxUses})
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={busyRow || !item.code?.code}
                              onClick={() => void requestRowAction(item, "copy")}
                            >
                              复制码
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={busyRow}
                              onClick={() => void requestRowAction(item, "reset")}
                            >
                              重置码
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={busyRow || !item.code || item.code.status === "revoked"}
                              onClick={() => void requestRowAction(item, "revoke")}
                            >
                              作废
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busyRow}
                              onClick={() => void requestRowAction(item, "delete")}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!detailLoading && activeItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--muted)]">
                        无文件
                      </td>
                    </tr>
                  ) : null}
                  {detailLoading && activeItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--muted)]">
                        加载中...
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div
          className="modal-overlay confirm-overlay"
          onClick={() => {
            if (!confirmBusy) setConfirmDialog(null);
          }}
        >
          <div
            className="modal-panel confirm-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-icon-wrap" aria-hidden="true">
              <span className={`confirm-icon ${confirmDialog.tone === "danger" ? "danger" : "default"}`}>
                !
              </span>
            </div>
            <h2 id="confirm-dialog-title" className="confirm-title">
              {confirmDialog.title}
            </h2>
            <p className="confirm-desc">{confirmDialog.description}</p>
            <div className="confirm-actions">
              <button
                className="btn btn-secondary"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
              >
                取消
              </button>
              <button
                className={`btn ${confirmDialog.tone === "danger" ? "btn-danger" : "btn-primary"}`}
                disabled={confirmBusy}
                onClick={() => void runConfirmAction()}
              >
                {confirmBusy ? "处理中..." : confirmDialog.confirmLabel || "确认"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
