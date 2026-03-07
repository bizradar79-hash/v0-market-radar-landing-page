import { getFullContext } from '@/lib/context'
import { analyzeWithAI } from '@/lib/ai'
import { multiSearch } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// GET /api/analyze — diagnostic checks, no auth needed to see env/connection status
export async function GET() {
  const checks: Record<string, any> = {}

  // 1. Env vars
  checks.env = {
    GROQ_API_KEY: process.env.GROQ_API_KEY
      ? `set (${process.env.GROQ_API_KEY.slice(0, 8)}...)`
      : 'MISSING',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY
      ? `set (${process.env.TAVILY_API_KEY.slice(0, 8)}...)`
      : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `set (${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 30)}...)`
      : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? `set (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 20)}...)`
      : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `set (${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 20)}...)`
      : 'MISSING',
  }

  // 2. Supabase connection
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('companies').select('count').limit(1)
    checks.supabase = error
      ? { ok: false, error: error.message, code: error.code }
      : { ok: true, response: data }
  } catch (e: any) {
    checks.supabase = { ok: false, error: e?.message, stack: e?.stack?.split('\n').slice(0, 3) }
  }

  // 3. Current user
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    checks.auth = error
      ? { ok: false, error: error.message }
      : { ok: true, user: user ? { id: user.id, email: user.email } : null }
  } catch (e: any) {
    checks.auth = { ok: false, error: e?.message }
  }

  // 4. Groq reachability (cheap call)
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.startsWith('gsk_placeholder')) {
      checks.groq = { ok: false, error: 'API key is placeholder or missing' }
    } else {
      const Groq = (await import('groq-sdk')).default
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'reply with the single word: ok' }],
        max_tokens: 5,
      })
      checks.groq = { ok: true, reply: res.choices[0].message.content }
    }
  } catch (e: any) {
    checks.groq = { ok: false, error: e?.message, status: e?.status }
  }

  // 5. Tavily reachability (cheap call)
  try {
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith('tvly-placeholder')) {
      checks.tavily = { ok: false, error: 'API key is placeholder or missing' }
    } else {
      const { tavily } = await import('@tavily/core')
      const client = tavily({ apiKey: process.env.TAVILY_API_KEY })
      const res = await client.search('test', { maxResults: 1 })
      checks.tavily = { ok: true, resultCount: res.results.length }
    }
  } catch (e: any) {
    checks.tavily = { ok: false, error: e?.message }
  }

  const allOk = checks.supabase?.ok && checks.groq?.ok && checks.tavily?.ok
  return NextResponse.json({ allOk, checks }, { status: allOk ? 200 : 500 })
}

// POST /api/analyze — full analysis with step-by-step error reporting
export async function POST() {
  const steps: Record<string, any> = {}

  try {
    // Step 1: getFullContext
    steps.step1_context = 'starting'
    let ctx: Awaited<ReturnType<typeof getFullContext>>
    try {
      ctx = await getFullContext()
      if (!ctx) {
        steps.step1_context = 'returned null — user not authenticated or no company profile'
        return NextResponse.json({ error: 'Unauthorized', steps }, { status: 401 })
      }
      steps.step1_context = {
        ok: true,
        userId: ctx.user.id,
        company: ctx.company?.name,
        industry: ctx.company?.industry,
      }
    } catch (e: any) {
      steps.step1_context = { ok: false, error: e?.message, stack: e?.stack }
      return NextResponse.json({ error: 'getFullContext failed', steps }, { status: 500 })
    }

    // Step 2: multiSearch
    steps.step2_search = 'starting'
    let searchResults: any[]
    try {
      searchResults = await multiSearch([
        `${ctx.company?.industry} הזדמנויות שוק ישראל 2026`,
        `${ctx.company?.name} ${ctx.company?.industry} ישראל`,
        `${ctx.company?.keywords?.slice(0, 2)?.join(' ')} ישראל`,
      ])
      steps.step2_search = { ok: true, resultCount: searchResults.length }
    } catch (e: any) {
      steps.step2_search = { ok: false, error: e?.message, stack: e?.stack }
      return NextResponse.json({ error: 'multiSearch failed', steps }, { status: 500 })
    }

    // Step 3: analyzeWithAI
    steps.step3_ai = 'starting'
    let data: any
    try {
      data = await analyzeWithAI(`בהתבסס על המידע הבא, צור 10 הזדמנויות עסקיות:

${ctx.context}

תוצאות חיפוש:
${searchResults.map((r: any) => `[${r.title}] ${r.url} - ${r.content}`).join('\n')}

כל הזדמנות מבוססת על נתון אמיתי, כוללת URL אמיתי, ו-3 פעולות מעשיות לשבוע.

{
  "opportunities": [{
    "title": "כותרת ספציפית",
    "description": "4-5 משפטים עם נתונים",
    "impact_score": 90,
    "confidence_score": 85,
    "priority": "גבוהה",
    "type": "סוג הזדמנות",
    "actions": ["פעולה 1", "פעולה 2", "פעולה 3"],
    "sources": ["URL אמיתי מהחיפוש"]
  }]
}`)
      steps.step3_ai = { ok: true, opportunityCount: data?.opportunities?.length }
    } catch (e: any) {
      steps.step3_ai = { ok: false, error: e?.message, stack: e?.stack }
      return NextResponse.json({ error: 'analyzeWithAI failed', steps }, { status: 500 })
    }

    // Step 4: Supabase insert
    steps.step4_db = 'starting'
    try {
      await ctx.supabase.from('opportunities').delete().eq('company_id', ctx.user.id)
      const { data: saved, error: insertError } = await ctx.supabase.from('opportunities').insert(
        data.opportunities.map((o: any) => ({
          title: o.title,
          description: o.description,
          impact_score: o.impact_score,
          confidence_score: o.confidence_score,
          priority: o.priority,
          type: o.type,
          actions: o.actions,
          sources: o.sources,
          company_id: ctx.user.id,
        }))
      ).select()

      if (insertError) {
        steps.step4_db = { ok: false, error: insertError.message, code: insertError.code, details: insertError.details }
        return NextResponse.json({ error: 'Supabase insert failed', steps }, { status: 500 })
      }
      steps.step4_db = { ok: true, savedCount: saved?.length }
    } catch (e: any) {
      steps.step4_db = { ok: false, error: e?.message, stack: e?.stack }
      return NextResponse.json({ error: 'Supabase insert threw', steps }, { status: 500 })
    }

    // Step 5: housekeeping (non-fatal)
    try {
      await ctx.supabase.from('companies')
        .update({ last_analyzed: new Date().toISOString() })
        .eq('id', ctx.user.id)
      await ctx.supabase.from('alerts').insert({
        company_id: ctx.user.id,
        title: 'הזדמנויות חדשות זוהו',
        message: `${data.opportunities.length} הזדמנויות חדשות התגלו`,
        type: 'info',
        link: '/app/opportunities',
        is_read: false,
      })
    } catch (e: any) {
      steps.step5_housekeeping = { ok: false, error: e?.message }
    }

    return NextResponse.json({ success: true, count: data.opportunities.length, steps })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Unexpected top-level error',
      message: e?.message,
      stack: e?.stack,
      steps,
    }, { status: 500 })
  }
}
