-- Worker deadline enforcement precedes peer negotiation; sideband readiness
-- remains separate. No content, credentials, or SDP is persisted.
alter table public.voice_test_sessions add column worker_started_at timestamptz;
