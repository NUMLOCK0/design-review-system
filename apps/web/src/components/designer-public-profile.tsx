'use client';

import { useEffect, useState } from 'react';
import { PublicEvaluations } from '@/components/order-evaluations';
import { useParams } from 'next/navigation';
import type { DesignerPortfolio, DesignerProfile } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/modal';

export function DesignerPublicProfile() {
  const { id } = useParams<{ id: string }>();
  const [designer, setDesigner] = useState<(DesignerProfile & { portfolios: DesignerPortfolio[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [work, setWork] = useState<DesignerPortfolio | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWithAuth(`/designers/${id}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '该设计师主页暂未公开');
      if (!cancelled) setDesigner(result.data);
    }).catch((reason) => { if (!cancelled) setError(reason.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);
  if (loading) return <p className="py-12 text-center text-sm text-slate-500">正在加载设计师主页…</p>;
  if (!designer) return <p role="alert" className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">{error || '该设计师主页暂未公开'}</p>;
  return <section className="space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-4">{designer.avatarUrl ? <AuthenticatedImage src={designer.avatarUrl} alt={designer.name} className="h-16 w-16 rounded-2xl object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl role-primary-soft text-2xl font-bold role-primary-text">{designer.name.slice(0, 1)}</span>}<div className="min-w-0"><h1 className="text-xl font-bold">{designer.name}</h1><p className="mt-1 text-sm text-slate-500">{designer.headline || '视觉设计师'}</p></div></div><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{designer.bio || '暂无个人介绍'}</p><div className="mt-4 flex flex-wrap gap-2">{[...new Set([...(designer.industries || []), ...designer.categories, ...designer.styles])].map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{tag}</span>)}</div><div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>从业 {designer.yearsExperience || 0} 年</span><span>公开作品 {designer.portfolios.length} 件</span><span>{designer.availabilityStatus === 'available' ? '可以接单' : designer.availabilityStatus === 'unavailable' ? '暂停接单' : '排期中'}</span></div></div>
    <div><h2 className="mb-3 text-base font-bold">作品集</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{designer.portfolios.map((item) => <button key={item.id} type="button" onClick={() => setWork(item)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left focus-visible:ring-2 focus-visible:ring-[var(--role-primary)]"><AuthenticatedImage src={item.coverUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" /><div className="space-y-2 p-3"><h3 className="text-sm font-semibold">{item.title}</h3><p className="text-xs text-slate-500">{[item.industry, item.category, item.platform].filter(Boolean).join(' · ')}</p><p className="line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p></div></button>)}</div>{!designer.portfolios.length && <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">暂无公开作品。</p>}</div>
    <PublicEvaluations userId={id} />
    <Modal open={Boolean(work)} onOpenChange={(open) => !open && setWork(null)}><ModalContent className="max-w-4xl rounded-2xl bg-white"><ModalHeader><ModalTitle>{work?.title}</ModalTitle><ModalDescription>{work?.description || '公开作品详情'}</ModalDescription></ModalHeader><div className="space-y-3 py-4">{work?.imageUrls.map((url, index) => <AuthenticatedImage key={`${url}-${index}`} src={url} alt={`${work.title} 第 ${index + 1} 张`} className="h-auto w-full rounded-xl" />)}</div></ModalContent></Modal>
  </section>;
}
