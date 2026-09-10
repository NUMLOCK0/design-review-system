import Link from 'next/link';
import { BellRing, FileText, ImageIcon, Settings2, SlidersHorizontal } from 'lucide-react';

const items = [
  { href: '/admin/settings/commission', title: '商业抽成配置', desc: '维护各设计类目的尾款服务费率。', icon: SlidersHorizontal, tone: 'bg-indigo-50 text-indigo-600' },
  { href: '/admin/settings/operations', title: '运营规则', desc: '预算、定金、返修与抢单时效规则。', icon: Settings2, tone: 'bg-sky-50 text-sky-600' },
  { href: '/admin/settings/publication', title: '发布与质检规则', desc: '订单审核开关与作品审核标准。', icon: SlidersHorizontal, tone: 'bg-amber-50 text-amber-600' },
  { href: '/admin/settings/announcement', title: '前台公告', desc: '配置设计师接单大厅的运营公告。', icon: BellRing, tone: 'bg-emerald-50 text-emerald-600' },
  { href: '/admin/settings/templates', title: '图片模板配置', desc: '维护订单图片分组、比例和张数模板。', icon: ImageIcon, tone: 'bg-fuchsia-50 text-fuchsia-600' },
  { href: '/admin/settings/agreements', title: '用户协议与隐私协议', desc: '维护登录页展示的协议正文。', icon: FileText, tone: 'bg-rose-50 text-rose-600' },
];

export default function AdminSettingsPage() { return <div className="mx-auto max-w-6xl space-y-6 p-8"><div className="rounded-3xl border border-white/80 bg-white/75 p-7 shadow-sm"><p className="text-xs font-semibold role-primary-text">平台运营</p><h1 className="mt-2 text-2xl font-bold text-slate-900">商业化与运营配置</h1><p className="mt-2 text-sm text-slate-500">将不同运营能力拆分为独立页面，便于集中配置与维护。</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--role-primary-border)] hover:shadow-md"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}><Icon className="h-5 w-5" /></span><h2 className="mt-5 text-base font-bold text-slate-800">{item.title}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{item.desc}</p><span className="mt-5 inline-block text-xs font-semibold role-primary-text">进入配置 →</span></Link>; })}</div></div>; }
