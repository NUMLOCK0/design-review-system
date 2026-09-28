'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MessageCategoryList } from '@/components/messages/message-center';

export default function MessageCategoryPage() {
  const params = useParams<{ type: string }>();
  return <section className="mx-auto max-w-4xl space-y-4">
    <Link href="/messages" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-500 hover:bg-white"><ArrowLeft className="h-4 w-4" />全部消息</Link>
    <MessageCategoryList type={params.type} />
  </section>;
}
