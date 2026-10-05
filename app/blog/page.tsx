import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublishedPosts } from '@/lib/blog/queries'
import { formatHebrewDate } from '@/lib/blog/posts'
import { BlogHeader, BlogFooter } from '@/components/blog/blog-chrome'

const HOST = 'https://www.nsradar.co.il'

// Server-rendered and cached; admin saves refresh it on demand (revalidatePath),
// and this is the safety net if that ever misses.
export const revalidate = 300

export const metadata: Metadata = {
  title: 'בלוג | North Star Radar — מודיעין שוק לעסקים',
  description: 'מאמרים על מעקב מתחרים, קידום בגוגל ובמנועי AI, טרנדים בשוק וצמיחה לעסקים קטנים ובינוניים בישראל.',
  alternates: { canonical: `${HOST}/blog` },
  openGraph: {
    type: 'website',
    url: `${HOST}/blog`,
    title: 'הבלוג של North Star Radar',
    description: 'מאמרים על מעקב מתחרים, קידום בגוגל ובמנועי AI וצמיחה לעסקים בישראל.',
    locale: 'he_IL',
    siteName: 'North Star Radar',
  },
}

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts()

  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900">
      <BlogHeader />

      <main className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold sm:text-4xl">הבלוג</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-gray-500">
            איך לדעת מה המתחרים עושים, להופיע בגוגל ובמנועי AI, ולזהות הזדמנויות לפני כולם.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 py-16 text-center text-gray-500">
            מאמרים חדשים בדרך — חזרו בקרוב.
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <li key={p.id}>
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <Link href={`/blog/${p.slug}`} className="flex h-full flex-col">
                    {p.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.cover_image_url}
                        alt=""
                        // The first row is above the fold — load it eagerly.
                        loading={i < 3 ? 'eager' : 'lazy'}
                        className="aspect-[16/9] w-full object-cover"
                      />
                    ) : (
                      <div aria-hidden className="aspect-[16/9] w-full" style={{ background: 'linear-gradient(135deg, #CCFBF1, #F0FDFA)' }} />
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      {p.published_at && (
                        <time dateTime={p.published_at} className="text-xs font-medium text-gray-400">
                          {formatHebrewDate(p.published_at)}
                        </time>
                      )}
                      <h2 className="mt-1.5 text-lg font-bold leading-snug text-slate-900 group-hover:text-teal-700">
                        {p.title}
                      </h2>
                      {p.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-500">{p.excerpt}</p>}
                      <span className="mt-auto pt-4 text-sm font-semibold text-teal-700">לקריאה ←</span>
                    </div>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      <BlogFooter />
    </div>
  )
}
