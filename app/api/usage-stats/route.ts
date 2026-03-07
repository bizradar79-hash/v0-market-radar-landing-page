import { getUsageStats } from '@/lib/usage'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stats = await getUsageStats()
  if (!stats) return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 })
  return NextResponse.json(stats)
}
