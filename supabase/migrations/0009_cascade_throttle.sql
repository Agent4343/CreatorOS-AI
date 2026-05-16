-- FieldForm — throttle the batch cascade so a long-running typing
-- session doesn't generate a sibling read+write every 5 seconds
-- (the auto-save interval). At 20 siblings that's 80 row writes/min
-- for one admin filling out one section.
--
-- The cascade still happens — it just coalesces multiple saves into
-- one cascade per source per 30 seconds. The heli admin's most
-- recent state lands on siblings within a half-minute, which is
-- fast enough for a multi-person induction (signers aren't typing
-- in parallel; the bottleneck is the human).

alter table submissions
  -- Stamped each time cascadeFieldChangesToSiblings actually runs
  -- for this submission. Reads on PATCH compare it to now() and
  -- skip cascade if the window hasn't elapsed.
  add column if not exists last_cascade_at timestamptz;
