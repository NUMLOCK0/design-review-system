'use client';

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { fetchWithAuth } from '@/lib/auth';

function isProtectedAsset(url: string) {
  try {
    const pathname = /^https?:\/\//i.test(url) ? new URL(url).pathname : url.split('?')[0];
    return pathname.includes('/api/upload/assets/') || pathname.includes('/api/upload/previews/');
  } catch {
    return false;
  }
}

export function AuthenticatedImage({ src, alt, className, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src || !isProtectedAsset(src)) return;
    setObjectUrl(null);
    let cancelled = false;
    let nextObjectUrl = '';
    void fetchWithAuth(src, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('图片加载失败');
        nextObjectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setObjectUrl(nextObjectUrl);
      })
      .catch(() => { if (!cancelled) setObjectUrl(null); });
    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);

  if (!isProtectedAsset(src)) return <img src={src} alt={alt} className={className} {...props} />;
  return objectUrl ? <img src={objectUrl} alt={alt} className={className} {...props} /> : <div aria-label={`${alt}加载中`} className={className} />;
}
