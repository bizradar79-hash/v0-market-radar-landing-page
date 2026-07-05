import type { TenderAdapter } from './types'
import { railAdapter } from './rail'

export type { TenderAdapter, NormalizedTender } from './types'

export const adapters: TenderAdapter[] = [
  railAdapter, // רכבת ישראל — internal JSON API, live-probed working (200, ~188KB JSON)
  // ── Probed 2026-07, NO reliable structured path found (do NOT build until one is) ──
  // חברת חשמל (IEC, iec.co.il): Angular SPA that serves a catch-all HTML shell for
  //   every path (/tenders, /api/tenders, /umbraco/* all return index.html). Tenders
  //   API lives in an unmapped lazy chunk; no TransferState/embedded JSON in the SSR
  //   page; main bundle has no apiUrl/host. Endpoint not discoverable without running
  //   the Angular router. "Endpoint or nothing" → nothing built.
  // נמלי ישראל (israports.co.il): unreachable from the probe env — https TLS handshake
  //   reset (curl 56), http 302 loops to itself, tenders.israports.co.il does not
  //   resolve. Could not confirm any endpoint. Re-probe from a network that reaches it.
  // data.gov.il CKAN procurement (מינהל הרכש, datasets `tenders`/`exemptions`): DEAD —
  //   newest records frozen at Feb 2021; `exemptions` are closed post-facto exemption
  //   decisions, not biddable open tenders. Not usable as a live source.
  // TODO: maccabi4u / clalit (SharePoint /_api/) / leumit / bank-of-israel — need endpoints.
]

export function findAdapter(url: string): TenderAdapter | null {
  return adapters.find(a => a.matchUrl(url)) || null
}

/** Returns adapter siteName for a URL, or null if no adapter */
export function getAdapterName(url: string): string | null {
  const adapter = findAdapter(url)
  return adapter ? adapter.siteName : null
}
