import type { NextConfig } from 'next'

/**
 * PWA note: this project uses a hand-written service worker at `public/sw.js`
 * (caching + Web Push + background sync), registered by `hooks/usePushNotifications`.
 * We deliberately do NOT use next-pwa/serwist — the hand-written SW already does
 * everything we need, and next-pwa is unmaintained for the App Router.
 */
const nextConfig: NextConfig = {
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
