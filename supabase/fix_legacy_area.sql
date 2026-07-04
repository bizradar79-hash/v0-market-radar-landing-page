-- One-time cleanup of the legacy 'כל הארץ' literal that leaked into the orphaned
-- companies.city / geographic_area columns and silently overrode the real
-- geographic_scope in the report + lead geo-targeting.
--
-- After this + the deriveArea() helper: a NATIONAL client shows "כל הארץ" via
-- scope (correct), and a LOCAL client shows the real city entered in settings.
--
-- Idempotent — safe to run more than once. Apply manually in the Supabase SQL editor.

-- 1) Clear the stale national literal from the single-value city column.
update companies
set city = null
where city = 'כל הארץ';

-- 2) Strip 'כל הארץ' entries from the geographic_area text[] array (leaves any
--    real entries intact; nulls out the column if it becomes empty).
update companies
set geographic_area = nullif(array_remove(geographic_area, 'כל הארץ'), '{}')
where geographic_area is not null
  and 'כל הארץ' = any(geographic_area);
