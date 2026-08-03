'use client'

import { Toaster } from 'react-hot-toast'

/** One notification surface for marketing, authentication and the app. */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gutter={10}
      containerStyle={{ inset: 'auto 16px 16px auto' }}
      toastOptions={{
        duration: 4200,
        style: {
          maxWidth: '420px',
          borderRadius: '14px',
          border: '1px solid rgb(51 65 85)',
          background: 'rgb(15 23 42)',
          color: 'rgb(248 250 252)',
          boxShadow: '0 18px 45px -18px rgb(2 6 23 / 0.6)',
          fontSize: '0.875rem',
          lineHeight: '1.35rem',
          padding: '12px 14px',
        },
        success: {
          duration: 3600,
          iconTheme: { primary: '#34d399', secondary: '#052e2b' },
        },
        error: {
          duration: 6500,
          iconTheme: { primary: '#f87171', secondary: '#450a0a' },
        },
        loading: {
          duration: Infinity,
          iconTheme: { primary: '#a5b4fc', secondary: '#1e1b4b' },
        },
      }}
    />
  )
}

