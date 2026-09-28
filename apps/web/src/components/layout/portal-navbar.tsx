'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Palette, 
  ShoppingBag, 
  UploadCloud, 
  CheckSquare, 
  ShieldCheck, 
  Sliders, 
  LogOut, 
  User, 
  // Sparkles, // 推荐设计师顶部 tab 暂时隐藏，恢复时一并取消注释
  ArrowRight,
  Bell,
  ReceiptText,
  Inbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { fetchWithAuth, getCurrentUser, clearAuthSession, getRoleHome, getRoleLoginPath, getRoleLoginPathForPath, ROLE_LABEL, UserInfo } from '@/lib/auth';
import { toast } from 'sonner';
import { useMessageRealtime } from '@/hooks/use-message-realtime';

const PORTAL_NAV_ITEMS: Record<UserInfo['role'], Array<{ href: string; label: string; mobileLabel: string; icon: typeof ShoppingBag; badge?: string; disabled?: boolean }>> = {
  advertiser: [
    // { href: '/advertiser/designers', label: '推荐设计师', icon: Sparkles, disabled: true },
    { href: '/advertiser/dashboard', label: '品牌方工作台', mobileLabel: '工作台', icon: CheckSquare },
    { href: '/advertiser/orders', label: '订单管理', mobileLabel: '订单', icon: ShoppingBag },
    { href: '/review-tasks', label: '作品审核台', mobileLabel: '审核', icon: CheckSquare },
  ],
  designer: [
    { href: '/order-market', label: '接单与派单大厅', mobileLabel: '订单大厅', icon: ShoppingBag, badge: '热' },
    { href: '/review-tasks', label: '我的任务中心', mobileLabel: '任务', icon: CheckSquare },
    { href: '/designer/profile', label: '个人主页与作品集', mobileLabel: '作品集', icon: User },
    { href: '/wallet', label: '收益钱包与结算', mobileLabel: '钱包', icon: ShieldCheck, badge: '资金' },
  ],
  customer_service: [
    { href: '/service/dashboard', label: '客服工作台', mobileLabel: '工作台', icon: CheckSquare },
    { href: '/service/portfolio-review', label: '作品审核', mobileLabel: '作品审核', icon: ShieldCheck },
    { href: '/service/disputes', label: '纠纷处理中心', mobileLabel: '纠纷', icon: ShieldCheck },
  ],
  admin: [
  ],
};

