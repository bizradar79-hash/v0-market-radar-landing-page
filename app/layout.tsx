import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { CookieBanner } from '@/components/cookie-banner'
import './globals.css'

const heebo = Heebo({ 
  subsets: ["hebrew", "latin"],
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: 'North Star Radar — הרדאר העסקי שלך',
  description: 'מערכת AI שסורקת את השוק ומראה לך בדיוק מה לעשות השבוע, איפה להרוויח יותר ואיזה נישות לפתוח.',
  metadataBase: new URL('https://www.nsradar.co.il'),
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
    shortcut: '/favicon.png',
  },
  openGraph: {
    title: 'North Star Radar — הרדאר העסקי שלך',
    description: 'מערכת AI לעסקים קטנים ובינוניים. טרנדים, מתחרים, הזדמנויות ועוד.',
    url: 'https://www.nsradar.co.il',
    siteName: 'North Star Radar',
    locale: 'he_IL',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#050914',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} font-sans antialiased`}>
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  )
}
