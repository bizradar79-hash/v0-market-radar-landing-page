import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const ctx = await getFullContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tables = ['competitors', 'leads', 'tenders', 'trends', 'news', 'conferences', 'alerts']
  const results: Record<string, any> = {}

  for (const table of tables) {
    const { error, count } = await ctx.supabase
      .from(table)
      .delete()
      .eq('company_id', ctx.user.id)
    results[table] = error ? { error: error.message } : { ok: true }
  }

  return NextResponse.json({ deleted: results })
}
