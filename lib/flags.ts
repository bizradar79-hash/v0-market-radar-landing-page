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
