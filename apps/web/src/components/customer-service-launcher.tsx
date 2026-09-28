'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Copy, Headset, LoaderCircle, MessageCircle, RefreshCw } from 'lucide-react';
import type { CustomerServiceContact } from '@design-review/shared';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function CustomerServiceLauncher({ placement }: { placement: 'profile' | 'desktop' }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<CustomerServiceContact | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const isProfile = placement === 'profile';

  const loadContact = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithAuth('/system-config/active-customer-service', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '客服信息加载失败');
      setContact(result.data || null);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '客服信息加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded && !loading && !error) void loadContact();
  }, [open, loaded, loading, error, loadContact]);

  const copyWechat = async () => {
    if (!contact?.wechat) return;
    try {
      await navigator.clipboard.writeText(contact.wechat);
      toast.success('客服微信号已复制');
    } catch {
      toast.error('复制失败，请手动复制微信号');
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className={isProfile
      ? 'flex min-h-[54px] w-full items-center gap-3 rounded-[18px] bg-white px-4 text-left text-[13px] font-semibold text-slate-700 shadow-[0_4px_20px_rgba(15,23,42,.035)] active:bg-slate-50'
      : 'fixed bottom-6 right-6 z-40 hidden min-h-12 items-center gap-2 rounded-full role-primary-bg px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,.2)] transition hover:-translate-y-0.5 hover:brightness-105 md:inline-flex'}>
      {isProfile ? <><span className="flex h-9 w-9 items-center justify-center rounded-xl role-primary-soft role-primary-text"><MessageCircle className="h-[18px] w-[18px]" /></span><span className="flex-1">在线客服</span><ChevronRight className="h-4 w-4 text-slate-300" /></> : <><Headset className="h-4 w-4" />联系客服</>}
    </button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm rounded-3xl border-0 p-6 max-sm:left-1/2 max-sm:top-1/2 max-sm:w-[calc(100%-2rem)] max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-3xl">
        <DialogHeader className="items-center text-center">
          <DialogTitle>联系客服</DialogTitle>
          <DialogDescription>扫码添加客服微信，获取订单与平台协助</DialogDescription>
        </DialogHeader>
        {loading && <div className="flex justify-center py-10 text-slate-400"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}
        {!loading && error && <div className="py-5 text-center"><p className="text-sm text-slate-500">{error}</p><button type="button" onClick={() => void loadContact()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold role-primary-text"><RefreshCw className="h-4 w-4" />重试</button></div>}
        {!loading && !error && !contact && <div className="rounded-2xl bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">客服信息暂未配置，请稍后再试。</div>}
        {!loading && !error && contact && <div className="flex flex-col items-center">
          {contact.qrCodeUrl
            ? <AuthenticatedImage src={contact.qrCodeUrl} alt={`${contact.name || '客服'}微信二维码`} className="h-56 w-56 rounded-2xl bg-white object-contain p-2 shadow-sm" />
            : <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-50 text-slate-400"><MessageCircle className="h-8 w-8" /><span className="text-xs">客服二维码暂未配置</span></div>}
          <p className="mt-4 text-sm font-bold text-slate-800">{contact.name || '在线客服'}</p>
          {contact.wechat && <button type="button" onClick={() => void copyWechat()} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold role-primary-text"><span>微信号：{contact.wechat}</span><Copy className="h-4 w-4" /></button>}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
