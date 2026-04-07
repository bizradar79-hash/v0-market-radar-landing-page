import { createClient } from '@/lib/supabase/server'
import { callModel } from '@/lib/call-model'
import type { ModelProvider } from '@/lib/available-models'

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

    // Build company context if company_id provided
    let fullPrompt = prompt
    if (company_id) {
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .select('name, website, industry, business_profile, business_overview')
        .eq('id', company_id)
        .maybeSingle()
      console.log('[prompts/test] company fetch:', company?.name ?? 'not found', companyErr?.message ?? 'ok')
      if (company) {
        const ctx = `הקשר חברה:
שם: ${company.name || ''}
תחום: ${company.industry || ''}
אתר: ${company.website || ''}
תיאור: ${(company as any).business_overview || (company as any).business_profile || ''}

`
        fullPrompt = ctx + prompt
      }
    }

    console.log('[prompts/test] calling callModel...')
    const result = await callModel(model_provider as ModelProvider, model_name, fullPrompt)
    console.log('[prompts/test] callModel done, latency_ms:', result.latency_ms, 'tokens:', result.tokens_used)

    // Try to parse result as JSON for display
    let parsed: any = null
    try {
      const match = result.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (match) parsed = JSON.parse(match[0])
    } catch {}

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
