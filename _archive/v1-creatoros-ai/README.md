# CreatorOS AI

**A content workflow engine that turns one source into twenty platform-ready assets in your writing style.**

Not an AI writer. Not a scheduler. Not a prompt library. CreatorOS AI replaces the editing-and-repurposing workflow that eats 15+ hours of an operator-creator's week.

---

## What it does

A creator drops in one long-form source (podcast, video, newsletter) and gets back ~20 platform-ready artifacts — clips, captions, threads, LinkedIn posts, newsletter teasers — in their writing style, with a QA scorecard attached to every asset.

The wedge: **produce 20 platform-ready assets from one source in under an hour, without rewriting.**

## Who it's for

Operator-creators on LinkedIn and newsletters: consultants, founders, B2B thought-leaders, course operators, agency owners with personal brands. High payment intent, rich written training data, professional outbound channels.

## How it works

1. **Onboarding (10 min)** — 4-question intake (optional) + 30+ source pieces uploaded.
2. **Style Profile build (3 min)** — one Claude call produces a structured JSON profile (vocabulary, sentence patterns, hooks, CTAs, tone vectors, format preferences, audience).
3. **Generate** — paste a transcript or topic, get a 20-asset bundle in 60–90 seconds with QA scores.
4. **Review** — approve, regenerate flagged assets, or edit in place. Edits feed back into the profile.
5. **Export** — copy buttons per platform.

## The two specs that matter

