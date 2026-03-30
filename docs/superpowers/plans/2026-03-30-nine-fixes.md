# Nine Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 independent issues: sidebar reorder, distribution channels module, review analysis auto-trigger, SEO filter, GEO engine differentiation, industry trends specificity, trend sparkline modals, news 404 handling, and reports rebuild.

**Architecture:** Each task targets isolated files with minimal cross-cutting changes. Tasks 1+2 are linked (sidebar + new page). Tasks 3–9 are fully independent. All are client/server Next.js App Router with Supabase as the database and xAI Grok as the AI provider.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (client+server), xAI Grok API (`grok-4-fast-non-reasoning`), shadcn/ui, Tailwind CSS, lucide-react

---

## File Map

| Task | Files to Create | Files to Modify |
|------|----------------|-----------------|
| 1 Sidebar | — | `components/app/app-sidebar.tsx` |
| 2 Distribution Channels | `app/app/distribution-channels/page.tsx` | `components/app/app-sidebar.tsx`, `app/api/sync/run/route.ts` |
| 3 Review Analysis | — | `app/app/profile/page.tsx` |
| 4 SEO Filter | — | `app/app/seo-geo/page.tsx`, `app/api/generate-seo-ranking/route.ts` |
| 5 GEO Engines | — | `app/api/generate-geo-ranking/route.ts`, `app/app/seo-geo/page.tsx` |
| 6 Industry Trends | — | `app/api/industry-trends/route.ts` |
| 7 Trend Graphs | — | `app/app/trends/page.tsx` |
| 8 News 404 | — | `app/api/generate-news/route.ts`, `app/app/news/page.tsx` |
| 9 Reports Rebuild | `app/api/generate-weekly-report/route.ts` | `app/api/weekly-report/route.ts`, `app/app/reports/page.tsx`, `app/api/sync/run/route.ts` |

---

## Task 1: Sidebar Reorder

**Files:**
- Modify: `components/app/app-sidebar.tsx:47–78` (getNavGroups function)

**Target order:**
- Group 1 "💼 פרופיל": דשבורד → פרופיל עסקי → ערוצי הפצה
- Group 2 "📊 מודיעין שוק": מתחרים → SEO/GEO → טרנדים → חדשות
- Group 3 "🌱 מנוע צמיחה": מרכז הזדמנויות
- Group 4 "🤝 פיתוח עסקי": מכרזים → כנסים
- Group 5 "⚙️ ניהול המערכת": דוחות → הגדרות

- [ ] **Step 1: Replace `getNavGroups` in `components/app/app-sidebar.tsx`**

Replace the entire `const getNavGroups = ...` block (lines 47–79) with:

```tsx
import { Truck } from "lucide-react"  // add to existing import block

const getNavGroups = (counts: NavCounts) => [
  {
    title: "💼 פרופיל",
    items: [
      { href: "/app/dashboard", label: "דשבורד", icon: LayoutDashboard },
      { href: "/app/profile", label: "פרופיל עסקי", icon: UserCircle },
      { href: "/app/distribution-channels", label: "ערוצי הפצה", icon: Truck },
    ],
  },
  {
    title: "📊 מודיעין שוק",
    items: [
      { href: "/app/competitors", label: "מתחרים", icon: Target, badge: counts.competitors || undefined },
      { href: "/app/seo-geo", label: "דירוג SEO/GEO", icon: BarChart2 },
      { href: "/app/trends", label: "טרנדים", icon: TrendingUp, badge: counts.trends || undefined },
      { href: "/app/news", label: "חדשות", icon: Newspaper, badge: counts.news || undefined },
    ],
  },
  {
    title: "🌱 מנוע צמיחה",
    items: [
      { href: "/app/leads", label: "מרכז הזדמנויות", icon: Users, badge: counts.leads || undefined },
    ],
  },
  {
    title: "🤝 פיתוח עסקי",
    items: [
      { href: "/app/tenders", label: "מכרזים", icon: FileText, badge: counts.tenders || undefined },
      { href: "/app/conferences", label: "כנסים", icon: Calendar, badge: counts.conferences || undefined },
    ],
  },
  {
    title: "⚙️ ניהול המערכת",
    items: [
      { href: "/app/reports", label: "דוחות", icon: FileBarChart },
      { href: "/app/settings", label: "הגדרות", icon: Settings },
    ],
  },
]
```

- [ ] **Step 2: Add `Truck` to lucide imports**

In the existing import block, add `Truck` to the list.

- [ ] **Step 3: Verify sidebar renders correctly (visual check)**

Open `/app/dashboard` in browser — sidebar should show new order with "ערוצי הפצה" below "פרופיל עסקי".

- [ ] **Step 4: Commit**
```bash
git add components/app/app-sidebar.tsx
git commit -m "feat: reorder sidebar — profile first, distribution channels added"
```

---

## Task 2: Distribution Channels Page

**Files:**
- Create: `app/app/distribution-channels/page.tsx`
- Modify: `app/api/sync/run/route.ts` (add distribution_channels refresh step)

