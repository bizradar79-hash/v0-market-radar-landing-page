import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRankedAnswer, answerText } from '../dataforseo-llm.ts'
import { buildClientIdentity, isOwnGeoResult } from '../identity.ts'

const chatgpt = `אם אתה מחפש **מיצוי רעמת האריה בישראל**, הייתי מתחיל עם המקומות האלה:

1. **Trust The Fungi דרך Biogaya** — https://www.biogaya.co.il — מיצוי נוזלי מ־100% גופי פרי. ([biogaya.co.il](https://www.biogaya.co.il/x?utm_source=openai))  
2. **MONIDO MUSHROOMZ** — https://monido.co.il — תמצית דו־שלבית מגופי פרי.  
3. **Health By Natures** — https://healthbynatures.co.il — תמצית ישראלית.`

const claude = `אחפש לך מידע.
על סמך חיפושי, הנה המלצות:

1. 
**Funngiz** — funngiz.co.il — מיצוי מרוכז של פטריית רעמת האריה


2. 
**נוטרי די** — nutrid.co.il — כמוסות מיצוי


3. 
**TriTerra Farm** — מיצוי רעמת האריה גופי פרי, גידול בגליל`

const gemini = `להלן 7 המלצות:

1. **Funngiz (פאנגיז)** — https://funngiz.co.il — חווה ישראלית המגדלת את הפטרייה.
2. **ברא צמחים (Bara Herbs)** — https://bara.co.il — חברה ישראלית מובילה.`

test('parses ChatGPT list (inline urls, citations)', () => {
  const r = parseRankedAnswer(chatgpt)
  assert.deepEqual(r.map(x => x.name), ['Trust The Fungi דרך Biogaya', 'MONIDO MUSHROOMZ', 'Health By Natures'])
  assert.equal(r[1].url, 'https://monido.co.il')
  assert.equal(r[2].position, 3)
})

test('parses Claude list (item on the line after the number, bare domains)', () => {
  const r = parseRankedAnswer(claude)
  assert.deepEqual(r.map(x => x.name), ['Funngiz', 'נוטרי די', 'TriTerra Farm'])
  assert.equal(r[0].url, 'https://funngiz.co.il')
  assert.equal(r[2].url, '')
})

test('client detection on parsed answers uses the shared identity matcher', () => {
  const id = buildClientIdentity('פאנגיז', 'https://funngiz.co.il/', { brandName: 'Funngiz' })
  const g = parseRankedAnswer(gemini)
  const own = g.find(r => isOwnGeoResult(r, id))
  assert.equal(own?.position, 1)
  assert.equal(parseRankedAnswer(chatgpt).find(r => isOwnGeoResult(r, id)), undefined)
})

test('answerText joins message sections only', () => {
  assert.equal(answerText({ items: [{ type: 'reasoning', sections: [{ text: 'x' }] }, { type: 'message', sections: [{ text: 'a' }, { text: 'b' }] }] }), 'a\nb')
})

test('parses bulleted answers when there is no numbered list', () => {
  const r = parseRankedAnswer(`הנה כמה המלצות:\n\n- **TriTerra Farm** — triterra.co.il — גידול בגליל\n- **Funngiz** — funngiz.co.il — מיצוי כפול\n- **Real Mushrooms** — realmushrooms.com`)
  assert.deepEqual(r.map(x => [x.name, x.position]), [['TriTerra Farm', 1], ['Funngiz', 2], ['Real Mushrooms', 3]])
})
