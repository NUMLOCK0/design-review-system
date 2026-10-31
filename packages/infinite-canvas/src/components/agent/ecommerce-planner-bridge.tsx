import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, LoaderCircle, MessageSquareText, Palette, Plus } from "lucide-react";

import { canvasThemes } from "@infinite-canvas/lib/canvas-theme";
import type { CanvasAgentOp } from "@infinite-canvas/lib/canvas/canvas-agent-ops";
import { useAgentStore } from "@infinite-canvas/stores/use-agent-store";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
type DesignQuestion = { id: string; label: string; prompt: string; required: boolean; answerType: "text" | "textarea" | "select"; options: string[] };
type DesignDirection = { id: string; name: string; concept: string; positioning: string; audience: string; keywords: string[]; palette: Array<{ name: string; hex: string; usage: string }>; typography: string; imagery: string; rationale: string; deliverables: string[] };
type DesignPlan = {
    summary: string;
    brief: { brandName: string; productOrService: string; positioning: string; targetAudience: string; marketAndChannel: string; businessGoal: string; knownFacts: string[]; constraints: string[]; factsToConfirm: string[] };
    questions: DesignQuestion[];
    recommendedSkills: Array<{ skillId: string; reason: string }>;
    directions: DesignDirection[];
    nextSteps: string[];
    selectedDirectionId: string | null;
};
type SavedPlan = { version: number; status: "needs_review" | "approved"; inputBrief: string; answers: Record<string, string>; plan: DesignPlan; sourceConversation?: { type: "order" | "intake"; id: string } };
type Project = { id: string; name: string; platform: string | null; workflow: Record<string, any>; version: number; updatedAt?: string };
type Conversation = { id: string; conversationType: "order" | "invite"; title: string; orderNo?: string; counterpartName?: string };
type ApiResult<T> = { success: boolean; data: T; message?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api/image-studio${path}`, {
        ...options,
        credentials: "include",
        cache: "no-store",
        headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers },
    });
    const result = await response.json().catch(() => null) as ApiResult<T> | null;
    if (!response.ok || !result?.success) throw new Error(result?.message || `请求失败（${response.status}）`);
    return result.data;
}

function conversationSource(value: string) {
    const [type, id] = value.split(":", 2);
    if (!id || (type !== "order" && type !== "invite")) return undefined;
    return { type: type === "invite" ? "intake" as const : "order" as const, id };
}

export function EcommercePlannerBridge({ theme }: { theme: Theme }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectId, setProjectId] = useState("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationId, setConversationId] = useState("");
    const [brief, setBrief] = useState("");
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [plan, setPlan] = useState<DesignPlan | null>(null);
    const [planVersion, setPlanVersion] = useState(0);
    const [projectVersion, setProjectVersion] = useState(0);
    const [approved, setApproved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const selectedDirection = useMemo(() => plan?.directions.find((item) => item.id === plan.selectedDirectionId) || null, [plan]);
    const requiredAnswersComplete = Boolean(plan?.questions.every((question) => !question.required || Boolean(answers[question.id]?.trim())));

    useEffect(() => {
        let cancelled = false;
        void request<{ items: Project[] }>("/projects?limit=100").then(({ items }) => {
            if (cancelled) return;
            setProjects(items);
            const first = items[0];
            if (first) setProjectId(first.id);
        }).catch((cause) => {
            if (!cancelled) setError(cause instanceof Error ? cause.message : "无法加载生图项目");
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!projectId) { setConversations([]); setConversationId(""); setPlan(null); return; }
        let cancelled = false;
        setError("");
        void Promise.all([
            request<Project>(`/projects/${encodeURIComponent(projectId)}`),
            request<Conversation[]>(`/projects/${encodeURIComponent(projectId)}/collaboration-conversations`).catch(() => []),
        ]).then(([project, items]) => {
            if (cancelled) return;
            setProjects((current) => current.map((item) => item.id === project.id ? project : item));
            setProjectVersion(project.version);
            setConversations(items);
            setConversationId((current) => items.some((item) => `${item.conversationType}:${item.id}` === current) ? current : "");
            const saved = project.workflow?.designAgent as SavedPlan | undefined;
            if (saved?.plan) {
                setBrief(saved.inputBrief || "");
                setAnswers(saved.answers || {});
                setPlan(saved.plan);
                setPlanVersion(saved.version);
                setApproved(saved.status === "approved");
                setConversationId(saved.sourceConversation ? `${saved.sourceConversation.type === "intake" ? "invite" : "order"}:${saved.sourceConversation.id}` : "");
            } else {
                setBrief(""); setAnswers({}); setPlan(null); setPlanVersion(0); setApproved(false);
            }
        }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "无法加载项目资料"); });
        return () => { cancelled = true; };
    }, [projectId]);

    const generate = async () => {
        if (busy || !projectId || (brief.trim().length < 8 && !conversationId)) return;
        setBusy(true); setError(""); setNotice("");
        try {
            const source = conversationSource(conversationId);
            const result = await request<{ project: Project; designPlan: SavedPlan }>(`/projects/${encodeURIComponent(projectId)}/design-agent/plan`, {
                method: "POST",
                body: JSON.stringify({ brief: brief.trim() || "请根据所选客服会话整理商品需求，规划适用于电商套图的品牌视觉方向。", skillIds: [], answers, ...(source ? { sourceConversation: source } : {}) }),
            });
            setProjectVersion(result.project.version);
            setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item));
            setBrief(result.designPlan.inputBrief);
            setAnswers(result.designPlan.answers || {});
            setPlan(result.designPlan.plan);
            setPlanVersion(result.designPlan.version);
            setApproved(false);
            setNotice("方案已生成，请补充待确认信息并选择视觉方向。");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "生成策划方案失败"); }
        finally { setBusy(false); }
    };

    const savePlan = async (approve: boolean) => {
        if (!plan || !projectId || busy) return;
        setBusy(true); setError(""); setNotice("");
        try {
            const result = await request<{ project: Project; designPlan: SavedPlan }>(`/projects/${encodeURIComponent(projectId)}/design-agent/plan`, {
                method: "PUT",
                body: JSON.stringify({ version: projectVersion, planVersion, plan, answers, approve }),
            });
            setProjectVersion(result.project.version);
            setPlanVersion(result.designPlan.version);
            setApproved(result.designPlan.status === "approved");
            setProjects((current) => current.map((item) => item.id === result.project.id ? result.project : item));
            setNotice(approve ? "方向已确认，可以继续完善画布方案。" : "修改已保存。");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "保存策划方案失败"); }
        finally { setBusy(false); }
    };

    const handoffToCanvasAgent = () => {
        if (!plan || !selectedDirection || !approved) return;
        const project = projects.find((item) => item.id === projectId);
        const palette = selectedDirection.palette.map((color) => `${color.name} ${color.hex}（${color.usage}）`).join("、");
        const handoff = [
            "请基于以下已由客服确认的电商品牌视觉策划，在当前无限画布中继续执行。先检查现有画布节点，避免重复创建；优先创建可编辑的商品套图规划/提示词节点，不要直接调用生图或产生费用，等我确认后再生成。",
            `生图项目：${project?.name || "未命名项目"}`,
            `策划摘要：${plan.summary}`,
            `品牌/商品：${plan.brief.brandName || "待定"} / ${plan.brief.productOrService || "待定"}`,
            `定位：${selectedDirection.positioning || plan.brief.positioning || "待定"}`,
            `目标人群：${selectedDirection.audience || plan.brief.targetAudience || "待定"}`,
            `已确认方向：${selectedDirection.name}。${selectedDirection.concept}`,
            `配色：${palette || "未指定"}`,
            `字体与排版：${selectedDirection.typography || "未指定"}`,
            `图像风格：${selectedDirection.imagery || "未指定"}`,
            `方向关键词：${selectedDirection.keywords.join("、") || "无"}`,
            `交付建议：${selectedDirection.deliverables.join("、") || "电商商品套图"}`,
            plan.brief.constraints.length ? `约束：${plan.brief.constraints.join("；")}` : "",
            "请把以上策划转化为当前画布中的清晰执行结构，并说明接下来需要我确认的内容。",
        ].filter(Boolean).join("\n");
        useAgentStore.getState().setAgentState({ prompt: handoff, activeTab: "chat" });
    };

    const createCanvasPlan = () => {
        const canvasContext = useAgentStore.getState().canvasContext;
        if (!plan || !selectedDirection) return;
        if (!canvasContext) { setNotice("请先打开一个画布项目，再执行策划方案。"); return; }
        const existing = canvasContext.snapshot.nodes;
        const x = existing.length ? Math.max(...existing.map((node) => node.position.x + node.width)) + 48 : 80;
        const y = existing.length ? Math.min(...existing.map((node) => node.position.y)) : 80;
        const briefNodeId = crypto.randomUUID();
        const deliverables = selectedDirection.deliverables.filter((item) => item.trim()).slice(0, 8);
        const outputs = deliverables.length ? deliverables : ["电商商品主视觉"];
        const palette = selectedDirection.palette.map((color) => `${color.name} ${color.hex}（${color.usage}）`).join("、") || "未指定";
        const constraints = plan.brief.constraints.length ? plan.brief.constraints.join("；") : "不添加需求中未确认的商品参数、功效或宣传文案";
        const ops: CanvasAgentOp[] = [{ type: "add_node", id: briefNodeId, nodeType: "text", title: `策划方案 · ${selectedDirection.name}`, position: { x, y }, width: 760, height: 270, metadata: {
            content: `${plan.summary}\n\n商品：${plan.brief.brandName || "待定"} · ${plan.brief.productOrService || "待定"}\n视觉方向：${selectedDirection.name}｜${selectedDirection.concept}\n定位：${selectedDirection.positioning || plan.brief.positioning || "待定"}\n目标人群：${selectedDirection.audience || plan.brief.targetAudience || "待定"}\n配色：${palette}\n字体排版：${selectedDirection.typography || "未指定"}\n图像风格：${selectedDirection.imagery || "未指定"}\n执行约束：${constraints}`,
            status: "success", fontSize: 14,
        } }];
        const imageNodeIds: string[] = [];
        outputs.forEach((output, index) => {
            const id = crypto.randomUUID();
            imageNodeIds.push(id);
            const prompt = [
                `为${plan.brief.brandName || "品牌"}的${plan.brief.productOrService || "商品"}制作${output}。`,
                `采用「${selectedDirection.name}」视觉方向：${selectedDirection.concept}`,
                `目标人群：${selectedDirection.audience || plan.brief.targetAudience || "按项目资料"}。`,
                `色彩：${palette}。`,
                `字体与排版：${selectedDirection.typography || "清晰易读"}。`,
                `摄影与图像风格：${selectedDirection.imagery || "真实、精致的电商视觉"}。`,
                `关键词：${selectedDirection.keywords.join("、") || "商品质感、品牌一致性"}。`,
                `约束：${constraints}。商品外观需贴合已提供的参考素材，不臆造商品细节。`,
            ].join("\n");
            ops.push({ type: "add_node", id, nodeType: "image", title: `${index + 1}. ${output}`, position: { x: x + ((index % 3) * 380), y: y + 320 + Math.floor(index / 3) * 290 }, width: 340, height: 240, metadata: {
                prompt, composerContent: prompt, generationMode: "image", generationType: "generation", status: "idle", count: 1,
            } });
            ops.push({ type: "connect_nodes", fromNodeId: briefNodeId, toNodeId: id });
        });
        ops.push({ type: "select_nodes", ids: imageNodeIds });
        canvasContext.applyOps(ops);
        setNotice("方案已添加到画布，可以继续调整每张图片的内容。");
    };

    const surface = { background: theme.node.fill, color: theme.node.text, borderColor: theme.node.stroke };
    const fieldStyle = { background: theme.toolbar.panel, color: theme.node.text, borderColor: theme.toolbar.border };

    return <div className="ecommerce-planner-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 @min-[560px]:p-4" style={{ background: theme.node.panel, color: theme.node.text, scrollbarColor: `${theme.node.faint} transparent` }}>
        <section className="rounded-2xl border p-3 @min-[560px]:p-4" style={{ ...surface, background: theme.toolbar.panel }}>
            <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700"><Palette className="size-4" /></span>
                <div className="min-w-0"><h3 className="text-sm font-semibold">品牌设计方案</h3><p className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>整理需求、确定视觉方向，再继续画布创作。</p></div>
            </div>

            <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium">设计项目
                    <div className="mt-1 flex gap-2">
                        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loading || busy} className="h-10 min-w-0 flex-1 rounded-lg border px-2.5 text-xs" style={fieldStyle}>
                            <option value="">选择项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}{item.platform ? ` · ${item.platform}` : ""}</option>)}
                        </select>
                        <button type="button" disabled={busy || loading} title="新建设计项目" className="grid size-10 shrink-0 place-items-center rounded-lg border disabled:opacity-50" style={fieldStyle} onClick={() => {
                            setBusy(true); setError("");
                            void request<Project>("/projects", { method: "POST", body: JSON.stringify({ name: "无限画布品牌策划", platform: null, workflow: {} }) })
                                .then((project) => { setProjects((current) => [project, ...current]); setProjectId(project.id); })
                                .catch((cause) => setError(cause instanceof Error ? cause.message : "创建项目失败"))
                                .finally(() => setBusy(false));
                        }}><Plus className="size-4" /></button>
                    </div>
                </label>

                <label className="block text-xs font-medium">客户会话（可选）
                    <select value={conversationId} onChange={(event) => setConversationId(event.target.value)} disabled={!projectId || busy} className="mt-1 h-10 w-full rounded-lg border px-2.5 text-xs" style={fieldStyle}>
                        <option value="">不引用会话</option>{conversations.map((item) => <option key={`${item.conversationType}:${item.id}`} value={`${item.conversationType}:${item.id}`}>{item.conversationType === "invite" ? "邀请会话 · " : item.orderNo ? `${item.orderNo} · ` : "订单会话 · "}{item.title}{item.counterpartName ? ` · ${item.counterpartName}` : ""}</option>)}
                    </select>
                </label>

                <label className="block text-xs font-medium">设计需求
                    <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} maxLength={6000} placeholder="描述品牌、商品和想要的图片风格。" className="mt-1 w-full resize-y rounded-lg border px-3 py-2.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-violet-500/30" style={fieldStyle} />
                </label>
                <button type="button" aria-busy={busy} disabled={busy || loading || !projectId || (brief.trim().length < 8 && !conversationId)} onClick={() => void generate()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400 disabled:opacity-70">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Palette className="size-4" />}{busy ? "正在整理方案…" : plan ? "重新生成方案" : "生成方案"}
                </button>
            </div>
        </section>

        {loading ? <p className="py-8 text-center text-xs" style={{ color: theme.node.muted }}>正在加载项目…</p> : null}
        {!loading && !projects.length ? <p className="mt-3 rounded-xl border border-dashed p-4 text-xs leading-5" style={{ ...surface, color: theme.node.muted }}>还没有项目，点击“＋”新建一个。</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs leading-5 text-rose-700">{error}</p> : null}
        {notice ? <p role="status" className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs leading-5 text-emerald-800">{notice}</p> : null}

        {plan ? <div className="mt-3 space-y-3">
            <article className="rounded-xl border p-3" style={surface}>
                <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">需求概览</h4><span className={`rounded-full px-2 py-1 text-[10px] ${approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{approved ? "已确认" : "待确认"}</span></div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>{plan.summary}</p>
            </article>

            {plan.questions.length ? <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 text-amber-950">
                <h4 className="text-xs font-semibold">还需要确认</h4>
                <div className="mt-2 space-y-2">{plan.questions.map((question) => <label key={question.id} className="block text-[11px] font-medium">{question.label}{question.required ? <span className="ml-1 text-rose-600">*</span> : null}<span className="mt-0.5 block font-normal leading-4 text-amber-900/80">{question.prompt}</span>
                    {question.answerType === "select" && question.options.length ? <select value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-amber-200 bg-white px-2 text-xs"><option value="">请选择</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                        : question.answerType === "text" ? <input value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-amber-200 bg-white px-2 text-xs" />
                            : <textarea value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs" />}
                </label>)}</div>
                <button type="button" disabled={busy} onClick={() => void generate()} className="mt-2 h-8 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] font-medium disabled:opacity-50">更新方案</button>
            </section> : null}

            <section className="space-y-2">
                <div className="flex items-center justify-between"><h4 className="text-xs font-semibold">选择视觉方向</h4><span className="text-[10px]" style={{ color: theme.node.muted }}>{plan.directions.length} 个方向</span></div>
                {plan.directions.map((direction) => {
                    const selected = direction.id === plan.selectedDirectionId;
                    return <button key={direction.id} type="button" onClick={() => { setPlan((current) => current ? { ...current, selectedDirectionId: direction.id } : current); setApproved(false); }} className="block w-full rounded-xl border p-3 text-left transition" style={{ ...surface, borderColor: selected ? "#8b5cf6" : theme.node.stroke, boxShadow: selected ? "0 0 0 2px #8b5cf633" : undefined }}>
                        <span className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{direction.name}</span>{selected ? <Check className="size-4 shrink-0 text-violet-600" /> : null}</span>
                        <span className="mt-1 block text-[11px] leading-5" style={{ color: theme.node.muted }}>{direction.concept}</span>
                        <span className="mt-2 flex flex-wrap gap-1">{direction.palette.slice(0, 6).map((color, index) => <span key={`${direction.id}-${index}`} title={`${color.name} ${color.hex}`} className="size-4 rounded-full border border-black/10" style={{ background: /^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : "#e2e8f0" }} />)}</span>
                    </button>;
                })}
            </section>

            <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy || !selectedDirection || !requiredAnswersComplete} onClick={() => void savePlan(true)} title={!requiredAnswersComplete ? "请先补全必填问题" : ""} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2 text-[11px] font-semibold text-white disabled:opacity-50"><Check className="size-3.5" />确认方向</button>
                <button type="button" disabled={!approved || !selectedDirection} onClick={handoffToCanvasAgent} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold disabled:opacity-50" style={fieldStyle}><MessageSquareText className="size-3.5" />在画布中继续</button>
            </div>
            {approved ? <button type="button" onClick={createCanvasPlan} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 text-[11px] font-semibold text-white"><ArrowRight className="size-3.5" />添加方案到画布</button> : null}
        </div> : null}
    </div>;
}
