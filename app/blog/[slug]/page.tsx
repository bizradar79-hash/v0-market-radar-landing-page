import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedPost } from '@/lib/blog/queries'
import { sanitizeArticleHtml, htmlToText } from '@/lib/blog/sanitize'
import { formatHebrewDate, metaDescriptionFor } from '@/lib/blog/posts'
import { BlogHeader, BlogFooter, BlogCta } from '@/components/blog/blog-chrome'
import styles from '@/components/blog/article.module.css'

const HOST = 'https://www.nsradar.co.il'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

/** URL segments arrive percent-encoded; Hebrew slugs must be decoded to match. */
function decodeSlug(raw: string): string {
  try { return decodeURIComponent(raw) } catch { return raw }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug((await params).slug)
  const post = await getPublishedPost(slug)
  if (!post) return { title: 'המאמר לא נמצא | North Star Radar', robots: { index: false } }

  const url = `${HOST}/blog/${encodeURIComponent(post.slug)}`
  const description = metaDescriptionFor(post, htmlToText(post.content))
  return {
    // Unique per article; the brand suffix stays short so the title isn't cut.
    title: `${post.title} | North Star Radar`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description,
      locale: 'he_IL',
      siteName: 'North Star Radar',
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at,
      images: post.cover_image_url ? [{ url: post.cover_image_url }] : undefined,
    },
    twitter: {
      card: post.cover_image_url ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const slug = decodeSlug((await params).slug)
  const post = await getPublishedPost(slug)
  if (!post) notFound()

  // Stored HTML is sanitized on save; sanitizing again here means a row edited
  // directly in the database still can't inject script into the page.
  const html = sanitizeArticleHtml(post.content)
  const url = `${HOST}/blog/${encodeURIComponent(post.slug)}`

  // Article structured data → eligible for rich results in Google.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: metaDescriptionFor(post, htmlToText(post.content)),
    datePublished: post.published_at || undefined,
    dateModified: post.updated_at,
    image: post.cover_image_url || undefined,
    inLanguage: 'he-IL',
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'North Star Radar', url: HOST },
    publisher: { '@type': 'Organization', name: 'North Star Radar', url: HOST },
  }

  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900">
      <BlogHeader />

      <main className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <nav aria-label="פירורי לחם" className="mb-6 text-sm text-gray-500">
          <Link href="/blog" className="hover:text-gray-900">← לכל המאמרים</Link>
        </nav>

        <article>
          <header>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{post.title}</h1>
            {post.published_at && (
              <p className="mt-3 text-sm text-gray-500">
                <time dateTime={post.published_at}>{formatHebrewDate(post.published_at)}</time>
              </p>
            )}
            {post.excerpt && <p className="mt-5 text-xl leading-relaxed text-gray-600">{post.excerpt}</p>}
          </header>

          {post.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.cover_image_url}
              alt={post.title}
              loading="eager"
              fetchPriority="high"
              className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
            />
          )}

          <div className={`${styles.body} mt-10`} dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <BlogCta />
      </main>

      <BlogFooter />

      <script
        type="application/ld+json"
        // Escape "<" so a title containing "</script>" can't end the tag early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </div>
  )
}
