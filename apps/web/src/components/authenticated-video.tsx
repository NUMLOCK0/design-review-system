'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';

export function AuthenticatedVideo({ src, className = '' }: { src: string; className?: string }) {
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setPlaybackUrl('');
    setLoadError('');
    const assetId = /\/api\/upload\/assets\/(asset_[a-zA-Z0-9_-]+)$/.exec(src)?.[1];
    if (!assetId) return;
    void fetchWithAuth(`/upload/videos/${encodeURIComponent(assetId)}/playback`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) throw new Error(result?.message || '视频加载失败');
        if (result.data?.url) return String(result.data.url);
        const videoResponse = await fetchWithAuth(src, { cache: 'no-store' });
        if (!videoResponse.ok) throw new Error('视频读取失败');
        objectUrl = URL.createObjectURL(await videoResponse.blob());
        return objectUrl;
      })
      .then(url => { if (!cancelled) setPlaybackUrl(url); })
      .catch(() => { if (!cancelled) setLoadError('视频加载失败'); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, retry]);

  return playbackUrl
    ? <video src={playbackUrl} controls preload="metadata" playsInline className={className} />
    : <div aria-label={loadError || '视频加载中'} className={`${className} flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs text-white/70`}><span>{loadError || '正在加载视频…'}</span>{loadError && <button type="button" onClick={() => setRetry(value => value + 1)} className="rounded-lg bg-white/15 px-3 py-1.5 text-white">重试</button>}</div>;
}
