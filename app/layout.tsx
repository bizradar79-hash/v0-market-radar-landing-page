import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const heebo = Heebo({ 
  subsets: ["hebrew", "latin"],
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: 'North Star Radar | הרדאר העסקי שמכוון אותך להזדמנויות הנכונות',
  description: 'הרדאר העסקי שמכוון אותך להזדמנויות הנכונות',
  icons: {
    icon: '/northstarlogo.jpg',
    apple: '/northstarlogo.jpg',
    shortcut: '/northstarlogo.jpg',
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
        <Analytics />
      </body>
    </html>
  )
}
