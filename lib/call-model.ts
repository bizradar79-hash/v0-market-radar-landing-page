import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function callModel(provider: string, modelName: string, prompt: string): Promise<string> {
  if (provider === 'xai') {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName,
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search' }],
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.output) throw new Error(`xAI error: ${JSON.stringify(data).slice(0, 200)}`)
    return (data.output as any[])
      .filter(i => i.type === 'message')
      .flatMap(i => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text as string)
      .join('')
  }

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: modelName })
    const result = await model.generateContent(prompt)
    return result.response.text()
  }

  if (provider === 'groq') {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
    const result = await groq.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    })
    return result.choices[0].message.content ?? ''
  }

  throw new Error(`Unknown provider: ${provider}`)
}
