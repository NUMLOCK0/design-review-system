import { Suspense } from 'react';
import '@design-review/infinite-canvas/styles.css';
import { ClientWorkspace } from './client-workspace';

export const dynamic = 'force-dynamic';

export default function InfiniteCanvasWorkspacePage() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500">正在载入生图工作台…</div>}>
        <ClientWorkspace />
      </Suspense>
    </div>
  );
}
