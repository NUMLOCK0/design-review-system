'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  Trash2, 
  ArrowRight, 
  Layers, 
  Sparkles, 
  Info, 
  FileArchive, 
  Coins, 
  CheckCircle2, 
  Paperclip,
  CloudUpload,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { PLATFORM_MAP, type PlatformType, type DesignOrder } from '@design-review/shared';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { getCurrentUser } from '@/lib/auth';

export default function ReviewSubmitPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [platform, setPlatform] = useState<PlatformType>('tmall');
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  
  // 绑定接单订单
  const [claimedOrders, setClaimedOrders] = useState<DesignOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');

  // 上传源文件状态
  const [sourceFileName, setSourceFileName] = useState('2026_AW_Jacket_Masters.psd');
  const [sourceFileSize, setSourceFileSize] = useState('184.5 MB');
  const [sourceFileUrl, setSourceFileUrl] = useState('');
  const [uploadingSource, setUploadingSource] = useState(false);

  // 图片列表与上传中状态
  const [uploadingImage, setUploadingImage] = useState(false);
  const [images, setImages] = useState<Array<{ id: string; url: string; group: string }>>([
    {
      id: '1',
      url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80',
      group: 'main_1_1'
    },
    {
      id: '2',
      url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80',
      group: 'main_3_4'
    }
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 获取当前设计师已接单未提交的需求列表
    fetch('http://localhost:8080/api/design-orders')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const claimed = data.data.filter((o: DesignOrder) => o.status === 'claimed');
          setClaimedOrders(claimed);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    const target = claimedOrders.find(o => o.id === orderId);
    if (target) {
      setProductName(target.title);
      setPlatform(target.platform);
      setDesignNotes(`依据接单需求【${target.title}】设计制作，包含规范主图及高分辨率分层源文件。`);
      toast.info(`已自动载入订单价格: ¥${target.designerPayout || target.budget}`);
    }
  };

  // 真实上传图片到服务端 / 阿里云 OSS
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'design-images');

    try {
      const res = await fetch('http://localhost:8080/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '上传失败');
      }

      const newImg = {
        id: `img_${Date.now()}`,
        url: data.data.url,
        group: images.length === 0 ? 'main_1_1' : 'main_3_4'
      };
      setImages(prev => [...prev, newImg]);
      toast.success(`图片已成功上传 (${data.data.storageType === 'aliyun-oss' ? '阿里云 OSS' : '本地存储'})`);
    } catch (err: any) {
      toast.error(err.message || '图片上传失败');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 真实上传分层源文件包 (PSD/AI/ZIP)
  const handleSourceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSource(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'source-files');

    try {
      const res = await fetch('http://localhost:8080/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '源文件上传失败');
      }

      setSourceFileName(file.name);
      setSourceFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      setSourceFileUrl(data.data.url);
      toast.success(`源文件包已成功同步至云端存储 (${data.data.storageType === 'aliyun-oss' ? 'OSS' : '本地'})`);
    } catch (err: any) {
      toast.error(err.message || '源文件上传失败');
    } finally {
      setUploadingSource(false);
      if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
    }
  };

  const handleSubmit = (isDraft: boolean) => {
    if (!productName) {
      toast.error('请输入商品名称');
      return;
    }
    toast.success(isDraft ? '已保存为草稿' : '设计稿与源文件已成功提交审核！', {
      description: '已同步进入多级审核流水线，审核通过后收益自动结算至个人钱包。'
    });
    router.push('/review-tasks');
  };

  const selectedOrder = claimedOrders.find(o => o.id === selectedOrderId);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">设计提审与源文件交付前台</h1>
        <p className="text-xs text-slate-500 mt-1">支持 1:1 主图、3:4 长图、商详长图切片及分层源文件包直传存储</p>
      </div>

      <Card className="glass-card border-white/80 p-6 space-y-6 rounded-3xl bg-white/80 shadow-sm">
        {/* 0. 关联已接单需求 (若有) */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-blue-600" />
              关联前台接单任务 (直接对接分账结算)
            </div>
            <p className="text-[11px] text-blue-700">
              选择您在接单广场中承接的需求，提审通过后将自动触发全额结算
            </p>
          </div>
          <select
            value={selectedOrderId}
            onChange={(e) => handleSelectOrder(e.target.value)}
            className="h-9 text-xs rounded-xl bg-white border border-blue-200 px-3 text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- 选择绑定的接单需求 --</option>
            {claimedOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} - {o.title} (¥{o.designerPayout || o.budget})
              </option>
            ))}
          </select>
        </div>

        {/* 1. 基本信息 */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. 商品与投放平台属性</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">目标电商平台</Label>
              <Select value={platform} onValueChange={(val) => setPlatform(val as PlatformType)}>
                <SelectTrigger className="bg-white rounded-xl border-slate-200 text-xs h-9">
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent className="glass-card-subtle bg-white">
                  {Object.entries(PLATFORM_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">商品名称 (必填)</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="例如: 2026秋季新款复古工装夹克外衣"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">商品款号 / SKU</Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="例如: JK-2026-09-A"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">设计创意说明 / 卖点提炼</Label>
              <Input
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                placeholder="简述设计卖点与排版核心理念"
                className="bg-white rounded-xl border-slate-200 text-xs h-9"
              />
            </div>
          </div>
        </div>

        {/* 2. 图片预览与多格式上传 */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">2. 待审核效果图 (JPG / PNG)</h2>
            <span className="text-[10px] text-slate-400">已载入 {images.length} 张效果图</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileUpload}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
          />

          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-200 bg-blue-50/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-blue-50/40 transition cursor-pointer"
          >
            {uploadingImage ? (
              <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                正在直传至云端存储...
              </div>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 text-blue-500 mb-1.5" />
                <p className="text-xs font-bold text-slate-700">点击浏览上传 或 拖拽设计图到此处</p>
                <p className="text-[11px] text-slate-400 mt-0.5">支持 1:1 白底图、3:4 场景图、商详切片，自动同步至存储</p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div key={img.id} className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm aspect-square">
                <img src={img.url} alt="预览" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => setImages(images.filter(i => i.id !== img.id))}
                    className="h-8 w-8 rounded-full"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                  {img.group === 'main_1_1' ? '1:1 主图' : '3:4 场景图'} · #{idx + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. 行业规范交付：分层源文件包 */}
        <div className="space-y-3">
          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileArchive className="w-4 h-4 text-purple-600" />
              3. 分层源文件包交付 (PSD / AI / C4D / ZIP)
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
                <div className="text-xs font-bold text-slate-800">{sourceFileName}</div>
                <div className="text-[10px] text-slate-400 font-mono">{sourceFileSize} · 包含完整文本矢量图层</div>
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
                  <span className="flex items-center gap-1"><CloudUpload className="w-3.5 h-3.5" /> 重新上传源文件</span>
                )}
              </Button>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> 已就绪
              </Badge>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          {selectedOrder && (
            <div className="text-xs">
              <span className="text-slate-500">订单价格：</span>
              <b className="text-emerald-600 font-mono text-sm font-bold">¥{selectedOrder.designerPayout || selectedOrder.budget}</b>
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <Button
              variant="outline"
              onClick={() => handleSubmit(true)}
              className="rounded-2xl text-xs h-10 px-5 border-slate-200"
            >
              保存为草稿
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs px-6 h-10 gap-1.5 font-semibold shadow-md shadow-blue-500/20"
            >
              <span>提交并派发会审</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
