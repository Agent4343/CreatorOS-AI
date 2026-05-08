# CreatorOS AI — Project Bible v2

**An AI content workflow for operator-creators**
*Version 2.0 · May 2026*

---

## 0. What changed from v1

This rewrite addresses eight strategic gaps:

1. The "moat" is named honestly — voice + QA isn't defensible on its own.
2. Pricing is restructured around a services-led model, not SaaS-led.
3. The initial niche is reconsidered (fitness → operator-creators).
4. The MVP is collapsed from a 6-month custom build to a 2-week no-code launch.
5. A real distribution plan replaces the missing GTM section.
6. Multi-agent architecture is deferred to v2; single-agent ships first.
7. The Voice Profile and QA Rubric are specified concretely, not aspirationally.
8. The product runs on Claude only for v1 — OpenAI is dropped until proven necessary.

---

## 1. Vision

Become the workflow layer that lets independent operator-creators publish at agency scale without losing their voice.

We are not building an AI writer. We are replacing the editing-and-repurposing workflow that eats 15+ hours of a creator's week.

---

## 2. The problem, sharper

A creator with one weekly long-form output (podcast, video, newsletter) currently needs to:

- pull 3–5 short clips
- write 2–4 captions per clip
- write a thread or LinkedIn post
- write a newsletter teaser
- maintain a consistent voice across all of it

That's roughly 20 distinct artifacts from one source, every week. Generic AI tools produce drafts that get rewritten so heavily the creator might as well have started from scratch — because the tools don't know their voice, their stock phrases, their audience, or their formats.

The wedge is not "write faster." It is "produce 20 platform-ready assets from one source in under an hour, in your voice, without rewriting."

---

## 3. The honest moat

Voice matching and QA are table stakes. Castmagic, Opus, Particle, Jasper, and a hundred custom GPTs are racing to the same place. Calling this a moat is wishful.

What is actually defensible, ranked:

1. **Accumulated creator data.** Once a creator has uploaded 50+ pieces and we've trained a voice profile, switching costs are real. The moat compounds with usage. This is the long-term defense.
2. **A published QA rubric with public credibility.** If we publish "the 47 tells of AI-written content" and creators cite it, we own the category vocabulary. This is a marketing moat masquerading as a product moat. It works.
3. **Service depth on top of software.** Done-for-you onboarding by humans who actually understand creator workflows is hard for a pure-software competitor to match. The service is the wedge; the software is the retention.
4. **Niche-specific templates and benchmarks.** "What a great hook looks like for a fitness creator" is different from generic AI output. Owning the niche reference data matters more than owning the model.

What is *not* a moat: the prompts, the multi-agent architecture, the model choice, "voice training" as a feature.

---

## 4. Initial niche — a recommendation to pressure-test

**v1 recommended:** Operator-creators on LinkedIn and newsletters (consultants, founders, B2B thought-leaders, course operators, agency owners with personal brands).

**v1 reasoning over fitness:**

| Criterion                       | Fitness creators                   | Operator-creators                                             |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Willingness to pay for software | Low (they buy programs, not tools) | High (already paying for Notion, Superhuman, Taplio, Beehiiv) |
| Average revenue per follower    | Low                                | High                                                          |
| Source content quality          | Mostly video — needs transcription | Often already written (newsletters, posts)                    |
| Voice training data available   | Captions, scripts                  | Long-form essays, transcripts, threads — much richer          |
| Outbound channel                | Instagram DM (cold, noisy)         | LinkedIn DM, email (warm, professional)                       |
| Founder-market fit risk         | Need to be plausibly fit           | Need to be plausibly thoughtful                               |

Fitness has volume; operator-creators have payment intent. Pick one and commit — the *worst* outcome is staying broad. If the founder has a strong fitness network or is themselves a fitness creator, that founder-market fit can override the table above. Otherwise, default to operator-creators.

This decision should be made before any code is written.

---

## 5. Positioning

**Not** an AI writer. **Not** a scheduler. **Not** a prompt library.

A **content workflow engine** that turns one source into twenty platform-ready assets in your voice.

The category we want to own: *content operations for creators*.

---

## 6. The product in three honest phases

### Phase 0 — Manual + no-code (Weeks 1–4)

**Goal: validate willingness to pay before writing custom code.**

Stack:

- Lindy or n8n for orchestration
- Claude API for generation
- Airtable for creator profile and content history
- Notion as the client-facing dashboard
- Loom for QA review (recorded, not automated)

Workflow per client:

- 1-hour onboarding call
- Manually build a voice profile in a structured Notion doc
- Set up a Lindy that takes a transcript URL and produces 20 assets
- Founder personally reviews every output for the first 4 weeks per client

**Sell to 5 paying creators at this phase.** If they will not pay for the manual version, they will not pay for the SaaS version.

### Phase 1 — Software wrapper, services-led (Months 2–6)

Build a thin web app that:

