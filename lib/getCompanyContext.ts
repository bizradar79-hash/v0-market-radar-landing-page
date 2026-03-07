import { createClient } from '@/lib/supabase/server'

export async function getCompanyContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: company } = await supabase
    .from('companies').select('*').eq('id', user.id).single()
  const { data: competitors } = await supabase
    .from('competitors').select('*').eq('company_id', user.id)

  // Scrape website
  let websiteContent = ''
  if (company?.website) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000'
      const scrape = await fetch(`${baseUrl}/api/scrape-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: company.website })
      })
      const data = await scrape.json()
      websiteContent = data.content || ''
    } catch {
      // Scraping failed, continue without website content
    }
  }

  const context = `
=== פרופיל החברה ===
שם: ${company?.name || 'לא צוין'}
אתר: ${company?.website || 'לא צוין'}
תעשייה: ${company?.industry || 'לא צוין'}
עיר: ${company?.city || 'לא צוין'}
גודל: ${company?.size || 'לא צוין'}
תיאור: ${company?.description || 'לא צוין'}
מילות מפתח: ${Array.isArray(company?.keywords) ? company.keywords.join(', ') : 'לא צוינו'}
מודולים נבחרים: ${Array.isArray(company?.modules) ? company.modules.join(', ') : 'לא צוינו'}

=== תוכן האתר ===
${websiteContent || 'לא זמין'}

=== מתחרים ידועים ===
${competitors?.map((c: { name: string; website?: string }) => `- ${c.name} (${c.website || 'אין אתר'})`).join('\n') || 'לא צוינו'}
`
  return { company, competitors, context, supabase, user }
}
