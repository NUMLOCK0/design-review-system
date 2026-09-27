'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, CircleHelp, Clock3, ExternalLink, FileImage, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DisputeStatus, OrderDispute } from '@design-review/shared';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type DisputeFilter = 'all' | DisputeStatus;
const statusMeta: Record<DisputeStatus, { label: string; className: string }> = {
  open: { label: '待处理', className: 'bg-amber-50 text-amber-700' },
  mediation: { label: '处理中', className: 'role-primary-soft role-primary-text' },
  resolved: { label: '已解决', className: 'bg-emerald-50 text-emerald-700' },
  escalated: { label: '已升级', className: 'bg-rose-50 text-rose-700' },
};
const roleLabel = { advertiser: '品牌方', designer: '设计师' } as const;
const priorityLabel = { normal: '普通', high: '较高', urgent: '紧急' } as const;
const filters: Array<{ value: DisputeFilter; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'open', label: '待处理' }, { value: 'mediation', label: '处理中' },
  { value: 'resolved', label: '已解决' }, { value: 'escalated', label: '已升级' },
];
const dateTime = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function MobileDisputesPage() {
  const [items, setItems] = useState<OrderDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DisputeFilter>('all');
  const [selected, setSelected] = useState<OrderDispute | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [preview, setPreview] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/disputes');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '纠纷记录加载失败');
      setItems(Array.isArray(result.data) ? result.data : []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '纠纷记录加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => filter === 'all' ? items : items.filter((item) => item.status === filter), [filter, items]);

  return <MobileSecondaryLayout title="订单纠纷" fallbackHref="/mobile/profile" action={
    <button type="button" onClick={() => setGuideOpen(true)} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-xs font-semibold role-primary-text"><CircleHelp className="h-4 w-4" />纠纷说明</button>
  }>
    <section className="space-y-3.5">
      <div>
        <p className="text-xs font-semibold role-primary-text">订单保障</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div><h2 className="text-[25px] font-extrabold tracking-tight">纠纷处理</h2><p className="mt-1 text-xs text-slate-400">查看争议内容、客服进展与处理结果</p></div>
          <button type="button" aria-label="刷新纠纷记录" onClick={() => void load()} disabled={loading} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="纠纷状态筛选">
        {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${filter === item.value ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{item.label}</button>)}
      </div>
      {!loading && <p className="px-1 text-[11px] text-slate-400">共 {visibleItems.length} 条纠纷记录</p>}

      {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-12 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载纠纷记录…</div>
        : visibleItems.length === 0 ? <div className="rounded-2xl bg-white px-5 py-12 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">{items.length ? '该状态下暂无纠纷' : '暂无订单纠纷'}</p><p className="mt-1 text-xs leading-5 text-slate-400">订单出现争议时，可从订单详情发起纠纷申请</p><Link href="/mobile/orders" className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-xl role-primary-bg px-4 text-xs font-bold text-white">查看订单<ExternalLink className="h-3.5 w-3.5" /></Link></div>
          : <div className="space-y-2.5">{visibleItems.map((item) => <DisputeCard key={item.id} item={item} onOpen={() => setSelected(item)} />)}</div>}
    </section>

    <Drawer open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DrawerContent className="max-h-[90dvh] rounded-t-[26px] bg-[#f4f6f8] pb-[max(env(safe-area-inset-bottom),12px)]">
        {selected && <>
          <DrawerHeader className="border-b border-slate-100 bg-white px-5 pb-4 pt-5 text-left">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] text-slate-400">订单号 {selected.orderNo}</p><DrawerTitle className="mt-1 text-base font-extrabold">纠纷详情与处理进度</DrawerTitle></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusMeta[selected.status].className}`}>{statusMeta[selected.status].label}</span></div>
            <DrawerDescription className="sr-only">查看订单纠纷双方、说明、证据和客服处理进度</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-4">
            <section className="rounded-2xl bg-white p-4">
              <h3 className="text-xs font-bold">纠纷信息</h3>
              <p className="mt-3 text-sm font-semibold text-slate-800">{selected.reason}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{selected.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500"><span>发起人 <b className="text-slate-700">{selected.initiatorName} · {roleLabel[selected.initiatorRole]}</b></span><span>对方 <b className="text-slate-700">{selected.respondentName || '—'}</b></span></div>
              {selected.evidenceUrls?.length ? <div className="mt-3"><p className="mb-2 text-[11px] font-semibold text-slate-600">证据图片（{selected.evidenceUrls.length}）</p><div className="grid grid-cols-3 gap-2">{selected.evidenceUrls.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => setPreview(url)} aria-label={`预览证据图片 ${index + 1}`} className="aspect-square overflow-hidden rounded-xl bg-slate-100"><AuthenticatedImage src={url} alt={`纠纷证据 ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div></div> : <p className="mt-3 text-[11px] text-slate-400">未提交证据图片</p>}
            </section>

            <section className="rounded-2xl bg-white p-4">
              <h3 className="text-xs font-bold">处理进度</h3>
              <ol className="mt-3 space-y-0">
                <ProgressStep active label="纠纷已提交" detail={dateTime(selected.createdAt)} />
                <ProgressStep active={selected.status !== 'open'} label={selected.status === 'escalated' ? '已升级处理' : '客服处理中'} detail={selected.handlerName ? `客服：${selected.handlerName}` : selected.serviceDueAt ? `预计处理：${dateTime(selected.serviceDueAt)}` : '等待客服跟进'} />
                <ProgressStep last active={selected.status === 'resolved'} label={selected.status === 'resolved' ? '纠纷已解决' : '等待处理结果'} detail={selected.resolutionComment || (selected.updatedAt && selected.status === 'resolved' ? dateTime(selected.updatedAt) : '处理完成后将展示结果')} />
              </ol>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>提交时间 {dateTime(selected.createdAt)}</span>{selected.servicePriority && <span>优先级 {priorityLabel[selected.servicePriority]}</span>}</div>
            </section>
            <Link href={`/mobile/orders/${encodeURIComponent(selected.orderId)}`} onClick={() => setSelected(null)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl role-primary-bg text-xs font-bold text-white">查看关联订单<ExternalLink className="h-4 w-4" /></Link>
          </div>
        </>}
      </DrawerContent>
    </Drawer>

    <Drawer open={guideOpen} onOpenChange={setGuideOpen}>
      <DrawerContent className="rounded-t-[26px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]">
        <DrawerHeader className="text-left"><DrawerTitle>纠纷处理说明</DrawerTitle><DrawerDescription>平台客服会依据订单需求、双方说明和证据协助处理。</DrawerDescription></DrawerHeader>
        <div className="space-y-3 px-4 pb-5 text-xs leading-5 text-slate-600"><p>1. 纠纷提交后，客服会查看争议原因、说明和证据图片。</p><p>2. 处理中可在此查看客服负责人和最新处理进度。</p><p>3. 处理结果与结案说明会同步展示在纠纷详情中。</p></div>
      </DrawerContent>
    </Drawer>

    {preview && <button type="button" aria-label="关闭证据图片预览" onClick={() => setPreview('')} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"><AuthenticatedImage src={preview} alt="纠纷证据大图" className="max-h-[88dvh] max-w-full rounded-xl object-contain" /></button>}
  </MobileSecondaryLayout>;
}

function DisputeCard({ item, onOpen }: { item: OrderDispute; onOpen: () => void }) {
  return <article className="rounded-[20px] bg-white p-3.5 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-[11px] text-slate-400">订单号 {item.orderNo}</p><h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 text-slate-900">{item.reason}</h3></div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusMeta[item.status].className}`}>{statusMeta[item.status].label}</span>
    </div>
    <p className="mt-2 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{item.description}</p>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400"><span>发起人 <b className="text-slate-600">{item.initiatorName} · {roleLabel[item.initiatorRole]}</b></span><span>对方 <b className="text-slate-600">{item.respondentName || '—'}</b></span></div>
    {item.evidenceUrls?.length ? <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><FileImage className="h-4 w-4 text-slate-400" />证据图片 {item.evidenceUrls.length} 张</div> : null}
    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-400"><span className="flex min-w-0 items-center gap-1.5 truncate">{item.handlerName ? `处理客服　${item.handlerName}` : '等待客服跟进'}{item.servicePriority === 'urgent' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />}</span><button type="button" onClick={onOpen} className="flex min-h-9 shrink-0 items-center gap-1 pl-2 font-semibold role-primary-text">查看进度<Clock3 className="h-3.5 w-3.5" /></button></div>
  </article>;
}

function ProgressStep({ active, label, detail, last = false }: { active: boolean; label: string; detail: string; last?: boolean }) {
  return <li className="relative flex gap-3 pb-4 last:pb-0">
    <span className="relative flex w-4 shrink-0 justify-center"><span className={`z-10 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ${active ? 'role-primary-bg text-white' : 'bg-slate-100 text-slate-300'}`}>{active ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>{!last && <span className="absolute top-4 h-full w-px bg-slate-200" />}</span>
    <span className="min-w-0 flex-1"><span className={`block text-xs font-semibold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span><span className="mt-1 block break-words text-[11px] leading-4 text-slate-400">{detail}</span></span>
  </li>;
}
