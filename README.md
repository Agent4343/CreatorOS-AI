# Reel — AI comedy clip factory

**Working title.** Type a topic, get a 30-second comedy video starring your recurring AI character.

---

## What it does

1. **Set up a character once** — upload a reference image, pick a voice, write a persona ("snarky tech analyst", "tired millennial parent").
2. **Type a topic** — *"the way LinkedIn talks about Mondays."*
3. **Wait 3 minutes** — Claude writes the script, ElevenLabs voices it, Hedra renders the video.
4. **Download & post** — vertical 9:16 MP4 ready for TikTok / Reels / Shorts.

Same character every clip. Same voice. Different topic each time. ~$0.60 in API cost per clip; we charge $0.99–1.99.

## What it doesn't do

- Not a video editor. Not an avatar marketplace.
- Not deepfakes — characters are clearly fictional, not impersonations of real people.
- No multi-character scenes (Phase 2).
- No automated posting (Phase 2).

## Stack

- **Next.js** (App Router) on Railway
- **Supabase** — Postgres + auth + Storage for video files
- **Anthropic Claude** — comedy script generation (Opus 4.7, adaptive thinking)
- **ElevenLabs** — voice synthesis (curated preset voices in Phase 1)
- **Hedra** (Character-3) — talking-head video render
- **Stripe** — credit-based billing

Three external providers, one DB, one frontend. Per BIBLE.md §15: every additional provider is engineering debt.

## Architecture

```
Topic ──▶ Claude (script) ──▶ ElevenLabs (voice) ──▶ Hedra (video) ──▶ Library
  ~10s            ~$0.05           ~15s, ~$0.02         ~3min, ~$0.50
```

The Hedra step is async. We persist `clips.status` and poll Hedra (or accept its webhook) until done. No Redis, no BullMQ — just a status field and the provider's own queue.

## Roadmap

- **Phase 0** (Weeks 1–3) — hand-validate that the comedy script generator hits ≥40% "would I watch this." No app code until then.
- **Phase 1** (Weeks 4–10) — single character, single talking-head clips, credit-based billing, manual download-and-post.
- **Phase 2** (Month 4+) — only after 50 paying users with >50% week-2 retention. Adds: custom voice cloning, captions, multi-character, direct-post to TikTok/Reels.

## Prior project

This repo previously held **CreatorOS AI**, a different product (long-form text → social posts). That work is preserved at `_archive/v1-creatoros-ai/` and in git history. The pivot to AI comedy video is a clean break — different problem, different stack, different audience.

---

Full strategy: [BIBLE.md](./BIBLE.md).
