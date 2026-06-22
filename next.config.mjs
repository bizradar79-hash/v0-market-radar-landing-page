/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SITE_URL: 'https://www.nsradar.co.il',
  },
  async redirects() {
    return [
      // Canonical host: 301 non-www (nsradar.co.il) → www.nsradar.co.il so there
      // is ONE indexable host (matches metadataBase / GSC). Preserves the path.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'nsradar.co.il' }],
        destination: 'https://www.nsradar.co.il/:path*',
        permanent: true,
      },
      // Permanent guard: Upay return URLs once had a typo (/onboaring). Forward
      // to /onboarding preserving ALL query params so paid users land correctly.
      { source: '/onboaring', destination: '/onboarding', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        // All API routes must never be cached by CDN, browser, or proxy
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'Surrogate-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig
