// Smoke test: assembleReport must not throw (e.g. a TDZ/shadowing bug took the
// live report down) and must produce action source links. Mock DB, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleReport } from '../assemble.ts'

const rows: Record<string, any[]> = {
  competitors: [], tenders: [], leads: [{ name: 'מרכז מיכל דליות', website: 'https://michal.example', score: 95, reason: 'מדריכי הורים' }],
  conferences: [], news: [{ title: 'כתבה', url: 'https://ynet.co.il/a', published_at: new Date().toISOString() }],
  competitor_tracking: [], admin_hidden_items: [{ item_type: 'tender', item_key: 'מכרז מוסתר' }],
}
function q(table: string) {
  const res = { data: rows[table] ?? [], error: null }
  const chain: any = new Proxy({}, {
    get(_t, k) {
      if (k === 'then') return (f: any, r: any) => Promise.resolve(res).then(f, r)
      if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null })
      return () => chain
    },
  })
  return chain
}
const db = { from: q }

test('assembleReport runs and links an in-report keyword action to the trends section', async () => {
  const company = {
    id: 'x', name: 'המרכז', website: 'https://c.example', last_sync_at: new Date().toISOString(),
    keyword_trends: { keywords: [{ keyword: 'חרדת קקי', searchVolume: 10, direction: 'rising' }] },
    weekly_actions: { actions: [{ title: "כתיבת מאמר SEO למילת 'חרדת קקי'", priority: 'גבוהה', category: 'SEO', signals: [{ type: 'keyword', label: 'חרדת קקי' }] }] },
  }
  const r = await assembleReport(db, 'x', company)
  assert.ok(Array.isArray(r.actions))
  const a = r.actions.find((x) => x.title.includes('חרדת קקי'))
  if (a && r.trends.length) assert.equal(a.links?.[0]?.url, '#sec-trends')
})
