'use client';

import { useEffect, useState } from 'react';
import { Search, Sparkles, UserRoundCheck } from 'lucide-react';
import type { DesignerProfile, DesignOrder, OrderInvitation } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';

const invitationLabels: Record<string, string> = { queued: '待审核后发送', sent: '已邀请', accepted: '已接受', declined: '已拒绝', expired: '已过期', cancelled: '已关闭' };

export function DesignerInviteDrawer({ open, onOpenChange, order, onUpdated }: { open: boolean; onOpenChange: (open: boolean) => void; order: DesignOrder | null; onUpdated?: () => void }) {
  const [designers, setDesigners] = useState<DesignerProfile[]>([]);
  const [invitations, setInvitations] = useState<OrderInvitation[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async (query = '') => {
    if (!order) return;
    setLoading(true);
    try {
      const [profileResponse, invitationResponse] = await Promise.all([
        fetchWithAuth(`/design-orders/${order.id}/recommended-designers?keyword=${encodeURIComponent(query)}`),
        fetchWithAuth(`/design-orders/${order.id}/invitations`),
      ]);
      const profiles = await profileResponse.json();
      const invitationData = await invitationResponse.json();
      if (!profileResponse.ok || !profiles.success) throw new Error(profiles.message || '推荐设计师加载失败');
      setDesigners(profiles.data || []);
      setInvitations(invitationData.success ? invitationData.data || [] : []);
      setSelected([]);
    } catch (error: any) { toast.error(error.message || '加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open, order?.id]);

  const sendInvitations = async () => {
    if (!order || !selected.length) return toast.error('请选择设计师');
    setSubmitting(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/invitations`, { method: 'POST', body: JSON.stringify({ designerIds: selected, message }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '发送邀请失败');
      toast.success(result.message || '邀请已发送');
      setMessage('');
      await load(keyword);
      onUpdated?.();
    } catch (error: any) { toast.error(error.message || '发送邀请失败'); } finally { setSubmitting(false); }
  };

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 5 ? [...current, id] : (toast.error('最多选择5位设计师'), current));

  return <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="w-full border-slate-200 bg-white sm:max-w-xl">
      <DrawerHeader className="border-b border-slate-100 p-5">
        <DrawerTitle className="flex items-center gap-2 text-base text-slate-800"><Sparkles className="h-4 w-4 text-blue-600" />邀请接单</DrawerTitle>
        <DrawerDescription className="text-xs text-slate-500">{order?.title || '订单'} · 系统按品类、平台、质量与可用度推荐，最多同时邀请 5 人。</DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load(keyword)} placeholder="搜索姓名、品类或风格" className="h-9 rounded-xl pl-9 text-xs" /></div>
          <Button variant="outline" onClick={() => load(keyword)} className="h-9 rounded-xl text-xs">搜索</Button>
        </div>
        {invitations.length > 0 && <div className="flex flex-wrap gap-1.5">{invitations.map((item) => <Badge key={item.id} variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-500">{item.designerName} · {invitationLabels[item.status] || item.status}</Badge>)}</div>}
        {loading ? <div className="py-12 text-center text-xs text-slate-400">正在匹配设计师…</div> : designers.map((designer) => <label key={designer.userId} className={`block cursor-pointer rounded-2xl border p-3 transition ${selected.includes(designer.userId) ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 hover:border-blue-200'}`}>
          <div className="flex gap-3">
            <Checkbox checked={selected.includes(designer.userId)} onCheckedChange={() => toggle(designer.userId)} className="mt-1 border-slate-300 data-[state=checked]:bg-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-blue-600" /><span className="text-xs font-bold text-slate-800">{designer.name}</span><Badge className="bg-blue-600 text-[10px] text-white">{designer.recommendationScore} 分</Badge></div><span className="text-[10px] text-slate-400">进行中 {designer.activeOrderCount}/{designer.maxActiveOrders}</span></div>
              <div className="mt-2 flex flex-wrap gap-1">{designer.categories.map((item) => <span key={item} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item}</span>)}</div>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">{designer.recommendationReasons?.join(' · ')}</p>
              <p className="mt-1 text-[10px] text-slate-400">质量分 {designer.qualityScore} · 准时率 {designer.onTimeRate}% · {designer.availabilityStatus === 'available' ? '可接单' : '忙碌中'}</p>
            </div>
          </div>
        </label>)}
        {!loading && !designers.length && <div className="py-12 text-center text-xs text-slate-400">暂无符合条件的设计师</div>}
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="邀请留言（可选）" className="rounded-xl text-xs" />
      </div>
      <DrawerFooter className="border-t border-slate-100 p-5"><Button disabled={!selected.length || submitting} onClick={sendInvitations} className="h-9 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">{submitting ? '发送中…' : `邀请已选 ${selected.length} 人`}</Button><Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-xl text-xs">关闭</Button></DrawerFooter>
    </DrawerContent>
  </Drawer>;
}
