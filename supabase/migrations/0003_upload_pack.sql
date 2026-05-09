-- Reel — upload-prep migration
-- Adds the clips.upload_pack column to store the YouTube + Facebook
-- metadata pack produced after script approval. Nullable so existing
-- rows don't break.

alter table clips
  add column if not exists upload_pack jsonb;
