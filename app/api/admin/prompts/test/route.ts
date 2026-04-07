import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callModel } from '@/lib/call-model'
import type { ModelProvider } from '@/lib/available-models'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { prompt, model_provider, model_name, company_id, module, version_id? }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('test route called with:', JSON.stringify({ ...body, prompt: body.prompt?.slice(0, 80) + '...' }))

    const { prompt, model_provider, model_name, company_id, module: module_, version_id } = body

    if (!prompt || !model_provider || !model_name) {
      return NextResponse.json({ error: 'prompt, model_provider, model_name required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Build company context if company_id provided
    let fullPrompt = prompt
    if (company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('name, website, industry, business_profile, business_overview')
        .eq('id', company_id)
        .maybeSingle()
      if (company) {
        const ctx = `הקשר חברה:
שם: ${company.name || ''}
תחום: ${company.industry || ''}
אתר: ${company.website || ''}
תיאור: ${company.business_overview || company.business_profile || ''}

`
        fullPrompt = ctx + prompt
      }
    }

    const result = await callModel(model_provider as ModelProvider, model_name, fullPrompt)
    console.log('callModel done, latency_ms:', result.latency_ms, 'tokens:', result.tokens_used)

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
      await supabase
        .from('prompt_versions')
        .update({ test_result: testResult, tested_with_company_id: company_id ?? null })
        .eq('id', version_id)
    }

    return NextResponse.json({ success: true, results: testResult })
  } catch (e: any) {
    console.error('[prompts/test] error:', e?.message, e?.stack)
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
