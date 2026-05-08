# Reel — Project Bible v1

**An AI comedy video factory: type a topic, get a 30-second comedy video starring your recurring AI persona.**
*Working title: "Reel" — to be renamed before launch.*
*Version 1.0 · May 2026*

---

## 0. What this is

You set up a recurring AI character once — a name, a face, a voice, a comedy persona. After that, you type a one-line topic ("the way LinkedIn influencers talk about Mondays"), wait three minutes, and get back a 30-second vertical video of that character delivering a comedy bit on the topic. Ready to post to TikTok / Reels / Shorts.

Same character every video. Same voice. Same comedic POV. Different topic each time.

---

## 1. Vision

The lowest-friction path from "topic" to "posted comedy video." A creator goes from idea → published clip in under 5 minutes, without filming, scripting, editing, or animating anything themselves.

We are not building a video editor. We are not building an avatar marketplace. We are building **one button that produces a finished comedy clip**.

---

## 2. The problem

Short-form comedy is the highest-engagement content on every short-form platform — and the hardest to produce at volume. To ship one good 30-second clip, a comedy creator currently needs:

- A premise / hook
- A script that lands
- A camera, lights, mic, and themselves on-screen
- Editing software
- ~3–6 hours from idea to published

Posting at the cadence the algorithms reward (5–10 clips/week) means either burning out or hiring a team.

What an AI version unlocks: **same persona, infinite topics, finished clips in minutes, zero on-screen presence required.** The bottleneck moves from production to taste — the creator picks topics, reviews, and ships. Everything else is automated.

---

## 3. The honest moat

Talking-head AI video tooling is commoditizing fast. Hedra, HeyGen, Captions, and Synthesia all have APIs. Voice (ElevenLabs) is mature. Script generation (Claude / GPT) is generic.

The defensible parts, ranked:

1. **Comedy quality of the script generator.** Most AI script tools produce LinkedIn-grade slop. Comedy is hard for LLMs because it requires specific hook structures, beats, callbacks, and a willingness to be sharp. A prompt + persona system that consistently produces *funny* — not just "comedy-shaped" — is the actual product.
2. **Persona consistency.** Same face, same voice, same point-of-view across hundreds of clips. The audience identifies with a character, not a creator.
3. **Speed of the loop.** "Topic → published" in under 5 minutes wins on every dimension that matters: experimentation rate, daily posting cadence, willingness to throw away mediocre clips.

