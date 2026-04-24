import type { TenderAdapter } from './types'
import { railAdapter } from './rail'

export type { TenderAdapter, NormalizedTender } from './types'

export const adapters: TenderAdapter[] = [
  railAdapter,
  // TODO: maccabi4u adapter — find their API endpoint via DevTools
  // TODO: clalit adapter — SharePoint, likely REST API at /_api/...
  // TODO: leumit adapter
  // TODO: bank-of-israel adapter
]

export function findAdapter(url: string): TenderAdapter | null {
  return adapters.find(a => a.matchUrl(url)) || null
}

/** Returns adapter siteName for a URL, or null if no adapter */
export function getAdapterName(url: string): string | null {
  const adapter = findAdapter(url)
  return adapter ? adapter.siteName : null
}
