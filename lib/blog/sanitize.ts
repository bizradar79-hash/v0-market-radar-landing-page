// Sanitize article HTML before it is stored AND before it is rendered.
//
// Post content is rendered with dangerouslySetInnerHTML on public, indexed
// pages, so whatever the editor produced must be reduced to a known-safe set of
// tags and attributes. Admins are trusted, but a pasted snippet, a compromised
// admin session or a future bug in the editor must not be able to put a script
// on nsradar.co.il.
//
// Server-only (sanitize-html runs in Node).

import sanitizeHtml from 'sanitize-html'

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // The page already renders the title as the single <h1>; an <h1> inside the
    // body would give the page two and hurt SEO, so it's demoted (see below).
    'h2', 'h3', 'h4',
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's',
    'a',
    'ul', 'ol', 'li',
    'blockquote',
    'code', 'pre',
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  },
  // No javascript:, data:, vbscript: — only real links and images.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    h1: 'h2',
    // Links that open a new tab must not hand the opener window to the target.
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      if (out.target === '_blank') out.rel = 'noopener noreferrer'
      else delete out.target
      return { tagName, attribs: out }
    },
    // Lazy-load every in-article image — cheaper page loads, better Core Web Vitals.
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
  },
  // Drop the CONTENTS of these, not just the tags.
  nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'embed'],
}

export function sanitizeArticleHtml(html: string | null | undefined): string {
  return sanitizeHtml(String(html || ''), OPTIONS).trim()
}

/** Plain text from HTML — for excerpts and meta descriptions. */
export function htmlToText(html: string | null | undefined): string {
  // Insert a space at every block/line boundary first; otherwise stripping the
  // tags glues "<h2>כותרת</h2><p>שורה" into "כותרתשורה".
  const spaced = String(html || '').replace(/<\/?(h[1-6]|p|li|br|div|blockquote|ul|ol|pre|hr)\b[^>]*>/gi, ' ')
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
