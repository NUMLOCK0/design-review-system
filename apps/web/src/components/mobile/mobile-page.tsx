'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, Clock3, Search, ShoppingBag, Sparkles, WalletCards } from 'lucide-react';
import type { DesignOrder, OrderDispute, ReviewTask, WithdrawalRequest } from '@design-review/shared';
import { getCurrentUser, fetchWithAuth, type UserInfo } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MobileOptionPicker } from '@/components/mobile/mobile-create-order';

type Screen = 'home' | 'orders' | 'tasks' | 'profile';
type ServiceWorkItem = { id: string; type: 'order_audit' | 'dispute' | 'withdrawal_review'; title: string; subtitle: string; statusLabel: string; payload: DesignOrder | OrderDispute | WithdrawalRequest };
const statusLabel: Record<string, string> = { pending_deposit: '待付定金', pending_service_review: '待客服审核', published: '待接单', claimed: '已接单', in_progress: '设计中', submitted: '待审核', completed: '已完成', cancelled: '已关闭', rejected: '已驳回' };
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;

function SectionHeading({ title, href, action = '查看全部' }: { title: string; href?: string; action?: string }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h2>{href && <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-slate-400">{action}<ChevronRight className="h-4 w-4" /></Link>}</div>;
}

function OrderCard({ order }: { order: DesignOrder }) {
  const visibleStatus = order.publicationStatus || order.status;
  const status = statusLabel[visibleStatus] || statusLabel[order.status] || order.status;
  const isAvailable = order.publicationStatus === 'published' || order.status === 'open';
  const imageCount = (order.imageRequirementGroups || []).reduce((total, group) => total + (group.imageItems?.length || group.quantity || 0), 0);
  return <article className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 text-[14px] font-bold leading-5 text-slate-900">{order.title}</p><p className="mt-1.5 text-[11px] text-slate-400">{order.category || '视觉设计'} · {order.platform || '全平台'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isAvailable ? 'bg-emerald-50 text-emerald-700' : order.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'role-primary-soft role-primary-text'}`}>{status}</span></div>
    <div className="mt-4 flex items-center gap-2.5">
      {order.imageRequirementGroups?.[0]?.imageItems?.[0]?.materialImage ? <AuthenticatedImage src={order.imageRequirementGroups[0].imageItems[0].materialImage} alt="订单素材" className="h-12 w-12 rounded-xl bg-slate-100 object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-300"><ShoppingBag className="h-5 w-5" /></span>}
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{money(order.budget)}</p><p className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{imageCount || '多'} 张图片</span><span>·</span><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{order.deadline ? new Date(order.deadline).toLocaleDateString('zh-CN') : '交期协商'}</span></p></div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
  </article>;
}

export function MobilePage({ screen }: { screen: Screen }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [serviceItems, setServiceItems] = useState<ServiceWorkItem[]>([]);
  const [serviceTotal, setServiceTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');

  useEffect(() => setUser(getCurrentUser()), []);
  useEffect(() => {
    if (screen !== 'tasks' || user?.role !== 'customer_service') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && ['all', 'mine', 'unassigned', 'order_audit', 'deposit_refund', 'withdrawal_review', 'dispute', 'overdue', 'completed'].includes(tab)) setServiceFilter(tab);
  }, [screen, user?.role]);

  const load = useCallback(async (nextPage = 1, append = false) => {
    setLoading(true);
    try {
      if (user?.role === 'designer' && screen === 'home') {
        const query = new URLSearchParams({ page: '1', pageSize: '6', status: 'all', keyword: '' });
        const [ordersResponse, tasksResponse] = await Promise.all([fetchWithAuth(`/design-orders/mine?${query}`), fetchWithAuth('/review-tasks', { cache: 'no-store' })]);
        const [ordersResult, tasksResult] = await Promise.all([ordersResponse.json(), tasksResponse.json()]);
        if (!ordersResponse.ok || !ordersResult.success) throw new Error(ordersResult.message || '订单加载失败');
        if (!tasksResponse.ok || !tasksResult.success) throw new Error(tasksResult.message || '任务加载失败');
        setOrders(ordersResult.data || []);
        setOrdersTotal(Number(ordersResult.total) || 0);
        setTasks(tasksResult.data?.list || []);
      } else if (user?.role === 'customer_service') {
        const tab = screen === 'home' ? 'all' : serviceFilter;
        const response = await fetchWithAuth(`/service/dashboard?tab=${tab}&page=${nextPage}&pageSize=${screen === 'home' ? 6 : 20}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '待办加载失败');
        setServiceItems(append ? (current) => [...current, ...(result.data || [])] : result.data || []);
        setServiceTotal(Number(result.total) || 0);
        setHasMore(Boolean(result.hasMore)); setPage(nextPage);
      } else if (user?.role === 'designer' && screen === 'orders') {
        const query = new URLSearchParams({ page: String(nextPage), pageSize: '20', category: categoryFilter, platform: platformFilter, urgency: urgencyFilter, keyword });
        const response = await fetchWithAuth(`/design-orders?${query}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '订单加载失败');
        setOrders(append ? (current) => [...current, ...(result.data || [])] : result.data || []);
        setOrdersTotal(Number(result.total) || 0);
        setHasMore(Boolean(result.hasMore)); setPage(nextPage);
      } else if (screen === 'tasks') {
        const response = await fetchWithAuth('/review-tasks', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '任务加载失败');
        setTasks(result.data?.list || []);
      } else if (user?.role === 'admin') {
        setOrders([]);
      } else {
        const query = new URLSearchParams({ page: String(nextPage), pageSize: screen === 'home' ? '6' : '10', status: statusFilter, keyword });
        const response = await fetchWithAuth(`/design-orders/mine?${query}`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '订单加载失败');
        setOrders(append ? (current) => [...current, ...(result.data || [])] : result.data || []);
        setOrdersTotal(Number(result.total) || 0); setOrderCounts(result.counts || {});
        setHasMore(Boolean(result.hasMore)); setPage(nextPage);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
    } finally { setLoading(false); }
  }, [user?.id, user?.role, screen, keyword, statusFilter, serviceFilter, categoryFilter, platformFilter, urgencyFilter]);

  useEffect(() => { if (user) void load(1); }, [user?.id, user?.role, screen, keyword, statusFilter, serviceFilter, load]);

  if (screen === 'home') return <HomeScreen user={user} orders={orders} ordersTotal={ordersTotal} orderCounts={orderCounts} tasks={tasks} serviceItems={serviceItems} serviceTotal={serviceTotal} loading={loading} />;
  if (screen === 'orders') return <section className="space-y-4">
    <div className="flex items-end justify-between"><div><p className="text-xs font-semibold role-primary-text">{user?.role === 'designer' ? '发现新机会' : '项目进度一目了然'}</p><h1 className="mt-1 text-[25px] font-extrabold tracking-tight">{user?.role === 'designer' ? '接单大厅' : '我的订单'}</h1></div>{user?.role === 'advertiser' && <Link href="/mobile/orders/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl role-primary-bg px-3 text-xs font-bold text-white"><span className="text-base leading-none">＋</span>发布订单</Link>}</div>
    <label className="relative block"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索订单名称…" className="h-12 rounded-2xl border-0 bg-white pl-10 shadow-[0_4px_20px_rgba(15,23,42,.035)] placeholder:text-slate-400" /></label>
    {user?.role === 'designer' && <div className="grid grid-cols-3 gap-2"><MobileOptionPicker title="设计类型" value={categoryFilter} onChange={setCategoryFilter} options={[{ value: 'all', label: '全部类型' }, ...['主图设计','详情页设计','活动海报','3D建模与渲染','精修合成'].map((label) => ({ value: label, label }))]} /><MobileOptionPicker title="投放平台" value={platformFilter} onChange={setPlatformFilter} options={[{ value: 'all', label: '全部平台' }, { value: 'tmall', label: '天猫' }, { value: 'taobao', label: '淘宝' }, { value: 'douyin', label: '抖音电商' }, { value: 'pinduoduo', label: '拼多多' }, { value: 'universal', label: '全网通用' }]} /><MobileOptionPicker title="订单紧急程度" value={urgencyFilter} onChange={setUrgencyFilter} options={[{ value: 'all', label: '全部时效' }, { value: 'normal', label: '普通' }, { value: 'urgent', label: '加急' }, { value: 'super_urgent', label: '特急' }]} /></div>}
    {user?.role === 'advertiser' && <div className="flex gap-2 overflow-x-auto pb-1">{[['all','全部'],['pending_deposit','待付定金'],['pending_service_review','待审核'],['published','待接单'],['claimed','已接单'],['in_progress','设计中'],['submitted','待审核稿'],['completed','已完成'],['cancelled','已关闭']].map(([value,label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${statusFilter === value ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{label}</button>)}</div>}
    <div className="space-y-3">{loading && orders.length === 0 ? <Loading /> : orders.length ? <>{orders.map((order) => <Link key={order.id} href={`/mobile/orders/${order.id}`} className="block rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary)]"><OrderCard order={order} /></Link>)}{hasMore && <button disabled={loading} onClick={() => void load(page + 1, true)} className="min-h-11 w-full rounded-xl bg-white text-xs font-semibold text-slate-500 disabled:opacity-50">{loading ? '正在加载…' : '加载更多订单'}</button>}</> : <Empty title="暂时没有订单" detail="有新订单时会显示在这里" />}</div>
  </section>;
  if (screen === 'tasks') return <section className="space-y-4"><div><p className="text-xs font-semibold role-primary-text">进度持续更新</p><h1 className="mt-1 text-[25px] font-extrabold tracking-tight">{user?.role === 'customer_service' ? '客服待办' : '我的任务'}</h1></div>{user?.role === 'customer_service' && <div className="flex gap-2 overflow-x-auto pb-1">{[['all','全部'],['mine','我的待办'],['unassigned','待领取'],['order_audit','发布审核'],['deposit_refund','定金退款'],['withdrawal_review','提现审核'],['dispute','纠纷处理'],['overdue','即将超时'],['completed','已完成']].map(([value,label]) => <button key={value} onClick={() => setServiceFilter(value)} className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold ${serviceFilter === value ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{label}</button>)}</div>}<div className="space-y-3">{loading ? <Loading /> : user?.role === 'customer_service' ? (serviceItems.length ? serviceItems.map((item) => <ServiceWorkCard key={`${item.type}-${item.id}`} item={item} />) : <Empty title="暂无待办" detail="当前筛选下没有需要处理的工作" />) : tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} />) : <Empty title="暂无进行中的任务" detail="接单后任务会出现在这里" />}</div>{user?.role === 'customer_service' && hasMore && <button disabled={loading} onClick={() => void load(page + 1, true)} className="min-h-11 w-full rounded-xl bg-white text-xs font-semibold text-slate-500 disabled:opacity-50">{loading ? '正在加载…' : '加载更多待办'}</button>}</section>;
  return <ProfileScreen user={user} />;
}

function HomeScreen({ user, orders, ordersTotal, orderCounts, tasks, serviceItems, serviceTotal, loading }: { user: UserInfo | null; orders: DesignOrder[]; ordersTotal: number; orderCounts: Record<string, number>; tasks: ReviewTask[]; serviceItems: ServiceWorkItem[]; serviceTotal: number; loading: boolean }) {
  const role = user?.role || 'designer';
  const isDesigner = role === 'designer';
  const title = isDesigner ? '让好设计，被更多人看见。' : role === 'advertiser' ? '把灵感变成好作品。' : role === 'customer_service' ? '每一件待办，都有清晰进度。' : '系统运行状态，一览无余。';
  const displayName = user?.name?.trim() || '欢迎回来';
  const metrics = isDesigner ? [{ label: '进行中任务', value: tasks.length, icon: BriefcaseBusiness }, { label: '可接订单', value: '持续更新', icon: ShoppingBag }] : role === 'customer_service' ? [{ label: '待办事项', value: serviceTotal, icon: BriefcaseBusiness }] : role === 'admin' ? [] : [{ label: '全部订单', value: ordersTotal, icon: ShoppingBag }, { label: '进行中', value: (orderCounts.claimed || 0) + (orderCounts.in_progress || 0) + (orderCounts.submitted || 0), icon: Clock3 }];
  return <div className="space-y-6">
    <div className="pt-1"><p className="text-xs font-medium text-slate-400">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p><h1 className="mt-1 text-[23px] font-extrabold tracking-tight">你好，{displayName}</h1></div>
    <section className="relative overflow-hidden rounded-[26px] bg-slate-900 px-5 py-5 text-white shadow-[0_14px_35px_rgba(15,23,42,.18)]"><div className="absolute -right-8 -top-12 h-40 w-40 rounded-full bg-[var(--role-primary)] opacity-70 blur-3xl" /><div className="absolute -bottom-20 right-20 h-36 w-36 rounded-full bg-cyan-400/30 blur-3xl" /><div className="relative"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80"><Sparkles className="h-3 w-3" />创赢 · {role === 'advertiser' ? '品牌方工作台' : role === 'designer' ? '设计师工作台' : role === 'customer_service' ? '客服工作台' : '管理工作台'}</span><h2 className="mt-4 max-w-[270px] text-[22px] font-bold leading-[1.25] tracking-tight">{title}</h2><p className="mt-2 max-w-[280px] text-xs leading-5 text-white/65">{isDesigner ? '挑选适合的设计需求，专注创作与交付。' : '订单、协作和服务进展都已为你汇总。'}</p><div className="mt-5 flex gap-2"><Link href={isDesigner ? '/mobile/orders' : role === 'advertiser' ? '/mobile/orders/new' : '/mobile/tasks'} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-bold text-slate-900 active:scale-[.98]">{isDesigner ? '浏览接单' : role === 'advertiser' ? '发布新订单' : '查看待办'}<ArrowUpRight className="h-4 w-4" /></Link>{role === 'advertiser' && <Link href="/mobile/orders" className="inline-flex min-h-10 items-center rounded-xl border border-white/20 px-3.5 text-xs font-semibold text-white">订单管理</Link>}</div></div></section>
    {metrics.length > 0 && <div className={`grid gap-3 ${metrics.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>{metrics.map((metric) => <div key={metric.label} className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-400">{metric.label}</span><metric.icon className="h-4 w-4 role-primary-text" /></div><p className="mt-2 text-[24px] font-extrabold tracking-tight text-slate-900">{loading ? '—' : metric.value}</p></div>)}</div>}
    {isDesigner && <Link href="/mobile/wallet" className="flex items-center gap-3 rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-amber-50 text-amber-600"><WalletCards className="h-5 w-5" /></span><span className="flex-1"><span className="block text-sm font-bold">收益与交付</span><span className="mt-1 block text-[11px] text-slate-400">查看钱包结算，完成后提现</span></span><ArrowRight className="h-4 w-4 text-slate-300" /></Link>}
    {role === 'admin' ? <Link href="/admin" className="flex items-center justify-between rounded-[20px] bg-white p-4 text-sm font-bold shadow-sm"><span>进入管理后台</span><ChevronRight className="h-4 w-4 text-slate-400" /></Link> : <section><SectionHeading title={role === 'customer_service' ? '最新待办' : isDesigner ? '最新任务' : '最近订单'} href={role === 'customer_service' ? '/mobile/tasks' : isDesigner ? '/mobile/tasks' : '/mobile/orders'} />{loading ? <Loading /> : role === 'customer_service' ? serviceItems.length ? <div className="space-y-3">{serviceItems.slice(0, 3).map((item) => <ServiceWorkCard key={`${item.type}-${item.id}`} item={item} />)}</div> : <Empty title="当前暂无待办" detail="有新的审核或服务任务时会显示在这里" /> : orders.length ? <div className="space-y-3">{orders.slice(0, 3).map((order) => <Link key={order.id} href={`/mobile/orders/${order.id}`} className="block"><OrderCard order={order} /></Link>)}</div> : <Empty title={isDesigner ? '还没有任务' : '还没有订单'} detail={isDesigner ? '去接单大厅发现新机会' : '发布订单后，进展会展示在这里'} />}</section>}
    <Link href="/mobile/messages" className="flex items-center justify-between rounded-[18px] bg-white px-4 py-3.5 text-sm font-semibold shadow-[0_4px_20px_rgba(15,23,42,.035)]"><span className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><BellIcon /></span>消息通知</span><ChevronRight className="h-4 w-4 text-slate-300" /></Link>
  </div>;
}

function TaskCard({ task }: { task: ReviewTask }) {
  const label = task.status === 'needs_revision' || task.status === 'returned' ? '需修改' : task.status === 'in_review' ? '待审核' : task.status === 'archived' ? '已归档' : task.status === 'pending' ? '待提交' : '进行中';
  return <Link href={`/mobile/tasks/${task.id}`} className="block rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">{task.productName || '设计任务'}</p><p className="mt-1 text-[11px] text-slate-400">{task.taskNo || task.orderId || '作品审核任务'}</p></div><span className="rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-semibold role-primary-text">{label}</span></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{task.totalImages} 张图片 · 打开任务详情</span><ChevronRight className="h-4 w-4" /></div></Link>;
}

function ServiceWorkCard({ item }: { item: ServiceWorkItem }) {
  return <Link href={`/mobile/service/tasks/${encodeURIComponent(item.id)}?type=${item.type}`} className="block rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{item.title}</p><p className="mt-1 truncate text-[11px] text-slate-400">{item.subtitle}</p></div><span className="shrink-0 rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-semibold role-primary-text">{item.statusLabel}</span></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>{item.type === 'order_audit' ? '订单审核 / 退款' : item.type === 'withdrawal_review' ? '提现审核' : '订单纠纷'}</span><span className="inline-flex items-center">打开处理<ChevronRight className="h-4 w-4" /></span></div></Link>;
}

function ProfileScreen({ user }: { user: UserInfo | null }) {
  const items = user?.role === 'designer' ? [['个人主页与作品集', '/mobile/designer-profile'], ['收益钱包', '/mobile/wallet'], ['订单邀请', '/mobile/invitations']] : user?.role === 'advertiser' ? [['审核流设置', '/mobile/review-flows'], ['财务账单', '/mobile/billing'], ['订单纠纷', '/mobile/disputes']] : user?.role === 'customer_service' ? [['\u4f5c\u54c1\u5ba1\u6838', '/mobile/service/portfolio-review'], ['纠纷处理', '/mobile/tasks']] : [['管理后台', '/admin']];
  return <section className="space-y-5"><div><p className="text-xs font-semibold role-primary-text">账号与设置</p><h1 className="mt-1 text-[25px] font-extrabold tracking-tight">个人中心</h1></div><div className="rounded-[22px] bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-[19px] role-primary-bg text-xl font-extrabold text-white">{user?.name?.slice(0, 1) || '创'}</span><div className="min-w-0"><p className="truncate text-base font-bold">{user?.name || '未登录'}</p><p className="mt-1 truncate text-xs text-slate-400">{user?.phone || user?.email || '创赢平台用户'}</p></div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3"><span className="text-xs text-slate-500">当前身份</span><span className="text-xs font-semibold text-slate-700">{user?.role === 'designer' ? '设计师' : user?.role === 'advertiser' ? '品牌方' : user?.role === 'customer_service' ? '客服' : '管理员'}</span></div></div><div className="overflow-hidden rounded-[20px] bg-white shadow-[0_4px_20px_rgba(15,23,42,.035)]">{items.map(([label, href], index) => <Link key={href} href={href} className={`flex min-h-[56px] items-center gap-3 px-4 active:bg-slate-50 ${index ? 'border-t border-slate-100' : ''}`}><span className="flex-1 text-[13px] font-semibold text-slate-700">{label}</span><ChevronRight className="h-4 w-4 text-slate-300" /></Link>)}</div><Link href="/mobile/messages" className="flex min-h-[54px] items-center rounded-[18px] bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-[0_4px_20px_rgba(15,23,42,.035)]">站内信<span className="ml-auto"><ChevronRight className="h-4 w-4 text-slate-300" /></span></Link></section>;
}

function Empty({ title, detail }: { title: string; detail: string }) { return <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-9 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><ShoppingBag className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>; }
function Loading() { return <div className="rounded-[20px] bg-white px-5 py-9 text-center text-xs text-slate-400">正在加载…</div>; }
function BellIcon() { return <CheckCircle2 className="h-[18px] w-[18px]" />; }
