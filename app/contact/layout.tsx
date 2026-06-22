import type { Metadata } from 'next'

// The contact page is a client component, so its metadata (title + canonical)
// is set here at the route layout. Canonical points to the www host via
// metadataBase, so /contact isn't mis-canonicalized to the homepage.
export const metadata: Metadata = {
  title: 'צור קשר | North Star Radar',
  description: 'צרו קשר עם North Star Radar — שאלות, תמיכה והצטרפות.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
