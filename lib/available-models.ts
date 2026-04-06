export const AVAILABLE_MODELS = {
  xai: {
    label: 'xAI Grok',
    models: [
      { id: 'grok-4-fast-non-reasoning', label: 'Grok 4 Fast (ברירת מחדל)' },
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-3-fast', label: 'Grok 3 Fast' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (ברירת מחדל)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (מהיר וזול)' },
    ],
  },
  groq: {
    label: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B (ברירת מחדל)' },
      { id: 'llama-3.1-8b-instant', label: 'LLaMA 3.1 8B (מהיר)' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
  },
} as const

export type ModelProvider = keyof typeof AVAILABLE_MODELS
