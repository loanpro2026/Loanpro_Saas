import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppToaster } from '@/components/ui/AppToaster'

export const metadata: Metadata = {
  title: { default: 'LoanPro — Gold & Silver Loan Management', template: '%s | LoanPro' },
  description: 'Manage your gold and silver pawn loans from any device. No installation required.',
  keywords: ['loan management', 'gold loan', 'silver loan', 'pawn shop software', 'vyapar software'],
  authors: [{ name: 'LoanPro' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LoanPro',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    title: 'LoanPro — Gold & Silver Loan Management',
    description: 'Modern loan management for pawn shops. Works on web, mobile, and tablet.',
    siteName: 'LoanPro',
  },
}

export const viewport: Viewport = {
  themeColor: '#f6f8fb',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('loanpro-theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  )
}
