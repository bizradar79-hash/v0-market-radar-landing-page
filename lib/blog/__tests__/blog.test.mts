import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeArticleHtml, htmlToText } from '../sanitize'
import {
  slugify, uniqueSlug, isValidSlug, compareBlogOrder, isPubliclyVisible, metaDescriptionFor,
} from '../posts'

// ── Sanitizer: nothing executable survives ────────────────────────────────
test('script tags and their contents are removed', () => {
  const out = sanitizeArticleHtml('<p>שלום</p><script>alert(1)</script>')
  assert.equal(out, '<p>שלום</p>')
})

test('event handlers are stripped', () => {
  const out = sanitizeArticleHtml('<img src="https://x.co/a.png" onerror="alert(1)"><p onclick="x()">t</p>')
  assert.ok(!/onerror|onclick/.test(out), out)
})

test('javascript: and data: URLs are removed', () => {
  const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAAA">')
  assert.ok(!/javascript:|data:/.test(out), out)
})

test('iframes, styles and embeds are dropped with their contents', () => {
  const out = sanitizeArticleHtml('<iframe src="https://evil"></iframe><style>body{}</style><p>ok</p>')
  assert.equal(out, '<p>ok</p>')
})

test('target=_blank links get rel=noopener noreferrer', () => {
  const out = sanitizeArticleHtml('<a href="https://nsradar.co.il" target="_blank">x</a>')
  assert.ok(out.includes('rel="noopener noreferrer"'), out)
})

test('an <h1> in the body is demoted to <h2> (the page owns the only <h1>)', () => {
  assert.equal(sanitizeArticleHtml('<h1>כותרת</h1>'), '<h2>כותרת</h2>')
})

test('SEO structure survives: headings, lists, links, images', () => {
  const html = '<h2>א</h2><h3>ב</h3><ul><li>1</li></ul><ol><li>2</li></ol>'
    + '<p><strong>b</strong> <em>i</em> <a href="https://x.co">l</a></p><img src="https://x.co/i.png" alt="תמונה">'
  const out = sanitizeArticleHtml(html)
  for (const t of ['<h2>', '<h3>', '<ul>', '<ol>', '<strong>', '<em>', 'href="https://x.co"', 'alt="תמונה"'])
    assert.ok(out.includes(t), `lost ${t}: ${out}`)
  assert.ok(out.includes('loading="lazy"'), 'images should lazy-load')
})

test('htmlToText keeps a space between blocks (no glued words)', () => {
  assert.equal(htmlToText('<h2>כותרת</h2><p>שורה&nbsp;ראשונה</p><ul><li>א</li><li>ב</li></ul>'), 'כותרת שורה ראשונה א ב')
})

// ── Slugs ─────────────────────────────────────────────────────────────────
test('Hebrew titles produce readable Hebrew slugs', () => {
  assert.equal(slugify('איך לבחור יועץ משכנתאות?'), 'איך-לבחור-יועץ-משכנתאות')
})

test('mixed Hebrew/English/numbers', () => {
  assert.equal(slugify('5 טיפים ל-SEO ב-2026!'), '5-טיפים-ל-seo-ב-2026')
})

test('niqqud does not change the slug', () => {
  assert.equal(slugify('שָׁלוֹם'), slugify('שלום'))
})

test('slugs are length-capped without a trailing dash', () => {
  const s = slugify('מילה '.repeat(40))
  assert.ok(s.length <= 80 && !s.endsWith('-'), s)
})

test('uniqueSlug appends -2, -3 on collision', () => {
  assert.equal(uniqueSlug('blog', []), 'blog')
  assert.equal(uniqueSlug('blog', ['blog']), 'blog-2')
  assert.equal(uniqueSlug('blog', ['blog', 'blog-2']), 'blog-3')
})

test('isValidSlug rejects anything we would not produce', () => {
  assert.equal(isValidSlug('איך-לבחור'), true)
  assert.equal(isValidSlug('Has Spaces'), false)
  assert.equal(isValidSlug('../etc'), false)
  assert.equal(isValidSlug(''), false)
})

// ── Ordering: manual position beats date ──────────────────────────────────
const p = (id: string, sort_order: number | null, published_at: string) =>
  ({ id, sort_order, published_at, created_at: published_at })

test('with no manual order, newest first', () => {
  const list = [p('old', null, '2026-01-01'), p('new', null, '2026-09-01'), p('mid', null, '2026-05-01')]
  assert.deepEqual(list.sort(compareBlogOrder).map(x => x.id), ['new', 'mid', 'old'])
})

test('manual sort_order overrides date', () => {
  const list = [p('newest', null, '2026-09-01'), p('pinned-old', 1, '2025-01-01'), p('second', 2, '2026-02-01')]
  assert.deepEqual(list.sort(compareBlogOrder).map(x => x.id), ['pinned-old', 'second', 'newest'])
})

// ── Visibility ────────────────────────────────────────────────────────────
test('drafts and future-dated posts are not public', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  assert.equal(isPubliclyVisible({ published: false, published_at: '2026-01-01' }, now), false)
  assert.equal(isPubliclyVisible({ published: true, published_at: '2026-12-01' }, now), false, 'scheduled post leaked')
  assert.equal(isPubliclyVisible({ published: true, published_at: '2026-10-01' }, now), true)
})

test('meta description falls back to the excerpt and is capped', () => {
  assert.equal(metaDescriptionFor({ meta_description: '', excerpt: 'תקציר' }), 'תקציר')
  const long = metaDescriptionFor({ meta_description: 'מילה '.repeat(60), excerpt: null })
  assert.ok(long.length <= 160 && long.endsWith('…'), long)
})
