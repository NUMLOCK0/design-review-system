'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/upload';
import { AuthenticatedImage } from '@/components/authenticated-image';

export function ImageUpload({ value, onChange, folder = 'reference-samples', label = '参考图片（选填）', multiple = true, variant = 'default', compact = false, squareSize, required = false }: { value: string[]; onChange: (urls: string[]) => void; folder?: string; label?: string; multiple?: boolean; variant?: 'default' | 'square'; compact?: boolean; squareSize?: 'sm' | 'md' | 'lg'; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const selectedFiles = multiple ? files : files.slice(0, 1);
    const imageFiles = selectedFiles.filter((file) => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type));
    if (!imageFiles.length) {
      toast.error('图片仅支持 PNG、JPG、WebP 或 GIF 格式');
      return;
    }
    setUploading(true);
    try {
      const results = await Promise.allSettled(imageFiles.map(async (file) => {
        const result = await uploadFile(file, folder);
        return result.url;
      }));
      const urls = results.filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled').map((result) => result.value);
      if (urls.length) {
        onChange(multiple ? [...value, ...urls] : urls.slice(0, 1));
        toast.success(`已上传 ${urls.length} 张图片`);
      }
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) toast.error(failed.reason?.message || '部分图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void uploadFiles(files);
  };

  if (variant === 'square') return <div className="space-y-1.5">
    {required && <p className="text-xs font-medium text-slate-600">{label} <span aria-hidden="true" className="text-rose-500">*</span></p>}
    <div
    role="group"
    aria-label={`${label}上传区域，可拖拽图片或聚焦后粘贴`}
    tabIndex={0}
    onPaste={paste}
    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}
    className={`flex w-fit flex-wrap gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary)] focus-visible:ring-offset-2 ${dragging ? 'ring-2 ring-[var(--role-primary)] ring-offset-2' : ''}`}
  >
    <Input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={multiple} onChange={upload} className="hidden" />
    {value.map((url, index) => <div key={`${url}-${index}`} className={`group relative ${squareSize === 'sm' ? 'h-24 w-24' : squareSize === 'lg' ? 'h-40 w-40' : compact ? 'h-36 w-36' : 'h-40 w-40'}`}>
      <AuthenticatedImage src={url} alt={`${label} ${index + 1}`} className="h-full w-full rounded-xl border border-slate-200 object-cover" />
      <Button type="button" variant="destructive" size="icon" onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))} className="absolute -right-2 -top-2 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><Trash2 className="h-3 w-3" /></Button>
    </div>)}
    {(!value.length || multiple) && <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className={`${squareSize === 'sm' ? 'h-24 w-24' : squareSize === 'lg' ? 'h-40 w-40' : compact ? 'h-36 w-36' : 'h-40 w-40'} overflow-hidden rounded-xl border-dashed border-slate-300 bg-slate-50 p-0 text-slate-400 hover:border-[var(--role-primary-border)] hover:bg-[var(--role-primary-soft)]`}>
      <span className={`flex flex-col items-center text-center ${squareSize === 'sm' ? 'gap-1 text-[10px]' : 'gap-2 text-xs'}`}><ImagePlus className={squareSize === 'sm' ? 'h-5 w-5' : 'h-7 w-7'} />{uploading ? '上传中…' : value.length ? '继续添加' : squareSize === 'sm' ? '上传图片' : '点击上传图片'}<span className="text-[10px] text-slate-400">{squareSize === 'sm' ? '拖拽 / 粘贴' : '也可拖拽，或聚焦后 Ctrl+V 粘贴'}</span></span>
    </Button>}
    </div>
  </div>;

  return <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
    <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-600">{label}{required && <span aria-hidden="true" className="ml-1 text-rose-500">*</span>}</span><Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="h-7 rounded-lg text-[11px]"><ImagePlus className="mr-1 h-3.5 w-3.5" />{uploading ? '上传中…' : value.length && !multiple ? '重新上传' : '添加图片'}</Button></div>
    <Input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={multiple} onChange={upload} className="hidden" />
    {value.length > 0 ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{value.map((url, index) => <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white"><AuthenticatedImage src={url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" /><Button type="button" variant="destructive" size="icon" onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))} className="absolute right-1 top-1 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></Button></div>)}{multiple && <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="aspect-square h-auto rounded-lg border-dashed text-[11px] text-slate-500"><span className="flex flex-col items-center gap-1"><ImagePlus className="h-4 w-4" />继续添加</span></Button>}</div> : <p className="text-[11px] text-slate-400">{multiple ? '可一次选择多张 PNG、JPG、WebP 或 GIF 图片' : '支持 PNG、JPG、WebP 或 GIF 图片'}</p>}
  </div>;
}
