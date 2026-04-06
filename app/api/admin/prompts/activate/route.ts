import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST { id }  →  activate this version, deactivate others in same module
export async function POST(req: Request) {
  const supabase = await createClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Get the module for this version
  const { data: row, error: fetchErr } = await supabase
    .from('prompt_versions')
    .select('module')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !row) return NextResponse.json({ error: 'version not found' }, { status: 404 })

  // Deactivate all versions for this module
  await supabase
    .from('prompt_versions')
    .update({ is_active: false })
    .eq('module', row.module)

  // Activate the selected one
  const { error } = await supabase
    .from('prompt_versions')
    .update({ is_active: true })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
