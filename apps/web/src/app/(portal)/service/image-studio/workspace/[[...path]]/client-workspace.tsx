'use client';

import dynamic from 'next/dynamic';

const InfiniteCanvasIntegratedApp = dynamic(() => import('@design-review/infinite-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-0 items-center justify-center text-sm text-slate-500">
      正在载入生图工作台…
    </div>
  ),
});

export function ClientWorkspace() {
  return <InfiniteCanvasIntegratedApp />;
}
