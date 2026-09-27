'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, BriefcaseBusiness, CheckSquare2, CircleUserRound, House, LogOut, Palette, Plus, ShoppingBag, WalletCards } from 'lucide-react';
import { clearAuthSession, fetchWithAuth, getCurrentUser, getRoleHome, type UserInfo } from '@/lib/auth';

const navByRole: Record<UserInfo['role'], Array<{ href: string; label: string; icon: typeof House }>> = {
  advertiser: [
    { href: '/mobile', label: '首页', icon: House },
    { href: '/mobile/orders', label: '订单', icon: ShoppingBag },
    { href: '/mobile/orders/new', label: '发布', icon: Plus },
    { href: '/mobile/profile', label: '我的', icon: CircleUserRound },
  ],
  designer: [
    { href: '/mobile', label: '首页', icon: House },
    { href: '/mobile/orders', label: '接单', icon: ShoppingBag },
    { href: '/mobile/tasks', label: '任务', icon: CheckSquare2 },
    { href: '/mobile/profile', label: '我的', icon: CircleUserRound },
  ],
  customer_service: [
    { href: '/mobile', label: '首页', icon: House },
    { href: '/mobile/tasks', label: '待办', icon: BriefcaseBusiness },
    { href: '/mobile/tasks?tab=dispute', label: '纠纷', icon: ShoppingBag },
    { href: '/mobile/profile', label: '我的', icon: CircleUserRound },
  ],
  admin: [
    { href: '/mobile', label: '首页', icon: House },
    { href: '/admin/users', label: '用户', icon: CircleUserRound },
    { href: '/admin/finance', label: '财务', icon: WalletCards },
    { href: '/mobile/profile', label: '我的', icon: CircleUserRound },
  ],
};

export function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const syncUser = () => {
      const current = getCurrentUser();
      setUser(current);
      setAuthChecked(true);
      if (!current) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    };
    syncUser();
    window.addEventListener('auth-state-change', syncUser);
    return () => window.removeEventListener('auth-state-change', syncUser);
  }, [pathname, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchWithAuth('/messages?page=1&pageSize=1').then((response) => response.json()).then((result) => {
      if (active && result.success) setUnread(Number(result.data?.unreadCount) || 0);
    }).catch(() => undefined);
    const update = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (typeof count === 'number') setUnread(Math.max(0, count));
    };
    window.addEventListener('messages-unread-change', update);
    return () => { active = false; window.removeEventListener('messages-unread-change', update); };
  }, [user?.id]);

  const nav = navByRole[user?.role || 'designer'];
  const accountRoute = ['/mobile/profile', '/mobile/wallet', '/mobile/invitations', '/mobile/designer-profile', '/mobile/billing', '/mobile/disputes', '/mobile/review-flows', '/mobile/service/portfolio-review'].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isReviewFlowsPage = pathname === '/mobile/review-flows' || pathname.startsWith('/mobile/review-flows/');
  const isSecondaryMobilePage = isReviewFlowsPage || pathname === '/mobile/billing' || pathname === '/mobile/messages' || pathname === '/mobile/disputes' || pathname === '/mobile/service/portfolio-review';
  const pageTitle = pathname === '/mobile' ? '工作台' : pathname.includes('orders') ? (user?.role === 'designer' ? '接单大厅' : '订单管理') : pathname.includes('tasks') ? (user?.role === 'customer_service' ? '客服待办' : '我的任务') : pathname.includes('messages') ? '站内信' : accountRoute ? '个人中心' : '移动工作台';
  const isStandaloneOrderForm = pathname === '/mobile/orders/new';
  const isStandalonePage = isStandaloneOrderForm || isSecondaryMobilePage;

  if (!authChecked || !user) return <div className="grid min-h-[100dvh] place-items-center text-sm text-slate-400">正在进入移动工作台…</div>;

  return <>
    {!isStandalonePage && <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between">
        <Link href="/mobile" className="flex items-center gap-2.5" aria-label="创赢移动工作台">
          <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-slate-900 text-white"><Palette className="h-[18px] w-[18px]" /></span>
          <span><span className="block text-[15px] font-extrabold tracking-tight">创赢</span><span className="block text-[10px] leading-3 text-slate-400">{pageTitle}</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/mobile/messages" aria-label="站内信" className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 h-[17px] min-w-[17px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[17px] text-white">{unread > 99 ? '99+' : unread}</span>}</Link>
          {user && <button aria-label="退出登录" onClick={() => { clearAuthSession(); router.push('/login'); }} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"><LogOut className="h-[18px] w-[18px]" /></button>}
        </div>
      </div>
    </header>}
    <main className={`mx-auto w-full ${isStandalonePage ? 'min-h-dvh max-w-none px-0 pb-0 pt-0' : 'min-h-[calc(100dvh-126px)] max-w-xl px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-5'}`}>{children}</main>
    {!isStandaloneOrderForm && !isSecondaryMobilePage && <nav aria-label="移动端主导航" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[max(env(safe-area-inset-bottom),8px)] shadow-[0_-8px_28px_rgba(15,23,42,.06)] backdrop-blur">
      <div className="mx-auto grid h-[62px] max-w-xl grid-cols-4 px-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const itemPath = item.href.split('?')[0];
          const active = itemPath === '/mobile' ? pathname === '/mobile' : itemPath === '/mobile/profile' ? accountRoute : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold active:scale-[.97] ${active ? 'role-primary-text' : 'text-slate-400'}`}>
            <span className={`flex h-7 w-10 items-center justify-center rounded-full ${active ? 'role-primary-soft' : ''}`}><Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 1.9} /></span>{item.label}
          </Link>;
        })}
      </div>
    </nav>}
  </>;
}
