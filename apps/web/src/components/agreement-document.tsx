'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type AgreementKey = 'userAgreementContent' | 'privacyPolicyContent';

const agreementHtml = (content: string) => {
  const sanitized = content.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (tag, name) => ['p', 'br', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'ul', 'ol', 'li'].includes(String(name).toLowerCase()) ? `<${tag.startsWith('</') ? '/' : ''}${String(name).toLowerCase()}>` : '');
  return /<\/?(?:p|br|strong|b|em|i|h2|h3|ul|ol|li)\b/i.test(sanitized) ? sanitized : sanitized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
};

export function AgreementDocument({ title, contentKey }: { title: string; contentKey: AgreementKey }) {
  const [content, setContent] = useState('协议内容加载中…');
  useEffect(() => {
    fetch('/api/system-config/agreements', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => { if (result.success && result.data?.[contentKey]) setContent(result.data[contentKey]); })
      .catch(() => setContent('协议内容暂时无法加载，请稍后重试。'));
  }, [contentKey]);
  return <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10"><a href="/login" className="text-sm text-blue-600 hover:underline">返回登录</a><h1 className="mt-8 text-3xl font-bold">创赢{title}</h1><p className="mt-3 text-sm text-slate-500">以管理员当前配置为准</p><div className="mt-8 text-sm leading-7 text-slate-600 [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-3 [&_h3]:text-base [&_h3]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: agreementHtml(content) }} /></article></main>;
}

export function AgreementModal({ open, onOpenChange, title, contentKey }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; contentKey: AgreementKey }) {
  const [content, setContent] = useState('协议内容加载中…');

  useEffect(() => {
    if (!open) return;
    setContent('协议内容加载中…');
    fetch('/api/system-config/agreements', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => setContent(result.success && result.data?.[contentKey] ? result.data[contentKey] : '暂无协议内容。'))
      .catch(() => setContent('协议内容暂时无法加载，请稍后重试。'));
  }, [open, contentKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle>创赢{title}</DialogTitle>
          <DialogDescription>以管理员当前配置为准</DialogDescription>
        </DialogHeader>
        <div className="text-sm leading-7 text-slate-600 [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-3 [&_h3]:text-base [&_h3]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: agreementHtml(content) }} />
      </DialogContent>
    </Dialog>
  );
}
