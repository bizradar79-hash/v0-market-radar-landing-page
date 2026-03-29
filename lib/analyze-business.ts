export interface BusinessAnalysis {
  what_business_does: string
  google_query: string
  ai_question: string
}

function extractXAIText(output: any[]): string {
  return output
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content)
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text)
    .join('')
}

/**
 * Step 1 — Ask Grok (no web_search) to deeply understand the business
 * and return an optimal Google query + natural AI question.
 */
export async function analyzeBusinessForSearch(
  overview: string,
  city: string,
  isLocal: boolean,
  scopeLocation: string,
): Promise<BusinessAnalysis | null> {
  if (!overview?.trim()) return null

  const prompt = `קרא את הסקירה הבאה של עסק ישראלי ותן לי:
1. מה העסק עושה בפועל (משפט אחד ספציפי)
2. שאילתת חיפוש גוגל אופטימלית (5-7 מילים) שתמצא את המתחרים הישירים שלו
3. שאלה טבעית שאדם היה שואל AI כדי למצוא עסק כזה

סקירה: ${overview}
עיר: ${city || 'לא ידוע'}
האם העסק מקומי או ארצי: ${isLocal ? `מקומי (${scopeLocation})` : 'ארצי'}

חוקים חשובים לשאילתות:
- כתוב ביטוי חיפוש עברי אחד נקי ותמציתי
- אסור מילים כפולות — לעולם לא "ישראל ישראל" או "תל אביב תל אביב"
- אסור מיקום כפול — כלול שם מיקום פעם אחת בלבד
- אסור חזרה על מילות תחום — לעולם לא "סדנאות סדנאות"

החזר JSON בלבד:
{"what_business_does": "", "google_query": "", "ai_question": ""}

CRITICAL: Output ONLY a raw JSON object. No markdown. Start with { and end with }`

  try {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        input: [{ role: 'user', content: prompt }],
        // No web_search — pure reasoning about the business description
      }),
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data.output) return null

    const text = extractXAIText(data.output)
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end <= start) return null

    const parsed = JSON.parse(clean.slice(start, end + 1))
    if (!parsed.google_query || !parsed.ai_question) return null

    return {
      what_business_does: parsed.what_business_does || '',
      google_query: parsed.google_query,
      ai_question: parsed.ai_question,
    }
  } catch {
    return null
  }
}
