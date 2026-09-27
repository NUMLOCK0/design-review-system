'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, RefreshCw, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'advertiser' | 'designer' | 'customer_service' | 'admin';
  roles: string[];
  department?: string;
  isActive: boolean;
  createdAt: string;
};

const roleLabels: Record<string, string> = { advertiser: '品牌方', designer: '设计师', customer_service: '客服', admin: '管理员' };
const roleFilters = [{ value: 'all', label: '全部用户' }, ...Object.entries(roleLabels).map(([value, label]) => ({ value, label }))];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const pageSize = 20;

  const loadUsers = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ keyword, role, status, page: String(nextPage), pageSize: String(pageSize) });
      const response = await fetchWithAuth(`/users?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载用户失败');
      setUsers(result.data || []);
      setTotal(result.total || 0);
    } catch (error: any) {
      toast.error(error.message || '加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); void loadUsers(1); }, [role, status]);
  const changePage = (nextPage: number) => { setPage(nextPage); void loadUsers(nextPage); };

  const updateUser = async (id: string, updates: Partial<Pick<UserRecord, 'role' | 'isActive'>>) => {
    setSavingId(id);
    try {
      const response = await fetchWithAuth(`/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '更新用户失败');
      setUsers((items) => items.map((item) => item.id === id ? { ...item, ...updates, roles: updates.role && ['advertiser', 'designer'].includes(updates.role) ? ['advertiser', 'designer'] : updates.role ? [updates.role] : item.roles } : item));
      toast.success('用户信息已更新');
    } catch (error: any) {
      toast.error(error.message || '更新用户失败');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-md md:flex-row md:items-center">
        <div className="flex items-center gap-3"><div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md"><Users className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight text-slate-800">用户管理</h1><p className="mt-1 text-xs text-slate-500">查看并管理系统中已注册的账户，共 {total} 个用户</p></div></div>
        <Button variant="outline" onClick={() => void loadUsers()} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新列表</Button>
      </div>

      <Card className="rounded-3xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-sm">
        <CardHeader className="space-y-4 pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{roleFilters.map((item) => <button key={item.value} type="button" onClick={() => setRole(item.value)} className={`rounded-lg px-3 py-1.5 text-xs transition ${role === item.value ? 'bg-white font-semibold text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div>
            <form className="flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); changePage(1); }}><div className="relative min-w-0 flex-1 md:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名、邮箱、手机号" className="h-9 w-full rounded-xl pl-9 text-xs md:w-64" /></div><Button type="submit" className="h-9 shrink-0 rounded-xl px-3 text-xs">搜索</Button></form>
          </div>
          <div className="flex gap-1 border-b border-slate-100 pb-2"><button type="button" onClick={() => setStatus('all')} className={`px-2 py-1 text-xs ${status === 'all' ? 'font-semibold text-blue-600' : 'text-slate-400'}`}>全部状态</button><button type="button" onClick={() => setStatus('active')} className={`px-2 py-1 text-xs ${status === 'active' ? 'font-semibold text-emerald-600' : 'text-slate-400'}`}>已启用</button><button type="button" onClick={() => setStatus('inactive')} className={`px-2 py-1 text-xs ${status === 'inactive' ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>已停用</button></div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[1.3fr_1.5fr_1fr_1.3fr_.8fr] gap-4 border-y border-slate-100 bg-slate-50/70 px-6 py-3 text-[11px] font-semibold text-slate-400 md:grid"><span>用户</span><span>账号</span><span>当前角色</span><span>角色权限</span><span className="text-right">状态</span></div>
          {loading ? <div className="p-12 text-center text-xs text-slate-400">正在加载用户列表…</div> : users.length === 0 ? <div className="p-12 text-center text-xs text-slate-400">暂无符合条件的用户</div> : <><div className="divide-y divide-slate-100">{users.map((item) => <div key={item.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1.3fr_1.5fr_1fr_1.3fr_.8fr] md:items-center md:gap-4"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{item.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">{item.department || '未设置部门'} · {new Date(item.createdAt).toLocaleDateString('zh-CN')}</p></div><div className="min-w-0"><p className="truncate text-xs text-slate-600">{item.email}</p>{item.phone && <p className="mt-1 text-[10px] text-slate-400">{item.phone}</p>}</div><Select.Root value={item.role} onValueChange={(value) => void updateUser(item.id, { role: value as UserRecord['role'] })} disabled={savingId === item.id}><Select.Trigger className="flex h-8 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 outline-none focus:border-blue-400"><Select.Value /></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"><Select.Viewport>{Object.entries(roleLabels).map(([value, label]) => <Select.Item key={value} value={value} className="relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-7 pr-3 text-[11px] text-slate-600 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700"><Select.ItemText>{label}</Select.ItemText><Select.ItemIndicator className="absolute left-2"><Check className="h-3 w-3" /></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root><div className="flex flex-wrap gap-1">{item.roles.map((itemRole) => <Badge key={itemRole} variant="outline" className="border-blue-100 bg-blue-50/60 px-1.5 py-0 text-[10px] text-blue-700">{roleLabels[itemRole] || itemRole}</Badge>)}</div><div className="flex items-center justify-between gap-3 md:justify-end"><Badge className={`text-[10px] font-semibold !text-white ${item.isActive ? 'bg-emerald-500 ring-emerald-600' : 'bg-slate-500 ring-slate-600'} ring-1`}>{item.isActive ? '已启用' : '已停用'}</Badge><Switch checked={item.isActive} disabled={savingId === item.id} onCheckedChange={(checked) => void updateUser(item.id, { isActive: checked })} aria-label={item.isActive ? '停用用户' : '启用用户'} className="data-[state=checked]:!bg-emerald-500 data-[state=unchecked]:!bg-slate-300" /></div></div>)}</div><AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} /></>}
        </CardContent>
      </Card>
    </div>
  );
}
