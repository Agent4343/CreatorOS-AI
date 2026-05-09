# Reel — Project Bible v2 (single-user, long-form)

**An AI long-form video factory for one creator.** Type a topic, get a 5–15 minute video starring your recurring AI character — ready to upload to YouTube or Facebook.
*Working title: "Reel" — to be renamed before launch.*
*Version 2.0 · May 2026*

---

## 0. What changed from v1

v1 was a multi-user SaaS pumping out 30-second TikTok-style comedy clips. v2 is a tool **for one creator** producing **long-form videos** for **YouTube + Facebook**. Everything follows from those two changes:

- **Single user.** No signup, no Stripe, no credits, no per-user RLS. One `APP_PASSWORD` gate. ~30% less code.
- **Long-form (16:9, 3–20 min).** Different video provider, different script structure, different UX. Hedra (≤90s talking-head) → **HeyGen** (long-form Photo Avatars).
- **YouTube + Facebook are the targets.** No TikTok-specific tooling. No vertical defaults. Manual upload — automation is Phase 2.

---

## 1. Vision

The lowest-friction path from "topic" to "uploadable long-form video" — for one creator, building one channel, with one recurring AI persona.

The creator does taste (pick the topic, review, upload). The system does production (script, voice, render). Goal: a creator can publish a polished 10-minute video every day without filming, scripting, or editing themselves.

---

## 2. The problem

Long-form YouTube comedy is the highest-value short-form-adjacent format — better algorithm reach, better ad revenue per view, better audience retention than Shorts. It's also the hardest to produce. To ship one 10-minute video, a creator needs:

- A premise sharp enough to hold attention for 10 minutes
- A 1500-word script that lands consistently
- Camera, lighting, mic, themselves on-screen
- Editing (cuts, b-roll, music, captions) — or it looks amateur
- Realistically, 8–20 hours per video

Most long-form creators ship **once a week, max**. The algorithm rewards 3–5 uploads/week. The math doesn't work without a team or a tool.

What the AI version unlocks: **one persona, infinite topics, finished videos in 15 minutes.** Move the bottleneck from production to taste — the creator picks topics, reviews, and uploads. Everything else is automated.

---

## 3. The honest moat (or honest lack of one)

This is a single-user tool, so the question isn't "what's the moat" — it's **"will the output be good enough to publish."** Answer drives everything.

The thing that has to work:

1. **Long-form AI presenter video has to be watchable for 10 minutes.** Talking-head straight to camera for 10 minutes is hard to watch even when a real human does it. AI heads have additional uncanny-valley + lip-sync issues. If audiences bounce at 2 minutes, the per-view ad revenue collapses and so does the value of the tool.
2. **Comedy at length.** A 30-second bit can survive on a punchline. A 10-minute bit needs structure — escalating beats, callbacks, a real argument. Claude can write this; making it consistently funny is the open question.

What is **not** a moat: the video model, the voice provider, the LLM, this codebase. We're a thin orchestration layer on top of three external APIs. That's fine for a single-user tool. It would not be a defensible business.

---

## 4. Distribution targets

**Primary: YouTube** (long-form, 3–20 min, 16:9). Where long-form pays.
**Secondary: Facebook** (feed video, 16:9). Where the older audience is, and where competition is thin.

**Not** TikTok / Reels / Shorts — those need vertical 9:16 ≤ 60s, which is a different product. Possible later, not Phase 1.

Posting is **manual**: download MP4, upload via the platform's UI. Auto-post is deferred until we know the videos are worth posting.

### Monetization thresholds — why length is the single biggest revenue lever

Both platforms gate ad placement on video length. These are not soft preferences; they are hard rules in the platforms' Partner Program docs:

| Length | YouTube | Facebook |
|---|---|---|
| < 1 min | No ads (Shorts only — different program) | No in-stream ads |
| 1–2 min | One pre-roll only | No in-stream ads |
| 3–7 min | One pre-roll only | In-stream ads enabled |
| **≥ 8 min** | **Mid-roll ads unlocked** (multiple breaks) | In-stream ads enabled |
| 10–15 min | Sweet spot — most ad revenue per video while retention holds | Same |

Mid-roll ads are where YouTube ad revenue actually lives. A 7-minute video gets one ad slot; an 8-minute video gets three or four. The cliff at 8 min is the single biggest revenue lever in long-form YouTube.

Eligibility (separate from per-video length rules):

- **YouTube Partner Program**: 1,000 subscribers + 4,000 watch hours over 12 months
- **Facebook In-Stream Ads**: 5,000 page followers + 60,000 minutes viewed over 60 days

**Implication for the app**: default `target_duration_sec` is 600 (10 min), which sits in the YouTube mid-roll sweet spot. The character-form slider visually marks the zones — red < 3 min (unmonetizable), amber 3–7 (single pre-roll only), green ≥ 8 (mid-roll unlocked) — so the creator never accidentally targets a length that can't earn.

