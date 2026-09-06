'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Layers, 
  Sliders, 
  Percent, 
  LogOut, 
  ShieldCheck, 
  ArrowLeft,
  ShoppingBag
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

const ADMIN_NAV_ITEMS = [
  { href: '/admin/review-workspace', label: '审核作业工作台', icon: Layers, badge: 'Pro' },
  { href: '/admin/review-rules', label: '多级审核规则流', icon: Sliders },
  { href: '/admin/admin-config', label: '商业抽成与运营配置', icon: Percent },
];

export function AdminSidebar() {
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

  const userName = user?.name || '王总监';
  const dept = user?.department || '审核运营部';

  return (
    <aside className="w-64 glass-card m-4 mr-0 p-4 flex flex-col h-[calc(100vh-2rem)] sticky top-4 select-none shrink-0 bg-white/80 border border-slate-200/80">
      {/* 后台品牌 Logo */}
      <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-slate-200/60">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
            Admin Console
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-50 text-indigo-600 border-indigo-200">管理后台</Badge>
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
        <div className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          后台质检与运营
        </div>
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
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
  );
}
