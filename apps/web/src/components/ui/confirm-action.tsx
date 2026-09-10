'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ConfirmActionProps = {
  children: React.ReactElement;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning';
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmAction({
  children,
  title,
  description,
  confirmText = '确认操作',
  cancelText = '取消',
  tone = 'danger',
  disabled = false,
  onConfirm,
}: ConfirmActionProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const confirm = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md rounded-2xl bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={confirm}
            className={cn(
              'text-white',
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            )}
          >
            {submitting ? '处理中…' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
