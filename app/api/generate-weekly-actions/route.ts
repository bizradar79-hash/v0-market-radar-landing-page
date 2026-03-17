import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check cache — only regenerate if force=true or stale
    const { force } = await request.json().catch(() => ({ force: false }))

    if (!force) {
      const { data: company } = await ctx.supabase
        .from('companies').select('weekly_actions').eq('id', ctx.user.id).single()

      const cached = company?.weekly_actions as { fetchedAt: string; actions: any[] } | null
      if (cached?.fetchedAt && cached.actions?.length > 0) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        if (age < CACHE_TTL_MS) {
          return NextResponse.json({ success: true, ...cached, cached: true })
        }
      }
    }

    // Build a rich context for Grok
    const company = ctx.company
    const profile = ctx.companyProfile || ''
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    const prompt = `אתה יועץ עסקי ישראלי מנוסה. היום הוא ${todayStr}.

פרטי העסק:
${profile}

המידע הזמין במערכת שלנו:
- תחום: ${company?.industry || ''}
- עיר: ${company?.city || ''}
- מתחרים: ${ctx.competitors?.map((c: any) => c.name).join(', ') || 'אין'}

המשימה שלך: בהתבסס על הפרופיל העסקי ועל מה שקורה בשוק הישראלי השבוע, הכן 5-7 פעולות קונקרטיות שהעסק הזה צריך לעשות השבוע.

כל פעולה צריכה להיות:
- ספציפית ומעשית (לא כלליות כמו "שפר שיווק")
- רלוונטית לתחום ולגודל העסק
- ברת-ביצוע תוך שבוע אחד
- מדורגת לפי עדיפות

החזר JSON בלבד:
[{
  "id": "1",
  "title": "כותרת קצרה (עד 60 תווים)",
  "category": "מכרז|ליד|מתחרה|טרנד|שיווק|כנס|כללי",
  "priority": "גבוהה|בינונית|נמוכה",
  "effort": "נמוך|בינוני|גבוה",
  "summary": "הסבר קצר 1-2 משפטים",
  "details": "תיאור מפורט של הפעולה",
  "steps": ["שלב 1", "שלב 2", "שלב 3"],
  "why_this_week": "למה דווקא השבוע זה חשוב",
  "expected_outcome": "מה תצפה לקבל כתוצאה"
}]

CRITICAL: Output ONLY a raw JSON array. No markdown. Start with [ and end with ]`

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })

    const data = await response.json()
    if (!response.ok || !data.output) {
      return NextResponse.json({ error: 'Grok API error', detail: data }, { status: 500 })
    }

    const text = data.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('')

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start === -1 || end <= start) {
      return NextResponse.json({ error: 'No JSON array in response', raw: text.slice(0, 500) }, { status: 500 })
    }

    let actions: any[] = []
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1))
      actions = Array.isArray(parsed) ? parsed.slice(0, 7) : []
    } catch {
      return NextResponse.json({ error: 'JSON parse failed', raw: clean.slice(0, 500) }, { status: 500 })
    }

    // Ensure IDs are strings
    actions = actions.map((a, i) => ({ ...a, id: String(a.id || i + 1) }))

    const payload = { fetchedAt: now.toISOString(), actions }

    const { error: saveError } = await ctx.supabase
      .from('companies').update({ weekly_actions: payload }).eq('id', ctx.user.id)

    if (saveError) {
      console.error('weekly_actions save error:', saveError.code, saveError.message)
    }

    return NextResponse.json({ success: true, ...payload, saveError: saveError?.message })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
