/**
 * Per-module AI cost instrumentation.
 *
 * Every outbound AI call in the scan (xAI/Grok, OpenAI, Gemini) is routed through
 * a ScanCostCollector so we can answer "where does the money go?" with EXACT
 * per-module numbers — before optimizing anything.
 *
 * Design:
 *   • Each scan MODULE route creates one collector tagged with its module label.
 *   • After each AI call it records { provider, model, webSearch, usage, ms }.
 *   • The collector computes USD per call from the PRICING table and aggregates.
 *   • flush() does ONE read-modify-write of companies.scan_control.cost_breakdown
 *     at the end of the route (in a finally), so parallel in-module calls (e.g.
 *     GEO's 9 concurrent engine calls) never race the JSONB column — they only
 *     mutate an in-memory array, and a single write lands per module.
 *
 * The orchestrator dispatches modules SEQUENTIALLY and awaits each module's HTTP
 * response (which only returns after flush), so per-module writes never overlap
 * each other or the breaker's own scan_control writes.
 *
 * Everything degrades open: missing scan_control, missing usage fields, or a DB
 * error never throws into the caller — instrumentation must never break a scan.
 */

import { createServerClient } from '@supabase/ssr'

// ── Pricing ─────────────────────────────────────────────────────────────────
// USD per 1M tokens, plus a per-call web-search surcharge. These are the single
// source of truth — update here when provider rates change. Rough current rates
// (2026); override the whole table via COST_PRICING_JSON env if needed.
export interface ModelPrice {
  inUSDPerM: number   // input / prompt tokens, USD per 1,000,000
  outUSDPerM: number  // output / completion tokens, USD per 1,000,000
  webSearchUSD: number // surcharge per call that used a web_search/live-search tool (per source if known)
}

const DEFAULT_PRICING: Record<string, ModelPrice> = {
  // xAI Grok — grok-4-fast-non-reasoning.
  // CALIBRATION (web_search surcharge): xAI bills Live Search at ~$0.025/SOURCE
  // and a typical agentic web_search call consumes many sources, but the
  // Responses API usually omits `num_sources_used`, so the tracker defaulted to
  // 1 source/call and under-reported the search portion. A measured weekly scan
  // came in at ~$0.86 real xAI vs ~$0.37 tracked (~2.3x under), with the entire
  // gap on Grok web_search calls. Raising the per-call surcharge 0.025 → 0.065
  // (~10 sources × $0.025, the dominant real cost) brings the tracker total in
  // line. Tunable without redeploy via COST_PRICING_JSON.
  'grok-4-fast-non-reasoning': { inUSDPerM: 0.20, outUSDPerM: 0.50, webSearchUSD: 0.065 },
  'grok-4-fast': { inUSDPerM: 0.20, outUSDPerM: 0.50, webSearchUSD: 0.065 },
  // OpenAI — gpt-5-mini (GEO engine). web_search tool ≈ $0.01 / call.
  'gpt-5-mini': { inUSDPerM: 0.25, outUSDPerM: 2.00, webSearchUSD: 0.01 },
  'gpt-4o-mini': { inUSDPerM: 0.15, outUSDPerM: 0.60, webSearchUSD: 0.01 },
  // Google — gemini-2.5-flash. No separate search billing here.
  'gemini-2.5-flash': { inUSDPerM: 0.30, outUSDPerM: 2.50, webSearchUSD: 0 },
  'gemini-2.0-flash': { inUSDPerM: 0.10, outUSDPerM: 0.40, webSearchUSD: 0 },
  // Groq (llama) — very cheap; tracked for completeness.
  'llama-3.3-70b-versatile': { inUSDPerM: 0.59, outUSDPerM: 0.79, webSearchUSD: 0 },
  'llama-3.1-8b-instant': { inUSDPerM: 0.05, outUSDPerM: 0.08, webSearchUSD: 0 },
  // DataForSEO Google Trends explore/live — flat ~$0.002 per call, no tokens.
  'google_trends_explore': { inUSDPerM: 0, outUSDPerM: 0, webSearchUSD: 0.002 },
  // DataForSEO Google Ads search volume (live) — flat ~$0.003 per call (covers a
  // whole keyword batch), no tokens.
  'google_ads_search_volume': { inUSDPerM: 0, outUSDPerM: 0, webSearchUSD: 0.003 },
  // DataForSEO Labs keyword suggestions (live) — flat ~$0.011 per call, no tokens.
  'keyword_suggestions': { inUSDPerM: 0, outUSDPerM: 0, webSearchUSD: 0.011 },
}

