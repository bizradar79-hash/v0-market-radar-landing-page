import { createServerClient } from '@supabase/ssr'

const GROQ_DAILY_LIMIT = 100_000
const GEMINI_DAILY_LIMIT = 1_000_000

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

export async function getUsageStats() {
  try {
    const sb = getServiceClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data } = await sb
      .from('ai_usage')
      .select('provider, tokens, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    const rows = data || []

    const groqUsed = rows.filter(r => r.provider === 'groq').reduce((s, r) => s + r.tokens, 0)
    const geminiUsed = rows.filter(r => r.provider === 'gemini').reduce((s, r) => s + r.tokens, 0)

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
      bothExhausted: groqUsed >= GROQ_DAILY_LIMIT && geminiUsed >= GEMINI_DAILY_LIMIT,
      activeProvider: groqUsed < GROQ_DAILY_LIMIT ? 'groq' : geminiUsed < GEMINI_DAILY_LIMIT ? 'gemini' : 'none',
      recent: rows.slice(0, 20),
    }
  } catch (e) {
    console.error('getUsageStats error:', e)
    return null
  }
}
