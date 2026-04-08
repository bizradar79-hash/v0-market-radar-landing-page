export async function callModel(provider: string, modelName: string, prompt: string): Promise<string> {

  if (provider === 'xai') {
    const res = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: modelName,
        tools: [{ type: 'web_search' }],
        input: prompt
      })
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`xAI error ${res.status}: ${errText}`)
    }
    const data = await res.json()
    const text = data.output
      ?.filter((b: any) => b.type === 'message')
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('') || ''
    return text
  }

  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    })
    const rawText = await res.text()
    console.log('Gemini status:', res.status, rawText.slice(0, 200))
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${rawText.slice(0, 200)}`)
    const data = JSON.parse(rawText)

    // Extract real URLs from grounding metadata
    const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    const realUrls: Record<number, string> = {}
    groundingChunks.forEach((chunk: any, i: number) => {
      if (chunk.web?.uri) realUrls[i] = chunk.web.uri
    })

    // Get the text
    let text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''

    // Replace vertexaisearch redirect URLs with real URLs from grounding chunks
    const groundingSupport = data.candidates?.[0]?.groundingMetadata?.groundingSupports || []
    groundingSupport.forEach((support: any) => {
      support.groundingChunkIndices?.forEach((idx: number) => {
        if (realUrls[idx]) {
          text = text.replace(/https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s"]+/g, realUrls[idx])
        }
      })
    })

    return text
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000
      })
    })
    const rawText = await res.text()
    console.log('Groq status:', res.status, rawText.slice(0, 200))
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${rawText.slice(0, 200)}`)
    const data = JSON.parse(rawText)
    return data.choices?.[0]?.message?.content || ''
  }

  throw new Error(`Unknown provider: ${provider}`)
}
