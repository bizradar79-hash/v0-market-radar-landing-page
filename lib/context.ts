import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { scrapeWebsite } from './scrape'
import type { BusinessProfile } from '@/types/business-profile'

function parseDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export async function getFullContext() {
  // Support Bearer token auth for server-to-server calls (e.g. /api/run-tests)
  const reqHeaders = await headers()
  const authHeader = reqHeaders.get('authorization')

  // Admin override: allows admin routes to run scans on behalf of any user.
  // Requires both x-admin-user-id and x-admin-secret = SUPABASE_SERVICE_ROLE_KEY.
  const adminUserId = reqHeaders.get('x-admin-user-id')
  const adminSecret = reqHeaders.get('x-admin-secret')
  const isAdminOverride = !!(
    adminUserId &&
    adminSecret &&
    adminSecret === process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let supabase: any
  let user: any

  if (isAdminOverride) {
    supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )
    user = { id: adminUserId }
  } else if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    )
    const { data } = await supabase.auth.getUser(token)
    user = data?.user
  } else {
    supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user
  }

  if (!user) return null

  const [{ data: company }, { data: competitors }] = await Promise.all([
    supabase.from('companies').select('*, geographic_area, target_customers').eq('id', user.id).single(),
    supabase.from('competitors').select('*').eq('company_id', user.id)
  ])

  if (!company) return null

  const companyDomain = parseDomain(company?.website || '')

  // Only scrape website — Tavily searches are done per-route to avoid timeout
  const websiteContent = await scrapeWebsite(company?.website || '')

  // Build rich company profile from DB data + scraped website content
  const keywords: string[] = company?.keywords || []
  const primaryKeywords = keywords.slice(0, 3).join(' ') || company?.industry || ''
  const geographicArea: string[] = company?.geographic_area || []
  const targetCustomers: string[] = company?.target_customers || []

  const companyProfile = {
    name: company?.name || '',
    industry: company?.industry || '',
    description: company?.description || '',
    city: company?.city || '',
    website: company?.website || '',
    keywords,
    primaryKeywords,
    // Use first 2 keywords as products proxy, rest as target customers proxy
    products: keywords.slice(0, 2).join(', ') || company?.description?.slice(0, 80) || '',
    targetCustomers: targetCustomers.length > 0 ? targetCustomers.join(', ') : (keywords.slice(2, 4).join(', ') || company?.industry || ''),
    geographicArea: geographicArea.join(', '),
  }

  const scopes: string[] = Array.isArray(company?.geographic_scope)
    ? company.geographic_scope
    : [company?.geographic_scope || 'national']

  const geoContext = [
    scopes.includes('local') && company?.city && company.city !== 'כל הארץ'
      ? `העסק פעיל מקומית באזור ${company.city}.`
      : null,
    scopes.includes('national')
      ? 'העסק פעיל בכל רחבי ישראל.'
      : null,
    scopes.includes('international')
      ? 'העסק פעיל גם בשווקים בינלאומיים מחוץ לישראל — כלול תוצאות גלובליות רלוונטיות.'
      : null,
  ].filter(Boolean).join(' ')

  const context = `
=== פרופיל החברה ===
שם: ${company?.name}
דומיין: ${companyDomain}
אתר: ${company?.website}
תעשייה: ${company?.industry}
עיר: ${company?.city}
גודל: ${company?.size}
תיאור: ${company?.description}
מוצרים/שירותים/מילות מפתח: ${keywords.join(', ')}
אזור גיאוגרפי: ${geographicArea.length > 0 ? geographicArea.join(', ') : company?.city || 'לא צוין'}
היקף גיאוגרפי: ${geoContext}
לקוחות יעד: ${targetCustomers.length > 0 ? targetCustomers.join(', ') : 'לא צוין'}
מתחרים ידועים: ${competitors?.map((c: any) => `${c.name} (${c.website})`).join(', ') || 'לא צוינו'}

=== תוכן האתר ===
${websiteContent ? websiteContent.slice(0, 2000) : 'לא זמין'}

=== הנחיה קריטית ===
אל תכלול את "${company?.name}" (דומיין: ${companyDomain}) בתוצאות כלשהן.
השתמש אך ורק בנתונים ו-URLs שמופיעים בתוצאות החיפוש שסופקו.
`

  const businessProfile = (company?.business_profile ?? null) as BusinessProfile | null

  const enrichedContext = businessProfile ? `
פרופיל עסקי מפורט:
- פעילות עיקרית: ${businessProfile.coreActivity}
- מודל עסקי: ${businessProfile.businessModel}
- מוצרים: ${businessProfile.products.map(p => p.name).join(', ')}
- קהלי יעד: ${businessProfile.targetAudiences.join(', ')}
- יתרון תחרותי: ${businessProfile.competitiveAdvantage}
- תגיות תעשייה: ${businessProfile.industryTags.join(', ')}
- מילות חיפוש עיקריות: ${businessProfile.primaryKeywords.join(', ')}
- שאילתות מוכנות: ${businessProfile.searchQueries.join(' | ')}

${context}` : context

  return { company, competitors, user, supabase, context: enrichedContext, companyDomain, companyProfile, geoContext }
}
