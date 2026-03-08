import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { scrapeWebsite } from './scrape'

function parseDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export async function getFullContext() {
  // Support Bearer token auth for server-to-server calls (e.g. /api/run-tests)
  const reqHeaders = await headers()
  const authHeader = reqHeaders.get('authorization')

  let supabase: any
  let user: any

  if (authHeader?.startsWith('Bearer ')) {
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
    supabase.from('companies').select('*').eq('id', user.id).single(),
    supabase.from('competitors').select('*').eq('company_id', user.id)
  ])

  if (!company) return null

  const companyDomain = parseDomain(company?.website || '')

  // Only scrape website — Tavily searches are done per-route to avoid timeout
  const websiteContent = await scrapeWebsite(company?.website || '')

  const context = `
=== פרופיל החברה ===
שם: ${company?.name}
דומיין: ${companyDomain}
אתר: ${company?.website}
תעשייה: ${company?.industry}
עיר: ${company?.city}
גודל: ${company?.size}
תיאור: ${company?.description}
מוצרים/שירותים/מילות מפתח: ${company?.keywords?.join(', ')}
מתחרים ידועים: ${competitors?.map((c: any) => `${c.name} (${c.website})`).join(', ') || 'לא צוינו'}

=== תוכן האתר ===
${websiteContent ? websiteContent.slice(0, 2000) : 'לא זמין'}

=== הנחיה קריטית ===
אל תכלול את "${company?.name}" (דומיין: ${companyDomain}) בתוצאות כלשהן.
השתמש אך ורק בנתונים ו-URLs שמופיעים בתוצאות החיפוש שסופקו.
`

  return { company, competitors, user, supabase, context, companyDomain }
}
