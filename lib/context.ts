import { createClient } from '@/lib/supabase/server'
import { scrapeWebsite } from './scrape'

export async function getFullContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: company }, { data: competitors }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', user.id).single(),
    supabase.from('competitors').select('*').eq('company_id', user.id)
  ])

  if (!company) return null

  // Only scrape website — Tavily searches are done per-route to avoid timeout
  const websiteContent = await scrapeWebsite(company?.website || '')

  const context = `
=== פרופיל החברה ===
שם: ${company?.name}
אתר: ${company?.website}
תעשייה: ${company?.industry}
עיר: ${company?.city}
גודל: ${company?.size}
תיאור: ${company?.description}
מילות מפתח: ${company?.keywords?.join(', ')}
מודולים: ${company?.modules?.join(', ')}
מתחרים ידועים: ${competitors?.map((c: any) => `${c.name} (${c.website})`).join(', ') || 'לא צוינו'}

=== תוכן האתר ===
${websiteContent ? websiteContent.slice(0, 2000) : 'לא זמין'}
`

  return { company, competitors, user, supabase, context }
}
