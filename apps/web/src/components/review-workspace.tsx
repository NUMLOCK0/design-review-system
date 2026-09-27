'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Check, 
  X, 
  ZoomIn, 
  ZoomOut, 
  Square, 
  MapPin, 
  AlertTriangle,
  Layers,
  Sparkles,
  RotateCcw,
  Trash2,
  Split,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { TASK_STATUS_MAP, GROUP_MAP, type AnnotationItem, type ReviewTask, type ReviewImage } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useToast } from '@/components/ui/app-toast';
import { AuthenticatedImage } from '@/components/authenticated-image';

const PRESET_REASONS = [
  '极限词/违反广告法',
  '排版结构拥挤/不对齐',
  '主图背景不纯净/有杂色',
  '商品比例失真/色差明显',
  '促销利益点缺失/不清晰',
  '未按平台规范比例裁切'
];

export default function ReviewWorkspaceContent({
  taskId,
  onClose,
}: {
  taskId?: string;
  onClose?: () => void;
}) {
  const user = useCurrentUser();
  const { confirm } = useToast();
  const [task, setTask] = useState<ReviewTask | null>(null);
  const [loading, setLoading] = useState(true);

  // 画布与缩放状态
  const [zoom, setZoom] = useState(100);
  const [selectedTool, setSelectedTool] = useState<'select' | 'rect' | 'pin'>('select');
  const [activeTab, setActiveTab] = useState<'review' | 'diff' | 'history'>('review');

  // 当前选中的图片
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // 坐标打标交互状态
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // 批注列表与当前新建批注
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [showAddCommentModal, setShowAddCommentModal] = useState(false);
  const [tempAnnotation, setTempAnnotation] = useState<any>(null);

  // 驳回弹窗与原因
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<string[]>([]);
  const [rejectCommentText, setRejectCommentText] = useState('');

  // 左右对比版本选择 (v1 vs v2)
  const [diffMode, setDiffMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [diffSliderPos, setDiffSliderPos] = useState(50);

  // 获取当前审核任务数据
  const fetchTask = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(taskId
        ? `/review-tasks/${taskId}`
        : '/review-tasks');
      const data = await res.json();
      if (data.success) {
        const nextTask = taskId ? data.data : data.data?.list?.find((item: ReviewTask) => item.status === 'pending' || item.status === 'in_review');
        if (nextTask) {
          const reviewTask = nextTask.status === 'pending'
            ? await fetchWithAuth(`/review-tasks/${nextTask.id}/start-review`, { method: 'POST' }).then((response) => response.json()).then((result) => result.data || nextTask)
            : nextTask;
          setTask(reviewTask);
          setSelectedImageIndex(0);
        }
      }
    } catch (e) {
      toast.error('加载审核任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  // 获取当前正在审核的图片
  const reviewImages = task?.groups?.flatMap((group) => group.images.map((image) => ({ ...image, groupType: group.groupType }))) || [];
  const currentImage: ReviewImage = reviewImages[selectedImageIndex] || {
    id: 'empty-image', taskId: '', groupId: '', imageUrl: '', imageIndex: 0,
    designDescription: '暂无待审核图片', version: 0, status: 'pending', createdAt: new Date().toISOString()
  };

  useEffect(() => {
    setAnnotations(currentImage.annotations || []);
    setActiveAnnotationId(currentImage.annotations?.[0]?.id || null);
  }, [currentImage.id]);

  // v1 对比图 (上一版本)
  const previousVersionUrl = currentImage.imageUrl;

  // 画布鼠标按下：开始框选或打点
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canReview || selectedTool === 'select' || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (selectedTool === 'pin') {
      // 图钉打点模式
      setTempAnnotation({
        type: 'pin',
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        color: '#f59e0b'
      });
      setShowAddCommentModal(true);
      return;
    }

    if (selectedTool === 'rect') {
      setIsDrawing(true);
      setStartPos({ x, y });
      setCurrentBox({ x, y, width: 0, height: 0 });
    }
  };

  // 画布鼠标移动：更新矩形框大小
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const boxX = Math.min(startPos.x, currentX);
    const boxY = Math.min(startPos.y, currentY);
    const boxWidth = Math.abs(currentX - startPos.x);
    const boxHeight = Math.abs(currentY - startPos.y);

    setCurrentBox({ x: boxX, y: boxY, width: boxWidth, height: boxHeight });
  };

  // 画布鼠标松开：完成矩形打标，弹出输入框
  const handleMouseUp = () => {
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);

    // 过滤误点击极小矩形
    if (currentBox.width > 2 && currentBox.height > 2) {
      setTempAnnotation({
        type: 'rect',
        x: Number(currentBox.x.toFixed(2)),
        y: Number(currentBox.y.toFixed(2)),
        width: Number(currentBox.width.toFixed(2)),
        height: Number(currentBox.height.toFixed(2)),
        color: '#ef4444'
      });
      setShowAddCommentModal(true);
    }
    setCurrentBox(null);
    setStartPos(null);
  };

  // 确认保存新批注
  const handleSaveAnnotation = () => {
    if (!newComment.trim()) {
      toast.error('请输入修改批注意见');
      return;
    }

    const newAnn: AnnotationItem = {
      id: `ann_${Date.now()}`,
      ...tempAnnotation,
      comment: newComment.trim(),
      creatorId: user?.id || 'u_rev_1',
      creatorName: user?.name || '王总监',
      createdAt: new Date().toISOString()
    };

    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    setActiveAnnotationId(newAnn.id);
    setNewComment('');
    setShowAddCommentModal(false);
    setSelectedTool('select');
    toast.success('坐标批注打标已添加');

    // 同步到后端
    if (task) {
      fetchWithAuth(`/review-tasks/${task.id}/images/${currentImage.id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: updated })
      }).catch(console.error);
    }
  };

  // 删除批注
  const handleDeleteAnnotation = async (id: string) => {
    if (!await confirm({ title: '确认删除批注？', message: '删除后该批注及其修改提示将从当前图片中移除。', confirmText: '确认删除', type: 'danger' })) return;
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    if (activeAnnotationId === id) {
      setActiveAnnotationId(null);
    }
    toast.info('批注已移除');
    if (task) {
      fetchWithAuth(`/review-tasks/${task.id}/images/${currentImage.id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: updated })
      }).catch(console.error);
    }
  };

  // 审批通过操作
  const handleApprove = async () => {
    if (!task) return;
    if (!await confirm({ title: '确认通过当前设计图？', message: '通过后当前图片将放行；当整套图片审核完成时，订单会进入后续结算与验收流程。', confirmText: '确认通过放行', type: 'warning' })) return;
    try {
      const res = await fetchWithAuth(`/review-tasks/${task.id}/images/${currentImage.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          reviewerName: user?.name || '王总监'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('审核通过！当前设计图已合格放行', {
          description: '若全套图片均合格，将自动结算设计款并完成归档。'
        });
        setTask(data.data);
      }
    } catch {
      toast.error('保存审核状态失败');
    }
  };

  // 驳回修改操作
  const handleReject = async () => {
    if (rejectReasons.length === 0 && !rejectCommentText) {
      toast.error('请勾选至少一个驳回原因或输入修改要求');
      return;
    }
    if (!task) return;

    try {
      const res = await fetchWithAuth(`/review-tasks/${task.id}/images/${currentImage.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectReasons,
          rejectComment: rejectCommentText,
          annotations,
          reviewerName: user?.name || '王总监'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.error('已下发驳回与修订指导工单！', {
          description: `修改意见已实时同步通知设计师，当前返修次数: ${data.data.rejectCount || 1} / 3。`
        });
        setTask(data.data);
        setShowRejectModal(false);
      }
    } catch {
      toast.error('下发驳回失败');
    }
  };

  const currentRejectCount = task?.rejectCount || 0;
  const canReview = (user?.role === 'advertiser' || user?.role === 'admin')
    && task?.status === 'in_review'
    && currentImage.status === 'pending'
    && !currentImage.reviewHistory?.some((review) => review.level === task.currentLevel && review.version === currentImage.version && review.reviewerId === user?.id);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-slate-50 text-slate-800">
      {/* 1. 顶部专业工具栏 */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-indigo-600" aria-label="关闭审核工作台">
              <X className="w-4 h-4" />
            </Button>
          )}
          <Badge variant="outline" className="font-mono text-xs text-indigo-400 border-indigo-500/40 bg-indigo-500/10">
            {task?.taskNo || '暂无审核任务'}
          </Badge>
          <h2 className="font-bold text-xs text-slate-700 truncate max-w-sm sm:max-w-md">
            {task?.productName || '暂无审核任务'} - {currentImage.designDescription} (V{currentImage.version})
          </h2>
          {task && (
            <Badge variant="outline" className="text-[10px] border-slate-200" style={{ color: TASK_STATUS_MAP[task.status].color }}>
              {TASK_STATUS_MAP[task.status].label}
            </Badge>
          )}
          {currentRejectCount >= 3 && (
            <Badge variant="destructive" className="text-[10px] bg-rose-500/20 text-rose-300 border-rose-500/50">
              已达返修熔断上限
            </Badge>
          )}
        </div>

        {/* 画布缩放与打标工具栏 */}
        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-2xl border border-slate-200">
          <Button
            size="sm"
            variant={selectedTool === 'select' ? 'secondary' : 'ghost'}
            onClick={() => setSelectedTool('select')}
            disabled={!canReview}
            className={`h-7 px-2.5 text-xs rounded-xl ${selectedTool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
          >
            指针选择
          </Button>

          <Button
            size="sm"
            variant={selectedTool === 'rect' ? 'secondary' : 'ghost'}
            onClick={() => setSelectedTool('rect')}
            disabled={!canReview}
            className={`h-7 px-2 text-xs rounded-xl gap-1.5 ${selectedTool === 'rect' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>区域框选</span>
          </Button>

          <Button
            size="sm"
            variant={selectedTool === 'pin' ? 'secondary' : 'ghost'}
            onClick={() => setSelectedTool('pin')}
            disabled={!canReview}
            className={`h-7 px-2 text-xs rounded-xl gap-1.5 ${selectedTool === 'pin' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>图钉打标</span>
          </Button>

          <div className="w-[1px] h-4 bg-slate-200 mx-1" />

          {/* 缩放控制器 */}
          <Button size="icon" variant="ghost" onClick={() => setZoom(Math.max(50, zoom - 15))} className="h-7 w-7 text-slate-500">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] font-mono text-slate-500 w-10 text-center">{zoom}%</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(Math.min(200, zoom + 15))} className="h-7 w-7 text-slate-500">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(100)} className="h-7 w-7 text-slate-500">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* 顶部审核操作按钮 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowRejectModal(true)}
            disabled={!canReview}
            className="h-8 rounded-xl text-xs px-3.5 gap-1.5 bg-rose-600 hover:bg-rose-700 font-semibold"
          >
            <X className="w-3.5 h-3.5" />
            <span>驳回修订</span>
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={!canReview}
            className="h-8 rounded-xl text-xs px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-semibold text-white shadow-md shadow-emerald-600/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>通过放行</span>
          </Button>
        </div>
      </header>

      {/* 2. 工作台主区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧图片分组切图列表 */}
        <aside className="w-48 bg-white/80 border-r border-slate-200 p-3 flex flex-col justify-between shrink-0">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
              <span>待审切图列表</span>
              <span className="text-slate-500 font-mono">{reviewImages.length}张</span>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-17rem)] pr-1">
              {reviewImages.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`p-2 rounded-2xl border cursor-pointer transition flex items-center gap-2 ${
                    selectedImageIndex === idx
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-200 bg-slate-50 hover:bg-indigo-50/40'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <AuthenticatedImage src={item.imageUrl} alt="切图" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-700 truncate">{GROUP_MAP[item.groupType].label} #{idx + 1}</div>
                    <div className="flex items-center gap-1 text-[10px] mt-0.5">
                      <span className="text-slate-500 font-mono">V{item.version}</span>
                      {item.status === 'approved' ? (
                        <span className="text-emerald-400 font-semibold">已通过</span>
                      ) : item.status === 'rejected' ? (
                        <span className="text-rose-400 font-semibold">待修改</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">待审核</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {reviewImages.length === 0 && <div className="py-8 text-center text-xs text-slate-500">暂无可审核切图</div>}
            </div>
          </div>

          {/* 源文件下载信息 */}
          <div className="p-2.5 rounded-2xl bg-white/90 border border-slate-200 text-[11px] text-slate-500 space-y-1">
            <div className="font-semibold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              分层源文件包
            </div>
            <div className="text-[10px] truncate text-slate-500">{task?.sourceFileName || '未上传源文件包'}</div>
            <Button size="sm" variant="outline" className="w-full text-[10px] h-6 rounded-xl border-slate-200 bg-white text-slate-700">
              下载核验
            </Button>
          </div>
        </aside>

        {/* 中间核心画布 / 比对区 */}
        <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          {/* 画布模式切换 Tab */}
          <div className="h-10 bg-white/80 border-b border-slate-200 px-4 flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
              <TabsList className="bg-slate-50 p-0.5 rounded-xl border border-slate-200 h-7">
                <TabsTrigger value="review" className="text-xs rounded-lg px-3 py-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                  单图批注模式
                </TabsTrigger>
                <TabsTrigger value="diff" className="text-xs rounded-lg px-3 py-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white flex items-center gap-1">
                  <Split className="w-3 h-3" />
                  V1 / V2 版本比对
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === 'review' && (
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>提示：选择上方矩形或图钉工具后在画布上拖拽即可快速打标</span>
              </div>
            )}
            {activeTab === 'diff' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">比对模式:</span>
                <Button
                  size="sm"
                  variant={diffMode === 'side-by-side' ? 'secondary' : 'ghost'}
                  onClick={() => setDiffMode('side-by-side')}
                  className="h-6 text-[10px] px-2 rounded-lg"
                >
                  左右双屏并排
                </Button>
                <Button
                  size="sm"
                  variant={diffMode === 'slider' ? 'secondary' : 'ghost'}
                  onClick={() => setDiffMode('slider')}
                  className="h-6 text-[10px] px-2 rounded-lg"
                >
                  卷帘拖拽对比
                </Button>
              </div>
            )}
          </div>

          {/* 模式 1：单图批注画布 */}
          {activeTab === 'review' && (
            <div className="flex-1 overflow-auto flex items-center justify-center p-8 select-none">
              <div
                ref={imageContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
                className={`relative max-w-xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 bg-white transition-transform duration-100 ${
                  selectedTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
                }`}
              >
                <AuthenticatedImage
                  src={currentImage.imageUrl}
                  alt="审核主画布"
                  className="w-full h-auto block pointer-events-none"
                />

                {/* 正在拉取的矩形框 */}
                {currentBox && (
                  <div
                    style={{
                      left: `${currentBox.x}%`,
                      top: `${currentBox.y}%`,
                      width: `${currentBox.width}%`,
                      height: `${currentBox.height}%`,
                    }}
                    className="absolute border-2 border-dashed border-rose-500 bg-rose-500/20 pointer-events-none rounded-sm"
                  />
                )}

                {/* 已保存的批注标记层 */}
                {annotations.map((ann, idx) => {
                  const isActive = activeAnnotationId === ann.id;
                  if (ann.type === 'rect') {
                    return (
                      <div
                        key={ann.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveAnnotationId(ann.id);
                        }}
                        style={{
                          left: `${ann.x}%`,
                          top: `${ann.y}%`,
                          width: `${ann.width}%`,
                          height: `${ann.height}%`,
                        }}
                        className={`absolute border-2 rounded-sm cursor-pointer transition-all ${
                          isActive
                            ? 'border-rose-500 bg-rose-500/30 ring-4 ring-rose-500/30'
                            : 'border-rose-400/80 bg-rose-500/10 hover:border-rose-400'
                        }`}
                      >
                        <span className="absolute -top-3 -left-3 w-5 h-5 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                          {idx + 1}
                        </span>
                      </div>
                    );
                  }

                  // 图钉打点标记
                  return (
                    <div
                      key={ann.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAnnotationId(ann.id);
                      }}
                      style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-full cursor-pointer group"
                    >
                      <div className={`p-1 rounded-full shadow-lg transition-transform ${
                        isActive ? 'scale-125 bg-amber-500 text-slate-950' : 'bg-amber-400 text-slate-900 group-hover:scale-110'
                      }`}>
                        <MapPin className="w-4 h-4 fill-current" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-50 text-amber-400 text-[9px] font-bold rounded-full flex items-center justify-center border border-amber-400">
                        {idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 模式 2：V1 vs V2 版本对比视图 */}
          {activeTab === 'diff' && (
            <div className="flex-1 p-6 overflow-hidden flex flex-col justify-center items-center">
              {diffMode === 'side-by-side' ? (
                <div className="grid grid-cols-2 gap-6 w-full max-w-4xl h-full items-center">
                  {/* 左侧 V1 */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      <span>初始版本 (V1 驳回前)</span>
                      <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30">已驳回</Badge>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-[65vh] shadow-xl">
                      <AuthenticatedImage src={previousVersionUrl} alt="V1" className="w-full h-full object-contain" />
                    </div>
                  </div>

                  {/* 右侧 V2 */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                      <span>当前版本 (V2 重新提审)</span>
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">最新修正</Badge>
                    </div>
                    <div className="rounded-2xl overflow-hidden border-2 border-indigo-500/80 max-h-[65vh] shadow-xl">
                      <AuthenticatedImage src={currentImage.imageUrl} alt="V2" className="w-full h-full object-contain" />
                    </div>
                  </div>
                </div>
              ) : (
                /* 卷帘模式 */
                <div className="relative w-full max-w-xl aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 select-none shadow-2xl">
                  {/* 底图 V2 */}
                  <AuthenticatedImage src={currentImage.imageUrl} alt="V2" className="absolute inset-0 w-full h-full object-cover" />
                  
                  {/* 顶图 V1 (带裁剪宽度) */}
                  <div
                    style={{ width: `${diffSliderPos}%` }}
                    className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white shadow-2xl"
                  >
                    <AuthenticatedImage
                      src={previousVersionUrl}
                      alt="V1"
                      className="absolute inset-0 w-full h-full object-cover max-w-none"
                      style={{ width: '100%', height: '100%' }}
                    />
                    <span className="absolute top-3 left-3 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-md">
                      V1 历史版本
                    </span>
                  </div>

                  <span className="absolute top-3 right-3 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-md">
                    V2 当前修正版
                  </span>

                  {/* 拖动滑动条 */}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={diffSliderPos}
                    onChange={(e) => setDiffSliderPos(Number(e.target.value))}
                    className="absolute inset-x-0 bottom-4 mx-auto w-3/4 opacity-70 hover:opacity-100 cursor-ew-resize"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧批注意见列表与操作流 */}
        <aside className="w-80 bg-white border-l border-slate-200 p-4 flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                坐标打标批注明细 ({annotations.length})
              </h3>
              <span className="text-[10px] text-slate-500">点击卡片定位</span>
            </div>

            {annotations.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                暂无打标批注，请在画布上框选或打点
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-16rem)] pr-1">
                {annotations.map((ann, idx) => {
                  const isActive = activeAnnotationId === ann.id;
                  return (
                    <div
                      key={ann.id}
                      onClick={() => setActiveAnnotationId(ann.id)}
                      className={`p-3 rounded-2xl border transition cursor-pointer ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-slate-200 bg-slate-50 hover:bg-indigo-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-[11px] font-bold text-slate-700">
                            {ann.type === 'rect' ? '区域修改框' : '图钉标注点'}
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAnnotation(ann.id);
                          }}
                          className="h-5 w-5 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{ann.comment}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                        <span>批注人: {ann.creatorName}</span>
                        <span>{new Date(ann.createdAt).toLocaleTimeString().slice(0, 5)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 底部质检信息 */}
          <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex items-center justify-between">
              <span>当前审核层级:</span>
            <span className="font-bold text-indigo-400">L{task?.currentLevel || 1} 视觉初审质检</span>
            </div>
            <div className="flex items-center justify-between">
              <span>累计驳回返修:</span>
              <span className="font-mono font-bold text-amber-400">{task?.rejectCount || 0} / 3 次</span>
            </div>
          </div>
        </aside>
      </div>

      {/* 弹窗 1：输入批注意见 */}
      <Dialog open={showAddCommentModal} onOpenChange={setShowAddCommentModal}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-indigo-400">
              <Square className="w-4 h-4" />
              添加坐标打标批注内容
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              精准描述选定区域需要修改排版、色调或文案的指导建议
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Textarea
              rows={3}
              placeholder="例如：左上角促销文案字体偏小，且离边缘缺少 10px 安全边距，请居中对齐..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="bg-slate-50 border-slate-200 text-xs text-slate-700 rounded-xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAddCommentModal(false)} className="text-xs">
              取消
            </Button>
            <Button size="sm" onClick={handleSaveAnnotation} className="text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
              保存打标批注
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗 2：驳回修改弹窗 */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="bg-white border-slate-200 text-slate-800 max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              下发设计稿驳回修改工单 (第 {currentRejectCount} 次返修 / 上限 3 次)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              勾选常见违规项或输入具体批注意见，工单将同步通知设计师修改。
            </DialogDescription>
          </DialogHeader>

          {/* 行业返修熔断提示 */}
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                行业返修熔断预警
              </div>
              <div className="text-[11px] text-amber-200/80 mt-0.5">
                若累计驳回达 3 次，系统将自动锁定任务并触发平台客服仲裁介入。
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold bg-amber-400/20 px-2 py-0.5 rounded-md border border-amber-400/30">
              {currentRejectCount} / 3
            </span>
          </div>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {PRESET_REASONS.map((r) => {
                const selected = rejectReasons.includes(r);
                return (
                  <Button
                    key={r}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRejectReasons(
                        selected ? rejectReasons.filter(i => i !== r) : [...rejectReasons, r]
                      );
                    }}
                    className={`text-xs h-auto py-2 px-3 justify-start rounded-xl border transition-all ${
                      selected
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {r}
                  </Button>
                );
              })}
            </div>

            <Textarea
              value={rejectCommentText}
              onChange={(e) => setRejectCommentText(e.target.value)}
              placeholder="输入具体指导要求与区域修改点..."
              rows={3}
              className="bg-slate-50 border-slate-200 text-xs text-slate-700 rounded-xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRejectModal(false)} className="text-xs">
              取消
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReject} className="text-xs rounded-xl px-4">
              确认下发驳回工单
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
