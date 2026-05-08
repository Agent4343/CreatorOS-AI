-- Reel — review pipeline migration

-- Add the scorecard column. Nullable so existing clips don't break.
alter table clips
  add column if not exists review_scorecard jsonb;

-- Drop the old narrow status check; replace with the wider set that
-- includes 'reviewing' and 'awaiting_approval'.
alter table clips
  drop constraint if exists clips_status_check;

alter table clips
  add constraint clips_status_check
  check (status in (
    'queued',
    'scripting',
    'reviewing',
    'awaiting_approval',
    'voicing',
    'rendering',
    'done',
    'failed'
  ));
