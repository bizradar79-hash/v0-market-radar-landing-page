-- Run once in Supabase Dashboard → SQL Editor
-- FIX 3: circuit breaker + resumable-scan control.
-- A single JSONB blob holds the whole scan-control state so we never need a
-- migration per field. Shape:
--   {
--     "status": "running" | "done" | "stopped" | "error",
--     "profile": "initial" | "weekly",
--     "started_at": "ISO",
--     "finished_at": "ISO",
--     "call_count": 0,            -- external-AI-call units used this run
--     "max_calls": 12,
--     "max_seconds": 240,
--     "abort_reason": "aborted_call_cap" | "aborted_timeout" | null,
--     "modules": { "<id>": { "status": "pending|running|done|skipped|error", "message": "", "updated_at": "ISO" } }
--   }

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS scan_control JSONB;
