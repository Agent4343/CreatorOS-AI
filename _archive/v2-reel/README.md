# Reel — single-user, long-form AI video factory

**Working title.** Type a topic, get a 5–15 minute video starring your recurring AI character. Built for one creator. Ships videos to YouTube and Facebook.

---

## What it does

1. **Set up a character once** — paste a HeyGen Photo Avatar ID, pick an ElevenLabs voice, write a 100-word persona ("snarky tech analyst", "tired millennial parent").
2. **Type a topic** — *"why every founder pretends to like their investors."*
3. **Wait 5–15 minutes** — Claude writes the long-form script, ElevenLabs voices it, HeyGen renders the video.
4. **Download & upload** — 16:9 horizontal MP4 ready for YouTube or Facebook.

Same character every video. Different topic each time. ~$3–8 of API spend per 10-minute video.

## Single-user

No signup, no Stripe, no credits. Whole app is gated by an `APP_PASSWORD` env var. One password, one cookie, one user. Want to invite someone later? Re-enable the multi-tenant layer (the `user_id` columns are still there) and switch back to Supabase auth.

## Stack

- **Next.js** (App Router) on Railway — long-running Node, no serverless
- **Supabase** — Postgres + Storage. No Supabase auth (we use a password gate).
- **Anthropic Claude Opus 4.7** — long-form script generation, adaptive thinking, persona cached behind `cache_control`
- **ElevenLabs** — voice synthesis (curated preset voices in Phase 1)
- **HeyGen V2** — Photo Avatar talking-head video, supports long-form
- Provider abstraction layer (`src/lib/providers/video.ts`) — swap HeyGen for Hedra (short-form ≤90s) or any future provider

## Pipeline

```
Topic
  ──▶ Claude        — script, ~30s, ~$0.10
  ──▶ ElevenLabs    — voice, ~30s, ~$0.30
  ──▶ HeyGen        — video, 5-15 min, ~$3-8
  ──▶ Library
```

The video render is async. We persist `provider_job_id`, and `/api/jobs/poll` (cron-driven) flips status to `done` when HeyGen reports completion.

## Roadmap

- **Phase 0** (Weeks 1–2) — hand-validate the script generator. Run `npm run smoke:script`. Iterate the prompt until ≥40% of generated scripts pass "would I watch all the way through."
- **Phase 1** (Weeks 3–6) — finished video pipeline. One character, one user, manual upload to YouTube / Facebook.
- **Phase 2** (Month 3+) — only if Phase 1 outputs pass the bar. B-roll, captions, music, auto-upload.

## Targets

- **YouTube** (long-form 16:9, 3–20 min) — the primary distribution surface
- **Facebook** (feed video 16:9) — secondary
- **Not** TikTok / Reels / Shorts — those are vertical 9:16 ≤60s, a different product. Possible later.

## Prior project

This repo previously held **CreatorOS AI** (long-form text → social posts) and then **Reel v1** (multi-user TikTok-style 30-second clips). Both are preserved at `_archive/v1-creatoros-ai/` and in git history. The current direction (single-user, long-form, YouTube/Facebook) is a clean break.

---

Full strategy: [BIBLE.md](./BIBLE.md). Setup recipe: [SETUP.md](./SETUP.md).
