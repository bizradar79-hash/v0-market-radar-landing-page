import { createClient } from '@/lib/supabase/server'
import { callModel } from '@/lib/call-model'
import type { ModelProvider } from '@/lib/available-models'
import type { BusinessProfile } from '@/types/business-profile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { prompt, model_provider, model_name, company_id, module, version_id? }
export async function POST(req: Request) {
  // Log raw body before any parsing so crashes don't swallow context
  try {
    const rawBody = await req.clone().json()
    console.log('test called with body:', JSON.stringify({
      ...rawBody,
      prompt: rawBody.prompt?.slice(0, 80) + '...',
    }))
  } catch (logErr) {
    console.log('test called — could not parse body for logging:', logErr)
  }

  try {
    const body = await req.json()
    const { prompt, model_provider, model_name, company_id, module: module_, version_id } = body

    if (!prompt || !model_provider || !model_name) {
      return Response.json({ error: 'prompt, model_provider, model_name required' }, { status: 400 })
    }

    console.log(`[prompts/test] provider=${model_provider} model=${model_name} company_id=${company_id ?? 'none'}`)

    const supabase = await createClient()

    // Build company context — same format as generate-news uses in production
    let fullPrompt = prompt
    if (company_id) {
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .select('name, website, industry, description, keywords, business_profile')
        .eq('id', company_id)
        .maybeSingle()

      console.log('[prompts/test] company fetch:', company?.name ?? 'not found', companyErr?.message ?? 'ok')

      if (company) {
        const bp = (company.business_profile ?? null) as BusinessProfile | null
        const keywords: string[] = (company as any).keywords || []
        const coreActivity = bp?.coreActivity || company.description || company.industry || ''
        const products = bp?.products?.map((p: any) => p.name).join(', ') || keywords.slice(0, 3).join(', ') || ''

        // Inject company directly into prompt instructions so xAI treats it as search intent
        fullPrompt = prompt
          .replace('לתעשייה ולשוק הישראלי', `לתחום "${company.industry || coreActivity}" ולשוק הישראלי`)
          .replace('לתעשייה ולמוצרים של החברה', `לחברה "${company.name}" שעוסקת ב: ${coreActivity}. מוצרים: ${products}`)

        // Also prepend short context so model has company name in scope
        fullPrompt = `חברה: ${company.name} | תחום: ${company.industry || coreActivity} | מוצרים: ${products}\n\n${fullPrompt}`
      }
    }

    console.log('[prompts/test] calling callModel...')
    const result = await callModel(model_provider as ModelProvider, model_name, fullPrompt)
    console.log('[prompts/test] callModel done, latency_ms:', result.latency_ms, 'tokens:', result.tokens_used)

    // Parse JSON — strip markdown fences first, then try regex extraction
    let parsed: any = null
    try {
      const clean = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      try {
        const match = result.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
        if (match) parsed = JSON.parse(match[0])
      } catch {}
    }

    const testResult = {
      raw_text: result.text.slice(0, 5000),
      parsed,
      tokens_used: result.tokens_used,
      latency_ms: result.latency_ms,
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
      if (saveErr) console.warn('[prompts/test] save test_result failed:', saveErr.message)
    }

    return Response.json({ success: true, results: testResult })
  } catch (e: any) {
    console.error('[prompts/test] CRASH:', e?.message, '\nStack:', e?.stack)
    return Response.json({ error: e?.message ?? 'Unknown error', stack: e?.stack }, { status: 500 })
  }
}
