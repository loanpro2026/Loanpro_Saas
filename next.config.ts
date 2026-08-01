import type { NextConfig } from 'next'
import path from 'node:path'

/**
 * PWA note: this project uses a hand-written service worker at `public/sw.js`
 * (caching + Web Push + background sync), registered by `hooks/usePushNotifications`.
 * We deliberately do NOT use next-pwa/serwist — the hand-written SW already does
 * everything we need, and next-pwa is unmaintained for the App Router.
 */
const nextConfig: NextConfig = {
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
