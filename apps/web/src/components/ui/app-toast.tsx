'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/* ─── Toast 类型定义 ─── */
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

/* ─── Confirm 对话框类型定义 ─── */
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

interface ToastContextValue {
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve?: (value: boolean) => void;
  }>({
    open: false,
    options: { message: '' },
  });

  // 移除 Toast
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 添加 Toast
  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: ToastItem = { id, type, message, title };
    setToasts((prev) => [...prev, newItem]);

    // 自动 3.5 秒后关闭
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  }, [removeToast]);

  const toastMethods = {
    success: (msg: string, title?: string) => addToast('success', msg, title),
    error: (msg: string, title?: string) => addToast('error', msg, title),
    warning: (msg: string, title?: string) => addToast('warning', msg, title),
    info: (msg: string, title?: string) => addToast('info', msg, title),
  };

  // 异步 Confirm 弹窗
  const confirmMethod = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      setConfirmState({
        open: true,
        options: opts,
        resolve,
      });
    });
  }, []);

  const handleConfirmAction = (value: boolean) => {
    if (confirmState.resolve) {
      confirmState.resolve(value);
    }
    setConfirmState((prev) => ({ ...prev, open: false }));
  };

  return (
    <ToastContext.Provider value={{ toast: toastMethods, confirm: confirmMethod }}>
      {children}

      {/* ────────────────── 1. 全局浮动 Toast 容器 ────────────────── */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-top-4',
                t.type === 'success' && 'bg-white/95 border-emerald-200/80 text-slate-800 shadow-emerald-500/10',
                t.type === 'error' && 'bg-white/95 border-red-200/80 text-slate-800 shadow-red-500/10',
                t.type === 'warning' && 'bg-white/95 border-amber-200/80 text-slate-800 shadow-amber-500/10',
                t.type === 'info' && 'bg-white/95 border-blue-200/80 text-slate-800 shadow-blue-500/10'
              )}
            >
              {/* 图标 */}
              <div className="shrink-0 mt-0.5">
                {t.type === 'success' && (
                  <div className="size-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="size-4" />
                  </div>
                )}
                {t.type === 'error' && (
                  <div className="size-6 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <AlertCircle className="size-4" />
                  </div>
                )}
                {t.type === 'warning' && (
                  <div className="size-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                    <AlertTriangle className="size-4" />
                  </div>
                )}
                {t.type === 'info' && (
                  <div className="size-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                    <Info className="size-4" />
                  </div>
                )}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0 pr-1">
                {t.title && (
                  <h4 className="text-xs font-bold text-slate-900 mb-0.5 tracking-tight">
                    {t.title}
                  </h4>
                )}
                <p className="text-xs text-slate-600 leading-relaxed break-words">
                  {t.message}
                </p>
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ────────────────── 2. 全局现代 Confirm 确认弹窗 ────────────────── */}
      <AlertDialog open={confirmState.open} onOpenChange={(open) => !open && handleConfirmAction(false)}>
        <AlertDialogContent className="max-w-md rounded-2xl border-white/80 bg-white/95 backdrop-blur-2xl shadow-2xl">
          <AlertDialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                'size-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm',
                confirmState.options.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
              )}>
                <AlertTriangle className="size-5" />
              </div>
              <AlertDialogTitle className="text-base font-bold text-slate-900">
                {confirmState.options.title || '操作确认'}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-slate-600 leading-relaxed pt-1">
              {confirmState.options.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
            <AlertDialogCancel
              onClick={() => handleConfirmAction(false)}
              className="text-xs rounded-xl border-slate-200"
            >
              {confirmState.options.cancelText || '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleConfirmAction(true)}
              className={cn(
                'text-xs rounded-xl font-semibold shadow-sm',
                confirmState.options.type === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              {confirmState.options.confirmText || '确定'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
