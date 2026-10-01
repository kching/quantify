'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactNode } from 'react';
import './toast.css';

export type ToastVariant = 'success' | 'error';
interface ToastData { variant: ToastVariant; }

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <ToastPrimitive.Provider limit={1} timeout={5000}>
    {children}
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="toast-viewport"><ToastList/></ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  </ToastPrimitive.Provider>;
}

function ToastList(): React.JSX.Element {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>();
  return <>{toasts.map((toast) => <ToastPrimitive.Root key={toast.id} toast={toast} className={`toast-root toast-${toast.data?.variant ?? 'success'}`}>
    <ToastPrimitive.Content className="toast-content"><ToastPrimitive.Description>{toast.title}</ToastPrimitive.Description><ToastPrimitive.Close className="toast-close" aria-label="Dismiss">×</ToastPrimitive.Close></ToastPrimitive.Content>
  </ToastPrimitive.Root>)}</>;
}

export function useToast(): (message: string, variant: ToastVariant) => void {
  const manager = ToastPrimitive.useToastManager<ToastData>();
  return (message: string, variant: ToastVariant): void => {
    manager.add({ title: message, data: { variant }, priority: variant === 'error' ? 'high' : 'low' });
  };
}
