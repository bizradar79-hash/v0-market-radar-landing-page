export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getFullContext } from '@/lib/context'

export async function GET() {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await ctx.supabase
      .from('saved_items')
      .select('*')
      .eq('company_id', ctx.user.id)
      .order('saved_at', { ascending: false })

    if (error) {
      // Table may not exist yet
      if (error.code === '42P01') return NextResponse.json({ items: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by item_type
    const grouped: Record<string, any[]> = {}
    for (const item of data || []) {
      if (!grouped[item.item_type]) grouped[item.item_type] = []
      grouped[item.item_type].push(item)
    }

    return NextResponse.json({ items: data || [], grouped })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { item_type, item_id, title, description, url, source_module, metadata } = body

    if (!item_type || !title) {
      return NextResponse.json({ error: 'Missing item_type or title' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('saved_items')
      .insert({
        company_id: ctx.user.id,
        item_type,
        item_id: item_id || null,
        title,
        description: description || null,
        url: url || null,
        source_module: source_module || null,
        metadata: metadata || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await ctx.supabase
      .from('saved_items')
      .delete()
      .eq('id', id)
      .eq('company_id', ctx.user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
