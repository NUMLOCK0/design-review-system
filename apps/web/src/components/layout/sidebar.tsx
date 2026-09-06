'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  CheckSquare, 
  UploadCloud, 
  Layers, 
  Sliders, 
  LogOut,
  Palette,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  User,
  ShoppingBag,
  Percent
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

const NAV_GROUPS = [
  {
    groupTitle: '前台业务与接单',
    items: [
      { href: '/order-market', label: '接单与派单大厅', icon: ShoppingBag, badge: '热' },
      { href: '/review-tasks', label: '我的任务中心', icon: CheckSquare, badge: '实时' },
    ]
  },
  {
    groupTitle: '后台作业与质检管理',
    items: [
      { href: '/review-workspace', label: '审核作业工作台', icon: Layers, badge: 'Pro' },
      { href: '/review-rules', label: '审核规则流程', icon: Sliders },
      { href: '/admin-config', label: '商业抽成与运营配置', icon: Percent },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());

    const handleAuthChange = () => {
      setUser(getCurrentUser());
    };

    window.addEventListener('auth-state-change', handleAuthChange);
    return () => window.removeEventListener('auth-state-change', handleAuthChange);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    toast.info('已退出登录');
    router.push('/login');
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return '系统管理员';
      case 'reviewer': return '高级审核主管';
      case 'designer': return '视觉设计师';
      default: return '访客人员';
    }
  };

  const userName = user?.name || '王总监';
  const roleTitle = getRoleLabel(user?.role);
  const dept = user?.department || '视觉设计部';

  return (
    <aside className="w-64 glass-card m-4 mr-0 p-4 flex flex-col h-[calc(100vh-2rem)] sticky top-4 select-none shrink-0">
      {/* 系统品牌 Logo */}
      <div className="flex items-center gap-3 px-2 py-3 mb-3 border-b border-white/60">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
            Cozi Review
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">V2</Badge>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">设计审核与派单平台</p>
        </div>
      </div>

      {/* 导航菜单分组 */}
      <nav className="flex-1 space-y-4 overflow-y-auto pr-1">
        {NAV_GROUPS.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {group.groupTitle}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-blue-100/60 text-blue-600'}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 用户信息与下拉操作 */}
      <div className="pt-3 border-t border-white/60">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 p-2 h-auto hover:bg-white/70 rounded-2xl">
              <Avatar className="w-8 h-8 border border-white/80 shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold">
                  {userName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
                <p className="text-[10px] text-slate-500 truncate">{roleTitle} · {dept}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 glass-card-subtle p-1.5" align="end" side="top">
            <DropdownMenuLabel className="text-xs">
              <div className="font-semibold">{userName}</div>
              <div className="text-[10px] text-slate-500 font-normal">{user?.email || 'reviewer@cozi.com'}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/order-market')}>
              <ShoppingBag className="w-3.5 h-3.5 text-amber-500" />
              <span>前台接单与派单大厅</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/review-tasks')}>
              <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
              <span>我的任务中心(提审)</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2" onClick={() => router.push('/admin-config')}>
              <Percent className="w-3.5 h-3.5 text-indigo-500" />
              <span>商业抽成与运营配置</span>
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

