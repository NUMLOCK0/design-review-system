'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { 
  UploadCloud, 
  Trash2, 
  ArrowRight, 
  Info, 
  FileArchive, 
  Coins, 
  CheckCircle2, 
  Paperclip,
  CloudUpload,
  Loader2,
  ChevronDown,
  ArrowLeft,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { GROUP_MAP, PLATFORM_MAP, type PlatformType, type DesignOrder, type ReviewTask, type OrderImageRequirementItem } from '@design-review/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { fetchWithAuth } from '@/lib/auth';
import { uploadFile } from '@/lib/upload';
import { useCurrentUser } from '@/hooks/use-current-user';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { ReferenceLinkItemsDetail } from '@/components/reference-link-items-detail';
import { CustomerServiceReviewModal } from '@/components/customer-service-review-modal';

const selectTriggerClass = 'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[var(--role-primary)] focus:ring-2 focus:ring-[var(--role-primary-border)]';
const selectContentClass = 'z-50 max-h-72 min-w-[8rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md';
const selectItemClass = 'flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100 data-[state=checked]:bg-[var(--role-primary-soft)] data-[state=checked]:text-[var(--role-primary)]';

function RequirementReferences({ group }: { group: OrderImageRequirementItem }) {
  const imageItems = group.imageItems?.length ? group.imageItems : [{
    id: `${group.id}-reference`,
    materialImage: '',
    description: '',
    referenceImages: group.referenceImages || [],
    referenceLinks: group.referenceLinks || [],
    referenceLinkItems: undefined,
    referenceLinkDescription: undefined,
  }];
  const hasReferences = imageItems.some((item) => item.referenceLinkItems?.some((reference) => reference.image || reference.link || reference.description) || item.referenceImages?.length || item.referenceLinks?.some(Boolean));
  if (!hasReferences) return null;
  return <div className="mt-2 rounded-xl bg-slate-50 p-2"><p className="mb-1 text-[10px] font-semibold text-slate-500">品牌方竞品参考</p><div className="space-y-1.5">{imageItems.map((item) => <ReferenceLinkItemsDetail key={item.id} item={item} compact />)}</div></div>;
}

function ReviewSubmitPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const taskId = searchParams.get('taskId') || '';
  const isMobile = pathname.startsWith('/mobile/');
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [loadingTask, setLoadingTask] = useState(Boolean(taskId));

  const [platform, setPlatform] = useState<PlatformType>('tmall');
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  
  // 绑定接单订单
  const [claimedOrders, setClaimedOrders] = useState<DesignOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');

  // 上传源文件状态
  const [sourceFileName, setSourceFileName] = useState('');
  const [sourceFileSize, setSourceFileSize] = useState('');
  const [sourceFileUrl, setSourceFileUrl] = useState('');
  const [uploadingSource, setUploadingSource] = useState(false);

  // 图片列表与上传中状态
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ groupId: string; uploaded: number; total: number } | null>(null);
  const [previewImage, setPreviewImage] = useState('');
  const [images, setImages] = useState<Array<{ id: string; url: string; groupId: string; originalAssetId?: string }>>([]);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [customerServiceModalOpen, setCustomerServiceModalOpen] = useState(false);
  const [submittedDestination, setSubmittedDestination] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const uploadGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (taskId) {
      Promise.all([
        fetchWithAuth(`/review-tasks/${taskId}`),
        fetchWithAuth('/design-orders?status=all&pageSize=100')
      ])
        .then(async ([taskResponse, orderResponse]) => {
          const taskResult = await taskResponse.json();
          const orderResult = await orderResponse.json();
          if (!taskResponse.ok || !taskResult.success) throw new Error(taskResult.message || '任务不存在');
          const currentTask = taskResult.data as ReviewTask;
          const currentOrder = (orderResult.data || []).find((item: DesignOrder) => item.id === currentTask.orderId) as DesignOrder | undefined;
          setTask(currentTask);
          setSelectedOrderId(currentTask.orderId || '');
          setProductName(currentTask.productName || '');
          setSku(currentTask.sku || '');
          setPlatform(currentTask.platform || 'tmall');
          setSourceFileName(currentTask.sourceFileName || '');
          setSourceFileSize(currentTask.sourceFileSize || '');
          setSourceFileUrl(currentTask.sourceFileUrl || '');
          if (currentOrder) {
            setClaimedOrders([currentOrder]);
            setDesignNotes(currentOrder.requirements || '');
          }
          const uploadedImages = (currentTask.groups || []).flatMap((group, groupIndex) => (group.images || []).filter((image) => currentTask.status !== 'draft' || image.originalAssetId).map((image) => ({ id: image.id, url: image.imageUrl, groupId: currentOrder?.imageRequirementGroups?.[groupIndex]?.id || group.id, originalAssetId: image.originalAssetId })));
          setImages(uploadedImages);
        })
        .catch((error: any) => toast.error(error.message || '加载任务失败'))
        .finally(() => setLoadingTask(false));
      return;
    }

    // 无任务参数时保留手动选择接单订单的入口。
    fetchWithAuth('/design-orders?status=all&pageSize=100')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const claimed = data.data.filter((o: DesignOrder) => o.status === 'claimed' && (!o.claimedById || o.claimedById === user?.id));
          setClaimedOrders(claimed);
        }
      })
      .catch(console.error);
  }, [user?.id]);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    const target = claimedOrders.find(o => o.id === orderId);
    if (target) {
      setProductName(target.title);
      setPlatform(target.platform);
      setDesignNotes(target.requirements || '');
      setImages([]);
      toast.info(`已自动载入订单价格: ¥${target.designerPayout || target.budget}`);
    }
  };

  const selectedOrder = claimedOrders.find(o => o.id === selectedOrderId);
  const requiresPsd = Boolean(selectedOrder?.requiresPsd || task?.requiresPsd);
  const getGroupKey = (group: OrderImageRequirementItem) => group.id;
  const requirementGroups: OrderImageRequirementItem[] = selectedOrder?.imageRequirementGroups?.length
    ? selectedOrder.imageRequirementGroups
    : (task?.groups || []).map((group) => ({
        id: group.id,
        name: GROUP_MAP[group.groupType]?.label || '图片需求',
        groupType: group.groupType,
        quantity: group.requiredCount,
        dimensions: '',
        description: '',
        referenceImages: [],
        referenceLinks: []
      }));

  const handleStartGroupUpload = (groupId: string) => {
    const group = requirementGroups.find((item) => getGroupKey(item) === groupId);
    if (!group) return;
    const uploadedCount = images.filter((image) => image.groupId === groupId).length;
    if (uploadedCount >= group.quantity) return toast.warning(`“${group.name}”已达到 ${group.quantity} 张要求`);
    uploadGroupIdRef.current = groupId;
    fileInputRef.current?.click();
  };

  // 按订单图片分组上传设计素材到服务端 / 阿里云 OSS。
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const groupId = uploadGroupIdRef.current;
    const group = requirementGroups.find((item) => getGroupKey(item) === groupId);
    if (!files.length || !groupId || !group) return;
    const uploadedCount = images.filter((image) => image.groupId === groupId).length;
    const uploadFiles = files.slice(0, Math.max(group.quantity - uploadedCount, 0));
    if (!uploadFiles.length) return toast.warning(`“${group.name}”已达到 ${group.quantity} 张要求`);

    setUploadingImage(true);
    setUploadProgress({ groupId, uploaded: 0, total: uploadFiles.length });
    try {
      const uploadedImages: Array<{ id: string; url: string; groupId: string; originalAssetId?: string }> = [];
      for (const file of uploadFiles) {
        const data = await uploadFile(file, 'design-images');
        const uploadedImage = { id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`, url: data.url, groupId, originalAssetId: data.assetId };
        uploadedImages.push(uploadedImage);
        setImages((current) => [...current, uploadedImage]);
        setUploadProgress((current) => current ? { ...current, uploaded: current.uploaded + 1 } : current);
      }
      toast.success(`已为“${group.name}”上传 ${uploadedImages.length} 张设计素材`);
      if (files.length > uploadFiles.length) toast.info(`已按订单要求限制为 ${group.quantity} 张`);
    } catch (err: any) {
      toast.error(err.message || '图片上传失败');
    } finally {
      setUploadingImage(false);
      setUploadProgress(null);
      uploadGroupIdRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 真实上传分层源文件包 (PSD/AI/ZIP)
  const handleSourceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSource(true);
    try {
      const data = await uploadFile(file, 'source-files');

      setSourceFileName(file.name);
      setSourceFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      setSourceFileUrl(data.url);
      toast.success(`源文件包已成功同步至云端存储 (${data.storageType === 'aliyun-oss' ? 'OSS' : '本地'})`);
    } catch (err: any) {
      toast.error(err.message || '源文件上传失败');
    } finally {
      setUploadingSource(false);
      if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
    }
  };

  const validateSubmit = (requireImages: boolean) => {
    if (!productName) {
      toast.error('请输入商品名称');
      return false;
    }
    if (requireImages && images.length === 0) {
      toast.error('请至少上传一张待审核效果图');
      return false;
    }
    if (requireImages) {
      const incompleteGroup = requirementGroups.find((group) => images.filter((image) => image.groupId === group.id).length < (group.quantity || 1));
      if (incompleteGroup) {
        toast.error(`请完成“${incompleteGroup.name}”分组的图片上传`);
        return false;
      }
    }
    if (requireImages && requiresPsd && !sourceFileUrl) {
      toast.error('该订单要求交付 PSD 源文件，请先上传源文件');
      return false;
    }
    return true;
  };

  const handleSubmit = async (isDraft: boolean) => {
    if (!isDraft && !validateSubmit(true)) return;
    if (isDraft && !productName) {
      toast.error('请输入商品名称');
      return;
    }

    const orderGroups = requirementGroups;
    const groups = (orderGroups.length > 0 ? orderGroups : [{ id: 'default', groupType: 'main_1_1' as const, quantity: 1, description: '' }]).map((group, groupIndex) => ({
      id: `${selectedOrderId || 'task'}_grp_${groupIndex + 1}`,
      taskId: '',
      groupType: group.groupType,
      requiredCount: group.quantity || 1,
      images: images
        .filter((image) => image.groupId === group.id)
        .map((image, imageIndex) => ({
          id: image.id,
          taskId: '',
          groupId: `${selectedOrderId || 'task'}_grp_${groupIndex + 1}`,
          imageUrl: image.url,
          originalAssetId: image.originalAssetId,
          imageIndex: imageIndex + 1,
          designDescription: group.description || designNotes,
          version: 1,
          status: 'pending' as const,
          createdAt: new Date().toISOString()
        }))
    }));

    try {
      const res = await fetchWithAuth('/review-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          sku,
          platform,
          designerId: user?.id,
          designerName: user?.name,
          orderId: selectedOrder?.id,
          orderBudget: selectedOrder?.budget,
          designerPayout: selectedOrder?.designerPayout,
          sourceFileUrl,
          sourceFileName,
          sourceFileSize,
          groups,
          isDraft
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || '提交失败');
      toast.success(isDraft ? '已保存为草稿' : '设计稿与源文件已成功提交审核！', {
        description: '任务状态已同步进入审核流水线。'
      });
      const destination = pathname.startsWith('/mobile/')
        ? (taskId ? `/mobile/tasks/${encodeURIComponent(data.data?.id || taskId)}` : '/mobile/tasks')
        : '/review-tasks';
      if (isDraft) {
        router.push(destination);
      } else {
        setSubmittedDestination(destination);
        setCustomerServiceModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message || '提交审核发生错误');
    }
  };

  const handleReviewSubmitClick = () => {
    if (validateSubmit(true)) setSubmitConfirmOpen(true);
  };

  const finishSubmission = () => {
    setCustomerServiceModalOpen(false);
    if (submittedDestination) router.push(submittedDestination);
  };

  return (
    <div className={isMobile ? 'mx-auto w-full max-w-xl space-y-4 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-36' : 'mx-auto w-full max-w-4xl space-y-6'}>
      <div className={isMobile ? 'flex items-center gap-3 py-1' : 'glass-card rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-md'}>
        {isMobile ? <><button type="button" aria-label="返回任务详情" onClick={() => router.push(taskId ? `/mobile/tasks/${encodeURIComponent(taskId)}` : '/mobile/tasks')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0"><p className="text-[10px] font-semibold role-primary-text">设计师工作台</p><h1 className="truncate text-base font-extrabold text-slate-900">提交作品</h1></div></> : <><h1 className="text-xl font-bold tracking-tight text-slate-800">设计提审与源文件交付前台</h1><p className="mt-1 text-xs text-slate-500">支持 1:1 主图、3:4 长图、商详长图切片及分层源文件包直传存储</p></>}
      </div>

      <Card className={`glass-card space-y-6 border-white/80 bg-white/80 shadow-sm ${isMobile ? 'rounded-[22px] p-4 pb-28' : 'rounded-3xl p-6'}`}>
        {/* 0. 当前任务 / 订单要求 */}
        {taskId ? (
          <div className="rounded-2xl border role-primary-border role-primary-soft p-4">
            {loadingTask ? <p className="text-xs role-primary-text">正在载入任务与订单要求...</p> : task ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-bold role-primary-text"><Coins className="h-4 w-4 role-primary-text" />当前提审任务 · {task.taskNo}</div><p className="mt-1 text-sm font-semibold text-slate-800">{task.productName}</p><p className="mt-1 text-[11px] role-primary-text">订单表单已载入，以下上传项将按该订单的图片分组和数量要求提交。</p></div><Badge className="w-fit bg-white text-[10px] role-primary-text shadow-sm">{selectedOrder?.orderNo || '关联订单'}</Badge></div> : <p className="text-xs text-rose-600">任务加载失败，请返回任务列表后重试。</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border role-primary-border role-primary-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1"><div className="flex items-center gap-1.5 text-xs font-bold role-primary-text"><Coins className="h-4 w-4 role-primary-text" />关联前台接单任务</div><p className="text-[11px] role-primary-text">选择您在接单广场中承接的需求，上传内容将按订单要求组织。</p></div>
            <Select.Root value={selectedOrderId || 'unselected'} onValueChange={(value) => handleSelectOrder(value === 'unselected' ? '' : value)}><Select.Trigger className={`${selectTriggerClass} sm:w-80`}><Select.Value placeholder="选择绑定的接单需求" /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="unselected" className={selectItemClass}><Select.ItemText>-- 选择绑定的接单需求 --</Select.ItemText></Select.Item>{claimedOrders.map((o) => <Select.Item key={o.id} value={o.id} className={selectItemClass}><Select.ItemText>{o.orderNo} - {o.title} (¥{o.designerPayout || o.budget})</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
          </div>
        )}

        {/* 1. 基本信息 */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. 商品与投放平台属性</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">目标电商平台</Label>
              <Select.Root value={platform} disabled={Boolean(taskId)} onValueChange={(value) => setPlatform(value as PlatformType)}>
                <Select.Trigger className={selectTriggerClass}><Select.Value placeholder="选择平台" /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger>
                <Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{Object.entries(PLATFORM_MAP).map(([key, item]) => <Select.Item key={key} value={key} className={selectItemClass}><Select.ItemText>{item.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
              </Select.Root>
            </div>

            <div className="space-y-1.5">
              <Label required className="text-xs font-semibold text-slate-700">商品名称</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                readOnly={Boolean(taskId)}
                placeholder="订单商品名称"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">商品款号 / SKU</Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                readOnly={Boolean(taskId)}
                placeholder="订单款号（如有）"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">订单整体要求 / 设计说明</Label>
              <Input
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                readOnly={Boolean(taskId)}
                placeholder="订单表单中的整体要求"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>
          </div>
        </div>

        {/* 2. 按订单表单的图片分组上传 */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div><h2 className="text-sm font-bold text-slate-800">交付作品图片 <span aria-hidden="true" className="text-rose-500">*</span></h2><p className="mt-1 text-[11px] leading-5 text-slate-500">按订单分组添加，图片会自动匹配尺寸要求。</p></div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{images.length} 张</span>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImageFileUpload} accept="image/png,image/jpeg,image/webp" multiple className="hidden" />
          {requirementGroups.length ? <div className="space-y-3">{requirementGroups.map((group) => {
            const groupImages = images.filter((image) => image.groupId === getGroupKey(group));
            const requiredCount = group.quantity || 1;
            const ratioLabel = GROUP_MAP[group.groupType]?.ratio || '自适应';
            const complete = groupImages.length >= requiredCount;
            const progress = uploadProgress?.groupId === group.id ? uploadProgress : null;
            return <section key={group.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-bold text-slate-800">{group.name}</h3><Badge variant="outline" className="role-primary-border role-primary-soft text-[10px] role-primary-text">{ratioLabel}</Badge>{group.dimensions && <span className="text-[10px] font-mono text-slate-400">{group.dimensions}</span>}</div>{group.description && <p className="mt-1 text-[11px] leading-5 text-slate-500">{group.description}</p>}</div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{groupImages.length} / {requiredCount} 张</span></div>
              <RequirementReferences group={group} />
              <div className="mt-3 grid grid-cols-3 gap-2.5 sm:flex sm:flex-wrap">
                {Array.from({ length: requiredCount }, (_, index) => groupImages[index] || null).map((image, index) => image ? <div key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-28 sm:w-28 sm:flex-none">
                  <button type="button" onClick={() => setPreviewImage(image.url)} aria-label={`预览${group.name}第${index + 1}张`} className="absolute inset-0 h-full w-full"><AuthenticatedImage src={image.url} alt={`${group.name}作品${index + 1}`} className="h-full w-full object-cover" /></button>
                  <button type="button" aria-label={`删除${group.name}第${index + 1}张`} onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-sm transition hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Trash2 className="h-3.5 w-3.5" /></button>
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-4 text-left text-[10px] font-semibold text-white">作品 {index + 1}</span>
                </div> : <button key={`${group.id}-slot-${index}`} type="button" disabled={uploadingImage} onClick={() => handleStartGroupUpload(group.id)} className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed role-primary-border role-primary-soft role-primary-text transition active:scale-[.98] disabled:opacity-60 sm:h-28 sm:w-28 sm:flex-none">{uploadingImage && uploadGroupIdRef.current === group.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}<span className="text-[10px] font-semibold">{uploadingImage && uploadGroupIdRef.current === group.id ? '上传中' : '添加图片'}</span></button>)}
              </div>
              {progress && <div role="status" className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex items-center justify-between text-[10px] font-medium text-slate-500"><span>正在上传图片</span><span>{progress.uploaded} / {progress.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full role-primary-bg transition-all" style={{ width: `${Math.round((progress.uploaded / progress.total) * 100)}%` }} /></div></div>}
              <p className={`mt-2 text-[10px] ${complete ? 'text-emerald-600' : 'text-slate-400'}`}>{complete ? '本组已满足订单图片数量要求' : `还需添加 ${requiredCount - groupImages.length} 张 · ${ratioLabel}`}</p>
            </section>;
          })}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">当前任务没有可用的图片分组要求</div>}
          <p className="flex items-start gap-1.5 text-[10px] leading-5 text-slate-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />支持 JPG、PNG、WebP。点击图片可预览，右上角可删除后重新上传。</p>
        </div>
        {/* 3. 行业规范交付：分层源文件包 */}
        <div className="space-y-3">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileArchive className="w-4 h-4 text-purple-600" />
              3. 分层源文件包交付 (PSD / AI / C4D / ZIP){requiresPsd && <><span className="ml-1 text-rose-500">*</span><span className="sr-only">订单要求必交</span></>}
            </h2>
            <span className="text-[10px] text-slate-400">终审通过与归档依据</span>
          </div>

          <input
            type="file"
            ref={sourceFileInputRef}
            onChange={handleSourceFileUpload}
            accept=".psd,.ai,.zip,.rar,.c4d"
            className="hidden"
          />

          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Paperclip className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">{sourceFileName || '尚未上传源文件'}</div>
                <div className="text-[10px] text-slate-400 font-mono">{sourceFileSize ? `${sourceFileSize} · 包含完整文本矢量图层` : requiresPsd ? '此订单需上传 PSD 源文件后才能提交审核' : '支持 PSD / AI / C4D / ZIP 格式'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingSource}
                onClick={() => sourceFileInputRef.current?.click()}
                className="rounded-xl text-xs h-8 border-slate-300"
              >
                {uploadingSource ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 上传中...</span>
                ) : (
                  <span className="flex items-center gap-1"><CloudUpload className="w-3.5 h-3.5" /> {sourceFileName ? '替换源文件' : '上传源文件'}</span>
                )}
              </Button>
              <Badge variant="outline" className={`${sourceFileName ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'} text-[10px]`}>
                <CheckCircle2 className="w-3 h-3 mr-1" /> {sourceFileName ? '已就绪' : '待上传'}
              </Badge>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className={isMobile ? 'fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-8px_28px_rgba(15,23,42,.08)] backdrop-blur' : 'flex items-center justify-between border-t border-slate-100 pt-4'}>
          {selectedOrder && <div className="hidden text-xs sm:block"><span className="text-slate-500">订单价格：</span><b className="font-mono text-sm font-bold text-emerald-600">¥{selectedOrder.designerPayout || selectedOrder.budget}</b></div>}
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto sm:gap-3">
            <Button type="button" variant="outline" disabled={uploadingImage || uploadingSource} onClick={() => handleSubmit(true)} className="h-11 flex-1 rounded-xl border-slate-200 px-3 text-xs sm:h-10 sm:flex-none sm:rounded-2xl sm:px-5">保存草稿</Button>
            <Button type="button" disabled={uploadingImage || uploadingSource || loadingTask} onClick={handleReviewSubmitClick} className="role-primary-bg h-11 flex-[1.4] gap-1.5 rounded-xl px-4 text-xs font-semibold text-white shadow-sm hover:opacity-90 sm:h-10 sm:flex-none sm:rounded-2xl sm:px-6"><span>提交审核</span><ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
      {previewImage && <div role="dialog" aria-modal="true" aria-label="作品预览" onClick={() => setPreviewImage('')} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"><button type="button" aria-label="关闭预览" onClick={() => setPreviewImage('')} className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"><X className="h-5 w-5" /></button><AuthenticatedImage src={previewImage} alt="作品大图预览" className="max-h-[88dvh] max-w-full object-contain" /></div>}

      <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认提交审核？</AlertDialogTitle>
            <AlertDialogDescription>
              提交后将进入审核流水线并通知审核人员。请确认图片素材和源文件已上传完成，是否继续提交？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回检查</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSubmitConfirmOpen(false); void handleSubmit(false); }}>
              确认提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerServiceReviewModal
        open={customerServiceModalOpen}
        onClose={finishSubmission}
        isMobile={isMobile}
      />
    </div>
  );
}

export default function ReviewSubmitPage() {
  return <Suspense fallback={<div className="mx-auto w-full max-w-4xl py-20 text-center text-xs text-slate-400">正在载入提审任务...</div>}><ReviewSubmitPageContent /></Suspense>;
}