What is **not** a moat:
- The video model (we use someone else's)
- The voice (we use ElevenLabs)
- The general LLM (we use Claude)
- A pretty UI

---

## 4. Initial niche — the recurring-character creator

**Who this is for:** indie creators who want to grow a faceless or pseudonymous channel on TikTok / Instagram Reels / YouTube Shorts.

Three concrete profiles:

| Persona | What they want | Why we win |
|---|---|---|
| **The faceless creator** — wants distribution but doesn't want to be on camera | A consistent on-screen "character" that isn't them | Recurring AI persona = built-in faceless brand |
| **The over-extended creator** — already has a real face but can't ship at cadence | A second-channel persona for high-volume content | Same person can run a "main" channel and a sidekick AI channel |
| **The format-tester** — runs many small experimental channels | Cheap iteration on personas + topics | Per-character setup is fast; per-clip cost is low |

**Not for:** broadcasters who need their own face on screen, brands that need legal-clean talent, anyone whose audience would feel betrayed by AI.

---

## 5. Positioning

**Not** an avatar generator. **Not** a video editor. **Not** a script tool.

A **comedy clip factory**: type a topic, get a finished clip starring your recurring character.

Category we want to own: *AI persona-driven short-form video.*

---

## 6. Phases

### Phase 0 — Prove the comedy works (Weeks 1–3)

Before any code, validate that the script-generation prompt actually produces funny material. Steps:

- Hand-design a comedy persona ("snarky tech analyst", "tired millennial parent", "gen-z cynic").
- Ship 30 generated scripts through manual review. Score each 1–5 for "would I watch this."
- Iterate the prompt until ≥40% score 4+.

If we can't get to 40% on text alone, no amount of video polish will save us.

### Phase 1 — One-click clip factory (Weeks 4–10)

Web app. User signs up, sets up one character (uploads a reference image, picks a voice from ElevenLabs presets, writes a 100-word persona description), then enters topics and gets back finished clips.

Stack (intentionally minimal):

- Next.js (App Router) on Railway
- Supabase (Postgres + auth + storage)
- Anthropic Claude — comedy script generation
- ElevenLabs — voice synthesis
- Hedra (Character-3) — talking-head video generation from image + voice + script
- Stripe — billing

What's deferred to Phase 2:

- Custom voice cloning (use ElevenLabs presets only)
- Multi-character scenes (single talking head only)
- Captions / on-screen text overlays
- Upload-to-platform automation
- Scheduled posting

### Phase 2 — Sharper clips, faster loop (Month 4+)

Only build after Phase 1 has 50 paying users with >50% week-2 retention. At that point:

- Custom voice cloning (record 1 minute of yourself, get a unique voice)
- Burned-in captions for accessibility / autoplay
- Background music and basic VFX
- B-roll / cutaway shots between character beats
- Direct posting to TikTok / Reels

---

## 7. Character spec (the thing the user sets up once)

```
{
  "character_id": "...",
  "name": "Tom",
  "reference_image": "https://...",          // 1024×1024, face-forward, neutral
  "voice": {
    "provider": "elevenlabs",
    "voice_id": "...",
    "stability": 0.5,
    "similarity_boost": 0.75
  },
  "persona": {
    "one_liner": "Snarky tech analyst who's seen it all",
    "perspective": "...",                    // 100-word description
    "delivery": "deadpan|hyped|exasperated|wry",
    "vocabulary_hits": ["actually", "look", "hot take"],
    "avoided_phrases": ["folks", "amazing"],
    "running_jokes": ["VC bingo", "the year is 2027"],
    "audience": "tech-adjacent millennials"
  },
  "format": {
    "aspect_ratio": "9:16",
    "target_duration_sec": 30,
    "max_duration_sec": 45
  }
}
```

The persona block is what makes the same character produce consistent comedy across topics. It feeds Claude on every script generation.

---

## 8. Generation pipeline

```
User types topic
       │
       ▼
┌────────────────────┐
│ Claude — script    │  ~10 sec, ~$0.05
│ persona + topic →  │
│ 30-sec script      │
└──────────┬─────────┘
           │  script (text)
           ▼
┌────────────────────┐
│ ElevenLabs — voice │  ~15 sec, ~$0.02
│ script + voice_id  │
│ → MP3              │
└──────────┬─────────┘
           │  audio file
           ▼
┌────────────────────┐
│ Hedra — video      │  ~3 min, ~$0.50
│ image + audio +    │
│ persona → MP4      │
└──────────┬─────────┘
           │  video URL
           ▼
       Library
```

**Total**: ~3 minutes wall-clock, ~$0.60 per clip. We charge $0.99–1.99 per clip on a credit pack model, or unlimited monthly tiers.

The Hedra step is async — we kick the job off, persist the job ID, and poll (or webhook) until done. Everything else is sync.

---

## 9. Pricing — credit-based

Setup is free. Comedy is volume-driven, so the right model is per-clip credits with a bulk discount.

**Monthly credit packs:**

- **Trial** — 3 free clips, no credit card. Burns down fast on purpose; converts the curious.
- **Hobbyist** — $19 / mo · 20 clips/mo · 1 character
- **Creator** — $49 / mo · 60 clips/mo · 3 characters
- **Pro** — $99 / mo · 150 clips/mo · 10 characters
- **Studio** — custom · enterprise / agency

**One-time top-ups** at $1.50 / clip for users who blow through their pack mid-month.

**Why credit packs over flat-rate:** unit cost per clip is ~$0.60 to us (Hedra dominates). A Pro user generating 150 clips costs us ~$90 — Pro tier covers it with a thin margin. Flat-rate "unlimited" plans get gamed by power users and erase the margin. Credits are honest.

---

## 10. Architecture — Phase 1

```
┌──────────────────────────────────────────────────┐
│              Next.js (Railway)                   │
│  /character  /generate  /library  /billing       │
└────────┬─────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│             Next.js API routes                   │
│  /character    /generate   /jobs/poll            │
│  /webhooks/hedra           /webhooks/stripe      │
└────┬───────────┬──────────────┬──────────────────┘
     │           │              │
     ▼           ▼              ▼
┌─────────┐ ┌─────────┐ ┌─────────────────────┐
│Supabase │ │ Claude  │ │ External video APIs │
│Postgres │ │ Eleven  │ │  · Hedra (primary)  │
│Auth     │ │ Labs    │ │  · HeyGen (backup)  │
│Storage  │ │         │ │                     │
└─────────┘ └─────────┘ └─────────────────────┘
```

**Database tables (Phase 1):**

- `users` — Supabase auth + profile
- `characters` — one row per user-defined persona
- `clips` — every generation, with `status` (queued | scripting | voicing | rendering | done | failed)
- `script_revisions` — store every Claude script call so we can A/B prompts
- `credits` — wallet balance + pack purchases
- `subscriptions` — Stripe state

**Async pattern**: Hedra render takes 1–4 minutes. We use a single cron-style poll route (`/api/jobs/poll`, hit by Railway's cron or a 30-second interval client poll) plus a webhook (`/api/webhooks/hedra`) when supported. No Redis, no BullMQ — just a `clips.status` field + the provider's own job queue.

**Storage**: video MP4 files live in Supabase Storage. We hand the user a signed URL.

**Environment variables:**

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
HEDRA_API_KEY=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

ADMIN_USER_IDS=
```

---

## 11. User flow — Phase 1

1. **Sign up.** Email + password (Supabase auth). Lands on `/character/new`.
2. **Set up character (~5 min).** Upload a reference image (we suggest free Unsplash portraits or Midjourney outputs they own). Pick a voice from ElevenLabs presets (we narrow to ~12 hand-curated options). Write a 100-word persona description. Save.
3. **Generate (~3 min wait).** Type a topic. Click Generate. Watch a progress indicator: *Writing script… Recording voice… Rendering video…*
4. **Review.** Video plays inline. Three buttons: **Download**, **Regenerate** (gives Claude a feedback note like "punchier", "shorter", "less obvious"), **Trash**.
5. **Library.** All past clips sortable by date / character / topic.

**No on-platform posting in Phase 1.** Download and post manually. Auto-post comes only after we've earned trust on quality.

---

## 12. Distribution — the section that has to come early

Same three-loop structure as any AI creator tool, with one twist:

### Loop 1 — Build a public character on the product

The fastest proof is a TikTok / Reels channel run *entirely* with the product. We pick a persona ("Tom, the snarky tech analyst" or whatever lands), commit to 5 clips/week for 12 weeks, and let the audience growth (or lack of it) be the live demo.

Founder-as-creator, except the creator is fictional.

### Loop 2 — Side-by-side clips

For every paying user, ask permission to feature one clip on the marketing site as a case study. Real persona, real topic, real output. 10 clips of varied personas does more than any landing-page copy.

### Loop 3 — Free trial does the selling

Three free clips on signup, no credit card. The first one shocks people. The second has them showing it to a friend. The third converts. **Credit gates and pricing screens never see the user before their first finished clip.**

---

## 13. Metrics that actually matter

|Metric                                     |Target by Month 6    |
|-------------------------------------------|---------------------|
|Trial → paid conversion                    |>15%                 |
|Paid users                                 |200                  |
|Median clips/user/month (paid)             |>15                  |
|Week-2 retention                           |>50%                 |
|Time from signup → first finished clip     |<10 minutes          |
|Funny rate (% clips user keeps)            |>50%                 |
|MRR                                        |$8k+                 |

**Funny rate** is the leading indicator. Below 50% kept-clips, retention dies. Above 70%, we have a real product.

---

## 14. Risks and mitigations

|Risk|Mitigation|
|---|---|
|Comedy isn't actually funny|Phase 0 hand-validation. Don't write app code until 40% of generated scripts pass the "would I watch" bar.|
|Hedra is slow / unreliable|Abstract video provider behind one interface; HeyGen as a hot backup. Status page + per-clip retries.|
|Hedra raises prices or shuts the API|Same provider abstraction. Open-weights talking-head models (LivePortrait, Hallo) are improving fast and could be self-hosted by Phase 2.|
|Audiences reject "AI character" content|Lean into it as a feature, not a bug. The persona is a known-AI character with consistent identity, not a deepfake of a real person.|
|Misuse: deepfakes of real people|Reference images go through a face-match check against a known-public-figures database. Reject obvious matches.|
|Cost per clip kills the margin|Per-clip credits, not flat-rate. Real-time monitoring of cost-per-clip per user.|

---

## 15. Strategic rules

1. **Funny first.** Until the comedy works in pure text, we don't ship anything else.
2. **One character per user, until proven.** Multi-character is Phase 1.5.
3. **Three providers max.** Claude, ElevenLabs, Hedra. Every additional provider is engineering debt.
4. **Per-clip economics, always.** Never offer a plan whose unit economics depend on customers not using it.
5. **The character is the brand.** Long-term, the audience belongs to the character, not to the creator behind it. Build for that.
6. **Founder runs a public character.** From day one. The proof is on a public feed, not in a deck.

---

*v1 is opinionated by design. Disagreement on any specific call is welcome — the document exists to be argued with.*
