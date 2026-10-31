"use client";

import { Activity, ArrowDownToLine, ArrowLeft, Check, ChevronRight, FileImage, Layers3, LoaderCircle, Settings2, Sparkles, Square, Type, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Log = { message: string; time: string; error?: boolean };
type Plan = { style: string; assets: Array<{ name: string; box: number[] }>; texts: Array<{ value: string; color: string }> };
type Output = {
  mode: "normal" | "psd"; mock: boolean; width: number; height: number; nativeTextCount?: number;
  previewUrl: string; downloadUrl: string; bundleUrl?: string; planUrl?: string;
  layers: Array<{ name: string; type: string; previewUrl: string; text?: { value: string } }>;
};
type StreamEvent = { type: string; message?: string; stage?: string; completed?: number; total?: number; plan?: Plan; output?: Output };
const SETTINGS_KEY = "image2psd-demo-settings-v1";
const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50";
const panel = "rounded-2xl border border-slate-200/80 bg-white shadow-sm";
const psdSteps = [["plan", "规划图层"], ["assets", "分别生成"], ["typography", "原生文字排版"], ["export", "导出 PSD"]];

export default function Image2PsdDemoWorkspace() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [visionModel, setVisionModel] = useState("gpt-5.2");
  const [imageModel, setImageModel] = useState("gpt-image-2");
  const [imageSize, setImageSize] = useState("1024x1024");
  const [quality, setQuality] = useState("high");
  const [ready, setReady] = useState(false);
  const [psdMode, setPsdMode] = useState(false);
  const [maxAssets, setMaxAssets] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [copy, setCopy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [mock, setMock] = useState(false);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (typeof saved.baseUrl === "string") setBaseUrl(saved.baseUrl);
      if (typeof saved.visionModel === "string") setVisionModel(saved.visionModel);
      if (typeof saved.imageModel === "string") setImageModel(saved.imageModel);
      if (["1024x1024", "1024x1536", "1536x1024"].includes(saved.imageSize)) setImageSize(saved.imageSize);
      if (["high", "medium", "low"].includes(saved.quality)) setQuality(saved.quality);
    } catch { /* Invalid settings do not prevent a new run. */ }
    setReady(true);
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      const previous = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...previous, baseUrl, visionModel, imageModel, imageSize, quality }));
    } catch { /* Browser storage may be disabled. */ }
  }, [ready, baseUrl, visionModel, imageModel, imageSize, quality]);
  useEffect(() => {
    if (!file) { setReferenceUrl(""); return; }
    const url = URL.createObjectURL(file);
    setReferenceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const viewport = logEnd.current?.parentElement;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [logs]);

  const append = (message: string, isError = false) => setLogs(current => [...current, { message, error: isError, time: new Date().toLocaleTimeString("zh-CN", { hour12: false }) }]);
  const resetResult = () => { setOutput(null); setPlan(null); setStage(""); setProgress({ completed: 0, total: 0 }); setLogs([]); setError(""); };
  async function testConnection() {
    setTesting(true); setTestMessage("");
    try {
      const response = await fetch("/image2psd-demo/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl, apiKey, visionModel }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "连接失败");
      setTestMessage(`已连通 · ${result.protocol} · ${result.elapsedMs} ms（仅文字接口）`);
    } catch (err) { setTestMessage(err instanceof Error ? err.message : "连接失败"); }
    finally { setTesting(false); }
  }
  async function run() {
    if (abort.current) return;
    if (!prompt.trim()) { setError("请先填写设计需求。"); return; }
    if (!mock && (!baseUrl.trim() || !apiKey.trim() || !imageModel.trim() || (psdMode && !visionModel.trim()))) {
      setError("请补全中转站地址、API Key 和当前模式需要的模型名称。"); return;
    }
    resetResult(); setElapsed(0); setRunning(true);
    append(mock ? "离线模拟：验证流程与文件结构，不代表模型生成效果。" : psdMode ? "PSD 任务已提交，准备规划图层。" : "普通出图任务已提交，直接生成成品图。");
    const controller = new AbortController();
    abort.current = controller;
    const body = new FormData();
    for (const [key, value] of Object.entries({ mode: psdMode ? "psd" : "normal", prompt, copy, baseUrl, apiKey, visionModel, imageModel, imageSize, quality, maxAssets: String(maxAssets), mock: String(mock) })) body.set(key, value);
    if (file) body.set("source", file);
    try {
      const response = await fetch("/image2psd-demo/api/generate", { method: "POST", body, signal: controller.signal });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "任务启动失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", completed = false;
      const handle = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        if (event.type === "error") throw new Error(event.message || "生成失败");
        if (event.type === "progress") {
          if (event.message) append(event.message);
          if (event.stage) setStage(event.stage);
          if (event.total) setProgress({ completed: event.completed || 0, total: event.total });
          if (event.plan) setPlan(event.plan);
        }
        if (event.type === "complete" && event.output) {
          setOutput(event.output); completed = true;
          append(event.output.mode === "psd" ? "PSD 与素材包已就绪。" : "成品图片已就绪。");
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) handle(line.trim());
      }
      buffer += decoder.decode();
      if (buffer.trim()) handle(buffer.trim());
      if (!completed) throw new Error("任务连接提前结束，请重试。");
    } catch (err) {
      const message = controller.signal.aborted ? "任务已停止。" : err instanceof Error ? err.message : "生成失败";
      controller.abort(); setError(message); append(message, true);
    } finally { abort.current = null; setRunning(false); }
  }
  const steps = psdMode ? psdSteps : [["generate", "生成成品图"]];
  const activeIndex = steps.findIndex(([key]) => key === stage);

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-6 pt-16 text-slate-900 sm:px-8 xl:pr-[370px] xl:pt-6">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <Link href="/image-studio" className="inline-flex items-center gap-1.5 hover:text-indigo-600"><ArrowLeft size={14} /> 生图工作台</Link>
          <div className="flex gap-4"><Link href="/image2psd-demo/legacy" className="hover:text-indigo-600">原图片拆层测试</Link><Link href="/image2psd-demo/projects" className="hover:text-indigo-600">开源项目对比</Link></div>
        </header>
        <section className="mb-6 rounded-3xl bg-[#111d37] p-6 text-white sm:p-8">
          <div className="mb-3 flex items-center gap-2 text-xs tracking-widest text-emerald-200"><Sparkles size={15} /> IMAGE LAB / 双模式生图</div>
          <h1 className="text-3xl font-semibold tracking-tight">从一个想法，到一张成品。</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">默认直接出图。需要继续设计时，勾选 PSD 模式，从生成开始保留图层。</p>
        </section>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <fieldset disabled={running || testing} className="min-w-0 space-y-5 disabled:opacity-80">
              <section className={`${panel} p-5`}>
                <div className="flex items-center justify-between"><h2 className="font-semibold">设计需求</h2><span className="text-[11px] text-slate-400">01 / 创作</span></div>
                <label className="mt-4 block text-xs font-medium text-slate-600">描述你想生成的画面<textarea aria-label="设计需求" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={6000} rows={5} placeholder="例如：为薄荷绿保温杯设计一张新品海报。深蓝背景，柔和侧光，主体居中，顶部留出标题空间。" className={`${field} resize-y leading-6`} /></label>
                <label className="mt-4 block text-xs font-medium text-slate-600">画面文案<textarea aria-label="画面文案" value={copy} onChange={e => setCopy(e.target.value)} rows={3} maxLength={1400} placeholder={"每行一段文案，例如：\n轻装出发\n每一口，都刚刚好"} className={`${field} resize-y`} /></label>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-400">最多 8 行。PSD 模式每行生成一个可编辑文字层；留空则不添加文字。</p>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
                  {referenceUrl ? <img src={referenceUrl} alt="参考图" className="h-14 w-14 rounded-lg object-cover" /> : <Upload size={20} className="text-slate-400" />}
                  <label className="min-w-0 flex-1 cursor-pointer text-xs text-slate-600"><span className="block truncate font-medium">{file?.name || "添加参考图（可选）"}</span><span className="mt-1 block text-[11px] text-slate-400">PNG / JPG / WebP · 最大 20 MB</span>
                    <input aria-label="参考图" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { const candidate = e.target.files?.[0]; if (candidate) { if (candidate.size > 20*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(candidate.type)) setError("参考图格式不支持或超过 20 MB。"); else { setFile(candidate); setError(""); } } e.target.value = ""; }} />
                  </label>
                  {file && <button type="button" aria-label="移除参考图" onClick={() => setFile(null)}><X size={16} /></button>}
                </div>
              </section>
              <section className={`${panel} overflow-hidden`}>
                <label className={`flex cursor-pointer items-start gap-3 p-5 transition ${psdMode ? "bg-indigo-50" : "bg-white"}`}>
                  <input type="checkbox" aria-label="PSD 模式" checked={psdMode} onChange={e => { setPsdMode(e.target.checked); resetResult(); }} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <div className="flex-1"><div className="flex items-center gap-2 font-semibold"><Layers3 size={17} className="text-indigo-600" /> PSD 模式</div><p className="mt-1.5 text-xs leading-5 text-slate-500">{psdMode ? "分别生成素材，保留原生文字，交付分层 PSD。" : "当前为普通出图：直接生成并下载 PNG。"}</p></div>
                </label>
                {psdMode && <div className="border-t border-indigo-100 p-5 pt-4"><div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-indigo-700">{psdSteps.map(([, label], i) => <span key={label} className="inline-flex items-center gap-1.5">{i > 0 && <ChevronRight size={12} />}{label}</span>)}</div>
                  <label className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-600">最多独立图片素材<select aria-label="最多独立图片素材" value={maxAssets} onChange={e => setMaxAssets(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2">{[1,2,3,4].map(n => <option key={n} value={n}>{n} 个</option>)}</select></label>
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">背景和文字另计。会增加模型调用次数与耗时；素材生成需要图像编辑和透明 PNG 输出能力。</p>
                </div>}
              </section>
              <details className={`${panel} p-5`} open>
                <summary className="cursor-pointer text-sm font-semibold"><Settings2 size={16} className="mr-2 inline text-indigo-600" />中转站与生成设置</summary>
                <label className="mt-4 block text-xs font-medium text-slate-600">API Base URL<input aria-label="API Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-relay.example/v1" className={field} /></label>
                <label className="mt-3 block text-xs font-medium text-slate-600">API Key<input aria-label="API Key" type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="仅本次使用，不保存" className={field} /></label>
                <label className="mt-3 block text-xs font-medium text-slate-600">图像模型<input aria-label="图像模型" value={imageModel} onChange={e => setImageModel(e.target.value)} className={field} /></label>
                {psdMode && <label className="mt-3 block text-xs font-medium text-slate-600">规划模型<input aria-label="规划模型" value={visionModel} onChange={e => setVisionModel(e.target.value)} className={field} /></label>}
                <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-600">画布比例<select aria-label="画布比例" value={imageSize} onChange={e => setImageSize(e.target.value)} className={field}><option value="1024x1024">1:1 · 1024²</option><option value="1024x1536">2:3 · 竖版</option><option value="1536x1024">3:2 · 横版</option></select></label><label className="text-xs font-medium text-slate-600">质量<select aria-label="图片质量" value={quality} onChange={e => setQuality(e.target.value)} className={field}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label></div>
                {psdMode && <button type="button" onClick={testConnection} disabled={testing || mock || !apiKey} className="mt-4 w-full rounded-xl border border-indigo-200 py-2.5 text-xs font-medium text-indigo-700 disabled:opacity-40">{testing ? "连接测试中…" : "测试规划模型连接"}</button>}
                {testMessage && psdMode && <p className="mt-2 break-words text-xs text-slate-500">{testMessage}</p>}
                <label className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">离线模拟（不调用模型）<input type="checkbox" aria-label="离线模拟" checked={mock} onChange={e => setMock(e.target.checked)} className="h-4 w-4 accent-indigo-600" /></label>
              </details>
            </fieldset>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">{error}</div>}
            <div className="flex gap-2"><button type="button" onClick={run} disabled={running || testing || !prompt.trim()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{running ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}{running ? "正在生成…" : psdMode ? "生成分层 PSD" : "生成图片"}</button>{running && <button type="button" onClick={() => abort.current?.abort()} className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 text-xs"><Square size={13} />停止</button>}</div>
          </div>
          <section className="min-w-0 space-y-5 lg:sticky lg:top-6">
            <div className={`${panel} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-semibold"><FileImage size={17} className="text-indigo-600" />{output?.mode === "psd" ? "PSD 合成预览" : "成品预览"}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">{output ? `${output.width} × ${output.height}` : psdMode ? "分层交付" : "普通出图"}</span></div>
              {output ? <div className="p-4"><a href={output.previewUrl} target="_blank" rel="noreferrer"><img src={output.previewUrl} alt="生成结果" className="max-h-[600px] w-full rounded-xl bg-slate-100 object-contain" /></a>{output.mock && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">离线模拟样例，仅验证流程与文件结构。</p>}<div className="mt-4 flex flex-wrap gap-2"><a href={`${output.downloadUrl}?download=1`} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white"><ArrowDownToLine size={14} />下载 {output.mode === "psd" ? "PSD" : "PNG"}</a>{output.mode === "psd" && <><a href={`${output.previewUrl}?download=1`} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs">下载成品 PNG</a><a href={output.bundleUrl} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs">素材包 ZIP</a></>}</div></div> : <div className="flex min-h-[340px] flex-col items-center justify-center px-7 text-center"><span className="rounded-2xl bg-indigo-50 p-4 text-indigo-500">{running ? <LoaderCircle size={26} className="animate-spin" /> : <FileImage size={26} />}</span><h3 className="mt-4 font-medium">{running ? "正在把想法变成画面" : "从左侧填写第一个想法"}</h3><p className="mt-2 text-xs leading-6 text-slate-400">{psdMode ? "完成后可下载 PSD、成品 PNG 和独立素材。" : "普通模式直接生成图片，无需图层规划。"}</p></div>}
            </div>
            {psdMode && <div className={`${panel} p-5`}><h2 className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={16} className="text-indigo-600" />{output ? `交付图层 · ${output.layers.length} 层` : "图层计划"}</h2>
              {output ? <><div className="mt-4 space-y-2">{[...output.layers].reverse().map((layer, i) => <div key={`${i}-${layer.name}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-200">{layer.type === "text" ? <Type size={18} className="text-indigo-600" /> : <img src={layer.previewUrl} alt={layer.name} className="h-full w-full object-contain" />}</div><div className="min-w-0"><div className="truncate text-xs font-medium">{layer.name}</div><div className="mt-1 text-[10px] text-slate-400">{layer.type === "text" ? "原生可编辑文字" : layer.type === "background" ? "背景像素层" : "独立透明素材"}</div></div></div>)}</div><p className="mt-3 text-[11px] leading-5 text-slate-400">{output.nativeTextCount} 个原生文字层已通过文件回读。使用微软雅黑；在 Photoshop 重新编辑时，字体与渲染可能产生差异。</p><a href={output.planUrl} className="mt-3 inline-block text-xs text-indigo-600">下载图层计划 JSON →</a></> : plan ? <div className="mt-3 space-y-2 text-xs text-slate-600"><p className="rounded-lg bg-indigo-50 p-3 leading-5">{plan.style}</p><p className="py-1">背景 · 独立生成</p>{plan.assets.map((asset, i) => <p key={i} className="rounded-lg bg-slate-50 p-2.5">{i+1}. {asset.name}</p>)}{plan.texts.map((text, i) => <p key={i} className="flex gap-2 rounded-lg bg-slate-50 p-2.5"><Type size={13} />{text.value}</p>)}</div> : <p className="mt-3 text-xs leading-6 text-slate-400">启动 PSD 任务后，规划结果会在这里出现。文字取自你填写的文案，不交给图像模型绘制。</p>}
            </div>}
          </section>
        </div>
        <button type="button" onClick={() => setLogOpen(value => !value)} aria-expanded={logOpen} aria-controls="generation-task-log" className="fixed right-4 top-3 z-40 flex items-center gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-medium text-indigo-700 shadow-md xl:hidden"><Activity size={14} />{logOpen ? "收起日志" : running ? "执行中 · 查看日志" : "任务日志"}</button>
        <aside id="generation-task-log" className={`${panel} fixed right-4 top-14 z-30 w-[min(320px,calc(100vw-32px))] overflow-hidden shadow-lg xl:right-6 xl:top-6 xl:w-[320px] ${logOpen ? "block" : "hidden xl:block"}`} aria-label="任务日志">
          <div className="border-b border-slate-100 p-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={16} className="text-indigo-600" />任务日志</h2><span className={`text-[11px] ${error ? "text-rose-600" : running ? "text-indigo-600" : "text-slate-400"}`}>{running ? `${elapsed}s · 执行中` : error ? "已停止" : output ? "已完成" : "待开始"}</span></div>
            <div className="mt-4 space-y-2">{steps.map(([key, title], index) => <div key={key} className={`flex items-center gap-2 text-xs ${activeIndex === index && running ? "font-semibold text-indigo-700" : "text-slate-500"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full ${output || index < activeIndex ? "bg-emerald-50 text-emerald-600" : "bg-slate-100"}`}>{output || index < activeIndex ? <Check size={12} /> : activeIndex === index && running ? <LoaderCircle size={12} className="animate-spin" /> : index+1}</span>{title}</div>)}</div>
            {progress.total > 0 && <p className="mt-3 text-[11px] text-slate-400">已完成 {progress.completed} / {progress.total} 个步骤 · 按实际完成阶段计数</p>}
          </div>
          <div className="max-h-[36vh] space-y-4 overflow-y-auto p-4 xl:max-h-[55vh]" role="log" aria-live="polite">{logs.length ? logs.map((log, i) => <div key={i}><div className="mb-1 text-[10px] tabular-nums text-slate-400">{log.time}</div><p className={`break-words text-xs leading-5 ${log.error ? "text-rose-600" : "text-slate-600"}`}>{log.message}</p></div>) : <p className="text-xs leading-6 text-slate-400">这里会记录当前任务、模型调用阶段、已完成步骤和文件验证结果。</p>}<div ref={logEnd} /></div>
        </aside>
        <p className="mt-6 text-[11px] leading-5 text-slate-400">开发环境 Demo · 沿用已有中转站设置 · API Key 仅用于本次任务，不写入浏览器存储或生成文件。</p>
      </div>
    </main>
  );
}
