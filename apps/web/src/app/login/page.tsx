import Link from 'next/link';
import { Building2, PenTool, ShieldCheck } from 'lucide-react';

const entries = [
  { href: '/login/advertiser', title: '品牌方登录', description: '发布设计需求，跟踪交付并完成验收。', icon: Building2, color: 'from-blue-600 via-indigo-600 to-cyan-500', tone: 'border-blue-200 hover:border-blue-400', text: 'text-blue-700' },
  { href: '/login/designer', title: '设计师登录', description: '浏览订单、接单创作并提交作品。', icon: PenTool, color: 'from-orange-500 via-rose-500 to-fuchsia-600', tone: 'border-rose-200 hover:border-rose-400', text: 'text-rose-700' },
];

export default async function LoginEntryPage({ searchParams }: { searchParams: Promise<{ redirect?: string | string[] }> }) {
  const { redirect } = await searchParams;
  const redirectParam = Array.isArray(redirect) ? redirect[0] : redirect;
  const redirectSuffix = redirectParam?.startsWith('/') && !redirectParam.startsWith('//') ? `?redirect=${encodeURIComponent(redirectParam)}` : '';
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="mb-7 text-center"><p className="text-xs font-semibold tracking-[0.2em] text-slate-500">COZI DESIGN</p><h1 className="mt-2 text-2xl font-bold text-slate-900">选择登录系统</h1><p className="mt-2 text-sm text-slate-500">请选择你的工作身份，进入对应工作台。</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{entries.map(({ href, title, description, icon: Icon, color, tone, text }) => <Link key={href} href={`${href}${redirectSuffix}`} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-sm`}><Icon className="h-5 w-5" /></span>
        <h2 className={`mt-4 text-sm font-bold ${text}`}>{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </Link>)}</div>
      <Link href={`/login/staff${redirectSuffix}`} className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"><ShieldCheck className="h-3.5 w-3.5" />平台客服与管理员登录</Link>
    </section>
  </main>;
}
