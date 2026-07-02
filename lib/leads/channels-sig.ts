// Stable fingerprint of a company's distribution-channel set, used to decide
// whether channel-driven leads need to regenerate. The signature is order- and
// case-insensitive (sorted, trimmed, lowercased), so re-ordering or re-casing a
// channel doesn't trigger a costly re-run — only adding/removing/renaming does.
// Empty channels get a stable 'empty' sentinel so the customer-fallback path
// doesn't loop (it runs once when leads are empty, then stays skipped).
export function channelsSig(channels: unknown): string {
  const list = Array.isArray(channels)
    ? channels
        .map((c) => (typeof c === 'string' ? c.trim().toLowerCase() : ''))
        .filter((c) => c.length > 0)
        .sort()
    : []
  return list.length ? `c:${list.join('|')}` : 'empty'
}
