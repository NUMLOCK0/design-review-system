'use client';

import Link from 'next/link';
import { ArrowLeft, House } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundActions() {
  return <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
    <Button asChild className="h-11 rounded-xl px-5"><Link href="/"><House className="mr-2 h-4 w-4" />返回主页</Link></Button>
    <Button type="button" variant="outline" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/'); }} className="h-11 rounded-xl px-5"><ArrowLeft className="mr-2 h-4 w-4" />返回上一页</Button>
  </div>;
}
