-- FieldForm — human-readable label per batch.
--
-- A batch_id is a UUID — fine for joining, terrible for showing the
-- heli admin "you're looking at the batch you started." We snapshot
-- a short label on every sibling row at batch-creation time so any
-- batch view (dashboard, submissions list, audit) can show
-- "Hebron Induction · May 11" without an extra table or join.
--
-- Stored per-submission (not in a `batches` table) because:
--   - every sibling shares the same value (the batch route writes
--     it once across all inserts in the same transaction),
--   - it's a leaf attribute, never updated except by reassign/
--     archive flows that already touch the row, and
--   - no read path needs it without already loading the submission.

alter table submissions
  add column if not exists batch_label text;

-- Filtering the submissions list by batch_id is already indexed
-- (0005_batch_workflow.sql:27). No new index needed — batch_label
-- is only read alongside the row, never filtered on.
