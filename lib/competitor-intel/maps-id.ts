/**
 * Google Maps URL → business identifier (cid / place_id).
 *
 * WHY THIS EXISTS: DataForSEO's keyword search cannot find Israeli businesses by
 * their Hebrew name — "מאי פיננסים" returns task_40102 "No Search Results" even
 * though the business has 119 reviews. But DataForSEO's reviews endpoint accepts
 * a `cid` or `place_id` directly. So we let the AI link-finder locate the Maps
 * listing (which Grok does well, since it's a web search), then extract the id
 * here and query reviews by id — sidestepping the name search entirely.
 *
 * The admin never types an id: this parses whatever Maps URL discovery found.
 */
export interface MapsId {
  cid?: string      // decimal, as DataForSEO expects
  placeId?: string  // ChIJ… form
  /** The URL the id came from, after any shortlink expansion. */
  resolvedUrl?: string
  error?: string
}

const SHORTLINK = /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.page)/i

/** `0x…:0x<hex>` inside a Maps `!1s` data segment → the decimal cid. */
function hexToCid(hex: string): string | undefined {
  try {
    // Hex → decimal without BigInt literals (tsconfig targets < ES2020).
    const v = BigInt(hex.startsWith('0x') ? hex : `0x${hex}`)
    return v > BigInt(0) ? v.toString(10) : undefined
  } catch { return undefined }
}

/** Pull an id out of an already-expanded Maps URL. Pure, no network. */
export function parseMapsUrl(raw: string): MapsId {
  const url = (raw || '').trim()
  if (!url) return { error: 'empty' }
  let u: URL
  try { u = new URL(url) } catch { return { error: 'not_a_url' } }

  // 1. Explicit query params — the easy, unambiguous shapes.
  const qCid = u.searchParams.get('cid') || u.searchParams.get('ludocid')
  if (qCid && /^\d{5,}$/.test(qCid)) return { cid: qCid, resolvedUrl: url }

  const qPlace = u.searchParams.get('place_id') || u.searchParams.get('placeid')
  if (qPlace && /^ChI[A-Za-z0-9_-]{10,}$/.test(qPlace)) return { placeId: qPlace, resolvedUrl: url }

  const whole = decodeURIComponent(url)

  // 2. place_id embedded anywhere (e.g. /maps/place/?q=place_id:ChIJ…).
  const pm = whole.match(/place_id[:=]([A-Za-z0-9_-]{15,})/)
  if (pm) return { placeId: pm[1], resolvedUrl: url }

  // 3. The `!1s0x<area>:0x<cid>` data segment of a canonical /maps/place URL.
  //    The SECOND hex value is the cid.
  const dm = whole.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i) || whole.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i)
  if (dm) {
    const cid = hexToCid(dm[1])
    if (cid) return { cid, resolvedUrl: url }
  }

  // 4. A bare `!1s` place reference (ChIJ form inside the data blob).
  const cm = whole.match(/!1s(ChI[A-Za-z0-9_-]{10,})/)
  if (cm) return { placeId: cm[1], resolvedUrl: url }

  return { error: 'no_id_in_url', resolvedUrl: url }
}

/**
 * Expand a shortlink (maps.app.goo.gl / goo.gl/maps / g.page) then parse.
 * Never throws — a dead or unexpandable link returns an error string.
 */
export async function resolveMapsId(raw: string): Promise<MapsId> {
  const url = (raw || '').trim()
  if (!url) return { error: 'empty' }

  // A full Maps URL usually carries the id already — try before any network.
  const direct = parseMapsUrl(url)
  if (direct.cid || direct.placeId) return direct

  if (!SHORTLINK.test(url)) return direct
  try {
    // Shortlinks 302 to the canonical /maps/place URL that holds the id.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
    })
    const finalUrl = res.url || url
    const fromUrl = parseMapsUrl(finalUrl)
    if (fromUrl.cid || fromUrl.placeId) return fromUrl
    // Some expansions only reveal the id inside the page body.
    const body = (await res.text().catch(() => '')).slice(0, 200000)
    const dm = body.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i)
    if (dm) {
      const cid = hexToCid(dm[1])
      if (cid) return { cid, resolvedUrl: finalUrl }
    }
    const pm = body.match(/"(ChI[A-Za-z0-9_-]{15,})"/)
    if (pm) return { placeId: pm[1], resolvedUrl: finalUrl }
    return { error: 'no_id_after_expand', resolvedUrl: finalUrl }
  } catch (e: any) {
    return { error: e?.name === 'TimeoutError' ? 'expand_timeout' : 'expand_failed' }
  }
}
