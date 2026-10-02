import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // forbidden() and forbidden.tsx, for forms that belong to someone else (403).
    authInterrupts: true,
  },
}

export default nextConfig
