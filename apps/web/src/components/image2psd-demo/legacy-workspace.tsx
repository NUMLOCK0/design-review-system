"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileImage,
  ImagePlus,
  KeyRound,
  Layers3,
  LoaderCircle,
  Play,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";

type LogEntry = { id: string; time: string; message: string; tone: "info" | "success" | "error" };
type RunOutput = {
  runId: string;
  downloadUrl: string;
  previewUrl: string;
  contactSheetUrl: string;
  layers: Array<{ name: string; type: string; bbox?: number[] }>;
  status?: string;
  errors?: string[];
  width?: number;
  height?: number;
};
type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "complete"; output: RunOutput }
  | { type: "error"; message: string };

const SETTINGS_KEY = "image2psd-demo-settings-v1";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function addLog(message: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    message,
    tone,
  };
}

export default function Image2PsdDemoWorkspace() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [visionModel, setVisionModel] = useState("gpt-5.2");
  const [imageModel, setImageModel] = useState("gpt-image-2");
  const [imageSize, setImageSize] = useState("auto");
  const [quality, setQuality] = useState("high");
  const [maxLayers, setMaxLayers] = useState(12);
  const [useAllImageCalls, setUseAllImageCalls] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewSource, setPreviewSource] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [output, setOutput] = useState<RunOutput | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const value = JSON.parse(saved) as Partial<{
          baseUrl: string;
          visionModel: string;
          imageModel: string;
          imageSize: string;
          quality: string;
          maxLayers: number;
          useAllImageCalls: boolean;
        }>;
        if (value.baseUrl) setBaseUrl(value.baseUrl);
        if (value.visionModel) setVisionModel(value.visionModel);
        if (value.imageModel) setImageModel(value.imageModel);
        if (value.imageSize) setImageSize(value.imageSize);
        if (value.quality) setQuality(value.quality);
        if (value.maxLayers) setMaxLayers(value.maxLayers);
        if (typeof value.useAllImageCalls === "boolean") setUseAllImageCalls(value.useAllImageCalls);
      }
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    }
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ baseUrl, visionModel, imageModel, imageSize, quality, maxLayers, useAllImageCalls }),
    );
  }, [baseUrl, visionModel, imageModel, imageSize, quality, maxLayers, useAllImageCalls, settingsReady]);

  useEffect(() => {
    if (!file) {
      setPreviewSource("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!running || runStartedAt === null) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - runStartedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [running, runStartedAt]);

  const elapsedLabel = useMemo(() => {
    const minutes = Math.floor(elapsed / 60);
    return `${minutes ? `${minutes}分 ` : ""}${String(elapsed % 60).padStart(2, "0")}秒`;
  }, [elapsed]);

  function acceptFile(candidate?: File) {
    if (!candidate) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(candidate.type)) {
      setErrorMessage("请选择 PNG、JPG 或 WebP 图片。");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setErrorMessage("图片不能超过 20 MB。");
      return;
    }
    setErrorMessage("");
    setOutput(null);
    setFile(candidate);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  async function testConnection() {
    if (!apiKey.trim()) {
      setTestMessage("先填写中转站 API Key。");
      return;
    }
    setTesting(true);
    setTestMessage("");
    try {
      const response = await fetch("/image2psd-demo/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, visionModel }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "接口测试失败");
      setTestMessage(`已连通 ${result.protocol || "Responses API"} · ${result.model || visionModel} · ${result.elapsedMs} ms`);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "接口测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function runPipeline() {
    if (!file) {
      setErrorMessage("先选择一张要拆层的图片。");
      return;
    }
    if (!mockMode && !apiKey.trim()) {
      setErrorMessage("填写 API Key，或开启离线模拟先检查 PSD 输出流程。");
      return;
    }
    setErrorMessage("");
    setOutput(null);
    setLogs([addLog(mockMode ? "启动离线结构测试，不会请求中转站。" : "已提交图片，开始执行分层流程。")]);
    setRunning(true);
    setRunStartedAt(Date.now());
    setElapsed(0);

    const body = new FormData();
    body.set("source", file);
    body.set("baseUrl", baseUrl);
    body.set("apiKey", apiKey);
    body.set("visionModel", visionModel);
    body.set("imageModel", imageModel);
    body.set("imageSize", imageSize);
    body.set("quality", quality);
    body.set("maxLayers", String(maxLayers));
    body.set("allImageCalls", String(useAllImageCalls));
    body.set("mock", String(mockMode));

    try {
      const response = await fetch("/image2psd-demo/api/run", { method: "POST", body });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "无法启动分层任务");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      const handleLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        let event: StreamEvent;
        try {
          event = JSON.parse(line.slice(6)) as StreamEvent;
        } catch {
          return;
        }
        if (event.type === "progress") setLogs((current) => [...current, addLog(event.message)]);
        if (event.type === "error") {
          setErrorMessage(event.message);
          setLogs((current) => [...current, addLog(event.message, "error")]);
          completed = true;
        }
        if (event.type === "complete") {
          setOutput(event.output);
          const partial = event.output.status?.startsWith("partial") && (event.output.errors?.length || 0) > 0;
          setLogs((current) => [...current, addLog(partial ? `PSD 已生成，但有 ${event.output.errors?.length} 个图层需要检查。` : "PSD 已生成，可以预览并下载。", partial ? "error" : "success")]);
          completed = true;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) handleLine(line.trim());
      }
      if (buffer.trim()) handleLine(buffer.trim());
      if (!completed) throw new Error("任务连接提前结束，请查看服务端日志后重试。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "分层任务失败";
      setErrorMessage(message);
      setLogs((current) => [...current, addLog(message, "error")]);
    } finally {
      setRunning(false);
      setRunStartedAt(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 text-slate-900 sm:px-7 sm:py-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/image-studio" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-indigo-700">
            <ArrowLeft size={16} /> 返回生图工作台
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/image2psd-demo" className="rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50">双模式生图</Link>
            <Link href="/image2psd-demo/projects" className="rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50">其他项目测试</Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> 临时实验环境
            </span>
          </div>
        </header>

        <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#111a34] px-6 py-7 text-white shadow-[0_24px_80px_rgba(35,53,110,0.22)] sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-150px] right-[22%] h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                <Sparkles size={15} /> GPT Image · Layered PSD
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">图片拆层实验台</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                配置 OpenAI 兼容中转站，上传海报或商品图，验证视觉分析、元素提取与 PSD 组装的完整链路。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs sm:min-w-[330px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                <div className="text-slate-400">视觉分析</div>
                <div className="mt-1.5 font-medium text-white">Responses API</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                <div className="text-slate-400">元素提取</div>
                <div className="mt-1.5 font-medium text-white">Images Edit API</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold"><Settings2 size={18} className="text-indigo-600" /> 中转站配置</div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">按项目的 Responses 和 Images Edit 接口调用</p>
                </div>
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Radio size={16} /></span>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">API Base URL</span>
                  <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-relay.example/v1" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><KeyRound size={13} /> API Key</span>
                  <input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  <span className="mt-1.5 block text-[11px] leading-4 text-slate-400">只随本次请求传给本地服务，不保存到浏览器存储或项目文件。</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">视觉模型</span>
                    <input value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="gpt-5.2" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">图像模型</span>
                    <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} placeholder="gpt-image-2" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">图片尺寸</span>
                    <select value={imageSize} onChange={(event) => setImageSize(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                      <option value="auto">自动</option><option value="1024x1024">1:1</option><option value="1024x1536">2:3</option><option value="1536x1024">3:2</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">质量</span>
                    <select value={quality} onChange={(event) => setQuality(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                      <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">最多图层</span>
                    <select value={maxLayers} onChange={(event) => setMaxLayers(Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                      <option value={6}>6</option><option value={12}>12</option><option value={18}>18</option><option value={24}>24</option>
                    </select>
                  </label>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <input type="checkbox" checked={useAllImageCalls} onChange={(event) => setUseAllImageCalls(event.target.checked)} className="mt-0.5 accent-indigo-600" />
                  <span><b className="font-semibold text-slate-700">所有元素都调用图像模型</b><span className="mt-0.5 block text-[11px] text-slate-400">关闭时，简单文字和图标可能在本地按识别框提取。</span></span>
                </label>

                <div className="flex flex-col gap-2">
                  <button type="button" onClick={testConnection} disabled={testing || mockMode} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {testing ? <LoaderCircle size={15} className="animate-spin" /> : <Activity size={15} />}
                    {testing ? "测试中…" : "测试视觉模型连接"}
                  </button>
                  {testMessage && <p className={`text-xs leading-5 ${testMessage.startsWith("已连通") ? "text-emerald-700" : "text-rose-600"}`}>{testMessage}</p>}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-base font-semibold"><FileImage size={18} className="text-indigo-600" /> 输入图片</div>
                {file && <button type="button" onClick={() => setFile(null)} className="text-xs text-slate-400 transition hover:text-rose-600">移除</button>}
              </div>
              <label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`relative flex min-h-[170px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed transition ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50/80 hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="sr-only" />
                {previewSource ? (
                  <>
                    <img src={previewSource} alt="输入图片预览" className="absolute inset-0 h-full w-full object-contain p-3" />
                    <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-slate-950/75 to-transparent px-4 pb-3 pt-9 text-xs font-medium text-white">{file?.name}</div>
                  </>
                ) : (
                  <>
                    <span className="mb-3 rounded-2xl bg-white p-3 text-indigo-600 shadow-sm"><Upload size={20} /></span>
                    <span className="text-sm font-semibold text-slate-700">点击选择，或拖入图片</span>
                    <span className="mt-1.5 text-xs text-slate-400">PNG / JPG / WebP · 最大 20 MB</span>
                  </>
                )}
              </label>
              {file && <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span className="truncate">{file.name}</span><span className="shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}

              <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-600"><Sparkles size={14} className="text-amber-500" /> 离线模拟（仅检查 PSD 写入）</span>
                <input type="checkbox" checked={mockMode} onChange={(event) => setMockMode(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
              </label>
              <p className="mt-2 px-1 text-[11px] leading-4 text-slate-400">模拟模式不会请求模型，真实拆层请关闭后填写中转站配置。</p>

              {errorMessage && <div className="mt-3 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700"><XCircle size={15} className="mt-0.5 shrink-0" />{errorMessage}</div>}

              <button type="button" onClick={runPipeline} disabled={running || !file} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#273ea8] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(39,62,168,0.2)] transition hover:bg-[#1d318e] disabled:cursor-not-allowed disabled:opacity-50">
                {running ? <LoaderCircle size={17} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                {running ? "正在运行分层流程…" : "开始生成分层 PSD"}
              </button>
            </section>
          </aside>

          <div className="space-y-5">
            <section className="overflow-hidden rounded-3xl border border-white/90 bg-white/85 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold"><Layers3 size={18} className="text-indigo-600" /> 处理记录与结果</div>
                  <p className="mt-1 text-xs text-slate-500">实时显示模型阶段、图层提取操作和 PSD 输出状态</p>
                </div>
                <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${running ? "bg-amber-50 text-amber-700" : output ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-amber-500" : output ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {running ? "处理中" : output ? "已完成" : "等待运行"}
                  {running && <span className="ml-1 inline-flex items-center gap-1 font-normal"><Clock3 size={12} />{elapsedLabel}</span>}
                </div>
              </div>

              {logs.length ? (
                <div className="max-h-[300px] space-y-3 overflow-y-auto px-5 py-4 sm:px-6" aria-live="polite">
                  {logs.map((entry) => (
                    <div key={entry.id} className="flex gap-3">
                      <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${entry.tone === "success" ? "bg-emerald-100 text-emerald-700" : entry.tone === "error" ? "bg-rose-100 text-rose-700" : "bg-indigo-50 text-indigo-600"}`}>
                        {entry.tone === "success" ? <Check size={12} /> : entry.tone === "error" ? <XCircle size={12} /> : <Activity size={12} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm leading-5 ${entry.tone === "error" ? "text-rose-700" : "text-slate-700"}`}>{entry.message}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{entry.time}</div>
                      </div>
                    </div>
                  ))}
                  {running && <div className="ml-2 h-4 border-l border-dashed border-indigo-200" />}
                </div>
              ) : (
                <div className="flex min-h-[190px] flex-col items-center justify-center px-6 text-center">
                  <span className="mb-3 rounded-2xl bg-indigo-50 p-3 text-indigo-500"><ImagePlus size={20} /></span>
                  <div className="text-sm font-semibold text-slate-700">等待提交任务</div>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">上传图片后启动流程，这里会显示模型分析、元素提取和 PSD 组装过程。</p>
                </div>
              )}
            </section>

            {output ? (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                <div className="overflow-hidden rounded-3xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_40px_rgba(44,62,108,0.08)] sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div><div className="text-sm font-semibold text-slate-800">PSD 合成预览</div><div className="mt-1 text-xs text-slate-400">{output.width && output.height ? `${output.width} × ${output.height}` : "透明图层合成结果"}</div></div>
                    <a href={output.downloadUrl} className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-700"><ArrowDownToLine size={14} />下载 PSD</a>
                  </div>
                  <a href={output.previewUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-[#20232a]">
                    <img src={output.previewUrl} alt="PSD 合成预览" className="mx-auto max-h-[580px] w-full object-contain" />
                    <span className="absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-white opacity-0 transition group-hover:opacity-100"><ExternalLink size={14} /></span>
                  </a>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={output.contactSheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700"><ExternalLink size={13} />查看元素总览图</a>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"><ShieldCheck size={13} />图层写入完成</span>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_40px_rgba(44,62,108,0.08)] sm:p-5">
                  <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-slate-800">识别图层</div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{output.layers.length} 层</span></div>
                  <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {output.layers.map((layer, index) => (
                      <div key={`${index}-${layer.name}`} className="rounded-xl border border-slate-100 bg-white px-3.5 py-3">
                        <div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-500">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{layer.name}</span><span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-500">{layer.type || "元素"}</span></div>
                        {layer.bbox && <div className="mt-2 pl-8 text-[10px] text-slate-400">识别区域：{layer.bbox.join(", ")}</div>}
                      </div>
                    ))}
                  </div>
                  {!!output.errors?.length && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">{output.errors.map((message, index) => <div key={`${index}-${message}`}>{message}</div>)}</div>}
                  <div className="mt-4 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />文字和图形以栅格图层为主，模型提取结果可能与原图有细节差异，建议检查预览后再使用。</div>
                </div>
              </section>
            ) : (
              <section className="grid gap-4 sm:grid-cols-3">
                {[
                  ["01", "分析画面", "视觉模型识别主体、标题、图标和层级位置。"],
                  ["02", "提取元素", "图像模型生成透明元素图层，简单元素可本地提取。"],
                  ["03", "写入 PSD", "按图层清单合成预览，并生成可下载的 PSD 文件。"],
                ].map(([number, title, description]) => (
                  <div key={number} className="rounded-2xl border border-white/90 bg-white/65 p-4 shadow-sm">
                    <div className="text-[11px] font-bold tracking-widest text-indigo-500">{number}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">{title}</div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>

        <footer className="mt-6 flex flex-col gap-2 border-t border-white/70 px-1 pt-4 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>仅开发环境可访问 · 任务产物保存在项目 .cache/image2psd-demo 下</span>
          <span>接口连通测试只调用 Responses 文本接口；完整任务还会调用图像编辑接口。</span>
        </footer>
      </div>
    </main>
  );
}
