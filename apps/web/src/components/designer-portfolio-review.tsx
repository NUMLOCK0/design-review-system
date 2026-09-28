'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { PLATFORM_MAP, type DesignerPortfolio } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Modal, ModalContent, ModalHeader, ModalFooter } from '@/components/ui/modal';

type ReviewItem = DesignerPortfolio & { designerName: string; designerAvatarUrl?: string };
const filters = [{ value: 'all', label: '全部作品' }, { value: 'pending_review', label: '待审核' }, { value: 'draft', label: '草稿' }, { value: 'published', label: '已通过' }, { value: 'hidden', label: '已下架' }];
const pageSize = 20;

export function DesignerPortfolioReview() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [status, setStatus] = useState('pending_review');
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const targetHandled = useRef(false);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/service/designer-portfolios?status=${status}&page=${nextPage}&pageSize=${pageSize}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '作品审核数据加载失败');
      setItems(result.data || []);
      setTotal(result.total || 0);
      setPage(nextPage);
    } catch (error) { toast.error(error instanceof Error ? error.message : '作品审核数据加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); void load(1); }, [status]);

  useEffect(() => {
    if (loading || targetHandled.current) return;
    targetHandled.current = true;
    const portfolioId = new URLSearchParams(window.location.search).get('portfolioId');
    if (portfolioId) {
      const target = items.find((item) => item.id === portfolioId);
      if (target) setSelected(target);
    }
  }, [items, loading]);

  const update = async (item: ReviewItem, nextStatus: 'published' | 'hidden') => {
    setOperating(item.id);
    try {
      const response = await fetchWithAuth(`/service/designer-portfolios/${item.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '审核操作失败');
      const updated = { ...item, status: nextStatus };
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setSelected((current) => current?.id === item.id ? updated : current);
      toast.success(result.message || '审核状态已更新');
    } catch (error) { toast.error(error instanceof Error ? error.message : '审核操作失败'); }
    finally { setOperating(null); }
  };

  const selectedImages = selected ? (selected.imageUrls?.length ? selected.imageUrls : selected.coverUrl ? [selected.coverUrl] : []) : [];
  const platformLabel = selected?.platform ? PLATFORM_MAP[selected.platform]?.label || selected.platform : '未设置';

  return <section className="mx-auto max-w-7xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-xs font-semibold role-primary-text">客服工作台</p><h1 className="mt-1 text-2xl font-bold text-slate-900">设计师作品审核</h1><p className="mt-2 text-xs text-slate-500">查看设计师提交的作品，审核通过后向品牌方公开。</p></div>
      <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新列表</Button>
    </div>
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 role-primary-text" />作品审核列表<Badge variant="outline" className="ml-auto text-[10px]">共 {total} 项</Badge></CardTitle>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{filters.map((item) => <button key={item.value} type="button" aria-pressed={status === item.value} onClick={() => setStatus(item.value)} className={`rounded-lg px-3 py-1.5 text-xs transition ${status === item.value ? 'bg-white font-semibold role-primary-text shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-10 text-center text-xs text-slate-400">正在加载…</div> : items.length === 0 ? <div className="p-10 text-center text-xs text-slate-400">暂无符合条件的作品</div> : <>
          <div className="grid gap-4 px-3 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6 xl:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="relative aspect-[4/3] bg-slate-100"><AuthenticatedImage src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" /><Badge className={`absolute left-2 top-2 text-[10px] ${item.status === 'published' ? 'bg-emerald-500 text-white' : item.status === 'hidden' ? 'bg-slate-700 text-white' : 'bg-amber-500 text-white'}`}>{item.status === 'published' ? '已通过' : item.status === 'hidden' ? '已下架' : item.status === 'draft' ? '草稿' : '待审核'}</Badge></div>
            <div className="space-y-3 p-4"><div><h2 className="text-sm font-bold text-slate-800">{item.title}</h2><p className="mt-1 text-[11px] text-slate-500">设计师：{item.designerName} · {item.imageUrls.length} 张图片</p></div>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setSelected(item)} className="h-8 min-w-24 flex-1 rounded-xl text-xs"><Eye className="mr-1 h-3.5 w-3.5" />查看作品</Button>{item.status !== 'published' && <Button type="button" disabled={operating === item.id} onClick={() => void update(item, 'published')} className="role-primary-gradient h-8 min-w-24 flex-1 rounded-xl text-xs text-white"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />通过公开</Button>}{item.status !== 'hidden' && <Button type="button" variant="outline" disabled={operating === item.id} onClick={() => void update(item, 'hidden')} className="h-8 rounded-xl text-xs text-slate-600"><EyeOff className="mr-1 h-3.5 w-3.5" />下架</Button>}</div>
            </div>
          </article>)}</div>
          <AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={(nextPage) => void load(nextPage)} />
        </>}
      </CardContent>
    </Card>
    <Modal open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><ModalContent className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-3xl border-slate-200 bg-white p-5 sm:p-6">
      {selected && <><ModalHeader><DialogTitle className="text-base">{selected.title}</DialogTitle><DialogDescription className="text-xs">设计师：{selected.designerName} · {selectedImages.length} 张作品图片</DialogDescription></ModalHeader>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selectedImages.length ? selectedImages.map((image, index) => <figure key={image + index} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><div className="aspect-[4/3]"><AuthenticatedImage src={image} alt={`${selected.title}作品图${index + 1}`} className="h-full w-full object-contain" /></div><figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">作品图 {index + 1}</figcaption></figure>) : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">暂无作品图片</div>}</div>
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-2"><p><span className="text-slate-500">设计师：</span><span className="font-medium text-slate-700">{selected.designerName}</span></p><p><span className="text-slate-500">设计类型：</span><span className="font-medium text-slate-700">{selected.category || '未设置'}</span></p><p><span className="text-slate-500">所属行业：</span><span className="font-medium text-slate-700">{selected.industry || '未设置'}</span></p><p><span className="text-slate-500">投放平台：</span><span className="font-medium text-slate-700">{platformLabel}</span></p><p><span className="text-slate-500">设计职责：</span><span className="font-medium text-slate-700">{selected.designerRole || '未设置'}</span></p><p><span className="text-slate-500">作品状态：</span><span className="font-medium text-slate-700">{selected.status === 'published' ? '已通过' : selected.status === 'hidden' ? '已下架' : selected.status === 'draft' ? '草稿' : '待审核'}</span></p>{selected.description && <p className="sm:col-span-2"><span className="text-slate-500">项目说明：</span><span className="leading-5 text-slate-700">{selected.description}</span></p>}{!!selected.tags?.length && <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2"><span className="mr-1 text-slate-500">标签：</span>{selected.tags.map((tag) => <Badge key={tag} variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-600">{tag}</Badge>)}</div>}</div>
        {selected.status !== 'published' && <div className="flex justify-end"><Button type="button" disabled={operating === selected.id} onClick={() => void update(selected, 'published')} className="role-primary-gradient h-9 rounded-xl text-xs text-white"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />通过并公开</Button></div>}
      </>}
    </ModalContent></Modal>
  </section>;
}
