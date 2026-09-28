'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MessageDetail } from '@/components/messages/message-center';
import { MESSAGE_CATEGORIES } from '@/lib/messages';

export default function MessageDetailPage() {
  const params = useParams<{ id: string; type: string }>();
  const category = MESSAGE_CATEGORIES.find((item) => item.type === params.type);
  const backHref = category ? `/messages/category/${category.type}` : '/messages';
  return <section className="mx-auto max-w-4xl space-y-4">
    <Link href={backHref} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-500 hover:bg-white"><ArrowLeft className="h-4 w-4" />{category?.label || '全部消息'}</Link>
    <MessageDetail id={params.id} />
  </section>;
}