- Accepts source content uploads (transcript, video → transcribe via Whisper, or pasted text)
- Stores the voice profile as structured JSON (see §8)
- Runs a single Claude call with tool use to generate platform assets
- Runs a second Claude call as the QA reviewer (see §9)
- Lets the creator approve, regenerate, or edit
- Exports copy-ready assets per platform

Stack (intentionally minimal):

- Next.js frontend
- Supabase (Postgres + auth + storage — one vendor for v1)
- Claude API only
- Vercel for hosting (Railway is fine but Vercel pairs better with Next.js)
- Stripe for billing

What's deferred to Phase 2:

- Multi-agent orchestration
- Redis queues
- Scheduling
- Analytics
- OpenAI fallback

### Phase 2 — Multi-agent + scheduling (Month 6+)

Only build this after Phase 1 has paying retention >60% at 3 months. At that point, multi-agent (separate research, writer, repurpose, QA agents) earns its complexity. Until then, one well-prompted Claude call with structured outputs does the same job at 1/10th the engineering cost.

---

## 7. Voice Profile — concrete spec

The Voice Profile is the entire product. It needs to be a real, structured object — not a vague "tone profile."

```json
{
  "creator_id": "...",
  "vocabulary": {
    "signature_phrases": ["..."],
    "avoided_phrases": ["..."],
    "technical_level": "low|medium|high",
    "reading_level_grade": 8
  },
  "sentence_patterns": {
    "avg_length_words": 14,
    "fragment_frequency": "low|medium|high",
    "starts_with_conjunction": true,
    "list_density": "low|medium|high"
  },
  "hook_library": [
    { "pattern": "contrarian claim + one line of context", "example": "..." },
    { "pattern": "specific number + outcome", "example": "..." }
  ],
  "cta_library": [
    { "context": "newsletter close", "pattern": "...", "example": "..." }
  ],
  "tone_vectors": {
    "formal_casual": -0.6,
    "earnest_ironic": -0.2,
    "prescriptive_reflective": 0.3,
    "warm_clinical": -0.4
  },
  "format_preferences": {
    "twitter": { "thread_length": [6,9], "uses_emojis": false },
    "linkedin": { "para_length_lines": [1,3], "uses_horizontal_rules": true },
    "newsletter": { "subhead_style": "sentence_case", "section_count": [3,5] }
  },
  "audience": {
    "who": "...",
    "pains": ["..."],
    "objections": ["..."]
  }
}
```

**Training data minimum:** 30 pieces of source content per creator to produce a usable profile. Below 30, results are unreliable. We tell creators this upfront.

**How the profile is built:** A single Claude call with the full corpus as context, using a structured output schema. Not a fine-tune. Not embeddings. Not a vector DB. Context window + structured output is enough for v1.

---

## 8. QA Rubric — concrete spec

Every generated asset is scored across six dimensions, each 0–10. Public-facing scorecard.

| Dimension           | What it checks                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Voice match**     | Vocabulary, sentence patterns, hook style match the Voice Profile                                                                  |
| **AI-tell density** | Banned phrases ("delve", "leverage", "in today's fast-paced world", em-dash overuse, generic adjective stacking, hollow tricolons) |
| **Specificity**     | Concrete nouns, named examples, numbers — vs. abstractions and platitudes                                                          |
| **Hook strength**   | First line passes the "would I keep reading" test against patterns from the hook library                                           |
| **Format fitness**  | Length, structure, line breaks match platform norms in the profile                                                                 |
| **CTA quality**     | Clear, single, in-voice — or appropriately absent                                                                                  |

Outputs scoring under 7 on any dimension are flagged with a specific suggestion ("This hook uses a generic 'In today's world' opener — your hook library favors contrarian claims; try X"). The scorecard is shown to the creator alongside every asset.

This is the part competitors won't copy quickly because it requires opinionated judgment, not just a model call. We publish the rubric on a marketing site as "The 47 Tells" — the QA rubric becomes content marketing.

---

## 9. Pricing — services-led

The v1 pricing inverts the original. Setup is the high-margin product; software is the retention layer.

**Setup (Done-For-You) — one-time**

- **Starter setup** — $1,500
  Voice profile built by us, 1 workflow live (e.g., podcast → 5 clips + 1 thread + 1 newsletter), training session.
- **Studio setup** — $3,000
  Everything above plus 3 workflows, custom hook + CTA libraries from their archive, 30-day hand-holding.

**Software retainer — monthly**

- **Solo** — $99/mo · 1 voice profile, 4 generations/week
- **Pro** — $199/mo · 1 voice profile, unlimited, QA scorecard, priority support
- **Team** — $399/mo · up to 3 voice profiles (creator + ghostwriter + agency use), unlimited

**Why this works:** $1,500–$3,000 setup fees give immediate cash flow and weed out tire-kickers. The retainer is priced where creators already pay (Beehiiv $79, Taplio $65, Superhuman $30 — $99 is a believable add). The original $249 entry was 3× the comparable category.

---

