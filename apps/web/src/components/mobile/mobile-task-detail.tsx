'use client';

import Link from 'next/link';
import { OrderEvaluationEntry } from '@/components/order-evaluations';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Clock3, Download, Image as ImageIcon } from 'lucide-react';
import type { ReviewTask } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { goBackOrReplace } from '@/components/mobile/mobile-navigation';
import { toast } from 'sonner';

const taskStatus: Record<string, string> = { draft: '制作中', pending: '待审核', in_review: '审核中', needs_revision: '待修改', returned: '已退单', approved: '审核通过', archived: '已归档' };
const imageStatus: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '需修改', revision: '需修改' };

export function MobileTaskDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/review-tasks/${id}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '任务加载失败');
      setTask(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : '任务加载失败'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const download = async (url: string, filename: string) => {
    try {
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error('下载失败，请稍后重试');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : '下载失败'); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">正在加载任务…</div>;
  if (!task) return <div className="py-16 text-center text-sm text-slate-500">无法加载任务<button type="button" onClick={() => goBackOrReplace(router, '/mobile/tasks')} className="mt-3 block w-full role-primary-text">返回</button></div>;
  const user = getCurrentUser();
  const isDesigner = user?.role === 'designer' && task.designerId === user.id;
  const canContinue = isDesigner && ['draft', 'needs_revision'].includes(task.status);
  const imageGroups = task.groups || [];
  return <>
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-32">
      <div className="flex items-center gap-3"><button type="button" aria-label="返回" onClick={() => goBackOrReplace(router, '/mobile/tasks')} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="truncate text-[11px] text-slate-400">{task.taskNo}</p><h1 className="truncate text-lg font-extrabold">任务详情</h1></div><span className="shrink-0 rounded-full role-primary-soft px-3 py-1.5 text-[10px] font-bold role-primary-text">{taskStatus[task.status] || task.status}</span></div>
      <section className="rounded-[22px] bg-white p-4 shadow-sm"><h2 className="text-base font-bold">{task.productName}</h2><p className="mt-1 text-xs text-slate-400">{task.platform} · 设计师 {task.designerName}</p><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="图片总数" value={`${task.totalImages} 张`} /><Metric label="已通过" value={`${task.approvedCount} 张`} /><Metric label="需修改" value={`${task.rejectedCount} 张`} /><Metric label="提交时间" value={task.submittedAt ? new Date(task.submittedAt).toLocaleDateString('zh-CN') : '尚未提交'} /></div>{task.orderId && <Link href={`/mobile/orders/${task.orderId}`} className="mt-3 flex min-h-11 items-center rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-600">关联订单<ChevronRight className="ml-auto h-4 w-4" /></Link>}</section>
      {!imageGroups.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400"><ImageIcon className="mx-auto mb-2 h-6 w-6" />该任务暂时没有作品图片</div>}
      {imageGroups.map((group, groupIndex) => <section key={group.id} className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">图片组 {groupIndex + 1}</h2><span className="text-[10px] text-slate-400">{group.images.length} 张作品</span></div>{group.images.map((image, imageIndex) => <article key={image.id} className="overflow-hidden rounded-[20px] border border-slate-100 bg-white shadow-sm"><button onClick={() => setPreview(image.imageUrl)} className="block w-full bg-slate-50"><AuthenticatedImage src={image.imageUrl} alt={`作品图片 ${imageIndex + 1}`} className="max-h-[65dvh] w-full object-contain" /></button><div className="space-y-2 p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold">第 {imageIndex + 1} 张作品</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${image.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : image.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{imageStatus[image.status] || image.status}</span></div>{image.designDescription && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">{image.designDescription}</p>}{image.rejectComment && <div className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">审核意见：{image.rejectComment}</div>}{image.rejectReasons?.length ? <p className="text-[11px] text-rose-600">修改项：{image.rejectReasons.join('、')}</p> : null}</div></article>)}</section>)}
      {task.sourceFileName && <div className="flex items-center gap-3 rounded-2xl bg-white p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Download className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{task.sourceFileName}</p><p className="mt-1 text-[10px] text-slate-400">{task.sourceFileSize || '已上传源文件'}</p></div>{task.sourceFileUrl && task.acceptedAt && user?.role === 'advertiser' && <button type="button" onClick={() => void download(task.sourceFileUrl!, task.sourceFileName || '设计源文件')} aria-label="下载源文件" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50"><Download className="h-4 w-4" /></button>}</div>}
      {task.orderId && task.acceptedAt && <OrderEvaluationEntry orderId={task.orderId} mobile />}
      <p className="flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />最近更新 {task.updatedAt ? new Date(task.updatedAt).toLocaleString('zh-CN') : '—'}</p>
    </div>
    {canContinue && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur"><Link href={`/mobile/review-submit?taskId=${encodeURIComponent(task.id)}`} className="mx-auto flex h-12 max-w-xl items-center justify-center gap-2 rounded-xl role-primary-bg text-sm font-bold text-white">{task.status === 'needs_revision' ? '修改并重新提交' : '继续提交作品'}<ChevronRight className="h-4 w-4" /></Link></div>}
    {preview && <div role="dialog" aria-modal="true" aria-label="作品预览" onClick={() => setPreview('')} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3"><button className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] rounded-full bg-white/15 px-4 py-2 text-sm text-white">关闭</button><AuthenticatedImage src={preview} alt="作品大图" className="max-h-[90dvh] max-w-full object-contain" /></div>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-700">{value}</p></div>; }
