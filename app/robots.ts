import type { MetadataRoute } from 'next'

const HOST = 'https://www.nsradar.co.il'

// Served at /robots.txt. Public marketing pages are crawlable; the gated app,
// the API, and auth/utility routes are disallowed. Points Google at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/app/',
        '/api/',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/admin-login',
        '/checkout',
        '/onboarding',
        '/unsubscribe',
        '/impersonate-callback',
      ],
    },
    sitemap: `${HOST}/sitemap.xml`,
    host: HOST,
  }
}
