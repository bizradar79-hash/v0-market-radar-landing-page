export interface TenderPoolItem {
  external_id: string
  title: string
  description?: string
  publisher?: string
  category?: string
  publish_date?: string // YYYY-MM-DD
  deadline?: string // YYYY-MM-DD
  url?: string
  budget?: string
  location?: string
  contact_info?: Record<string, string>
  status?: string
  raw_data?: Record<string, any>
}

export interface TenderSource {
  id: string
  name: string
  source_type: string
  config: Record<string, any>
  enabled: boolean
  last_scanned_at: string | null
  last_scan_status: string | null
  last_error: string | null
  total_tenders_found: number
  created_at: string
}
