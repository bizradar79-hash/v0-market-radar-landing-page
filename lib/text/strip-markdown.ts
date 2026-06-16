// Minimal, safe markdown → plain-text stripper for AI-generated free text.
// The models sometimes wrap report prose in **bold**, *italic*, `code`,
// "- " bullets or "### " headings; the report surfaces (page, PDF, email,
// text) render plain strings, so the markers leak through literally.
//
// Design goals:
//  - Remove the common markdown emphasis/structure markers.
//  - Do NOT mangle normal text, Hebrew, punctuation, snake_case or URLs
//    (so underscore-italic is only stripped when clearly word-wrapped, never
//    inside identifiers/URLs like foo_bar or https://a_b.com/x).

export function stripMarkdown(input: unknown): string {
  if (typeof input !== 'string' || !input) return (input as string) ?? ''
  let s = input

  // Inline code: `code` → code
  s = s.replace(/`([^`]+)`/g, '$1')
  // Bold: **text** / __text__ → text  (run before italic)
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  // Italic with asterisks: *text* → text  (single line, no nested *)
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  // Italic with underscores: _text_ → text, ONLY when bounded by
  // whitespace/start and whitespace/end/punctuation (protects snake_case & URLs).
  s = s.replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?;:)])/g, '$1$2')
  // Strikethrough: ~~text~~ → text
  s = s.replace(/~~([^~]+)~~/g, '$1')
  // Markdown links: [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // Leading heading markers at line start: ###, ## … → (removed)
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  // Leading bullet markers at line start: "- ", "* ", "• " → (removed)
  s = s.replace(/^\s{0,3}[-*•]\s+/gm, '')
  // Collapse runs of spaces/tabs left behind (keep newlines).
  s = s.replace(/[ \t]{2,}/g, ' ')

  return s.trim()
}

// Keys whose values are dates / URLs / identifiers — never markdown-strip these.
const SKIP_KEYS = new Set([
  'url', 'link', 'website', 'href', 'image', 'logo',
  'generated_at', 'generatedAt', 'fetchedAt', 'fetched_at',
  'date', 'deadline', 'created_at', 'updated_at', 'id',
])

// Deep-clone an object/array, stripping markdown from every string leaf except
// values under SKIP_KEYS. Safe to run over a whole report JSON.
export function stripMarkdownDeep<T>(value: T, key?: string): T {
  if (typeof value === 'string') {
    if (key && SKIP_KEYS.has(key)) return value
    return stripMarkdown(value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripMarkdownDeep(v, key)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = stripMarkdownDeep(v, k)
    return out as unknown as T
  }
  return value
}