### Context
`companies.distribution_channels` is a JSONB column holding a `string[]` array of channel names (populated by `analyze-business-deep`). Display each channel as a card with name, contextual description (generated client-side from the name), potential badge, and "סמן כפעיל" toggle stored in `localStorage` (no DB column needed for active status).

- [ ] **Step 1: Create `app/app/distribution-channels/page.tsx`**

```tsx
"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Truck, CheckCircle2, Circle, Loader2, Info } from "lucide-react"

const CHANNEL_META: Record<string, { description: string; potential: 'גבוה' | 'בינוני' | 'נמוך' }> = {
  "אתר אינטרנט": { description: "נוכחות דיגיטלית ישירה — לקוחות מוצאים אתכם בגוגל ומבצעים פעולה", potential: "גבוה" },
  "מכירה ישירה": { description: "פגישות, שיחות ומכירה face-to-face עם לקוחות פוטנציאליים", potential: "גבוה" },
  "רשתות חברתיות": { description: "Instagram, Facebook, LinkedIn — בניית קהל ולידים אורגניים", potential: "גבוה" },
  "מפיצים": { description: "שותפי הפצה שמוכרים את המוצר שלכם ללקוחותיהם", potential: "בינוני" },
  "שותפים עסקיים": { description: "הסכמי שיתוף פעולה שמניבים הפניות הדדיות", potential: "גבוה" },
  "חנויות": { description: "נקודות מכירה פיזיות — ישירות או דרך קמעונאים", potential: "בינוני" },
  "B2B פגישות": { description: "תהליך מכירה מול לקוחות עסקיים בפגישות ומצגות", potential: "גבוה" },
  "קטלוגים": { description: "חומרי שיווק פיזיים/דיגיטליים שמציגים את המוצרים", potential: "נמוך" },
  "פלטפורמות מקוונות": { description: "מכירה דרך מרקטפלייסים — Amazon, Yad2, אחרים", potential: "בינוני" },
}

function getChannelMeta(name: string) {
  return CHANNEL_META[name] ?? {
    description: `ערוץ הפצה: ${name}`,
    potential: "בינוני" as const,
  }
}

const POTENTIAL_COLOR = {
  "גבוה": "bg-green-100 text-green-700 border-green-200",
  "בינוני": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "נמוך": "bg-gray-100 text-gray-500 border-gray-200",
}

const ACTIVE_KEY = "distribution_channels_active"

function loadActive(): Set<string> {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch { return new Set() }
}

function saveActive(active: Set<string>) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify([...active]))
}

export default function DistributionChannelsPage() {
  const [channels, setChannels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [syncDates, setSyncDates] = useState<{ last_sync_at: string | null; next_sync_at: string | null } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    setActive(loadActive())
    loadChannels()
  }, [])

  async function loadChannels() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('companies')
      .select('distribution_channels, last_sync_at, next_sync_at')
      .eq('id', user.id)
      .single()
    if (data?.distribution_channels) {
      setChannels(Array.isArray(data.distribution_channels) ? data.distribution_channels : [])
    }
    if (data) setSyncDates({ last_sync_at: (data as any).last_sync_at ?? null, next_sync_at: (data as any).next_sync_at ?? null })
    setLoading(false)
  }

  function toggleActive(name: string) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      saveActive(next)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />ערוצי הפצה
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          הערוצים שדרכם העסק שלך מגיע ללקוחות — מזוהים אוטומטית מהפרופיל העסקי
        </p>
        {syncDates && (
          <p className="text-xs text-muted-foreground mt-1">
            עודכן: {syncDates.last_sync_at ? new Date(syncDates.last_sync_at).toLocaleDateString('he-IL') : '—'} | עדכון הבא: {syncDates.next_sync_at ? new Date(syncDates.next_sync_at).toLocaleDateString('he-IL') : '—'}
          </p>
        )}
      </div>

      {channels.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">ערוצי הפצה לא זוהו עדיין</p>
              <p className="text-sm text-muted-foreground mt-1">
                ערוצי ההפצה מזוהים אוטומטית בעת ניתוח הפרופיל העסקי
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>סמן ערוצים שאתה כבר משתמש בהם — זה יעזור לאסטרטגיית הצמיחה שלך</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => {
              const meta = getChannelMeta(channel)
              const isActive = active.has(channel)
              return (
                <Card
                  key={channel}
                  className={`transition-all ${isActive ? 'border-primary/40 bg-primary/5 shadow-sm' : 'hover:shadow-sm'}`}
                >
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{channel}</span>
                      <Badge className={`text-xs border ${POTENTIAL_COLOR[meta.potential]}`}>
                        {meta.potential}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="w-full"
                      onClick={() => toggleActive(channel)}
                    >
                      {isActive
                        ? <><CheckCircle2 className="ml-2 h-3.5 w-3.5" />פעיל</>
                        : <><Circle className="ml-2 h-3.5 w-3.5" />סמן כפעיל</>
                      }
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {active.size} מתוך {channels.length} ערוצים מסומנים כפעילים
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit page**
```bash
git add app/app/distribution-channels/page.tsx
git commit -m "feat: add distribution channels page"
```

---

## Task 3: Business Profile — Auto-Trigger Review Analysis

**Files:**
- Modify: `app/app/profile/page.tsx`

**Problem:** `loadReviewAnalysis` is never called automatically on page load. If `review_analysis` is null in the DB, the user sees "ניתוח הביקורות יתעדכן בסנכרון השבועי" with no way to trigger it.

**Fix:** In `loadData()`, after loading `review_analysis`, if it's null trigger `loadReviewAnalysis()` automatically.

- [ ] **Step 1: Modify `loadData` in `app/app/profile/page.tsx`**

Find this block (around line 231):
```tsx
if (data.review_analysis && typeof data.review_analysis === 'object') {
  setReviewAnalysis(data.review_analysis as ReviewAnalysis)
}
```

Replace with:
```tsx
if (data.review_analysis && typeof data.review_analysis === 'object') {
  setReviewAnalysis(data.review_analysis as ReviewAnalysis)
} else {
  // Auto-trigger review analysis if not yet available
  loadReviewAnalysis(false)
}
```

Note: `loadReviewAnalysis` is defined later in the file — move its declaration above `loadData`, or add a forward-declared `let` ref. Since both are in the same component scope (hooks pattern), calling `loadReviewAnalysis()` inside `loadData()` will work as they're both `async function` declarations hoisted in the function body — this is valid JS/TS.

- [ ] **Step 2: Find the review analysis display section and verify it shows the source breakdown table**

Search for "ניתוח הביקורות יתעדכן" in the file. The empty state currently shows this text. Replace it with an auto-loading state:

Find:
```tsx
// wherever this text appears in JSX
"ניתוח הביקורות יתעדכן בסנכרון השבועי"
```

Replace with a loading indicator or nothing (since we now auto-trigger):
```tsx
{loadingReviewAnalysis ? (
  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>מנתח ביקורות...</span>
  </div>
) : (
  <p className="text-sm text-muted-foreground py-4">לא נמצאו ביקורות לעסק זה</p>
)}
```

- [ ] **Step 3: Add source breakdown table to review display**

Find where `reviewAnalysis` is rendered. Ensure it displays a sources table. After the existing sentiment/themes display, add:

```tsx
{reviewAnalysis.sources && reviewAnalysis.sources.length > 0 && (
  <div className="rounded-lg border overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/40 border-b">
          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">מקור</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">דירוג</th>
          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">ביקורות</th>
        </tr>
      </thead>
      <tbody>
        {(reviewAnalysis.sources as ReviewSource[]).map((src, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-2 px-3">
              {src.url ? (
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {src.name}
                </a>
              ) : src.name}
            </td>
            <td className="py-2 px-3">
              {src.rating != null ? (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {src.rating.toFixed(1)}
                </span>
              ) : '—'}
            </td>
            <td className="py-2 px-3 text-muted-foreground">{src.review_count ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 4: Commit**
```bash
git add app/app/profile/page.tsx
git commit -m "fix: auto-trigger review analysis on profile page load"
```

---

## Task 4: SEO Filter Fix

**Files:**
- Modify: `app/app/seo-geo/page.tsx`
- Modify: `app/api/generate-seo-ranking/route.ts` (ensure `is_sponsored` is populated)

**Problem:** The filter tabs show identical results because `is_sponsored` may not be set on results, so all are treated as organic.

**Fix Part A — API:** Ensure the SEO ranking API sets `is_sponsored: boolean` correctly on each result.

- [ ] **Step 1: Read `app/api/generate-seo-ranking/route.ts` — check `is_sponsored` population**

The prompt to Grok must explicitly ask for `is_sponsored` per result. Find the JSON template in the prompt and verify it includes `"is_sponsored": false`. If not:

Find the prompt section that describes the result format and add:
```
"is_sponsored": true/false (true se é anúncio pago/Google Ads)
```

And in the normalization code where results are mapped, ensure:
```ts
is_sponsored: typeof r.is_sponsored === 'boolean' ? r.is_sponsored : false,
```

**Fix Part B — UI:** Add empty state for filter tabs.

- [ ] **Step 2: In `app/app/seo-geo/page.tsx`, find `filterResults` function**

Current code:
```tsx
function filterResults(results: QueryVariantResult[] | undefined): QueryVariantResult[] {
  if (!results) return []
  if (seoFilter === 'organic') return results.filter(r => !r.is_sponsored)
  if (seoFilter === 'sponsored') return results.filter(r => r.is_sponsored)
  return results
}
```

This is already correct. The issue is likely in the data — `is_sponsored` is `undefined` on all results so the filter has no effect. The fix is in the API (Step 1).

- [ ] **Step 3: Add empty-tab message when filter yields no results**

In the variants table body, after rendering rows, add below the `tbody`:
```tsx
{/* Show message when filter eliminates all results */}
{seoRanking.queryVariants &&
  filterVariants(seoRanking.queryVariants).length === 0 && (
  <tr>
    <td colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
      {seoFilter === 'sponsored'
        ? 'לא נמצאו תוצאות ממומנות לשאילתות אלו'
        : 'לא נמצאו תוצאות אורגניות'}
    </td>
  </tr>
)}
```

This must be inside `<tbody>` or rendered as a separate row below the table.

- [ ] **Step 4: Commit**
```bash
git add app/app/seo-geo/page.tsx app/api/generate-seo-ranking/route.ts
git commit -m "fix: SEO filter - ensure is_sponsored populated and empty-tab message"
```

---

## Task 5: GEO Engine Differentiation + Info Boxes

**Files:**
- Modify: `app/api/generate-geo-ranking/route.ts` (buildEnginePrompt)
- Modify: `app/app/seo-geo/page.tsx` (add info boxes per tab)

**Problem:** Gemini and Grok prompts both ask Grok to "search the web for what X engine says". Since Grok's web_search finds similar content for both, results overlap.

**Fix:** Make prompts structurally different:
- `gemini`: Ask Grok to directly search for what Gemini AI recommends for the query (search for recent Gemini conversation results, blog posts, screenshots)
- `grok`: Use Grok's own search to find best current results (don't frame as finding another engine's answers)

Add 60% overlap validation: if two engine results share >60% names, add "ישראל" + specific qualifier to the query and retry once.

- [ ] **Step 1: Update `buildEnginePrompt` in `app/api/generate-geo-ranking/route.ts`**

Replace the `bases` object:
```ts
const bases: Record<Engine, string> = {
  general: `חפש בגוגל: מי הם 10 העסקים המובילים בישראל עבור "${question}"?
השתמש בחיפוש אינטרנט כדי למצוא תוצאות גוגל אמיתיות ועדכניות לשאלה זו.
הצג רשימה ממוינת לפי חשיבות/דירוג בגוגל.`,

  chatgpt: `חפש באינטרנט: מה ChatGPT (של OpenAI) ממליץ כאשר שואלים אותו "${question}" בישראל?
חפש בפורומים ישראליים, Reddit, Twitter/X — תיעוד של תשובות ChatGPT לשאלה זו.
כלול רק עסקים שמופיעים בתשובות ChatGPT בפועל.`,

  gemini: `חפש באינטרנט: מה Google Gemini מציג כשמישהו שואל אותו בעברית "${question}" בישראל?
חפש screenshots, פוסטים, תיעוד של תשובות Gemini לשאלה זו בהקשר ישראלי.
גלה אילו עסקים ישראליים Google Gemini ממליץ עליהם ספציפית — לא תוצאות גוגל רגילות.`,

  grok: `השתמש בחיפוש האינטרנט החי שלך עכשיו: מה העסקים הטובים ביותר בישראל עבור "${question}"?
חפש מידע עדכני ביותר — 2024-2025. עדיפות לידיעות חדשות, סקירות, ואתרים ישראליים.
זה חיפוש שלך — לא מה שמנוע אחר ממליץ.`,
}
```

- [ ] **Step 2: Add overlap detection in `POST` handler**

After running all 4 engines, add overlap check between gemini and grok. Find the section where `engines` object is built and add:

```ts
// Overlap detection — if gemini and grok share >60% results, retry grok with enhanced query
const geminiNames = new Set((enginesData.gemini?.results || []).map((r: any) => (r.name || '').toLowerCase()))
const grokNames = (enginesData.grok?.results || []).map((r: any) => (r.name || '').toLowerCase())
if (geminiNames.size > 0 && grokNames.length > 0) {
  const overlap = grokNames.filter(n => geminiNames.has(n)).length / grokNames.length
  if (overlap > 0.6) {
    // Retry grok with more specific query
    const specificQuestion = `${question} ישראל 2025 מובילים`
    enginesData.grok = await runGeoQuestion(specificQuestion, companyName, website, competitorNames, 'grok')
  }
}
```

- [ ] **Step 3: Add engine info boxes in `app/app/seo-geo/page.tsx`**

Find the engine tabs section in the GEO card. After the tab buttons row, add an info box before the results:

```tsx
const ENGINE_INFO: Record<string, string> = {
  general: "תוצאות אורגניות בגוגל לשאילתה זו",
  chatgpt: "מה ChatGPT ממליץ כשמישהו שואל שאלה זו",
  gemini: "מה Google Gemini מציג בתשובה לשאלה זו",
  grok: "תוצאות חיפוש בזמן אמת של Grok לשאילתה זו",
}

// Render this above the engine results:
{ENGINE_INFO[selectedGeoEngine] && (
  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border">
    📡 {ENGINE_INFO[selectedGeoEngine]}
  </p>
)}
```

- [ ] **Step 4: Commit**
```bash
git add app/api/generate-geo-ranking/route.ts app/app/seo-geo/page.tsx
git commit -m "fix: GEO engine differentiation + info boxes per tab"
```

---

## Task 6: Industry Trends — Use Full Business Profile

**Files:**
- Modify: `app/api/industry-trends/route.ts` (buildSearchQuery + prompt)

**Problem:** `buildSearchQuery` only uses `coreActivity` or `industryTags[0]`, producing generic queries. The prompt doesn't include products, target market, competitors, or keywords.

**Fix:** Build a richer search query using all available profile data.

- [ ] **Step 1: Replace `buildSearchQuery` in `app/api/industry-trends/route.ts`**

```ts
function buildSearchQuery(bp: BusinessProfile | null, company: any): string {
  const year = new Date().getFullYear()
  if (!bp) {
    const base = company?.industry || company?.description || 'עסקים'
    return `${base} טרנד ${year} ישראל`
  }

  // Build a rich, specific query
  const parts: string[] = []
  if (bp.coreActivity) parts.push(bp.coreActivity.split(/\s+/).slice(0, 5).join(' '))
  if (bp.industryTags?.length) parts.push(bp.industryTags[0])
  if (bp.products?.[0]?.name) parts.push(bp.products[0].name)
  const markets = bp.geographicMarkets?.includes('ישראל') ? 'ישראל' : bp.geographicMarkets?.[0] || 'ישראל'

  const base = parts.filter(Boolean).join(' ')
  return `${base} טרנד ${year} ${markets}`
}
```

- [ ] **Step 2: Enrich the prompt with business context**

After `const searchQuery = buildSearchQuery(...)`, build a context string and add it to the prompt:

```ts
const businessContext = bp ? `
תחום ספציפי: ${bp.coreActivity || ''}
מוצרים/שירותים: ${bp.products?.map(p => p.name).join(', ') || ''}
קהל יעד: ${bp.targetAudiences?.join(', ') || ''}
מתחרים ישירים: ${bp.directCompetitors?.slice(0, 3).join(', ') || ''}
שווקים: ${bp.geographicMarkets?.join(', ') || ''}` : ''

const prompt = `אתה מנתח שוק ישראלי. חפש ברשת מה טורנד כרגע בתחום: "${searchQuery}"
${businessContext}

// ... rest of prompt unchanged
```

- [ ] **Step 3: Commit**
```bash
git add app/api/industry-trends/route.ts
git commit -m "fix: industry trends use full business profile for targeted queries"
```

---

## Task 7: Trends — Clickable Graph Modal

**Files:**
- Modify: `app/app/trends/page.tsx`

**Add:** A modal that opens when clicking any sparkline graph showing:
- Full-width trend graph (re-using MiniSparkline/Sparkline components)
- Trend name, evidence, source
- One-line "מה זה אומר לעסק שלך" insight (static, generated from direction + name)

- [ ] **Step 1: Add modal state and `TrendModal` component to `app/app/trends/page.tsx`**

Add imports:
```tsx
import { X as XIcon, TrendingUp, TrendingDown, Minus as MinusIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
```

Add modal state near top of `TrendsPage`:
```tsx
const [selectedTrend, setSelectedTrend] = useState<{
  name: string
  direction: string
  evidence?: string
  source?: string
  week_data?: number[]
  trend_data?: { week: string; value: number }[]
} | null>(null)
```

Add `TrendInsight` helper:
```tsx
function getTrendInsight(name: string, direction: string): string {
  if (direction === 'rising' || direction === 'עולה') {
    return `"${name}" בעלייה — שקול להתמקד בתחום זה עכשיו כדי לנצל את הגל`
  }
  if (direction === 'declining' || direction === 'יורד') {
    return `"${name}" בירידה — בחן האם להפחית השקעה בתחום זה`
  }
  return `"${name}" יציב — שמור על הנוכחות הקיימת שלך בתחום זה`
}
```

- [ ] **Step 2: Make industry trend cards' sparklines clickable**

In the industry trends card render (around the `MiniSparkline` component), wrap the sparkline in a button:

```tsx
// Before:
<MiniSparkline data={t.week_data} direction={t.direction} />

// After:
<button
  onClick={() => setSelectedTrend({ name: t.name, direction: t.direction, evidence: t.evidence, source: t.source, week_data: t.week_data })}
  className="cursor-pointer hover:opacity-80 transition-opacity"
  title="לחץ לפרטים"
>
  <MiniSparkline data={t.week_data} direction={t.direction} />
</button>
```

- [ ] **Step 3: Make keyword trend sparklines clickable**

In the per-keyword `Sparkline` render (around line 436 in original):

```tsx
// Before:
{t.trend_data?.length >= 2 && <Sparkline data={t.trend_data} trend={t.trend} />}

// After:
{t.trend_data?.length >= 2 && (
  <button
    onClick={() => setSelectedTrend({ name: t.phrase, direction: t.trend, trend_data: t.trend_data })}
    className="cursor-pointer hover:opacity-80 transition-opacity"
    title="לחץ לפרטים"
  >
    <Sparkline data={t.trend_data} trend={t.trend} />
  </button>
)}
```

- [ ] **Step 4: Add `TrendModal` at bottom of JSX (before closing `</div>`)**

```tsx
<Dialog open={!!selectedTrend} onOpenChange={open => { if (!open) setSelectedTrend(null) }}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle className="text-right">{selectedTrend?.name}</DialogTitle>
    </DialogHeader>
    {selectedTrend && (
      <div className="space-y-4">
        {/* Large graph */}
        <div className="flex justify-center py-2">
          {selectedTrend.week_data ? (
            <svg width={280} height={80}>
              {(() => {
                const data = selectedTrend.week_data!
                const W = 280, H = 80
                const min = Math.min(...data), max = Math.max(...data)
                const range = max - min || 1
                const pts = data.map((v, i) => {
                  const x = (i / (data.length - 1)) * W
                  const y = H - 8 - ((v - min) / range) * (H - 16)
                  return `${x.toFixed(1)},${y.toFixed(1)}`
                }).join(' ')
                const color = selectedTrend.direction === 'rising' ? '#16a34a' : selectedTrend.direction === 'declining' ? '#dc2626' : '#9ca3af'
                return <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              })()}
            </svg>
          ) : selectedTrend.trend_data ? (
            <Sparkline data={selectedTrend.trend_data} trend={selectedTrend.direction} />
          ) : null}
        </div>

        {/* Evidence */}
        {selectedTrend.evidence && (
          <blockquote className="border-r-2 border-primary/30 pr-3 text-sm text-muted-foreground italic">
            {selectedTrend.evidence}
          </blockquote>
        )}

        {/* Source */}
        {selectedTrend.source && (
          <p className="text-xs text-muted-foreground">מקור: {selectedTrend.source}</p>
        )}

        {/* Business insight */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs font-medium text-primary mb-1">מה זה אומר לעסק שלך</p>
          <p className="text-sm text-foreground">{getTrendInsight(selectedTrend.name, selectedTrend.direction)}</p>
        </div>
      </div>
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: Commit**
```bash
git add app/app/trends/page.tsx
git commit -m "feat: clickable sparkline graphs open trend detail modal"
```

---

## Task 8: News — Fix Broken URLs

**Files:**
- Modify: `app/api/generate-news/route.ts` (stricter validation)
- Modify: `app/app/news/page.tsx` (error boundary toast on click)

**Problem analysis:** The existing validation uses `AbortSignal.timeout(5000)` and 5s timeout — many news sites block HEAD requests with a non-error response code OR redirect to a 404 page (returning HTTP 200). Also Vercel functions may not support outbound HEAD requests to all domains.

**Fix:** Add 403 to the "treat as valid" list (paywalled but real URLs), reduce timeout to 3s, use `credentials: 'omit'`, and add fallback: if URL ends with a known extension pattern it's likely valid.

- [ ] **Step 1: Update URL validation in `app/api/generate-news/route.ts`**

Find the validation block (lines 142–161) and replace with:
```ts
// URL validation: filter out definitely broken URLs
const validationResults = await Promise.allSettled(
  list.map(async (n: any) => {
    const url = n.url || ''
    if (!url.startsWith('http')) return { n, valid: false }
    // Skip validation for well-known reliable domains
    const knownDomains = ['reuters.com', 'bbc.com', 'ynet.co.il', 'haaretz.com', 'calcalist.co.il', 'globes.co.il', 'techcrunch.com', 'wsj.com', 'bloomberg.com', 'themarker.com', 'maariv.co.il']
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })()
    if (knownDomains.some(d => host.endsWith(d))) return { n, valid: true }
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
        redirect: 'follow',
        credentials: 'omit',
      })
      // 200, 301, 302, 405 (blocks HEAD but URL exists), 403 (paywall but exists) = valid
      const valid = res.ok || res.status === 405 || res.status === 403 || res.status === 301 || res.status === 302
      return { n, valid }
    } catch {
      return { n, valid: false }
    }
  })
)
list = validationResults
  .filter((r): r is PromiseFulfilledResult<{ n: any; valid: boolean }> => r.status === 'fulfilled' && r.value.valid)
  .map(r => r.value.n)
steps.urlValidation = { count: list.length }
```

- [ ] **Step 2: Add error boundary in `app/app/news/page.tsx`**

Import `useToast`:
```tsx
import { useToast } from "@/hooks/use-toast"
```

Add `const { toast } = useToast()` in the component.

Replace the news link `<a>` element:
```tsx
// Before:
<a
  key={item.id}
  href={item.url || '#'}
  target="_blank"
  rel="noopener noreferrer"
  className="group flex flex-col gap-2 ..."
>

// After:
<a
  key={item.id}
  href={item.url || '#'}
  target="_blank"
  rel="noopener noreferrer"
  className="group flex flex-col gap-2 ..."
  onClick={(e) => {
    if (!item.url) { e.preventDefault(); toast({ title: "הקישור אינו זמין", variant: "destructive" }) }
  }}
>
```

- [ ] **Step 3: Commit**
```bash
git add app/api/generate-news/route.ts app/app/news/page.tsx
git commit -m "fix: news URL validation - stricter HEAD check, known-domain bypass, UI error boundary"
```

---

## Task 9: Reports — Rebuild Weekly Report

**Files:**
- Create: `app/api/generate-weekly-report/route.ts` (new comprehensive route)
- Modify: `app/api/weekly-report/route.ts` (thin wrapper → calls new route)
- Modify: `app/app/reports/page.tsx` (display structured report)
- Modify: `app/api/sync/run/route.ts` (add weekly report to sync)

**Report structure:**
```
1. Business Overview
2. Competitors Update
3. SEO Summary (best position)
4. GEO Summary (best position per engine)
5. Trending Topics (industry + competitor trends)
6. Relevant News (last 7 days)
7. Active Tenders
8. Weekly Action Items
9. Niche Opportunities
```

Saved to `companies.last_report JSONB` with `generated_at` timestamp.

- [ ] **Step 1: Create `app/api/generate-weekly-report/route.ts`**

```ts
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getFullContext } from '@/lib/context'
import { NextResponse } from 'next/server'

interface ReportSection {
  title: string
  content: string[]
  meta?: string
}

interface WeeklyReport {
  generated_at: string
  company_name: string
  sections: ReportSection[]
}

export async function POST(request: Request) {
  try {
    const ctx = await getFullContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
      { data: competitors },
      { data: tenders },
      { data: news },
      { data: company },
      { data: niches },
    ] = await Promise.all([
      ctx.supabase.from('competitors').select('name, threat_score, services, positioning').order('threat_score', { ascending: false }).limit(10),
      ctx.supabase.from('tenders').select('title, organization, deadline, description').order('deadline', { ascending: true }).limit(5),
      ctx.supabase.from('news').select('title, source, summary, category, published_at').gte('published_at', weekAgo).order('published_at', { ascending: false }).limit(8),
      ctx.supabase.from('companies').select('name, industry, business_overview, seo_ranking, geo_ranking, industry_trends, competitor_trends, weekly_actions, niche_opportunities').eq('id', ctx.user.id).single(),
      ctx.supabase.from('saved_opportunities').select('name, reason, score').order('score', { ascending: false }).limit(5),
    ])

    const sections: ReportSection[] = []

    // 1. Business Overview
    if (company?.business_overview) {
      sections.push({
        title: "סקירת עסק",
        content: [company.business_overview],
        meta: company.industry || '',
      })
    }

    // 2. Competitors
    if (competitors && competitors.length > 0) {
      const high = competitors.filter(c => (c.threat_score || 0) >= 70)
      sections.push({
        title: "עדכון מתחרים",
        content: [
          `נמצאו ${competitors.length} מתחרים סה"כ — ${high.length} בעלי ציון איום גבוה (≥70).`,
          ...competitors.slice(0, 5).map(c => `• ${c.name} — ציון איום: ${c.threat_score || 'לא ידוע'}`),
        ],
        meta: `${competitors.length} מתחרים`,
      })
    }

    // 3. SEO Summary
    const seoData = (company as any)?.seo_ranking as any
    if (seoData?.queryVariants) {
      const appeared = seoData.queryVariants.filter((v: any) => v.appeared && v.position != null)
      const best = appeared.reduce((b: any, v: any) => (!b || v.position < b.position) ? v : b, null)
      sections.push({
        title: "דירוג SEO",
        content: [
          best ? `הדירוג הטוב ביותר: מיקום #${best.position} עבור "${best.query}"` : 'לא נמצא מיקום בגוגל השבוע',
          `נבדקו ${seoData.queryVariants.length} שאילתות — הופעה ב-${appeared.length} מהן`,
        ],
        meta: best ? `#${best.position}` : '—',
      })
    }

    // 4. GEO Summary
    const geoData = (company as any)?.geo_ranking as any
    if (geoData?.engines) {
      const engineLines = Object.entries(geoData.engines).map(([eng, data]: [string, any]) => {
        const label = { general: 'כללי', chatgpt: 'ChatGPT', gemini: 'Gemini', grok: 'Grok' }[eng] || eng
        return data?.appeared ? `• ${label}: מיקום #${data.position}` : `• ${label}: לא הוזכרת`
      })
      sections.push({
        title: "דירוג GEO (מנועי AI)",
        content: engineLines,
        meta: Object.values(geoData.engines as any).filter((d: any) => d?.appeared).length + '/4 מנועים',
      })
    }

    // 5. Trending Topics
    const industryTrends = (company as any)?.industry_trends as any
    if (industryTrends?.trends?.length) {
      const rising = industryTrends.trends.filter((t: any) => t.direction === 'rising').slice(0, 3)
      sections.push({
        title: "טרנדים חמים השבוע",
        content: [
          ...rising.map((t: any) => `📈 ${t.name}: ${t.evidence || ''}`),
          ...industryTrends.trends.filter((t: any) => t.direction === 'declining').slice(0, 2).map((t: any) => `📉 ${t.name}`),
        ].filter(Boolean),
        meta: `${industryTrends.trends.length} טרנדים`,
      })
    }

    // 6. News
    if (news && news.length > 0) {
      sections.push({
        title: "חדשות רלוונטיות השבוע",
        content: news.map(n => `• [${n.category}] ${n.title} (${n.source})`),
        meta: `${news.length} חדשות`,
      })
    }

    // 7. Tenders
    if (tenders && tenders.length > 0) {
      sections.push({
        title: "מכרזים פעילים",
        content: tenders.map(t => `• ${t.title} — ${t.organization} (עד ${new Date(t.deadline).toLocaleDateString('he-IL')})`),
        meta: `${tenders.length} מכרזים`,
      })
    }

    // 8. Weekly Actions
    const weeklyActions = (company as any)?.weekly_actions as any
    if (Array.isArray(weeklyActions) && weeklyActions.length > 0) {
      sections.push({
        title: "משימות שבועיות",
        content: weeklyActions.slice(0, 5).map((a: any) => `• ${a.title || a.action || a}`),
        meta: `${weeklyActions.length} משימות`,
      })
    }

    // 9. Niche Opportunities
    const nicheOpps = (company as any)?.niche_opportunities as any
    const activeNiches = Array.isArray(nicheOpps)
      ? nicheOpps.filter((n: any) => n.status === 'tracking').slice(0, 3)
      : []
    if (activeNiches.length > 0) {
      sections.push({
        title: "הזדמנויות נישה במעקב",
        content: activeNiches.map((n: any) => `• ${n.nicheTitle}: ${n.shortInsightSummary || ''}`),
        meta: `${activeNiches.length} במעקב`,
      })
    }

    const report: WeeklyReport = {
      generated_at: new Date().toISOString(),
      company_name: company?.name || '',
      sections,
    }

    // Save to DB
    await ctx.supabase.from('companies').update({ last_report: report } as any).eq('id', ctx.user.id)

    return NextResponse.json({ success: true, report })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Update `app/api/weekly-report/route.ts` to also call the new route**

At the end of the existing POST handler, after returning highlights, also trigger `generate-weekly-report` fire-and-forget:
```ts
// Before the return statement:
const origin = new URL(request.url).origin
fetch(`${origin}/api/generate-weekly-report`, { method: 'POST', headers: { 'Cookie': request.headers.get('cookie') || '' } }).catch(() => {})
```

- [ ] **Step 3: Add weekly report to sync/run/route.ts**

After step 10 (niche opportunities), add step 11:
```ts
// ── 11. Weekly report — always regenerate ────────────────────────────────
{
  const r = await callModule(origin, '/api/generate-weekly-report', companyId)
  addLog('weekly_report', r.ok ? 'ok' : 'error', r.ok ? `${r.body?.report?.sections?.length ?? 0} sections` : (r.body?.error ?? `HTTP ${r.status}`))
  await new Promise(res => setTimeout(res, 2000))
}
```

- [ ] **Step 4: Add report display to `app/app/reports/page.tsx`**

Add fetch for `last_report` from companies:
```tsx
const { data: companyReport } = await supabase
  .from('companies')
  .select('last_report')
  .eq('id', user.id)
  .single()
if (companyReport?.last_report) setWeeklyReport(companyReport.last_report as WeeklyReport)
```

Add a new state:
```tsx
const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null)
```

Add display section before existing content:
```tsx
{weeklyReport && (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <FileText className="h-5 w-5 text-primary" />
        דו"ח שבועי
        <span className="text-xs text-muted-foreground font-normal">
          {new Date(weeklyReport.generated_at).toLocaleDateString('he-IL')}
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {weeklyReport.sections.map((section, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">{section.title}</h3>
            {section.meta && <Badge variant="secondary" className="text-xs">{section.meta}</Badge>}
          </div>
          <ul className="space-y-1">
            {section.content.map((line, j) => (
              <li key={j} className="text-sm text-muted-foreground">{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 5: Add DB column migration note**

Create `supabase/add_last_report_column.sql`:
```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_report JSONB;
```

Run this migration in the Supabase SQL editor.

- [ ] **Step 6: Commit**
```bash
git add app/api/generate-weekly-report/route.ts app/api/weekly-report/route.ts app/api/sync/run/route.ts app/app/reports/page.tsx supabase/add_last_report_column.sql
git commit -m "feat: rebuild weekly report from all modules, save to last_report column"
```

---

## Final commit + deploy

- [ ] **Push to main (triggers Vercel deploy)**
```bash
git push origin main
```

---

## Notes for Implementer

1. **Task 3** — `loadReviewAnalysis` is defined after `loadData` in the file. Since both are `async function` declarations within the component, calling `loadReviewAnalysis()` from within `loadData()` is valid due to hoisting. If there are TS complaints, restructure to use `useEffect` with a state flag instead.

2. **Task 4** — Read `app/api/generate-seo-ranking/route.ts` fully before starting. The `is_sponsored` field is AI-generated. If Grok doesn't reliably return it, add explicit prompt instructions: "mark is_sponsored: true for any result that is a paid Google Ad (has 'ממומן', 'AD', 'Sponsored' marker)".

3. **Task 5** — Overlap detection must be added AFTER all 4 engine calls complete. Read the full `generate-geo-ranking/route.ts` to find exactly where `engines` object is assembled.

4. **Task 9** — `companies.weekly_actions` and `companies.niche_opportunities` are JSONB columns. Check the actual data shape before mapping — `weekly_actions` may be an array of objects with `title`/`description` fields, or just strings.
