// Product feature flags. DELETE NOTHING when a module is off — routes, data,
// crons and admin tools all stay; the flag only hides the CLIENT-FACING surfaces.
//
// TENDERS: disabled per client feedback (will return later). Enable by setting
// BOTH env vars to 'true' (NEXT_PUBLIC_ for client components, plain for server):
//   NEXT_PUBLIC_TENDERS_ENABLED=true
//   TENDERS_ENABLED=true
export const TENDERS_ENABLED =
  process.env.NEXT_PUBLIC_TENDERS_ENABLED === 'true' ||
  process.env.TENDERS_ENABLED === 'true'

// ── COMPETITORS ────────────────────────────────────────────────────────────
// Direct competitors are now MANUAL ONLY: the client names up to 5 in
// onboarding / settings, stored in business_profile.directCompetitors (the
// single source of truth). The new tracking module (admin dev tab today) gets
// wired into scans separately.

/** How many direct competitors a client may track. */
export const MAX_DIRECT_COMPETITORS = Number(process.env.MAX_DIRECT_COMPETITORS) || 5

// AUTO-DISCOVERY (/api/find-competitors): OFF. It was the expensive part —
// a web-search model call per scan to invent competitors the client never
// asked for. Code and data are untouched; flip the env var to bring it back.
//   COMPETITOR_AUTODISCOVERY_ENABLED=true
export const COMPETITOR_AUTODISCOVERY_ENABLED =
  process.env.NEXT_PUBLIC_COMPETITOR_AUTODISCOVERY_ENABLED === 'true' ||
  process.env.COMPETITOR_AUTODISCOVERY_ENABLED === 'true'

// The OLD competitor analysis module (competitors + competitor_ratings scan
// steps, the /app/competitors dashboard card and nav entry). OFF pending its
// replacement. NOTHING is deleted: the page, routes, tables and rows all stay,
// so flipping this back restores the module exactly as it was.
//   NEXT_PUBLIC_OLD_COMPETITOR_MODULE_ENABLED=true
//   OLD_COMPETITOR_MODULE_ENABLED=true
export const OLD_COMPETITOR_MODULE_ENABLED =
  process.env.NEXT_PUBLIC_OLD_COMPETITOR_MODULE_ENABLED === 'true' ||
  process.env.OLD_COMPETITOR_MODULE_ENABLED === 'true'

// COMPETITOR TRENDS ("טרנדים אצל מתחרים"): OFF. Superseded by the competitor
// tracking module, which reads real activity + Google reviews per competitor
// instead of asking a model what competitors might be doing. Disabled here
// removes the generation step from every scan (the cost) and hides every
// client-facing surface. Route, stored data and readers are all retained.
//   NEXT_PUBLIC_COMPETITOR_TRENDS_ENABLED=true
//   COMPETITOR_TRENDS_ENABLED=true
export const COMPETITOR_TRENDS_ENABLED =
  process.env.NEXT_PUBLIC_COMPETITOR_TRENDS_ENABLED === 'true' ||
  process.env.COMPETITOR_TRENDS_ENABLED === 'true'
