'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { fetchWithAuth } from '@/lib/auth';

type CustomerService = { name: string; wechat: string; qrCodeUrl: string };

export function CustomerServiceReviewModal({
  open,
  onClose,
  isMobile = false,
}: {
  open: boolean;
  onClose: () => void;
  isMobile?: boolean;
}) {
  const [customerService, setCustomerService] = useState<CustomerService | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/system-config/active-customer-service')
      .then(async (response) => {
        const result = await response.json();
        if (response.ok && result.success) setCustomerService(result.data || null);
      })
      .catch(() => setCustomerService(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Modal open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <ModalContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl border-slate-200 bg-white p-0">
        <ModalHeader className="border-b border-slate-100 px-5 py-4 pr-12">
          <ModalTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl role-primary-soft role-primary-text">
              <MessageCircle className="h-4 w-4" />
            </span>
            添加客服微信
          </ModalTitle>
          <ModalDescription className="text-xs leading-5 text-slate-500">
            作品已提交审核。添加客服微信，可及时了解审核与交付进度。
          </ModalDescription>
        </ModalHeader>
        <div className="flex flex-col items-center gap-3 p-5 text-center">
          {loading ? (
            <div className="flex h-56 w-56 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-xs text-slate-400">
              正在加载客服二维码…
            </div>
          ) : customerService?.qrCodeUrl ? (
            <AuthenticatedImage
              src={customerService.qrCodeUrl}
              alt={`${customerService.name}客服微信二维码`}
              className="h-56 w-56 rounded-2xl border border-slate-100 bg-white object-contain p-2"
            />
          ) : (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-sm text-slate-500">
              <MessageCircle className="h-8 w-8 text-slate-300" />
              暂未配置客服二维码
            </div>
          )}
          {customerService ? (
            <div className="text-xs text-slate-600">
              <span>{customerService.name} · 微信号 </span>
              <span className="font-semibold text-slate-900">{customerService.wechat}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">请稍后在消息中心查看审核进度。</p>
          )}
        </div>
        <ModalFooter className="px-5 pb-5 pt-3 sm:flex-row">
          <Button type="button" onClick={onClose} className="h-10 w-full rounded-xl role-primary-bg text-xs font-semibold text-white hover:opacity-90 sm:w-auto">
            {isMobile ? '返回任务' : '查看审核任务'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
