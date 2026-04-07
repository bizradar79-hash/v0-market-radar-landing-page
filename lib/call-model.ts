import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ModelProvider } from './available-models'

export interface ModelResult {
  text: string
  tokens_used: number
  latency_ms: number
}

export async function callModel(
  provider: ModelProvider,
  modelName: string,
  prompt: string,
): Promise<ModelResult> {
  const start = Date.now()

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
    const text = (data.output as any[])
      .filter(i => i.type === 'message')
      .flatMap(i => i.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text as string)
      .join('')
    return { text, tokens_used: data.usage?.total_tokens ?? 0, latency_ms: Date.now() - start }
  }

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: modelName })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const tokens = result.response.usageMetadata?.totalTokenCount ?? 0
    return { text, tokens_used: tokens, latency_ms: Date.now() - start }
  }

  if (provider === 'groq') {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
    const result = await groq.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
    })
    const text = result.choices[0].message.content ?? ''
    return { text, tokens_used: result.usage?.total_tokens ?? 0, latency_ms: Date.now() - start }
  }

  throw new Error(`Unknown provider: ${provider}`)
}
