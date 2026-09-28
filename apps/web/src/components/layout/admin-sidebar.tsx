'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Sliders, 
  Percent, 
  LogOut, 
  ShieldCheck, 
  ArrowLeft,
  ShoppingBag,
  Users,
  FileClock,
  WalletCards,
  Menu
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
import { getCurrentUser, clearAuthSession, getRoleHome, getRoleLoginPath, UserInfo } from '@/lib/auth';
import { toast } from 'sonner';

const ALL_ADMIN_NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon; badge?: string; roles: string[] }> = [
  { href: '/admin/review-rules', label: '平台审核规则', icon: Sliders, roles: ['admin'] },
  { href: '/admin/designer-moderation', label: '设计师主页与作品审核', icon: ShieldCheck, roles: ['admin'] },
  { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin'] },
  { href: '/admin/audit-logs', label: '操作日志', icon: FileClock, roles: ['admin'] },
  { href: '/admin/finance', label: '财务管理', icon: WalletCards, roles: ['admin'] },
];

const OPERATIONS_NAV_ITEMS = [
  { href: '/admin/settings/commission', label: '商业抽成' }, { href: '/admin/settings/operations', label: '运营规则' }, { href: '/admin/settings/publication', label: '发布与质检' }, { href: '/admin/settings/announcement', label: '前台公告' }, { href: '/admin/settings/templates', label: '图片模板' }, { href: '/admin/settings/agreements', label: '协议配置' }, { href: '/admin/settings/customer-service', label: '客服二维码' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.replace('/login/staff?redirect=/admin');
    } else if (currentUser.role !== 'admin') {
      router.replace(getRoleHome(currentUser.role));
    }
    const handleAuthChange = () => setUser(getCurrentUser());
    window.addEventListener('auth-state-change', handleAuthChange);
    return () => window.removeEventListener('auth-state-change', handleAuthChange);
  }, []);

  const handleLogout = () => {
    const loginPath = getRoleLoginPath(user?.role || getCurrentUser()?.role);
    clearAuthSession();
    toast.info('已退出登录');
    window.location.replace(loginPath);
  };

  const userRole = user?.role;
  const filteredNavItems = userRole ? ALL_ADMIN_NAV_ITEMS.filter(item => item.roles.includes(userRole)) : [];

  const userName = user?.name || '管理员';
  const dept = user?.department || '运营管理部';

  return (
    <>
    <aside className="fixed inset-y-4 left-4 z-30 hidden h-[calc(100vh-2rem)] w-64 shrink-0 select-none flex-col glass-card border border-slate-200/80 bg-white/80 p-4 md:flex">
      {/* 后台品牌 Logo */}
      <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-slate-200/60">
        <div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg shadow-blue-500/20">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
            Admin Console
            <Badge variant="outline" className="role-primary-soft role-primary-text role-primary-border border px-1.5 py-0 text-[10px]">管理后台</Badge>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">设计质检与商业抽成控制</p>
        </div>
      </div>

      {/* 返回前台接单广场快捷通道 */}
      <div className="mb-4">
        <Link href="/order-market">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-9 rounded-xl border-dashed border-slate-300 text-slate-600 hover:text-blue-600 hover:border-blue-300 bg-slate-50/50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
            <span>返回前台接单大厅</span>
          </Button>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">平台运营</div>
        <Link href="/admin/settings" className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 ${pathname === '/admin/settings' ? 'role-primary-gradient text-white shadow-md shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'}`}><Percent className={`w-4 h-4 ${pathname === '/admin/settings' ? 'text-white' : 'text-slate-400'}`} /><span>商业化与运营配置</span></Link>
        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
          {OPERATIONS_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className={`block rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${pathname === item.href ? 'role-primary-soft role-primary-text' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>{item.label}</Link>)}
        </div>
        <div className="mt-5 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">内容与账户治理</div>
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'role-primary-gradient text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {'badge' in item && item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-100/60 text-indigo-600'}`}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部用户信息 */}
      <div className="pt-3 border-t border-slate-200/60">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 p-2 h-auto hover:bg-slate-100/70 rounded-2xl">
              <Avatar className="w-8 h-8 border border-slate-200 shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-xs font-bold">
                  {userName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
                <p className="text-[10px] text-slate-500 truncate">{dept}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 glass-card-subtle p-1.5" align="end" side="top">
            <DropdownMenuLabel className="text-xs">
              <div className="font-semibold">{userName}</div>
              <div className="text-[10px] text-slate-500 font-normal">{user?.email || 'admin@cozi.com'}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/order-market')}>
              <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
              <span>切换至前台接单大厅</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs gap-2 text-rose-600 focus:text-rose-600 cursor-pointer" onClick={handleLogout}>
              <LogOut className="w-3.5 h-3.5" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="打开管理后台导航" className="h-11 w-11 rounded-xl"><Menu className="h-5 w-5 text-slate-600" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,86vw)] gap-0 overflow-y-auto overscroll-contain rounded-r-2xl border-0 bg-white p-0">
            <SheetHeader className="border-b border-slate-100 px-5 py-5 pr-14 text-left">
              <SheetTitle className="text-base">管理后台导航</SheetTitle>
              <SheetDescription className="text-xs">快速切换管理功能</SheetDescription>
            </SheetHeader>
            <nav className="space-y-1 p-3" aria-label="管理后台手机导航">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">平台运营</p>
              <Link href="/admin/settings" onClick={() => setMobileMenuOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${pathname === '/admin/settings' ? 'role-primary-soft role-primary-text' : 'text-slate-600 active:bg-slate-100'}`}><Percent className="h-4 w-4" />商业化与运营配置</Link>
              <div className="ml-4 space-y-0.5 border-l border-slate-200 py-1 pl-3">
                {OPERATIONS_NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className={`flex min-h-10 items-center rounded-lg px-2.5 text-xs ${pathname === item.href ? 'role-primary-soft role-primary-text font-semibold' : 'text-slate-500 active:bg-slate-100'}`}>{item.label}</Link>)}
              </div>
              <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">内容与账户治理</p>
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} aria-current={isActive ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${isActive ? 'role-primary-soft role-primary-text' : 'text-slate-600 active:bg-slate-100'}`}><Icon className="h-4 w-4" />{item.label}</Link>;
              })}
              <Link href="/order-market" onClick={() => setMobileMenuOpen(false)} className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border-t border-slate-100 px-3 pt-2 text-sm font-medium text-slate-500"><ArrowLeft className="h-4 w-4" />返回前台接单大厅</Link>
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <span className="role-primary-gradient flex h-8 w-8 items-center justify-center rounded-xl text-white"><ShieldCheck className="h-4 w-4" /></span>
          <span className="text-sm font-bold text-slate-800">管理后台</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="用户菜单" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Avatar className="h-8 w-8 border border-slate-200"><AvatarFallback className="role-primary-gradient text-xs font-bold text-white">{userName.slice(0, 1)}</AvatarFallback></Avatar></button></DropdownMenuTrigger>
        <DropdownMenuContent className="w-52" align="end">
          <DropdownMenuLabel className="text-xs"><div className="font-semibold">{userName}</div><div className="text-[10px] font-normal text-slate-500">{user?.email || '管理员'}</div></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-10 gap-2 text-xs" onClick={() => router.push('/order-market')}><ShoppingBag className="h-3.5 w-3.5" />切换至前台</DropdownMenuItem>
          <DropdownMenuItem className="min-h-10 gap-2 text-xs text-rose-600" onClick={handleLogout}><LogOut className="h-3.5 w-3.5" />退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </>
  );
}