## 10. Architecture — Phase 1 (the version we actually build)

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js (Vercel)                      │
│         Dashboard · Generator · QA review                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js API routes (Vercel)                 │
│   /upload  /voice/build  /generate  /qa  /export         │
└────┬─────────────────┬───────────────────┬──────────────┘
     │                 │                   │
     ▼                 ▼                   ▼
┌─────────┐    ┌──────────────┐   ┌──────────────────┐
│Supabase │    │  Claude API  │   │  Whisper (or     │
│Postgres │    │  (one model) │   │  AssemblyAI) for │
│Auth     │    │              │   │  transcription   │
│Storage  │    └──────────────┘   └──────────────────┘
└─────────┘
```

**Database tables (Phase 1):**

- `creators` — profile, niche, audience, billing
- `voice_profiles` — the JSON object in §7, versioned
- `source_content` — uploaded raw content
- `generations` — output assets, QA scores, approval state, regeneration history
- `workflows` — saved generation recipes per creator

**No Redis. No queues. No microservices.** Generation runs synchronously via streaming response. Add async jobs only when latency or cost forces it.

**Environment variables:**

```
DATABASE_URL=
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
WHISPER_API_KEY=
```

That's it for v1. Seven keys, four services, one model.

---

## 11. User flow — Phase 1

1. **Onboarding (10 min):** Creator answers a 12-question voice intake, uploads 30+ source pieces (or links to a YouTube channel / Substack we scrape).
2. **Voice Profile build (3 min):** One Claude call produces the JSON profile. Creator reviews and edits in a structured form.
3. **First generation:** Creator pastes a transcript or topic. System produces a 20-asset bundle in 60–90 seconds, with QA scores attached to each.
4. **Review:** Creator approves, regenerates flagged assets, or edits in place. Edits are logged and fed back into the profile (silent learning).
5. **Export:** Copy buttons per platform. CSV / Notion / Buffer exports as fast-follows.

---

## 12. Distribution — the section v1 was missing

Three loops, all running in parallel from Day 1.

### Loop 1 — Founder-as-creator

The founder publishes weekly on the same platforms our customers do. Every public post is implicit proof the system works. This is the single highest-leverage marketing channel and it costs zero money.

- LinkedIn: 3 posts/week
- Newsletter: weekly, ~600 words, in-house
- X: daily, threaded weekly

### Loop 2 — Public case studies

For each of the first 10 customers: a documented before/after. "How {creator} went from 4 hours/week on captions to 25 minutes." Each case study becomes a landing page, a thread, and an outbound asset.

### Loop 3 — Outbound, not paid acquisition

For the first 50 customers, no paid ads. Channel mix:

- Targeted LinkedIn DMs (50/week, manual, personalized) to operator-creators in the 10–150k follower range
- Cold email to newsletter operators (~20/week)
- Comment-presence on the top 30 LinkedIn voices in the niche (genuine, useful comments — not pitches)

**The Audit-as-lead-magnet play:** offer a free 15-minute "voice audit" — we run their last 10 posts through our QA rubric and send back a one-pager. High intent, low cost, naturally converts.

---

## 13. Metrics that actually matter

Everything else is vanity. Track these weekly:

| Metric                                      | Target by Month 6     |
| ------------------------------------------- | --------------------- |
| Paid customers                              | 30                    |
| Setup → retainer conversion                 | >70%                  |
| 3-month retention                           | >60%                  |
| Approval rate (assets shipped without edit) | >50%                  |
| Time-to-first-published-asset               | <24 hours from signup |
| Net revenue retention                       | >100%                 |
| MRR                                         | $6k+                  |

Time saved per creator is the marketing metric. Approval rate is the product metric. Retention is the only metric that proves the product works.

---

## 14. Risks and mitigations

| Risk                                      | Mitigation                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Voice match isn't good enough             | Phase 0 manual review for 4 weeks per client. Don't ship Phase 1 until manual approval rate >50%.                          |
| A bigger player ships the same thing      | Niche depth and accumulated voice data. Don't try to be horizontal.                                                        |
| Claude API pricing or availability shifts | Build the prompt layer behind a thin abstraction so model swap is a 1-day job, not a refactor. Don't optimize prematurely. |
| Creators churn after the setup fee        | Tie the Phase 0 setup to a 90-day minimum retainer. Setup fee is non-refundable, retainer prorates.                        |
| Service layer doesn't scale past founder  | Document the onboarding playbook from client #1 so it can be delegated by client #20.                                      |

---

## 15. Strategic rules

1. **Services first, software second.** Cash flow now, not in 18 months.
2. **One niche until $20k MRR.** Expansion comes after dominance, not before.
3. **The voice profile is the product.** Everything else is a wrapper on top.
4. **Ship the manual version before the automated one.** Always.
5. **Founder is the first creator.** No exceptions.
6. **One model, one database, one frontend** until growth forces otherwise.
7. **Compete on workflow ownership and creator outcomes — never on AI capability.**

---

*v2 is opinionated by design. Disagreement on any specific call is welcome — the document exists to be argued with.*
