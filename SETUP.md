# Setup — Reel from zero to running

End-to-end recipe to get the comedy clip factory running on your machine, then deployed to Railway.

Five accounts:

- **Anthropic** — script generation. ~$5 of credit gets you started.
- **ElevenLabs** — voice. $5 starter plan is fine for testing.
- **Hedra** — talking-head video. Pay-as-you-go; ~$0.50/clip on Character-3.
- **Supabase** — Postgres + auth + storage. Free tier works.
- **Railway** — hosting. Free tier works for testing.

---

## 1 · Supabase

1. supabase.com → New project.
2. **SQL Editor** → New query → paste `supabase/migrations/0001_init.sql` → Run. (Creates the `characters` and `clips` tables, the `clip-assets` storage bucket, and RLS policies.)
3. **Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2 · Provider keys

| Service | Where to get the key | Env var |
|---|---|---|
| Anthropic | console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` |
| ElevenLabs | elevenlabs.io → Profile → API key | `ELEVENLABS_API_KEY` |
| Hedra | hedra.com → API settings | `HEDRA_API_KEY` |

Then open `src/lib/providers/elevenlabs.ts` and replace the `voice_id` placeholders in `CURATED_VOICES` with real IDs from your ElevenLabs Voices dashboard.

---

## 3 · Local dev

```bash
cp .env.example .env.local
# fill the keys from steps 1-2
npm install
npm run dev
```

Open http://localhost:3000.

### Validate the comedy first

Per BIBLE.md §6 Phase 0: don't waste time on UI until the script generator works.

```bash
npm run smoke:script
```

Generates 5 comedy scripts against a fixture persona and prints them. Score each 1–5 ("would I watch this"). If <40% score 4+, iterate `src/lib/prompts/script.ts` and run again. Don't move on until the comedy lands.

### Walk through the product

1. Sign up at `/login` (magic link or password).
2. Go to `/character/new`. Upload an image URL (Unsplash portrait works for testing). Pick a voice. Write a persona. Save.
3. Go to `/generate`. Type a topic. Click Generate. Status updates show *Writing script → Recording voice → Rendering video*. Total ~3 min.
4. Video plays inline when ready. Library at `/library`.

---

## 4 · Deploy to Railway

1. railway.app → New Project → Deploy from GitHub repo.
2. **Settings → Environment** → paste in all keys from `.env.local`.
3. **Settings → Healthcheck Path** → `/api/health`. Returns 503 with the missing-keys list if anything is unset.
4. **Settings → Networking → Generate Domain**.
5. Deploy.

### Cron for the polling endpoint

Hedra renders are async and can take 1–4 minutes. The app needs to poll Hedra periodically to detect completion. Two options:

**Option A — Railway cron** (recommended). Add a cron schedule that hits `POST /api/jobs/poll` every 30 seconds with `Authorization: Bearer $CRON_SECRET`.

**Option B — Hedra webhook**. If/when Hedra adds webhook support, point it at `/api/webhooks/hedra` (route is reserved but not yet implemented).

Set `CRON_SECRET` in env to a random string. The poll route requires this token.

---

## 5 · Make yourself admin (optional)

`ADMIN_USER_IDS` is a comma-separated list of Supabase auth UUIDs. Members see admin tooling (TBD). Find your UUID at Supabase → Authentication → Users.

---

## 6 · Going to production

Before charging real money:

- Stripe products created (`Hobbyist $19`, `Creator $49`, `Pro $99`) and IDs in env
- Stripe webhook endpoint pointed at `/api/webhooks/stripe` (route reserved)
- A face-match check on uploaded reference images (BIBLE.md §14 risk row 5)
- Per-clip credit accounting (deduct on generate, refund on failed render)

These are not built yet — they're Phase 1 milestones, not Phase 0.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` returns 503 | Some required env var is missing. Response body lists which. |
| Script generation 401 | `ANTHROPIC_API_KEY` invalid or missing |
| Voice synth 401 | `ELEVENLABS_API_KEY` invalid, or the `voice_id` in your character record isn't in your ElevenLabs account |
| Hedra render fails | Check Hedra dashboard for the job. Common causes: image isn't face-forward, audio is too long, account out of credit |
| Video shows status `rendering` for >10 min | Cron poll isn't running. Check Railway cron config or hit `/api/jobs/poll` manually with the bearer token |
| RLS error on character create | Service role key not set, or the user_id in the request doesn't match the signed-in user |

---

Total cost to validate end-to-end: ~$3 of API spend (one persona + 5 sample scripts + one finished clip).
