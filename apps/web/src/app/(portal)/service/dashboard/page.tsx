'use client';

import { useEffect, useState } from 'react';
import type { DesignOrder, OrderDispute, ServiceActionLog, WithdrawalRequest } from '@design-review/shared';
import { Check, Clock3, CreditCard, FileCheck2, Inbox, MessageSquareWarning, RefreshCw, UserRound } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/app-toast';
import { toast } from 'sonner';

type WorkItem = {
  id: string;
  type: 'order_audit' | 'dispute' | 'withdrawal_review';
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  priority: 'normal' | 'high' | 'urgent';
  assigneeId?: string;
  assigneeName?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  payload: DesignOrder | OrderDispute | WithdrawalRequest;
};

type Counts = { all: number; mine: number; unassigned: number; orderAudit: number; dispute: number; withdrawalReview: number; overdue: number; completedToday: number };

const emptyCounts: Counts = { all: 0, mine: 0, unassigned: 0, orderAudit: 0, dispute: 0, withdrawalReview: 0, overdue: 0, completedToday: 0 };
const tabs = [['all', '全部待办'], ['mine', '我的待办'], ['unassigned', '待领取'], ['order_audit', '发布审核'], ['withdrawal_review', '提现审核'], ['dispute', '纠纷处理'], ['overdue', '即将超时'], ['completed', '已完成']] as const;
const priorityMap = { normal: { label: '普通', className: 'bg-slate-100 text-slate-500' }, high: { label: '较高', className: 'bg-amber-50 text-amber-600' }, urgent: { label: '紧急', className: 'bg-rose-50 text-rose-600' } };

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSla(item: WorkItem) {
  if (!item.dueAt || item.completed) return { label: item.completed ? '已完成' : '未设置', className: 'text-slate-400' };
  const diff = new Date(item.dueAt).getTime() - Date.now();
  if (diff <= 0) return { label: '已超时', className: 'text-rose-600' };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { label: `${hours}小时${minutes}分`, className: hours < 2 ? 'text-amber-600' : 'text-emerald-600' };
}

function isOrder(item: WorkItem): item is WorkItem & { payload: DesignOrder } { return item.type === 'order_audit'; }
function isWithdrawal(item: WorkItem): item is WorkItem & { payload: WithdrawalRequest } { return item.type === 'withdrawal_review'; }
function assigneeLabel(item: Pick<WorkItem, 'type' | 'assigneeName'>) { return item.assigneeName || (item.type !== 'dispute' ? '无需领取' : '待领取'); }

