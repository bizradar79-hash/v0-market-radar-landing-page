import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY! })
}

export async function analyzeWithAI(prompt: string): Promise<any> {
  const result = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `אתה יועץ אסטרטגי בכיר המתמחה בשוק הישראלי.
כללי ברזל:
1. אף פעם אל תמציא URLs, שמות חברות או נתונים שלא קיבלת
2. השתמש רק במידע שסופק לך
3. החזר JSON תקני בלבד - ללא markdown, ללא הסברים, ללא טקסט לפני או אחרי ה-JSON
4. התחל את התשובה ישירות עם { ו-סיים עם }
5. דבר בעברית`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 4000,
  })

  const raw = result.choices[0].message.content ?? ''

  // Try to extract JSON — handle model adding prose before/after
  const extracted = extractJSON(raw)
  if (!extracted) {
    console.error('analyzeWithAI: could not extract JSON from:', raw.slice(0, 500))
    throw new Error(`Model did not return valid JSON. Raw: ${raw.slice(0, 200)}`)
  }

  return extracted
}

function extractJSON(text: string): any {
  // Strip markdown code fences
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()

  // Try direct parse first
  try {
    return JSON.parse(clean)
  } catch {}

  // Find first { or [ and last } or ]
  const firstBrace = clean.indexOf('{')
  const firstBracket = clean.indexOf('[')
  let start = -1

  if (firstBrace === -1 && firstBracket === -1) return null
  if (firstBrace === -1) start = firstBracket
  else if (firstBracket === -1) start = firstBrace
  else start = Math.min(firstBrace, firstBracket)

  const openChar = clean[start]
  const closeChar = openChar === '{' ? '}' : ']'
  const end = clean.lastIndexOf(closeChar)

  if (end <= start) return null

  try {
    return JSON.parse(clean.slice(start, end + 1))
  } catch {
    return null
  }
}
