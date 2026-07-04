import { assembleReport } from './assemble'

// Retention cap: keep the latest N snapshots per company (~half a year of
// weekly scans). Older ones are pruned at insert time so the table stays small.
const SNAPSHOT_CAP = 26

const COMPANY_COLS =
  'id, name, city, geographic_area, geographic_scope, next_sync_at, last_sync_at, weekly_actions, seo_ranking, geo_ranking, keyword_trends, competitor_trends, business_profile'

/**
 * Freeze the CURRENT assembled report for a company into a report_snapshots row.
 * Pure read-only assembly — NO AI, NO generation. Best-effort: returns the new
 * snapshot's token, or null on failure (never throws, so a scan's completion is
 * never broken by snapshot issues). Prunes older snapshots beyond SNAPSHOT_CAP.
 *
 * `db` must be a service-role client.
 */
export async function createReportSnapshot(
  db: any,
  companyId: string,
  labelOverride?: string,
): Promise<string | null> {
  try {
    const { data: company } = await db
      .from('companies').select(COMPANY_COLS).eq('id', companyId).single()
    if (!company) return null

    const data = await assembleReport(db, companyId, company)
    const label = labelOverride || data.scanDate || new Date().toLocaleDateString('he-IL')

    const { data: inserted, error } = await db
      .from('report_snapshots')
      .insert({ company_id: companyId, label, data })
      .select('id, snapshot_token')
      .single()
    if (error) {
      console.warn('[report-snapshot] insert failed:', error.message)
      return null
    }

    // Prune beyond the cap (keep the newest SNAPSHOT_CAP).
    try {
      const { data: rows } = await db
        .from('report_snapshots')
        .select('id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      const ids = (rows || []).map((r: any) => r.id)
      if (ids.length > SNAPSHOT_CAP) {
        const toDelete = ids.slice(SNAPSHOT_CAP)
        await db.from('report_snapshots').delete().in('id', toDelete)
      }
    } catch (e: any) {
      console.warn('[report-snapshot] prune failed:', e?.message)
    }

    return inserted?.snapshot_token ?? null
  } catch (e: any) {
    console.warn('[report-snapshot] createReportSnapshot failed:', e?.message)
    return null
  }
}
