'use client'

import { Loader2, X } from 'lucide-react'
import toast, { resolveValue, Toaster, ToastIcon } from 'react-hot-toast'
import { cn } from '@/lib/utils'

/** One notification surface for marketing, authentication and the app. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      containerStyle={{ inset: 'auto 12px 12px auto' }}
      toastOptions={{
        duration: 4200,
        style: { background: 'transparent', boxShadow: 'none', padding: 0, maxWidth: 'none' },
        success: {
          duration: 3600,
          iconTheme: { primary: '#10b981', secondary: '#ecfdf5' },
        },
        error: {
          duration: 6500,
          iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
        },
        loading: {
          duration: Infinity,
          iconTheme: { primary: '#3b82f6', secondary: '#eff6ff' },
        },
      }}
    >
      {item => {
        const title = item.type === 'success'
          ? 'Completed'
          : item.type === 'error'
            ? 'Action needed'
            : item.type === 'loading'
              ? 'Working'
              : 'LoanPro'

        return (
          <div
            className={cn('lp-toast', `lp-toast-${item.type}`)}
            style={{
              opacity: item.visible ? 1 : 0,
              transform: item.visible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 160ms ease, transform 160ms ease',
            }}
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
              {item.type === 'loading'
                ? <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                : <ToastIcon toast={item} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
              <p className="mt-0.5 text-sm leading-5 text-slate-800">{resolveValue(item.message, item)}</p>
            </div>
            {item.type !== 'loading' && (
              <button
                type="button"
                onClick={() => toast.dismiss(item.id)}
                className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      }}
    </Toaster>
  )
}
