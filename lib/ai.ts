import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function analyzeWithAI(prompt: string): Promise<any> {
  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `אתה יועץ אסטרטגי בכיר ברמת McKinsey המתמחה בשוק הישראלי.
אתה מומחה ב: אינטליגנציה תחרותית, גילוי הזדמנויות, ניתוח שוק, lead generation.
כללי ברזל:
1. אף פעם אל תמציא URLs, שמות חברות או נתונים שלא קיבלת
2. השתמש רק במידע שסופק לך
3. החזר JSON תקני בלבד - ללא markdown, ללא הסברים
4. כל המלצה חייבת להיות מעשית וניתנת לביצוע תוך 7 ימים
5. דבר בעברית, חשוב בעברית, פעל בשוק הישראלי`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 4000,
  })
  
  const text = result.choices[0].message.content!
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
  
  return JSON.parse(text)
}
