'use client';

import { usePathname } from 'next/navigation';

export function PortalMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isServiceChat = /^\/service\/collaboration\/[^/]+$/.test(pathname);
  const isCanvasStudio = pathname.startsWith('/service/image-studio/workspace') || /^\/service\/image-studio\/[\w-]+$/.test(pathname);

  return <main className={isServiceChat || isCanvasStudio
    ? 'min-h-0 w-full flex-1 overflow-hidden p-0'
    : 'mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-4 sm:p-6 md:pb-6 lg:p-8'}>
    {children}
  </main>;
}
