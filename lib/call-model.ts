export async function callModel(provider: string, modelName: string, prompt: string): Promise<string> {

  if (provider === 'xai') {
    const res = await fetch('https://api.x.ai/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', description: 'Search the web for current information and news' }],
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const rawText = await res.text()
    console.log('xAI status:', res.status, rawText.slice(0, 300))
    if (!res.ok) throw new Error(`xAI error ${res.status}: ${rawText.slice(0, 200)}`)
    const data = JSON.parse(rawText)
    return data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || ''
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
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
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
