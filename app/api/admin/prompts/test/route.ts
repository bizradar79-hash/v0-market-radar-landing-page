import { createServerClient } from '@supabase/ssr'
import { callModel } from '@/lib/call-model'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Service-role client — bypasses RLS so admin can fetch any company
function adminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// POST { prompt, model_provider, model_name, company_id, module, version_id? }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { prompt, model_provider, model_name, company_id, version_id } = body

    if (!prompt || !model_provider || !model_name) {
      return Response.json({ error: 'prompt, model_provider, model_name required' }, { status: 400 })
    }

    console.log(`[prompts/test] provider=${model_provider} model=${model_name} company_id=${company_id ?? 'none'}`)

    const supabase = adminSupabase()

    // Fetch company using service role so RLS doesn't block admin access
    let companyContext = ''
    if (company_id) {
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .select('name, website, industry, description, keywords, business_profile')
        .eq('id', company_id)
        .maybeSingle()

      console.log('COMPANY DATA:', JSON.stringify(company))
      if (companyErr) console.error('[prompts/test] company fetch error:', companyErr.message)

      if (company) {
        const bp = (company as any).business_profile
        const coreActivity = bp?.coreActivity || company.description || ''
        const products = bp?.products?.map((p: any) => p.name).join(', ') || ''
        const keywords = (bp?.primaryKeywords || (company as any).keywords || []).join(', ')

        companyContext = `הקשר חברה:
שם: ${company.name}
תחום: ${company.industry || coreActivity}
פעילות עיקרית: ${coreActivity}
מוצרים: ${products}
מילות מפתח: ${keywords}
---
`
      }
    }

    const finalPrompt = companyContext + prompt
    console.log('FINAL PROMPT:', finalPrompt.substring(0, 400))

    const start = Date.now()
    const rawText = await callModel(model_provider, model_name, finalPrompt)
    const latency_ms = Date.now() - start
    console.log('[prompts/test] done, latency_ms:', latency_ms, 'raw_text[:200]:', rawText.substring(0, 200))

    // Parse JSON — strip markdown fences first, then try regex extraction
    let parsed: any = null
    try {
      const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      try {
        const match = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
        if (match) parsed = JSON.parse(match[0])
      } catch {}
    }

    const testResult = {
      raw_text: rawText.slice(0, 5000),
      parsed,
      latency_ms,
      tokens_used: 0,
      model_provider,
      model_name,
      tested_at: new Date().toISOString(),
    }

    // Save test result to version row if version_id provided
    if (version_id) {
      const { error: saveErr } = await supabase
        .from('prompt_versions')
        .update({ test_result: testResult, tested_with_company_id: company_id ?? null })
        .eq('id', version_id)
      if (saveErr) console.warn('[prompts/test] save failed:', saveErr.message)
    }

    return Response.json({ success: true, results: testResult })
  } catch (e: any) {
    console.error('[prompts/test] CRASH:', e?.message, '\nStack:', e?.stack)
    return Response.json({ error: e?.message ?? 'Unknown error', stack: e?.stack }, { status: 500 })
  }
}
