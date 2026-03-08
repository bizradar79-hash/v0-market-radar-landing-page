import { createServerClient } from '@supabase/ssr'

const GROQ_DAILY_LIMIT = 100_000
const GEMINI_DAILY_LIMIT = 1_000_000
const TAVILY_MONTHLY_LIMIT = 1_000
const SERPER_MONTHLY_LIMIT = 2_500

const SEARCH_PROVIDERS = new Set(['tavily', 'serper'])

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function trackUsage(provider: string, tokens: number) {
  try {
    await getServiceClient().from('ai_usage').insert({ provider, tokens })
  } catch (e) {
    console.error('trackUsage error:', e)
  }
}

export async function trackSearchUsage(provider: string) {
  try {
    await getServiceClient().from('ai_usage').insert({ provider, tokens: 1 })
  } catch (e) {
    console.error('trackSearchUsage error:', e)
  }
}

export async function getUsageStats() {
  try {
    const sb = getServiceClient()
    const now = new Date()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const sinceMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // AI usage: last 24h
    const { data: aiData } = await sb
      .from('ai_usage')
      .select('provider, tokens, created_at')
      .not('provider', 'in', '(tavily,serper)')
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(500)

    // Search usage: this month
    const { data: searchData } = await sb
      .from('ai_usage')
      .select('provider, created_at')
      .in('provider', ['tavily', 'serper'])
      .gte('created_at', sinceMonthStart)

    // Recent activity (all types, last 20)
    const { data: recentData } = await sb
      .from('ai_usage')
      .select('provider, tokens, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    const aiRows = aiData || []
    const searchRows = searchData || []

    const groqUsed = aiRows.filter(r => r.provider === 'groq').reduce((s, r) => s + r.tokens, 0)
    const geminiUsed = aiRows.filter(r => r.provider === 'gemini').reduce((s, r) => s + r.tokens, 0)
    const tavilyUsed = searchRows.filter(r => r.provider === 'tavily').length
    const serperUsed = searchRows.filter(r => r.provider === 'serper').length

    return {
      groq: {
        used: groqUsed,
        limit: GROQ_DAILY_LIMIT,
        percent: Math.min(100, Math.round((groqUsed / GROQ_DAILY_LIMIT) * 100)),
      },
      gemini: {
        used: geminiUsed,
        limit: GEMINI_DAILY_LIMIT,
        percent: Math.min(100, Math.round((geminiUsed / GEMINI_DAILY_LIMIT) * 100)),
      },
      tavily: {
        used: tavilyUsed,
        limit: TAVILY_MONTHLY_LIMIT,
        percent: Math.min(100, Math.round((tavilyUsed / TAVILY_MONTHLY_LIMIT) * 100)),
      },
      serper: {
        used: serperUsed,
        limit: SERPER_MONTHLY_LIMIT,
        percent: Math.min(100, Math.round((serperUsed / SERPER_MONTHLY_LIMIT) * 100)),
      },
      bothExhausted: groqUsed >= GROQ_DAILY_LIMIT && geminiUsed >= GEMINI_DAILY_LIMIT,
      activeProvider: groqUsed < GROQ_DAILY_LIMIT ? 'groq' : geminiUsed < GEMINI_DAILY_LIMIT ? 'gemini' : 'none',
      activeSearch: tavilyUsed < TAVILY_MONTHLY_LIMIT ? 'tavily' : serperUsed < SERPER_MONTHLY_LIMIT ? 'serper' : 'none',
      recent: recentData || [],
    }
  } catch (e) {
    console.error('getUsageStats error:', e)
    return null
  }
}