---

## 5. Positioning

This is not a SaaS, not a creator tool, not a marketplace. It's **the founder's content factory**. Single deployment, single user, single character (or two), single editor (you).

If we ever decide to flip it to multi-user, the architecture supports that pivot — the `user_id` columns are still there, just constant. Re-enable RLS, swap the password gate for Supabase auth, add Stripe — none of which is built today.

---

## 6. Phases

### Phase 0 — prove the comedy at length (Weeks 1–2)

Before any video render, validate that Claude can write a 10-minute comedy script that holds together. Run `npm run smoke:script` against a fixture persona with 5 different topics. Read the output out loud. Score each 1–5 for "would I watch this all the way through." Iterate the prompt until ≥40% score 4+.

If we can't write a watchable text script, the video will be worse. No video render until the script lands.

### Phase 1 — first finished video (Weeks 3–6)

End-to-end pipeline: script → voice → HeyGen video → manual upload. One character, one user, no analytics, no editing.

Stack:

- Next.js (App Router) on Railway
- Supabase (Postgres + Storage)
- Anthropic Claude (Opus 4.7, adaptive thinking, cached persona prefix)
- ElevenLabs (voice synthesis, curated preset voices)
- HeyGen V2 (Photo Avatar talking-head, supports long-form)
- Single-password gate (no Stripe, no Supabase auth)

What's deferred to Phase 2:

- B-roll / scene cuts (would require an FFmpeg pipeline + asset library)
- Captions / on-screen text
- Background music
- Direct upload to YouTube / Facebook
- Multi-character scenes

### Phase 2 — polish (Month 3+)

Only if Phase 1 produces videos with >40% audience retention at 5 minutes. At that point:

- B-roll insertion via stock footage APIs (Pexels, Storyblocks)
- Burned-in captions for accessibility / autoplay
- Background music (suno.com or Mubert)
- Direct YouTube upload via the Data API
- Multi-character scenes (would force a rethink of the video provider — HeyGen handles 1 avatar per render)

---

## 7. Character spec

```json
{
  "id": "...",
  "name": "Tom",
  "reference_image_url": "heygen://<avatar_id>",
  "voice": {
    "provider": "elevenlabs",
    "voice_id": "...",
    "stability": 0.5,
    "similarity_boost": 0.75
  },
  "persona": {
    "one_liner": "Snarky tech analyst who's seen it all",
    "perspective": "...",
    "delivery": "deadpan",
    "vocabulary_hits": ["actually", "look"],
    "avoided_phrases": ["folks", "amazing"],
    "audience": "tech-adjacent millennials"
  },
  "format": {
    "aspect_ratio": "16:9",
    "target_duration_sec": 600
  }
}
```

Note `reference_image_url` uses a `heygen://<avatar_id>` URL scheme. The user creates the Photo Avatar manually in the HeyGen dashboard from a still image, then pastes the avatar_id into the character form. We don't try to magic-create avatars from arbitrary URLs — HeyGen's avatar onboarding has its own UX and rules.

---

## 7b. Review pipeline — the six agents

