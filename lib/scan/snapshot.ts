// Layer 2: capture a full pre-scan snapshot of every module's state so a bad
// re-scan can be audited and restored. Best-effort — never throws into the
// scan flow.

const MAX_SNAPSHOTS = 10

export type ScanTrigger = 'initial' | 'full' | 'partial'

export interface SnapshotData {
  seo_ranking: any
  geo_ranking: any
  industry_trends: any
  keyword_trends: any
  competitors: any[]
  news: any[]
  conferences: any[]
  tenders: any[]
}

function countKeys(obj: any): number {
  return obj && typeof obj === 'object' ? Object.keys(obj).length : 0
}

/**
 * Gather the company's current state across all modules.
 * `supabase` must be a service-role client (scan orchestrators use one).
 */
export async function gatherSnapshotData(supabase: any, companyId: string): Promise<SnapshotData> {
  const [{ data: company }, { data: competitors }, { data: news }, { data: conferences }, { data: tenders }] =
    await Promise.all([
      supabase.from('companies').select('seo_ranking, geo_ranking, industry_trends, keyword_trends').eq('id', companyId).single(),
      supabase.from('competitors').select('*').eq('company_id', companyId),
      supabase.from('news').select('*').eq('company_id', companyId),
      supabase.from('conferences').select('*').eq('company_id', companyId),
      supabase.from('tenders').select('*').eq('company_id', companyId),
    ])

  return {
    seo_ranking: company?.seo_ranking ?? null,
    geo_ranking: company?.geo_ranking ?? null,
    industry_trends: company?.industry_trends ?? null,
    keyword_trends: company?.keyword_trends ?? null,
    competitors: competitors ?? [],
    news: news ?? [],
    conferences: conferences ?? [],
    tenders: tenders ?? [],
  }
}

export function snapshotCounts(data: SnapshotData): Record<string, number> {
  return {
    competitors: data.competitors.length,
    keyword_trends: countKeys(data.keyword_trends),
    seo: Array.isArray(data.seo_ranking?.results) ? data.seo_ranking.results.length : 0,
    geo: Array.isArray(data.geo_ranking?.results) ? data.geo_ranking.results.length : 0,
    industry_trends: Array.isArray(data.industry_trends?.trends) ? data.industry_trends.trends.length : 0,
    tenders: data.tenders.length,
    news: data.news.length,
    conferences: data.conferences.length,
  }
}

/**
 * Capture and persist a pre-scan snapshot, then prune to the latest 10 per
 * company. Returns the snapshot id, or null on failure (never throws).
 */
export async function captureSnapshot(
  supabase: any,
  companyId: string,
  trigger: ScanTrigger,
): Promise<string | null> {
  try {
    const data = await gatherSnapshotData(supabase, companyId)
    const counts = snapshotCounts(data)

    const { data: inserted, error } = await supabase
      .from('scan_snapshots')
      .insert({ company_id: companyId, trigger, counts, data })
      .select('id')
      .single()
    if (error) {
      console.error('[snapshot] insert failed:', error.message)
      return null
    }

    // Rolling window: keep only the most recent MAX_SNAPSHOTS.
    const { data: all } = await supabase
      .from('scan_snapshots').select('id').eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (all && all.length > MAX_SNAPSHOTS) {
      const toDelete = all.slice(MAX_SNAPSHOTS).map((r: any) => r.id)
      await supabase.from('scan_snapshots').delete().in('id', toDelete)
    }

    return inserted?.id ?? null
  } catch (e: any) {
    console.error('[snapshot] capture error:', e?.message)
    return null
  }
}
