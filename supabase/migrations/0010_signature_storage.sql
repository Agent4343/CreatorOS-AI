-- FieldForm — move signature images out of the row.
--
-- Today every submission_signatures row stores the canvas PNG as a
-- base64 string in `signature_image`. A typical PNG is 30-150 KB;
-- multiplied by 4-6 signatures per submission and a busy operator's
-- batch of 8 inductees, that's ~5 MB of base64 in a single JSONB
-- query. Slow to fetch, slow to print, and the bytes never leave
-- the DB row so we can't CDN-cache them either.
--
-- Migration: add `signature_image_path` (storage object path) and
-- make `signature_image` nullable. New writes go to Supabase
-- Storage and store only the path; existing rows keep working
-- because the read path falls back to the base64 column. A backfill
-- can move legacy rows out incrementally without downtime.

alter table submission_signatures
  add column if not exists signature_image_path text,
  alter column signature_image drop not null;

-- The bucket itself is created in app code (Supabase Storage doesn't
-- expose a stable SQL migration for buckets across all client
-- versions). See src/lib/signatureStorage.ts:ensureBucket().
