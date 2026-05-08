# CreatorOS AI

**A content workflow engine that turns one source into twenty platform-ready assets in your voice.**

Not an AI writer. Not a scheduler. Not a prompt library. CreatorOS AI replaces the editing-and-repurposing workflow that eats 15+ hours of an operator-creator's week.

---

## What it does

A creator drops in one long-form source (podcast, video, newsletter) and gets back ~20 platform-ready artifacts — clips, captions, threads, LinkedIn posts, newsletter teasers — in their voice, with a QA scorecard attached to every asset.

The wedge: **produce 20 platform-ready assets from one source in under an hour, without rewriting.**

## Who it's for

Operator-creators on LinkedIn and newsletters: consultants, founders, B2B thought-leaders, course operators, agency owners with personal brands. High payment intent, rich written training data, professional outbound channels.

## How it works

1. **Onboarding (10 min)** — 12-question voice intake + 30+ source pieces uploaded.
2. **Voice Profile build (3 min)** — one Claude call produces a structured JSON profile (vocabulary, sentence patterns, hooks, CTAs, tone vectors, format preferences, audience).
3. **Generate** — paste a transcript or topic, get a 20-asset bundle in 60–90 seconds with QA scores.
4. **Review** — approve, regenerate flagged assets, or edit in place. Edits feed back into the profile.
5. **Export** — copy buttons per platform.

## The two specs that matter

- **Voice Profile** — structured JSON, built from ≥30 source pieces via a single Claude call with structured output. Not a fine-tune, not embeddings, not a vector DB. See [BIBLE.md §7](./BIBLE.md#7-voice-profile--concrete-spec).
- **QA Rubric** — six dimensions (voice match, AI-tell density, specificity, hook strength, format fitness, CTA quality), each scored 0–10. Sub-7 scores get specific fix suggestions. See [BIBLE.md §8](./BIBLE.md#8-qa-rubric--concrete-spec).

## Pricing

Services-led. Setup is the high-margin product; software is retention.

| Tier             | Price            | What you get                                                |
| ---------------- | ---------------- | ----------------------------------------------------------- |
| Starter setup    | $1,500 once      | Voice profile + 1 workflow live + training                  |
| Studio setup     | $3,000 once      | 3 workflows + custom hook/CTA libraries + 30-day support    |
| Solo retainer    | $99 / mo         | 1 voice profile, 4 generations/week                         |
| Pro retainer     | $199 / mo        | 1 voice profile, unlimited, QA scorecard, priority support  |
| Team retainer    | $399 / mo        | Up to 3 voice profiles                                      |

## Stack (Phase 1)

- Next.js on Vercel
- Supabase (Postgres + auth + storage)
- Claude API (one model)
- Whisper / AssemblyAI for transcription
- Stripe for billing

No Redis, no queues, no microservices. Generation runs synchronously via streaming.

## Roadmap

- **Phase 0 (Weeks 1–4)** — manual + no-code (Lindy/n8n + Airtable + Notion). Sell to 5 paying creators before writing custom code.
- **Phase 1 (Months 2–6)** — thin web app, single-agent. Target: 30 paid customers, >60% 3-month retention, $6k+ MRR.
- **Phase 2 (Month 6+)** — multi-agent + scheduling, only if Phase 1 retention clears the bar.

## The strategic rules

1. Services first, software second.
2. One niche until $20k MRR.
3. The voice profile is the product.
4. Ship the manual version before the automated one.
5. Founder is the first creator.
6. One model, one database, one frontend.
7. Compete on workflow ownership and creator outcomes — never on AI capability.

---

Full strategy, architecture, distribution plan, metrics, and risks: [**BIBLE.md**](./BIBLE.md).
