import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET ?module=news  →  all versions for that module, sorted by version desc
export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const module_ = searchParams.get('module')
  if (!module_) return NextResponse.json({ error: 'module required' }, { status: 400 })

  const { data, error } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('module', module_)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ versions: data ?? [] })
}

// POST { module, prompt, model_provider, model_name, created_by }  →  save new version
export async function POST(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  const { module: module_, prompt, model_provider, model_name, created_by } = body

  if (!module_ || !prompt || !model_provider || !model_name) {
    return NextResponse.json({ error: 'module, prompt, model_provider, model_name required' }, { status: 400 })
  }

  // Get current max version for this module
  const { data: latest } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('module', module_)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  const { data, error } = await supabase
    .from('prompt_versions')
    .insert({
      module: module_,
      prompt,
      model_provider,
      model_name,
      version: nextVersion,
      is_active: false,
      created_by: created_by ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ version: data })
}