function loadPricing(): Record<string, ModelPrice> {
  const raw = process.env.COST_PRICING_JSON
  if (!raw) return DEFAULT_PRICING
  try {
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PRICING, ...parsed }
  } catch {
    return DEFAULT_PRICING
  }
}

const PRICING = loadPricing()

// Fallback price for an unknown model — assume a cheap mid-tier so we still get a
// non-zero estimate rather than silently dropping the call's cost.
const FALLBACK_PRICE: ModelPrice = { inUSDPerM: 0.30, outUSDPerM: 1.00, webSearchUSD: 0.01 }

export function priceFor(model: string): ModelPrice {
  if (PRICING[model]) return PRICING[model]
  // Loose prefix match so e.g. 'gpt-5-mini-2026-01' still resolves.
  const key = Object.keys(PRICING).find(k => model.startsWith(k) || k.startsWith(model))
  return key ? PRICING[key] : FALLBACK_PRICE
}

export type AiProvider = 'xai' | 'openai' | 'gemini' | 'groq' | 'dataforseo'

export interface CostEntry {
  module: string
  provider: AiProvider
  model: string
  promptTokens: number
  completionTokens: number
  webSearch: boolean
  costUSD: number
  ms: number
}

export interface ModuleCost { calls: number; costUSD: number; promptTokens: number; completionTokens: number }
export interface CostBreakdown { [module: string]: ModuleCost }

// ── Usage extraction (defensive across provider shapes) ─────────────────────
function extractUsage(
  provider: AiProvider,
  data: any,
): { promptTokens: number; completionTokens: number; sources: number } {
  if (!data || typeof data !== 'object') return { promptTokens: 0, completionTokens: 0, sources: 0 }
  if (provider === 'gemini') {
    const u = data.usageMetadata || {}
    return {
      promptTokens: Number(u.promptTokenCount) || 0,
      completionTokens: Number(u.candidatesTokenCount) || 0,
      sources: 0,
    }
  }
  // xAI + OpenAI: Responses API (input_tokens/output_tokens) or chat-style
  // (prompt_tokens/completion_tokens). num_sources_used appears on xAI live search.
  const u = data.usage || {}
  return {
    promptTokens: Number(u.input_tokens ?? u.prompt_tokens) || 0,
    completionTokens: Number(u.output_tokens ?? u.completion_tokens) || 0,
    sources: Number(u.num_sources_used ?? u.num_sources) || 0,
  }
}

function computeCost(model: string, promptTokens: number, completionTokens: number, webSearch: boolean, sources: number): number {
  const p = priceFor(model)
  const tokenCost = (promptTokens / 1e6) * p.inUSDPerM + (completionTokens / 1e6) * p.outUSDPerM
  const searchCost = webSearch ? p.webSearchUSD * Math.max(1, sources || 1) : 0
  return tokenCost + searchCost
}

function getAdminDb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

/**
 * Collects every AI call for ONE module route, then flushes the aggregate to
 * scan_control.cost_breakdown in a single write.
 */
export class ScanCostCollector {
  readonly companyId: string
  readonly module: string
  private entries: CostEntry[] = []

  constructor(companyId: string | undefined | null, module: string) {
    this.companyId = companyId || ''
    this.module = module
  }

  /** Record one AI call. Pass the raw provider response as `data` to read usage. */
  add(opts: {
    provider: AiProvider
    model: string
    webSearch?: boolean
    data?: any
    ms?: number
    // Optional explicit token counts (when the caller already parsed usage).
    promptTokens?: number
    completionTokens?: number
  }): void {
    try {
      const webSearch = !!opts.webSearch
      let promptTokens = opts.promptTokens ?? 0
      let completionTokens = opts.completionTokens ?? 0
      let sources = 0
      if (opts.data && (opts.promptTokens == null)) {
        const u = extractUsage(opts.provider, opts.data)
        promptTokens = u.promptTokens
        completionTokens = u.completionTokens
        sources = u.sources
      }
      const costUSD = computeCost(opts.model, promptTokens, completionTokens, webSearch, sources)
      this.entries.push({
        module: this.module,
        provider: opts.provider,
        model: opts.model,
        promptTokens,
        completionTokens,
        webSearch,
        costUSD,
        ms: opts.ms ?? 0,
      })
    } catch {
      /* instrumentation must never throw into the caller */
    }
  }

