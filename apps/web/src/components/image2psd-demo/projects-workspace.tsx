"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CircleHelp,
  Eye,
  FileImage,
  Layers3,
  LoaderCircle,
  Play,
  Scissors,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";

type Engine = "design-to-psd" | "bggg-creator-image2psd";
type LogEntry = { id: string; time: string; message: string; tone: "info" | "success" | "error" };
type RunOutput = {
  runId: string;
  engine: Engine;
  downloadUrl: string;
  previewUrl: string;
  width?: number;
  height?: number;
  layerCount?: number;
  layers: Array<{ name: string; visible: boolean }>;
};
type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "complete"; output: RunOutput }
  | { type: "error"; message: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function makeLog(message: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    message,
    tone,
  };
}

export default function PsdProjectsDemoWorkspace() {
  const [engine, setEngine] = useState<Engine>("design-to-psd");
  const [file, setFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("品牌主视觉");
  const [titleX, setTitleX] = useState(50);
  const [titleY, setTitleY] = useState(18);
  const [titleSize, setTitleSize] = useState(64);
  const [titleColor, setTitleColor] = useState("#ffffff");
  const [extractSubject, setExtractSubject] = useState(false);
  const [crop, setCrop] = useState({ x0: 22, y0: 24, x1: 78, y1: 78 });
  const [mask, setMask] = useState("foreground");
  const [colors, setColors] = useState(8);
  const [ignoreBackground, setIgnoreBackground] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<RunOutput | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setSourcePreview("");
      setDimensions(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSourcePreview(url);
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const elapsedLabel = useMemo(() => `${Math.floor(elapsed / 60) ? `${Math.floor(elapsed / 60)}分 ` : ""}${String(elapsed % 60).padStart(2, "0")}秒`, [elapsed]);

  function acceptFile(candidate?: File) {
    if (!candidate) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(candidate.type)) {
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

  async function runPipeline() {
    if (!file) {
      setErrorMessage("请先上传一张图片。");
      return;
    }
    setErrorMessage("");
    setOutput(null);
    setLogs([makeLog(`已选择 ${engine}，准备运行本地拆层流程。`)]);
    setRunning(true);
    setStartedAt(Date.now());
    setElapsed(0);

    const body = new FormData();
    body.set("source", file);
    body.set("mode", engine);
    if (engine === "bggg-creator-image2psd") {
      body.set("colors", String(colors));
      body.set("ignoreColor", ignoreBackground ? backgroundColor : "");
    } else {
      body.set("title", title);
      body.set("titleX", String(titleX));
      body.set("titleY", String(titleY));
      body.set("titleSize", String(titleSize));
      body.set("titleColor", titleColor);
      body.set("extractSubject", String(extractSubject));
      body.set("x0", String(crop.x0));
      body.set("y0", String(crop.y0));
      body.set("x1", String(crop.x1));
      body.set("y1", String(crop.y1));
      body.set("mask", mask);
    }

    try {
      const response = await fetch("/image2psd-demo/api/projects/run", { method: "POST", body });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "无法启动项目测试。");
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
        if (event.type === "progress") setLogs((current) => [...current, makeLog(event.message)]);
        if (event.type === "error") {
          setErrorMessage(event.message);
          setLogs((current) => [...current, makeLog(event.message, "error")]);
          completed = true;
        }
        if (event.type === "complete") {
          setOutput(event.output);
          setLogs((current) => [...current, makeLog(`PSD 已生成，包含 ${event.output.layerCount || event.output.layers.length} 个图层。`, "success")]);
          completed = true;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach((line) => handleLine(line.trim()));
      }
      if (buffer.trim()) handleLine(buffer.trim());
      if (!completed) throw new Error("任务连接提前结束，请查看服务端日志后重试。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "项目测试失败。";
      setErrorMessage(message);
      setLogs((current) => [...current, makeLog(message, "error")]);
    } finally {
      setRunning(false);
      setStartedAt(null);
    }
  }

  const engineName = engine === "design-to-psd" ? "design-to-psd" : "bggg-creator-image2psd";

  return (
    <main className="min-h-screen px-4 py-5 text-slate-900 sm:px-7 sm:py-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/image2psd-demo" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-indigo-700"><ArrowLeft size={16} /> 返回双模式生图 Demo</Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 本地项目对照实验</span>
        </header>

        <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#111a34] px-6 py-7 text-white shadow-[0_24px_80px_rgba(35,53,110,0.22)] sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200"><Layers3 size={15} /> PSD Project Lab</div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">其他拆层项目测试台</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">用同一张图片实测两种开源实现，直接对比拆层逻辑、图层预览和 PSD 文件。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs leading-5 text-slate-300"><span className="font-semibold text-white">本地执行</span><br />不需要中转站或模型 API Key</div>
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
              <div className="mb-4 flex items-center gap-2 text-base font-semibold"><Scissors size={18} className="text-indigo-600" /> 选择项目实现</div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                <button type="button" onClick={() => setEngine("design-to-psd")} className={`rounded-xl px-3 py-3 text-left transition ${engine === "design-to-psd" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  <span className="block text-sm font-semibold">design-to-psd</span><span className="mt-1 block text-[11px]">文字 / 主体重建</span>
                </button>
                <button type="button" onClick={() => setEngine("bggg-creator-image2psd")} className={`rounded-xl px-3 py-3 text-left transition ${engine === "bggg-creator-image2psd" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  <span className="block text-sm font-semibold">bggg creator</span><span className="mt-1 block text-[11px]">颜色聚类拆层</span>
                </button>
              </div>
              <div className="mt-4 flex gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900"><CircleHelp size={15} className="mt-0.5 shrink-0" />{engine === "design-to-psd" ? "该项目按配置生成背景、文字与选区图层；它不会自动识别图片语义。主体区域需要手动框选。" : "该项目把像素按相近颜色聚类，输出可移动的颜色块图层；它不等于主体、文字等语义识别。"}</div>
            </section>

            <section className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-base font-semibold"><FileImage size={18} className="text-indigo-600" /> 输入图片</div>
                {file && <button type="button" onClick={() => { setFile(null); setOutput(null); }} className="text-xs text-slate-400 transition hover:text-rose-600">移除</button>}
              </div>
              <label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed transition ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50/80 hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} className="sr-only" />
                {sourcePreview ? <><img src={sourcePreview} alt="输入图片预览" className="absolute inset-0 h-full w-full object-contain p-3" /><div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-slate-950/75 to-transparent px-4 pb-3 pt-9 text-xs font-medium text-white">{file?.name}</div></> : <><span className="mb-3 rounded-2xl bg-white p-3 text-indigo-600 shadow-sm"><Upload size={20} /></span><span className="text-sm font-semibold text-slate-700">点击选择，或拖入图片</span><span className="mt-1.5 text-xs text-slate-400">PNG / JPG / WebP · 最大 20 MB</span></>}
              </label>
              {file && <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500"><span className="truncate">{file.name}</span><span className="shrink-0">{dimensions ? `${dimensions.width} × ${dimensions.height}` : `${(file.size / 1024 / 1024).toFixed(2)} MB`}</span></div>}
            </section>

            {engine === "design-to-psd" ? (
              <section className="space-y-4 rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
                <div><h2 className="text-base font-semibold">design-to-psd 参数</h2><p className="mt-1 text-xs leading-5 text-slate-500">输出隐藏原图参考层、柔化背景层和下面配置的图层。</p></div>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">标题文字（留空则不加文字层）</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">中心 X %</span><input type="number" min={0} max={100} value={titleX} onChange={(event) => setTitleX(Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">中心 Y %</span><input type="number" min={0} max={100} value={titleY} onChange={(event) => setTitleY(Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">字号 px</span><input type="number" min={8} max={240} value={titleSize} onChange={(event) => setTitleSize(Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3"><span className="text-xs font-medium text-slate-600">标题颜色</span><input type="color" value={titleColor} onChange={(event) => setTitleColor(event.target.value)} className="h-7 w-12 cursor-pointer border-0 bg-transparent" /></label>
                <div className="rounded-2xl border border-slate-200 p-3.5">
                  <label className="flex cursor-pointer items-center justify-between"><span className="text-xs font-semibold text-slate-700">额外提取主体图层</span><input type="checkbox" checked={extractSubject} onChange={(event) => setExtractSubject(event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>
                  {extractSubject && <div className="mt-3 space-y-3">
                    <p className="text-[11px] leading-4 text-slate-400">主体框使用图片宽高百分比；请按输入图预览估计主体范围。</p>
                    <div className="grid grid-cols-4 gap-2">{(["x0", "y0", "x1", "y1"] as const).map((key) => <label key={key} className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">{key} %</span><input type="number" min={0} max={100} value={crop[key]} onChange={(event) => setCrop((current) => ({ ...current, [key]: Number(event.target.value) }))} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>)}</div>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">遮罩方式</span><select value={mask} onChange={(event) => setMask(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="foreground">前景色估算</option><option value="ellipse">椭圆羽化</option><option value="soft-rect">柔边矩形</option><option value="rect">矩形（小区域）</option></select></label>
                  </div>}
                </div>
              </section>
            ) : (
              <section className="space-y-4 rounded-3xl border border-white/90 bg-white/85 p-5 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl sm:p-6">
                <div><h2 className="text-base font-semibold">bggg-creator 参数</h2><p className="mt-1 text-xs leading-5 text-slate-500">运行 split-colors，将相似颜色区域写入不同图层。</p></div>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">颜色图层数量</span><select value={colors} onChange={(event) => setColors(Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value={4}>4 层</option><option value={6}>6 层</option><option value={8}>8 层</option><option value={12}>12 层</option><option value={16}>16 层</option><option value={24}>24 层</option></select></label>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3"><span className="text-xs font-medium text-slate-600">忽略近似背景色</span><input type="checkbox" checked={ignoreBackground} onChange={(event) => setIgnoreBackground(event.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>
                {ignoreBackground && <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"><span className="text-xs text-slate-500">颜色距离阈值 22</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="h-7 w-12 cursor-pointer border-0 bg-transparent" /></label>}
                <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-900">颜色聚类会按像素颜色分组，照片中的同一物体可能被拆到多个图层。</div>
              </section>
            )}

            {errorMessage && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700"><XCircle size={15} className="mt-0.5 shrink-0" />{errorMessage}</div>}
            <button type="button" onClick={runPipeline} disabled={running || !file} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#273ea8] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(39,62,168,0.2)] transition hover:bg-[#1d318e] disabled:cursor-not-allowed disabled:opacity-50">{running ? <LoaderCircle size={17} className="animate-spin" /> : <Play size={16} fill="currentColor" />}{running ? `正在运行 ${engineName}…` : `运行 ${engineName}`}</button>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/90 bg-white/85 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div><div className="flex items-center gap-2 text-base font-semibold"><Activity size={18} className="text-indigo-600" /> 执行日志</div><p className="mt-1 text-xs text-slate-500">{running ? `运行中 · ${elapsedLabel}` : "展示脚本阶段、PSD 写入和验证结果"}</p></div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${running ? "bg-amber-50 text-amber-700" : output ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-amber-500" : output ? "bg-emerald-500" : "bg-slate-400"}`} />{running ? "处理中" : output ? "已完成" : "等待运行"}</span>
              </div>
              <div className="max-h-[250px] space-y-3 overflow-y-auto px-5 py-4 sm:px-6" aria-live="polite">
                {logs.length ? logs.map((entry) => <div key={entry.id} className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${entry.tone === "success" ? "bg-emerald-100 text-emerald-700" : entry.tone === "error" ? "bg-rose-100 text-rose-700" : "bg-indigo-50 text-indigo-600"}`}>{entry.tone === "success" ? <Check size={12} /> : entry.tone === "error" ? <XCircle size={12} /> : <Activity size={12} />}</span><div className="min-w-0 flex-1"><div className={`text-sm leading-5 ${entry.tone === "error" ? "text-rose-700" : "text-slate-700"}`}>{entry.message}</div><div className="mt-1 text-[10px] text-slate-400">{entry.time}</div></div></div>) : <p className="py-6 text-center text-sm text-slate-400">上传图片并运行项目后，这里会显示处理进度。</p>}
              </div>
            </div>

            {output ? <div className="overflow-hidden rounded-3xl border border-white/90 bg-white/85 shadow-[0_12px_40px_rgba(44,62,108,0.08)] backdrop-blur-xl">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6"><div><div className="flex items-center gap-2 text-base font-semibold"><Sparkles size={18} className="text-emerald-600" /> 测试结果</div><p className="mt-1 text-xs text-slate-500">{output.width} × {output.height} · {output.layerCount} 个图层 · {output.engine}</p></div><a href={output.downloadUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700"><ArrowDownToLine size={15} /> 下载 PSD</a></div>
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl bg-[linear-gradient(45deg,#e9edf4_25%,transparent_25%),linear-gradient(-45deg,#e9edf4_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e9edf4_75%),linear-gradient(-45deg,transparent_75%,#e9edf4_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-4"><img src={output.previewUrl} alt={`${engineName} 生成的预览`} className="max-h-[560px] max-w-full rounded-lg object-contain shadow-lg" /></div>
                <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Eye size={15} className="text-indigo-600" /> 图层清单</h3><div className="mt-3 space-y-2">{output.layers.map((layer, index) => <div key={`${index}-${layer.name}`} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs"><Layers3 size={14} className="shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-slate-700">{layer.name}</span><span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${layer.visible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{layer.visible ? "显示" : "隐藏"}</span></div>)}</div></div>
              </div>
            </div> : <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/50 px-6 text-center"><span className="rounded-2xl bg-white p-4 text-indigo-600 shadow-sm"><Layers3 size={24} /></span><h2 className="mt-4 text-lg font-semibold text-slate-700">等待处理结果</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">选择一个项目并上传图片后运行。完成时会显示合成预览、图层列表和 PSD 下载入口。</p></div>}
          </section>
        </div>
      </div>
    </main>
  );
}
