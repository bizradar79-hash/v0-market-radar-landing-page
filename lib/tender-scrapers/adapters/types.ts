export interface NormalizedTender {
  external_id: string
  title: string
  publisher: string
  description?: string
  url: string
  deadline: string | null
  publish_date: string | null
  category?: string
  tender_number?: string
  tender_type?: 'tender' | 'rfi' | 'exemption' | 'unknown'
  raw?: any
}

export interface TenderAdapter {
  siteName: string
  matchUrl: (url: string) => boolean
  fetchTenders: () => Promise<NormalizedTender[]>
}