  /** Aggregate of this collector's in-memory entries. */
  summary(): ModuleCost {
    return this.entries.reduce<ModuleCost>(
      (acc, e) => ({
        calls: acc.calls + 1,
        costUSD: acc.costUSD + e.costUSD,
        promptTokens: acc.promptTokens + e.promptTokens,
        completionTokens: acc.completionTokens + e.completionTokens,
      }),
      { calls: 0, costUSD: 0, promptTokens: 0, completionTokens: 0 },
    )
  }

  /**
   * Merge this module's aggregate into companies.scan_control.cost_breakdown.
   * Only writes while a scan is actively running (so manual single-module calls
   * outside a scan don't pollute a finished scan's breakdown). Best-effort.
   */
  async flush(): Promise<void> {
    if (!this.companyId || this.entries.length === 0) return
    const sum = this.summary()
    try {
      const db = getAdminDb()
      const { data } = await db.from('companies').select('scan_control').eq('id', this.companyId).single()
      const control: any = data?.scan_control
      if (!control || control.status !== 'running') return // not an active scan
      const cb: CostBreakdown = (control.cost_breakdown && typeof control.cost_breakdown === 'object')
        ? control.cost_breakdown : {}
      const prev = cb[this.module] || { calls: 0, costUSD: 0, promptTokens: 0, completionTokens: 0 }
      cb[this.module] = {
        calls: prev.calls + sum.calls,
        costUSD: round4(prev.costUSD + sum.costUSD),
        promptTokens: prev.promptTokens + sum.promptTokens,
        completionTokens: prev.completionTokens + sum.completionTokens,
      }
      control.cost_breakdown = cb
      await db.from('companies').update({ scan_control: control } as any).eq('id', this.companyId)
      // Keep the per-module detail in the logs for a granular audit trail.
      console.log(`[cost] ${this.module}: ${sum.calls} calls, $${sum.costUSD.toFixed(4)} (${sum.promptTokens}+${sum.completionTokens} tok)`)
    } catch (e: any) {
      console.error('[cost] flush failed:', e?.message)
    }
  }
}

function round4(n: number): number { return Math.round(n * 10000) / 10000 }

/** Sum a cost_breakdown into a single total row (calls, costUSD, tokens). */
export function totalOfBreakdown(cb: CostBreakdown | null | undefined): ModuleCost {
  const base: ModuleCost = { calls: 0, costUSD: 0, promptTokens: 0, completionTokens: 0 }
  if (!cb) return base
  for (const [k, v] of Object.entries(cb)) {
    if (k === 'total' || !v) continue
    base.calls += v.calls || 0
    base.costUSD += v.costUSD || 0
    base.promptTokens += v.promptTokens || 0
    base.completionTokens += v.completionTokens || 0
  }
  base.costUSD = round4(base.costUSD)
  return base
}

/** Render a sorted (most expensive first) plaintext table for scan-end logging. */
export function formatBreakdownTable(cb: CostBreakdown | null | undefined): string {
  if (!cb) return '(no cost data)'
  const rows = Object.entries(cb)
    .filter(([k]) => k !== 'total')
    .map(([module, v]) => ({ module, ...v }))
    .sort((a, b) => b.costUSD - a.costUSD)
  const total = totalOfBreakdown(cb)
  const lines = [
    'module                | calls | $',
    '----------------------+-------+----------',
    ...rows.map(r => `${r.module.padEnd(21)} | ${String(r.calls).padStart(5)} | $${r.costUSD.toFixed(4)}`),
    '----------------------+-------+----------',
    `${'TOTAL'.padEnd(21)} | ${String(total.calls).padStart(5)} | $${total.costUSD.toFixed(4)}`,
  ]
  return lines.join('\n')
}
