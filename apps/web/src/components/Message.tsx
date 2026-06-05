import type { ReactNode } from 'react';
export function Message({ type = 'info', children }: { type?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    error: 'border-red-400/30 bg-red-400/10 text-red-100',
    success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  };

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${styles[type]}`}>{children}</div>;
}
