import type { NextConfig } from 'next'
import path from 'node:path'

const isProduction = process.env.NODE_ENV === 'production'
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin }
  catch { return '' }
})()

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')} https://*.r2.cloudflarestorage.com https://*.razorpay.com`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ')

/**
 * PWA note: this project uses a hand-written service worker at `public/sw.js`
 * (caching + Web Push + background sync), registered by `hooks/usePushNotifications`.
 * We deliberately do NOT use next-pwa/serwist — the hand-written SW already does
 * everything we need, and next-pwa is unmaintained for the App Router.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self)' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
        ...(isProduction ? [{
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        }] : []),
      ],
    }]
  },
  /**
   * Pin the workspace root to this folder.
   *
   * This project sits inside `web_loanpro/`, alongside the desktop app and the
   * older web app. That parent folder contains a stray empty `package.json`
   * and `package-lock.json`, so Next sees two lockfiles, guesses the parent is
   * the workspace root, and resolves modules from there — where there is no
   * node_modules. The build then fails with things like
   *
   *     Module not found: Can't resolve '@aws-sdk/core/util'
   *
   * which reads like a broken dependency but is nothing of the sort: the
   * package is installed here and does export that path. Vercel never hit this,
   * because it only ever clones this directory.
   *
   * `__dirname` is this folder, whether the config is loaded as CJS or ESM.
   */
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      // Cloudflare R2 — photos are served through our own /api/photos route,
      // which redirects to a short-lived presigned URL on the R2 domain.
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
}

export default nextConfig
