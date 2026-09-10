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
  Sparkles,
  ArrowRight,
  Bell,
  ReceiptText,
  Inbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { fetchWithAuth, getCurrentUser, clearAuthSession, getRoleHome, ROLE_LABEL, UserInfo } from '@/lib/auth';
import { toast } from 'sonner';

const PORTAL_NAV_ITEMS: Record<UserInfo['role'], Array<{ href: string; label: string; icon: typeof ShoppingBag; badge?: string }>> = {
  advertiser: [
    { href: '/advertiser/designers', label: '推荐设计师', icon: Sparkles },
    { href: '/advertiser/dashboard', label: '品牌方工作台', icon: CheckSquare },
    { href: '/advertiser/orders', label: '订单管理', icon: ShoppingBag },
    { href: '/review-tasks', label: '作品审核台', icon: CheckSquare },
  ],
  designer: [
    { href: '/order-market', label: '接单与派单大厅', icon: ShoppingBag, badge: '热' },
    { href: '/review-tasks', label: '我的任务中心', icon: CheckSquare },
    { href: '/designer/profile', label: '个人主页与作品集', icon: User },
    { href: '/wallet', label: '收益钱包与结算', icon: ShieldCheck, badge: '资金' },
  ],
  customer_service: [
    { href: '/service/dashboard', label: '客服工作台', icon: CheckSquare },
    { href: '/service/disputes', label: '纠纷处理中心', icon: ShieldCheck },
  ],
  admin: [
  ],
};

export function PortalNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

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
    fetchWithAuth('/messages?page=1&pageSize=1')
      .then((response) => response.json())
      .then((result) => setUnreadCount(result.success ? result.data?.unreadCount || 0 : 0))
      .catch(() => setUnreadCount(0));
    return () => window.removeEventListener('messages-unread-change', handleUnreadCountChange);
  }, [user?.id]);

  const handleLogout = () => {
    clearAuthSession();
    toast.info('已退出登录');
    router.push('/login');
  };

  const userName = user?.name || '未登录';
  const userRole = user?.role || 'designer';
  const isAdmin = userRole === 'admin';
  const navItems = PORTAL_NAV_ITEMS[userRole];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* 左侧品牌 Logo */}
        <div className="flex items-center gap-8">
          <Link href={user ? getRoleHome(userRole) : '/login'} className="flex items-center gap-2.5 group">
            <div className="role-primary-gradient flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-md shadow-blue-500/25 transition group-hover:scale-105">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
                Cozi Design
                <span className="role-primary-text role-primary-soft role-primary-border rounded-md border px-1.5 py-0.2 text-[10px] font-semibold">
                  {ROLE_LABEL[userRole]}空间
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">视觉设计与接单平台</p>
            </div>
          </Link>

          {/* 前台顶部主要导航 */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
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
        </div>

        {/* 右侧：后台入口与用户中心 */}
        <div className="flex items-center gap-3">
          {/* 管理后台跳转按钮 */}
          {isAdmin && (
            <Link href="/admin">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs h-9 border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100 gap-1.5 shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>进入管理后台</span>
                <ArrowRight className="w-3 h-3 text-indigo-400" />
              </Button>
            </Link>
          )}

          {/* 站内信通知 */}
          {user && (
            <>
              <Link href="/messages" aria-label="站内信" className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-50 hover:text-blue-600">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white ring-2 ring-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </Link>
            </>
          )}

          {/* 未登录显示登录按钮，登录后显示用户菜单 */}
          {!user ? (
            <Link href={pathname === '/login' ? '/login' : `/login?redirect=${encodeURIComponent(pathname)}`} className="role-primary-bg inline-flex h-9 items-center rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-95">
                登录
            </Link>
          ) : <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-slate-100 transition outline-none">
                <Avatar className="w-8 h-8 border border-slate-200">
                  <AvatarFallback className="role-primary-gradient text-xs font-bold text-white">
                    {userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left">
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
  );
}