Every script passes through six parallel Claude-backed review agents before voice or video render. The pipeline exists for two reasons: protect monetization (don't burn $5 of HeyGen render on a script YouTube will demonetize), and stop "AI-shaped" comedy from leaking through (the structural-but-not-funny output that LLMs default to).

| Agent | What it catches | Failure mode |
|---|---|---|
| **Monetization compliance** | YouTube advertiser-unfriendly content — profanity intensity, sensitive-topic categories, harmful claims, copyrighted material | **Hard gate.** Any `critical` issue blocks the render; the user is forced to regenerate. |
| **Hook strength** | First 30 sec earn the rest. Hollow openers like "Hey guys" or "Today we're going to talk about." | Soft gate. Surfaces issue + suggestion. User decides. |
| **Persona fit** | Drift from the character — generic-AI register, banned phrases, tone shift mid-script | Soft gate. |
| **Comedy lands** | Specific punches, escalation, callbacks — vs. comedy-shaped filler ("absolutely wild and frankly insane", hollow tricolons, "and then I realized…") | Soft gate. |
| **Length & pacing** | Hits target duration at ~150 wpm; segments balanced; no runtime holes | Soft gate. Critical if predicted runtime drops below the 8-min YouTube mid-roll cliff (§4). |
| **Fact-check surface** | Identifies claims to verify (specific numbers, named events with dates, quotes, health/finance). Doesn't auto-fact-check — surfaces them. | Soft gate. |

All six run **in parallel** against the generated script. The Claude calls share a `cache_control` prefix (persona + script) so the second through sixth reviewers cost ~10% of the first. Total: ~10 sec wall-clock, ~$0.60.

**Gate logic:**

- Any `monetization` issue with `severity: "critical"` → `monetization_blocked: true`. The pipeline auto-regenerates **once** with feedback synthesized from the failed agents. If still blocked, surfaces to the user — no render until they fix it.
- All scores ≥ 7 and no monetization block → `overall_pass: true`. UI shows the green-light state. One click to continue.
- Anything in between → `overall_pass: false` but not blocked. UI shows the scorecard with issues; user reads, optionally types creator feedback, hits *Regenerate* or *Approve anyway*.

**Why human-in-the-loop, not full auto:**

Per §1: creator does taste, system does production. The agents are an *assist*, not a substitute for the editor. Full-auto regeneration on every soft fail would cause the writer to thrash on subjective notes — the user is the final taste arbiter, especially on comedy where what an LLM thinks is "funnier" often isn't.

**Three escape hatches when you disagree with the agents:**

| Path | Cost | When to use |
|---|---|---|
| **Approve anyway** | $0 | Soft-fail issues you've judged are wrong (taste is yours) |
| **Edit script inline** | ~$0.60 (re-review only) | The 5% the agents missed — fix one sentence yourself, save, agents re-score the edited version. No regen, no script-gen call. |
| **Regenerate** | ~$1 (script + 6 reviews) | You want a different draft entirely. Optional creator feedback is merged with agent feedback. |

The inline editor preserves your hand-edits verbatim and recomputes `estimated_seconds` from word count at 150 wpm so the pacing agent and chapter-timestamp math stay honest.

## 7c. Upload-prep agent (the 7th)

A separate generator agent runs **after the user approves the script**, before voice/video render. It produces the YouTube + Facebook metadata pack that the creator copies straight into the platform's upload form:

| Field | Purpose | Constraints |
|---|---|---|
| YouTube title | The clickable headline | 10–100 chars; no clickbait the video doesn't deliver on |
| YouTube description | First 150 chars are SEO + above the "more" cutoff; rest is context + chapters + hashtags | ≤5000 chars |
| YouTube tags | Mix of broad and specific | ≤25 tags, ≤500 total chars |
| YouTube chapters | First chapter MUST start at 0:00, ≥10s spacing — YouTube auto-creates clickable chapters from this exact format | 3–15 chapters, computed proportionally to segment word counts at 150 wpm |
| Thumbnail concepts | 3 distinct visual briefs + text overlays — input for whichever thumbnail tool the creator uses (Canva, Figma, Midjourney) | Exactly 3 concepts, ≤40 chars per overlay |
| Facebook caption | Facebook prefers conversation-starters, not SEO-heavy descriptions; aggressive truncation at ~280 chars | ≤280 chars |

Runs in `runRenderPhase`, BEFORE voicing, so a failure here surfaces immediately rather than after a 5-min HeyGen render. Cost ~$0.05, runtime ~5s. Output saved to `clips.upload_pack` jsonb. The Generate page renders it as a copy-button panel below the finished video.

Per BIBLE §15: this is the agent that closes the workflow leak — every uploaded video now has a metadata pack that took 30 seconds to generate instead of 5 minutes to write by hand.

## 8. Generation pipeline

```
Topic
  │
  ▼
Claude (script, ~30 sec, ~$0.10)
  │ produces hook + 3-6 segments + outro, ~1500 words for 10 min
  ▼
6 review agents in parallel (~10 sec, ~$0.60)
  │ monetization · hook · persona · comedy · pacing · facts
  ▼
[gate]
  │   monetization_blocked → auto-regen once → re-review
  │   overall_pass         → ready for human approval
  │   soft fails           → surface scorecard; user reads
  ▼
[user clicks Approve & render]
  │
  ▼
Upload-prep agent (~5 sec, ~$0.05)
  │ produces title, description, tags, chapters, 3 thumbnail concepts,
  │ Facebook caption — saved to clips.upload_pack
  ▼
ElevenLabs (voice, ~30 sec, ~$0.30)
  │ MP3 of the full script
  ▼
Supabase Storage (audio_url)
  │
  ▼
HeyGen render kicked off (async)
  │ video provider returns a job_id; we persist it
  ▼
[gap of 5-15 min while HeyGen renders]
  │
  ▼
/api/jobs/poll detects completion
  │ fetches MP4, mirrors to Supabase Storage
  ▼
clip.status = 'done', video_url populated
  │
  ▼
Library — download, upload to YouTube
```

**Total**: ~1 min for script + review, then 5–15 min for the video render. ~$4–9 of API spend per 10-min video (HeyGen dominates; review pipeline adds ~$0.60).

---

## 9. No pricing — solo deployment

This is a personal tool. You pay the API providers directly. Estimated monthly cost for 30 videos/month:

- Anthropic: ~$3
- ElevenLabs: $22 starter plan covers it
- HeyGen: ~$200–300 depending on plan
- Supabase + Railway: free tier suffices

So roughly **$8–10 per finished 10-minute video**, plus the ElevenLabs base.

If you ever flip to multi-user, see v1 BIBLE.md (`_archive/v1-creatoros-ai/`) for credit-based pricing logic.

---

## 10. Architecture — Phase 1

```
┌──────────────────────────────────────────────────┐
│             Next.js (Railway)                    │
│  /character  /generate  /library  /login         │
└────────┬─────────────────────────────────────────┘
         │ APP_PASSWORD cookie gate
         ▼
┌──────────────────────────────────────────────────┐
│             Next.js API routes                   │
│  /character    /generate   /clips/[id]           │
│  /jobs/poll    /auth       /health               │
└────┬───────────┬──────────────┬──────────────────┘
     │           │              │
     ▼           ▼              ▼
┌─────────┐ ┌─────────┐ ┌─────────────────────┐
│Supabase │ │ Claude  │ │  Video provider     │
│Postgres │ │ Eleven  │ │  · HeyGen (default) │
│Storage  │ │ Labs    │ │  · Hedra (swap-in)  │
└─────────┘ └─────────┘ └─────────────────────┘
```

**Database tables:**

- `characters` — your AI persona(s)
- `clips` — every generation, with `status` (queued | scripting | voicing | rendering | done | failed) and `provider_job_id`

No `users` table — single-user, gated by middleware.
No `subscriptions` table — no billing.

**Async pattern**: HeyGen render is 5–15 min. We persist `provider_job_id`, and `/api/jobs/poll` (cron-driven) walks every `clips.status='rendering'` row and asks the provider whether it's done.

**Provider abstraction**: `src/lib/providers/video.ts` defines a single `VideoProvider` interface. HeyGen is the implementation; Hedra can be added the same way. `VIDEO_PROVIDER` env var picks one.

---

## 11. User flow

1. **Sign in.** Single password page. Cookie set for 30 days.
2. **Set up character (~5 min, one-time).** Create a HeyGen Photo Avatar in the HeyGen dashboard → paste its avatar_id. Pick a voice from the curated ElevenLabs list. Pick aspect (16:9 default). Pick target length (8 min default). Write a one-liner persona + a 100-word perspective + vocabulary lists + audience.
3. **Generate.** Type a topic. Click. Status updates: *Writing script → Recording voice → Rendering video*. Total 5–15 min wall-clock.
4. **Review.** Video plays inline at 16:9. Three buttons: **Download MP4**, **Library**, **Generate another**.
5. **Upload manually** to YouTube / Facebook.

---

## 12. Metrics that matter

This is a personal tool, not a product, so metrics are about **whether the output is good enough to publish**:

| Metric | Target |
|---|---|
| Generated videos that you actually upload (vs trash) | >40% |
| Average watch-through % on published videos | >35% (YouTube average is ~20–30% for long-form) |
| Time topic → uploaded | <30 min |
| Cost per uploaded video | <$15 |

If <40% of generated videos are uploadable after Phase 1, the prompt or the provider are the problem. Tune them, or fall back to shorter formats.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 10 min of one AI face is unwatchable | Start at 5–8 min and lengthen only if retention holds. Provider abstraction makes it easy to test HeyGen vs alternatives. |
| Comedy at length is too hard for the LLM | Phase 0 hand-validation. Don't render videos until the text scripts land. |
| HeyGen render fails / queue grows / pricing changes | `VideoProvider` interface lets us swap to Hedra, Synthesia, D-ID, or self-hosted (LivePortrait, Hallo) with minimal code change. |
| Audiences reject AI-presenter content | Lean into it as a feature: the persona is openly fictional. Pick a name, build a public character, let the audience decide. |
| Misuse: deepfaking real people | The Photo Avatar is created by the user in HeyGen's dashboard, which has its own consent flow. We don't accept arbitrary image URLs into a face-generation pipeline. |

---

## 14. Strategic rules

1. **Output quality > everything.** No new feature ships before Phase 0 hand-validation passes.
2. **One character, one channel, until it works.** Multi-character is Phase 2.
3. **Three providers, one DB, one frontend.** Every additional provider is engineering debt.
4. **Single-user assumption is real.** Don't write code that makes sense only in a multi-user world (per-org analytics, sharing, invites). Strip it whenever you see it.
5. **Manual upload is fine.** Auto-upload to YouTube / Facebook is Phase 2 — and only if you're confident enough in the output to want it on a daily cadence.
6. **The persona is the brand.** You're the editor. The character is the talent.

---

*v2 is opinionated and scoped to a real, single user. Disagreement on any specific call is welcome — the document exists to be argued with.*