export function PortalNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  useMessageRealtime(user?.id);

  useEffect(() => {
    setUser(getCurrentUser());
    const handleAuthChange = () => setUser(getCurrentUser());
    window.addEventListener('auth-state-change', handleAuthChange);
    return () => window.removeEventListener('auth-state-change', handleAuthChange);
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    const handleUnreadCountChange = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (typeof count === 'number') setUnreadCount(Math.max(0, count));
    };
    window.addEventListener('messages-unread-change', handleUnreadCountChange);
    fetchWithAuth('/messages/summary')
      .then((response) => response.json())
      .then((result) => setUnreadCount(result.success ? result.data?.unreadCount || 0 : 0))
      .catch(() => setUnreadCount(0));
    return () => window.removeEventListener('messages-unread-change', handleUnreadCountChange);
  }, [user?.id]);

  const handleLogout = () => {
    const loginPath = getRoleLoginPath(user?.role || getCurrentUser()?.role);
    clearAuthSession();
    toast.info('已退出登录');
    window.location.replace(loginPath);
  };

  const userName = user?.name || '未登录';
  const userRole = user?.role || 'designer';
  const isAdmin = userRole === 'admin';
  const navItems = PORTAL_NAV_ITEMS[userRole];
  const pageLoginPath = getRoleLoginPathForPath(pathname);
  const loginHref = pathname.startsWith('/login') || pageLoginPath === '/login' ? '/login' : `${pageLoginPath}?redirect=${encodeURIComponent(pathname)}`;

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
        {/* 左侧品牌 Logo */}
        <div className="flex min-w-0 items-center gap-4 sm:gap-8">
          <Link href={user ? getRoleHome(userRole) : '/login'} className="flex items-center gap-2.5 group">
            <div className="role-primary-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-blue-500/25 transition group-hover:scale-105 sm:h-9 sm:w-9 sm:rounded-2xl">
              <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <div className="font-extrabold text-slate-800 text-sm tracking-tight">Cozi Design</div>
              <p className="hidden text-[10px] font-medium text-slate-400 sm:block">视觉设计与接单平台</p>
            </div>
          </Link>

          {/* 前台顶部主要导航 */}
          <TooltipProvider delayDuration={180}>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return item.disabled ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <span
                        aria-disabled="true"
                        tabIndex={0}
                        className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-400 opacity-75"
                      >
                        <Icon className="h-4 w-4 text-slate-300" />
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.2 font-mono text-[10px] text-amber-700">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      敬请期待
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'role-primary-soft role-primary-text font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'role-primary-text' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-amber-100 text-amber-700">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </TooltipProvider>
        </div>

        {/* 右侧：后台入口与用户中心 */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* 管理后台跳转按钮 */}
          {isAdmin && (
            <Link href="/admin">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-xl border-indigo-200 bg-indigo-50/60 text-xs text-indigo-700 shadow-sm hover:bg-indigo-100"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">进入管理后台</span>
                <ArrowRight className="w-3 h-3 text-indigo-400" />
              </Button>
            </Link>
          )}

          {/* 站内信通知 */}
          {user && (
            <>
              <Link href="/messages" aria-label="站内信" className="relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 sm:h-9 sm:w-9">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white ring-2 ring-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </Link>
            </>
          )}

          {/* 未登录显示登录按钮，登录后显示用户菜单 */}
          {!user ? (
            <Link href={loginHref} className="role-primary-bg inline-flex h-9 items-center rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-95">
                登录
            </Link>
          ) : <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-2xl p-1 outline-none transition hover:bg-slate-100">
                <Avatar className="w-8 h-8 border border-slate-200">
                  <AvatarFallback className="role-primary-gradient text-xs font-bold text-white">
                    {userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-bold text-slate-800 leading-none mb-1">{userName}</div>
                <div className="text-[10px] text-slate-400 leading-none">{user ? ROLE_LABEL[userRole] : '请先登录'}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 glass-card-subtle p-1.5" align="end">
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold">{userName}</div>
                <div className="text-[10px] text-slate-500 font-normal">{user?.email || '请登录后继续'}</div>
              </DropdownMenuLabel>
              {userRole === 'advertiser' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => router.push('/advertiser/review-flows')}>
                    <Sliders className="w-3.5 h-3.5 text-blue-500" />
                    <span>作品审核流</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => router.push('/advertiser/disputes')}>
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                    <span>订单纠纷</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => router.push('/advertiser/billing')}>
                    <ReceiptText className="w-3.5 h-3.5 text-emerald-500" />
                    <span>财务账单</span>
                  </DropdownMenuItem>
                </>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/admin/admin-config')}>
                    <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                    <span>商业抽成与系统配置</span>
                  </DropdownMenuItem>
                </>
              )}
              {userRole === 'designer' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={() => router.push('/invitations')}>
                    <Inbox className="w-3.5 h-3.5 text-blue-500" />
                    <span>订单邀请</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs gap-2 text-rose-600 focus:text-rose-600 cursor-pointer" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </div>
    </header>
    {navItems.length > 0 && <nav aria-label="手机端主导航" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-1 text-[10px] font-medium transition-colors active:bg-slate-50 ${isActive ? 'role-primary-text' : 'text-slate-500'}`}>
            <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? 'role-primary-soft' : ''}`}>
              <Icon className="h-5 w-5" />
              {item.badge === '热' && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </span>
            <span className="max-w-full truncate">{item.mobileLabel}</span>
          </Link>;
        })}
      </div>
    </nav>}
    </>
  );
}
