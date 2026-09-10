'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/upload';

export function ImageUpload({ value, onChange, folder = 'reference-samples', label = '参考图片（选填）', multiple = true, variant = 'default' }: { value: string[]; onChange: (urls: string[]) => void; folder?: string; label?: string; multiple?: boolean; variant?: 'default' | 'square' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const results = await Promise.allSettled(files.map(async (file) => {
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
      event.target.value = '';
    }
  };

  if (variant === 'square') return <div className="w-fit">
    <Input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={false} onChange={upload} className="hidden" />
    <div className="group relative h-28 w-28">
      <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="h-full w-full overflow-hidden rounded-xl border-dashed border-slate-300 bg-slate-50 p-0 text-slate-400 hover:border-[var(--role-primary-border)] hover:bg-[var(--role-primary-soft)]">
        {value[0] ? <img src={value[0]} alt="素材原图" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-[11px]"><ImagePlus className="h-5 w-5" />{uploading ? '上传中…' : '上传图片'}</span>}
      </Button>
      {value[0] && <Button type="button" variant="destructive" size="icon" onClick={() => onChange([])} className="absolute -right-2 -top-2 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><Trash2 className="h-3 w-3" /></Button>}
    </div>
  </div>;

  return <div className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
    <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-600">{label}</span><Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="h-7 rounded-lg text-[11px]"><ImagePlus className="mr-1 h-3.5 w-3.5" />{uploading ? '上传中…' : value.length && !multiple ? '重新上传' : '添加图片'}</Button></div>
    <Input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple={multiple} onChange={upload} className="hidden" />
    {value.length > 0 ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{value.map((url, index) => <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" /><Button type="button" variant="destructive" size="icon" onClick={() => onChange(value.filter((_, currentIndex) => currentIndex !== index))} className="absolute right-1 top-1 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3 w-3" /></Button></div>)}{multiple && <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="aspect-square h-auto rounded-lg border-dashed text-[11px] text-slate-500"><span className="flex flex-col items-center gap-1"><ImagePlus className="h-4 w-4" />继续添加</span></Button>}</div> : <p className="text-[11px] text-slate-400">{multiple ? '可一次选择多张 PNG、JPG、WebP 或 GIF 图片' : '支持 PNG、JPG、WebP 或 GIF 图片'}</p>}
  </div>;
}
