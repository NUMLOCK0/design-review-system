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
  ArrowRight
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
import { getCurrentUser, clearAuthSession, UserInfo } from '@/lib/auth';
import { toast } from 'sonner';

const PORTAL_NAV_ITEMS = [
  { href: '/order-market', label: '接单与派单大厅', icon: ShoppingBag, badge: '热' },
  { href: '/review-tasks', label: '我的任务中心', icon: CheckSquare },
  { href: '/wallet', label: '收益钱包与结算', icon: ShieldCheck, badge: '资金' },
];

export function PortalNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
    const handleAuthChange = () => setUser(getCurrentUser());
    window.addEventListener('auth-state-change', handleAuthChange);
    return () => window.removeEventListener('auth-state-change', handleAuthChange);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    toast.info('已退出登录');
    router.push('/login');
  };

  const userName = user?.name || '李设计师';
  const userRole = user?.role || 'designer';
  const isStaffOrAdmin = userRole === 'admin' || userRole === 'reviewer';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* 左侧品牌 Logo */}
        <div className="flex items-center gap-8">
          <Link href="/order-market" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25 group-hover:scale-105 transition">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
                Cozi Design
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded-md border border-blue-200">
                  创作者前台
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">视觉设计与接单平台</p>
            </div>
          </Link>

          {/* 前台顶部主要导航 */}
          <nav className="hidden md:flex items-center gap-1">
            {PORTAL_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
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
          <Link href="/admin/review-workspace">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs h-9 border-indigo-200 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100 gap-1.5 shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>进入审核与管理后台</span>
              <ArrowRight className="w-3 h-3 text-indigo-400" />
            </Button>
          </Link>

          {/* 用户头像与菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-slate-100 transition outline-none">
                <Avatar className="w-8 h-8 border border-slate-200">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold">
                    {userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-none mb-1">{userName}</div>
                  <div className="text-[10px] text-slate-400 leading-none">{user?.department || '视觉设计部'}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 glass-card-subtle p-1.5" align="end">
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold">{userName}</div>
                <div className="text-[10px] text-slate-500 font-normal">{user?.email || 'designer@cozi.com'}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/admin/admin-config')}>
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                <span>商业抽成与系统配置</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs gap-2 text-rose-600 focus:text-rose-600 cursor-pointer" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
