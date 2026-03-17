import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { user_notes, status } = body

    const updates: Record<string, any> = {}
    if (user_notes !== undefined) updates.user_notes = user_notes
    if (status !== undefined) updates.status = status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { error } = await ctx.supabase
      .from('saved_opportunities')
      .update(updates)
      .eq('id', params.id)
      .eq('company_id', ctx.user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await ctx.supabase
      .from('saved_opportunities')
      .delete()
      .eq('id', params.id)
      .eq('company_id', ctx.user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