export default function ServiceDashboardPage() {
  const { confirm } = useToast();
  const [tab, setTab] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [logs, setLogs] = useState<ServiceActionLog[]>([]);
  const [comment, setComment] = useState('');
  const [operating, setOperating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, page: String(page), pageSize: '10' });
      if (keyword) params.set('keyword', keyword);
      const response = await fetchWithAuth(`/service/dashboard?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载客服工作台失败');
      setItems(result.data || []); setCounts(result.counts || emptyCounts); setTotal(result.total || 0); setHasMore(Boolean(result.hasMore));
    } catch (error: any) { toast.error(error.message || '加载客服工作台失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadData(); }, [tab, keyword, page]);
  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get('tab');
    if (initialTab && tabs.some(([value]) => value === initialTab)) setTab(initialTab);
  }, []);

  const openItem = async (item: WorkItem) => {
    setSelected(item); setComment('');
    try {
      const response = await fetchWithAuth(`/service/logs?taskType=${item.type}&taskId=${item.id}`);
      const result = await response.json();
      if (response.ok && result.success) setLogs(result.data || []);
    } catch { setLogs([]); }
  };

  const claim = async (target: WorkItem | null = selected) => {
    if (!target) return;
    setOperating(true);
    try {
      const response = await fetchWithAuth(`/service/tasks/${target.type}/${target.id}/claim`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '领取任务失败');
      toast.success('任务已领取'); setSelected(null); await loadData();
    } catch (error: any) { toast.error(error.message || '领取任务失败'); }
    finally { setOperating(false); }
  };

  const operate = async (action: 'approve' | 'reject' | 'mediation' | 'resolve' | 'escalate') => {
    if (!selected) return;
    if (['reject', 'resolve', 'escalate'].includes(action) && !comment.trim()) { toast.error('请先填写处理意见'); return; }
    const actionLabels = { approve: '通过审核', reject: '驳回处理', mediation: '进入调解', resolve: '结案', escalate: '升级处理' } as const;
    if (!await confirm({ title: `确认${actionLabels[action]}？`, message: action === 'approve' ? '确认后将改变订单或提现申请状态，请核对信息后继续。' : '该操作会改变当前任务状态，确认后将通知相关人员。', confirmText: `确认${actionLabels[action]}`, type: ['reject', 'resolve', 'escalate'].includes(action) ? 'danger' : 'warning' })) return;
    setOperating(true);
    try {
      const endpoint = isOrder(selected) ? `/design-orders/${selected.id}/publication-review` : isWithdrawal(selected) ? `/wallet/withdrawals/${selected.id}/review` : `/disputes/${selected.id}/action`;
      const response = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify({ action, comment: comment.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '处理失败');
      await fetchWithAuth('/service/logs', { method: 'POST', body: JSON.stringify({ taskType: selected.type, taskId: selected.id, action, comment: comment.trim() }) });
      toast.success(result.message || '处理成功'); setSelected(null); await loadData();
    } catch (error: any) { toast.error(error.message || '处理失败'); }
    finally { setOperating(false); }
  };

  const selectedSla = selected ? getSla(selected) : null;

  return <section className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold text-blue-600">客服工作台</p><h1 className="mt-1 text-2xl font-bold text-slate-900">今天处理什么？</h1><p className="mt-1 text-xs text-slate-500">订单发布审核与纠纷处理统一在这里完成</p></div>
      <div className="flex min-w-0 gap-2"><form className="flex min-w-0 flex-1 gap-2 sm:w-64" onSubmit={(event) => { event.preventDefault(); setPage(1); setKeyword(search.trim()); }}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单名称 / 编号" className="h-9 rounded-xl" /><Button type="submit" variant="outline" className="h-9 shrink-0 rounded-xl text-xs">搜索</Button></form><Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => void loadData()} aria-label="刷新"><RefreshCw className="h-3.5 w-3.5" /></Button></div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric icon={Inbox} label="待我处理" value={counts.mine} tone="blue" /><Metric icon={Clock3} label="即将超时" value={counts.overdue} tone="amber" /><Metric icon={CreditCard} label="提现审核" value={counts.withdrawalReview} tone="blue" /><Metric icon={MessageSquareWarning} label="处理中纠纷" value={counts.dispute} tone="rose" /><Metric icon={Check} label="今日已完成" value={counts.completedToday} tone="emerald" /></div>

    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Tabs value={tab} onValueChange={(value) => { setTab(value); setPage(1); }}><TabsList className="flex h-12 w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-slate-100 bg-white p-2">{tabs.map(([value, label]) => <TabsTrigger key={value} value={value} className="h-8 shrink-0 rounded-lg px-3 text-xs data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">{label}{value === 'all' ? ` ${counts.all}` : ''}</TabsTrigger>)}</TabsList></Tabs>
      <div className="divide-y divide-slate-100">{loading && <div className="p-10 text-center text-sm text-slate-400">正在加载任务…</div>}{!loading && items.length === 0 && <div className="p-12 text-center text-sm text-slate-400">当前没有符合条件的任务</div>}{!loading && items.map((item) => <WorkRow key={`${item.type}-${item.id}`} item={item} onOpen={() => void openItem(item)} onClaim={() => void claim(item)} />)}</div>
      {!loading && total > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-400"><span>共 {total} 条，每页 10 条</span><div className="flex gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="h-7 rounded-lg px-3 text-xs">上一页</Button><Button variant="outline" disabled={!hasMore} onClick={() => setPage((value) => value + 1)} className="h-7 rounded-lg px-3 text-xs">下一页</Button></div></div>}
    </div>

    <Drawer direction="right" open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DrawerContent className="h-full max-h-full w-full max-w-[calc(100vw-1rem)] overflow-hidden overflow-x-hidden rounded-l-3xl bg-white p-0 [--drawer-width:860px]">{selected && <><DrawerHeader className="min-w-0 border-b border-slate-100 p-5"><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><DrawerTitle className="truncate text-base text-slate-900">{selected.title}</DrawerTitle><DrawerDescription className="mt-1 truncate text-xs">{selected.subtitle}</DrawerDescription></div><div className="flex shrink-0 items-center gap-2"><Badge className={priorityMap[selected.priority].className}>{priorityMap[selected.priority].label}</Badge><span className={`text-xs font-medium ${selectedSla?.className}`}>{selectedSla?.label}</span></div></div></DrawerHeader><div className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-5"><div className="grid min-w-0 grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-4"><Info label="任务类型" value={isOrder(selected) ? '订单发布审核' : isWithdrawal(selected) ? '提现审核' : '订单纠纷'} /><Info label="当前状态" value={selected.statusLabel} /><Info label="负责人" value={assigneeLabel(selected)} /><Info label="创建时间" value={formatDate(selected.createdAt)} /></div>{isOrder(selected) ? <OrderDetail order={selected.payload} /> : isWithdrawal(selected) ? <WithdrawalDetail request={selected.payload} /> : <DisputeDetail dispute={selected.payload as OrderDispute} />}<div><h2 className="mb-3 text-sm font-semibold text-slate-800">处理记录</h2>{logs.length === 0 ? <p className="text-xs text-slate-400">暂无记录</p> : <div className="space-y-3">{logs.map((log) => <div key={log.id} className="border-l-2 border-blue-100 pl-3 text-xs"><p className="font-medium text-slate-700">{log.operatorName} · {log.action}</p><p className="mt-1 break-words text-slate-500">{log.comment || '无补充说明'} · {formatDate(log.createdAt)}</p></div>)}</div>}</div>{!selected.completed && <div className="space-y-2"><label className="text-sm font-semibold text-slate-800">处理意见</label><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="请输入处理意见；驳回、升级、结案时必填" className="min-h-24 rounded-xl" /></div>}</div>{!selected.completed && <DrawerFooter className="flex-row justify-between border-t border-slate-100 p-4">{selected.type === 'dispute' ? <Button variant="outline" disabled={operating || Boolean(selected.assigneeId)} onClick={() => void claim()} className="h-9 rounded-xl text-xs">{selected.assigneeId ? `负责人：${selected.assigneeName}` : <><UserRound className="mr-1 h-3.5 w-3.5" />领取任务</>}</Button> : <span className="flex items-center text-xs text-slate-400">{isWithdrawal(selected) ? '提现审核无需领取，可直接审核' : '订单审核无需领取，可直接审核'}</span>}<div className="flex gap-2">{isOrder(selected) || isWithdrawal(selected) ? <><Button variant="outline" disabled={operating} onClick={() => void operate('reject')} className="h-9 rounded-xl text-xs text-rose-600">驳回</Button><Button disabled={operating} onClick={() => void operate('approve')} className="h-9 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700"><FileCheck2 className="mr-1 h-3.5 w-3.5" />{isWithdrawal(selected) ? '审核通过' : '通过并上架'}</Button></> : <><Button variant="outline" disabled={operating} onClick={() => void operate('escalate')} className="h-9 rounded-xl text-xs text-rose-600">升级</Button><Button variant="outline" disabled={operating} onClick={() => void operate('mediation')} className="h-9 rounded-xl text-xs">进入调解</Button><Button disabled={operating} onClick={() => void operate('resolve')} className="h-9 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700">结案</Button></>}</div></DrawerFooter>}</>}</DrawerContent></Drawer>
  </section>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Inbox; label: string; value: number; tone: 'blue' | 'amber' | 'rose' | 'emerald' }) { const colors = { blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', emerald: 'bg-emerald-50 text-emerald-600' }; return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`rounded-xl p-2 ${colors[tone]}`}><Icon className="h-4 w-4" /></div><div><p className="text-[11px] text-slate-400">{label}</p><p className="mt-0.5 text-xl font-bold text-slate-800">{value}</p></div></div>; }

function WorkRow({ item, onOpen, onClaim }: { item: WorkItem; onOpen: () => void; onClaim: () => void }) {
  const sla = getSla(item);
  return <div role="button" tabIndex={0} aria-label={`打开${item.title}`} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"><div className={`shrink-0 rounded-lg p-2 ${item.type === 'order_audit' ? 'bg-blue-50 text-blue-600' : item.type === 'withdrawal_review' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>{item.type === 'order_audit' ? <FileCheck2 className="h-4 w-4" /> : item.type === 'withdrawal_review' ? <CreditCard className="h-4 w-4" /> : <MessageSquareWarning className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-slate-800">{item.title}</span><Badge variant="outline" className="shrink-0 text-[10px]">{item.statusLabel}</Badge></div><p className="mt-1 truncate text-xs text-slate-400">{item.subtitle} · {assigneeLabel(item)}</p></div><span className={`hidden shrink-0 text-xs font-medium sm:block ${sla.className}`}>{sla.label}</span><span className={`hidden shrink-0 rounded-md px-2 py-1 text-[10px] sm:block ${priorityMap[item.priority].className}`}>{priorityMap[item.priority].label}</span>{item.type === 'dispute' && !item.completed && !item.assigneeId && <Button type="button" variant="outline" onClick={(event) => { event.stopPropagation(); onClaim(); }} className="h-7 shrink-0 rounded-lg px-2 text-xs">领取</Button>}</div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 truncate font-medium text-slate-700">{value}</p></div>; }

function OrderDetail({ order }: { order: DesignOrder }) { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><Info label="发布方" value={order.creatorName} /><Info label="设计类型" value={order.category} /><Info label="预算" value={`¥${order.budget}`} /><Info label="交付时间" value={formatDate(order.deadline)} /></div><div><h2 className="mb-2 text-sm font-semibold text-slate-800">需求说明</h2><p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{order.requirements || '暂无补充说明'}</p></div>{order.imageRequirementGroups?.length ? <div><h2 className="mb-2 text-sm font-semibold text-slate-800">图片需求</h2><div className="space-y-2">{order.imageRequirementGroups.map((group) => <div key={group.id} className="rounded-xl border border-slate-100 p-3 text-xs"><div className="flex justify-between gap-3 font-medium text-slate-700"><span>{group.name}</span><span className="text-slate-400">{group.dimensions || group.groupType}</span></div><p className="mt-1 break-words text-slate-500">{group.description || '暂无说明'}</p></div>)}</div></div> : null}</div>; }

function WithdrawalDetail({ request }: { request: WithdrawalRequest }) { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><Info label="设计师" value={request.designerName} /><Info label="提现金额" value={`¥${request.amount.toFixed(2)}`} /><Info label="开户行" value={request.bankAccount.bankName} /><Info label="持卡人" value={request.bankAccount.holderName} /></div><div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><p>银行卡号：尾号 {request.bankAccount.accountNo.slice(-4)}</p><p>审核规则：客服审核通过后处理；驳回时金额原路退回收益钱包。</p></div></div>; }

function DisputeDetail({ dispute }: { dispute: OrderDispute }) { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><Info label="发起人" value={dispute.initiatorName} /><Info label="对方" value={dispute.respondentName || '-'} /><Info label="争议原因" value={dispute.reason} /><Info label="发起时间" value={formatDate(dispute.createdAt)} /></div><div><h2 className="mb-2 text-sm font-semibold text-slate-800">纠纷说明</h2><p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{dispute.description}</p></div>{dispute.evidenceUrls?.length ? <div><h2 className="mb-2 text-sm font-semibold text-slate-800">证据图片</h2><div className="grid grid-cols-3 gap-2">{dispute.evidenceUrls.map((url) => <img key={url} src={url} alt="纠纷证据" className="aspect-square w-full rounded-lg object-cover" />)}</div></div> : null}</div>; }
