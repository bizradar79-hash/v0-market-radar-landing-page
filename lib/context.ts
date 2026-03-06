import { createClient } from '@/lib/supabase/server'
import { scrapeWebsite } from './scrape'
import { multiSearch } from './search'

export async function getFullContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: company }, { data: competitors }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', user.id).single(),
    supabase.from('competitors').select('*').eq('company_id', user.id)
  ])

  if (!company) return null

  // Parallel: scrape website + 6 different searches
  const [websiteContent, searchResults] = await Promise.all([
    scrapeWebsite(company?.website || ''),
    multiSearch([
      `${company?.name} ${company?.industry} ישראל`,
      `${company?.industry} חברות מובילות ישראל 2025 2026`,
      `${company?.description?.slice(0, 100)} שוק ישראל`,
      `${company?.keywords?.slice(0, 3)?.join(' ')} ישראל`,
      `מתחרים ${company?.industry} ישראל`,
      `${company?.industry} טרנדים ישראל 2026`,
    ])
  ])

  const context = `
╔══════════════════════════════════╗
  פרופיל החברה המלא
╚══════════════════════════════════╝
שם: ${company?.name}
אתר: ${company?.website}
תעשייה: ${company?.industry}
עיר: ${company?.city}
גודל: ${company?.size}
תיאור מלא: ${company?.description}
מילות מפתח: ${company?.keywords?.join(', ')}
מודולים: ${company?.modules?.join(', ')}
מתחרים ידועים: ${competitors?.map((c: any) => `${c.name} (${c.website})`).join(', ') || 'לא צוינו'}

╔══════════════════════════════════╗
  תוכן האתר (סרוק אוטומטית)
╚══════════════════════════════════╝
${websiteContent || 'לא זמין'}

╔══════════════════════════════════╗
  מידע אמיתי מהאינטרנט
╚══════════════════════════════════╝
${searchResults.map(r => `[${r.title}]
URL: ${r.url}
תוכן: ${r.content}`).join('\n\n')}
`

  return { company, competitors, user, supabase, context, searchResults }
}