- **Style Profile** — structured JSON, built from ≥30 source pieces via a single Claude call with structured output. Not a fine-tune, not embeddings, not a vector DB. See [BIBLE.md §7](./BIBLE.md#7-voice-profile--concrete-spec).
- **QA Rubric** — six dimensions (style match, AI-tell density, specificity, hook strength, format fitness, CTA quality), each scored 0–10. Sub-7 scores get specific fix suggestions. See [BIBLE.md §8](./BIBLE.md#8-qa-rubric--concrete-spec).

## Pricing

Services-led. Setup is the high-margin product; software is retention.

| Tier             | Price            | What you get                                                |
| ---------------- | ---------------- | ----------------------------------------------------------- |
| Starter setup    | $1,500 once      | Style profile + 1 workflow live + training                  |
| Studio setup     | $3,000 once      | 3 workflows + custom hook/CTA libraries + 30-day support    |
| Solo retainer    | $99 / mo         | 1 style profile, 4 generations/week                         |
| Pro retainer     | $199 / mo        | 1 style profile, unlimited, QA scorecard, priority support  |
| Team retainer    | $399 / mo        | Up to 3 style profiles                                      |

## Stack (Phase 1)

- Next.js (App Router) on Railway — long-running Node process, not serverless
- Supabase (Postgres + auth + storage)
- Claude API — Opus 4.7 with adaptive thinking and prompt caching
- Whisper for transcription (optional; paste-only works without it)
- Stripe for billing

No Redis, no queues, no microservices. Generation runs synchronously.

---

## Running it locally

```bash
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY + Supabase keys
npm install
npm run dev                  # http://localhost:3000
```

Apply both Supabase migrations (`supabase/migrations/0001_init.sql` and `0002_subscriptions.sql`) once against your project.

### Smoke test

```bash
npm run smoke   # exercises style-build → generate → QA against fixture data
```

Costs ~$1–2 in Anthropic tokens per run. Validates the prompt chain end-to-end without Supabase or the API routes.

---

## Deploying to Railway

1. Connect the repo. Railway auto-detects Next.js — no `Procfile` or `railway.json` needed. Build = `npm run build`, start = `npm run start`.
2. **Healthcheck path**: set `Settings → Healthcheck Path` to `/api/health`. The route returns 503 if any required env var is missing, so a misconfigured deploy fails fast instead of silently 500-ing on first user request.
3. **Apply Supabase migrations** to your Supabase project via the Supabase SQL editor:
   - `supabase/migrations/0001_init.sql` (creators, voice_profiles, source_content, generations, workflows + RLS)
   - `supabase/migrations/0002_subscriptions.sql` (Stripe subscription state + RLS)
4. **Required env vars** in Railway:

   ```
   ANTHROPIC_API_KEY
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```

   Optional but recommended:

   ```
   WHISPER_API_KEY                    # /api/transcribe falls back to "key not set" if absent
   STRIPE_SECRET_KEY                  # required for /billing checkout
   STRIPE_WEBHOOK_SECRET              # required for Stripe webhook signature verification
   STRIPE_PRICE_SOLO                  # solo  · $99/mo
   STRIPE_PRICE_PRO                   #  pro  · $199/mo
   STRIPE_PRICE_TEAM                  # team  · $399/mo
   ```

5. **Stripe webhook URL**: once Railway gives you a public domain (e.g. `creatoros.up.railway.app`), point Stripe → Webhooks at `https://<your-domain>/api/stripe/webhook` and listen for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
6. **Note on `maxDuration` exports**: Several API routes export `maxDuration` (e.g. 300s for `/api/voice/build` and `/api/generate`). That's a Vercel-specific hint; on Railway it's a no-op. Railway runs Next.js as a long-running Node process with no per-request timeout, so the long Anthropic calls just run to completion.

### Project layout

```
src/
  app/
    page.tsx              landing
    audit/                public writing-style audit (no signup) — lead magnet
    login/                Supabase auth (magic link / password / signup)
    onboarding/           12-question intake + 30-piece corpus upload
                          + RSS / URL list import
    style/                rendered Style Profile (read-only viewer)
    generate/             source → 20 scored assets + per-asset regenerate
                          + audio/video transcribe panel
    dashboard/            counts, approval rate, recent generations
    billing/              Stripe checkout for the three retainer tiers
    auth/callback/        Supabase OAuth code exchange
    auth/signout/         signs out + redirects
    api/
      voice/build/        POST  builds Style Profile JSON from corpus
      generate/           POST  20-asset bundle, each asset QA-scored
      regenerate/         POST  one asset, steered by previous + feedback
      qa/                 POST  re-score one asset
      upload/             POST  save source content
      export/             GET   CSV / JSON export of a generation
      transcribe/         POST  multipart audio/video → Whisper transcript
      scrape/             POST  RSS / URL list / single page → pieces
      audit/              POST  public — score 3-10 posts (no auth)
      stripe/checkout/    POST  authed — start Stripe Checkout Session
      stripe/webhook/     POST  Stripe webhook (signature-verified)
      health/             GET   Railway healthcheck
  lib/
    anthropic.ts          Opus 4.7 client (singleton)
    types.ts              VoiceProfile + QAScorecard zod schemas
    stripe.ts             Stripe client + tier price-id resolver
    scrape.ts             RSS/Atom + HTML page extraction
    prompts/
      voiceBuild.ts       corpus → structured JSON
      generate.ts         source + cached profile → bundle / one asset
      qa.ts               per-asset scorecard
      audit.ts            public five-dimension audit
    db.ts                 Supabase queries
    supabase/             server + browser clients
    auth.ts               requireUser() helper
  middleware.ts           gates protected pages + API routes
scripts/smoke.ts          end-to-end prompt smoke test
supabase/migrations/      schema + RLS policies
```

### Why Opus 4.7

The Bible commits to one model. Opus 4.7 with `thinking: {type: "adaptive"}` is the right default — style extraction and QA both benefit from extended reasoning. The Style Profile is sent on every generation (and every QA call) for a creator, so it sits behind a `cache_control: {type: "ephemeral"}` breakpoint in the system block. That's a ~90% cost reduction on the cached prefix after the first call in a 5-minute window.

## Roadmap

- **Phase 0 (Weeks 1–4)** — manual + no-code (Lindy/n8n + Airtable + Notion). Sell to 5 paying creators before writing custom code.
- **Phase 1 (Months 2–6)** — thin web app, single-agent. Target: 30 paid customers, >60% 3-month retention, $6k+ MRR.
- **Phase 2 (Month 6+)** — multi-agent + scheduling, only if Phase 1 retention clears the bar.

## The strategic rules

1. Services first, software second.
2. One niche until $20k MRR.
3. The style profile is the product.
4. Ship the manual version before the automated one.
5. Founder is the first creator.
6. One model, one database, one frontend.
7. Compete on workflow ownership and creator outcomes — never on AI capability.

---

Full strategy, architecture, distribution plan, metrics, and risks: [**BIBLE.md**](./BIBLE.md).
