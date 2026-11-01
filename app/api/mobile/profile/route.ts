export const dynamic = 'force-dynamic'

import { apiError, json, requireMobileAuth, scopedDb } from '@/lib/mobile/core'
import { effectiveKeywords } from '@/lib/keywords'
import { deriveArea } from '@/lib/geo/area'

const REPORT_BASE = (process.env.REPORT_PUBLIC_BASE_URL || 'https://www.nsradar.co.il').replace(/\/+$/, '')

/** GET /api/mobile/profile — the authenticated business's profile. */
export async function GET(req: Request) {
  const r = await requireMobileAuth(req)
  if ('res' in r) return r.res

  // Scoped by the token's company id (companies.id === user id).
  const { data: c, error } = await scopedDb(r.auth.companyId)
    .from('companies', '*', 'id')
    .maybeSingle()
  if (error) return apiError(500, 'server_error', 'Could not load the profile.')
  if (!c) return apiError(404, 'not_found', 'Business profile not found.')

  const company: any = c
  const bp = company.business_profile || null
  return json({
    company_id: company.id,
    name: company.name || bp?.name || null,
    industry: company.industry || bp?.industry || null,
    area: deriveArea(company, bp).display || null,
    website: company.website || null,
    keywords: effectiveKeywords(company, bp),
    report_url: company.report_token ? `${REPORT_BASE}/r/${company.report_token}` : null,
  })
}
