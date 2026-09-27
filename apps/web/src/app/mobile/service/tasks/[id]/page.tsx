import { Suspense } from 'react';
import { MobileServiceTaskDetail } from '@/components/mobile/mobile-service-task-detail';
export default function MobileServiceTaskRoute() { return <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">正在载入待办…</div>}><MobileServiceTaskDetail /></Suspense>; }
