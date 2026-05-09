# Setup — Reel from zero to running

End-to-end recipe for the single-user comedy video factory. Three external providers, one DB, one frontend, one password.

---

## 1 · Accounts you need

| Service | Why | Approx. cost |
|---|---|---|
| **Anthropic** | Comedy script generation (Opus 4.7) | ~$3 / month for ~30 videos |
| **ElevenLabs** | Voice synthesis | $22 / month starter plan |
| **HeyGen** | Photo Avatar talking-head video | $30–500 / month depending on volume |
| **Supabase** | Postgres + Storage | Free tier |
| **Railway** | Hosting | Free tier for testing |

---

## 2 · Supabase

1. supabase.com → New project.
2. **SQL Editor** → New query → paste `supabase/migrations/0001_init.sql` → Run. (Creates the `characters` and `clips` tables, plus the `clip-assets` storage bucket. **No RLS** — single-user app gated at middleware.)
3. **Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

You don't need the anon key — single-user mode never instantiates a browser-side Supabase client.

---

## 3 · Provider keys

| Service | Where to get the key | Env var |
|---|---|---|
| Anthropic | console.anthropic.com → API Keys | `ANTHROPIC_API_KEY` |
| ElevenLabs | elevenlabs.io → Profile → API key | `ELEVENLABS_API_KEY` |
| HeyGen | heygen.com → API settings | `HEYGEN_API_KEY` |

Then open `src/lib/providers/elevenlabs.ts` and replace the `voice_id` placeholders in `CURATED_VOICES` with real IDs from your ElevenLabs Voices dashboard.

### Create your HeyGen Photo Avatar

This step is manual on HeyGen's side because their avatar pipeline has its own consent flow.

1. heygen.com → **Photo Avatars** → New
2. Upload a face-forward image (your character's face — could be Midjourney output you own, or any image you have rights to)
3. Name it. HeyGen generates the avatar.
4. Copy the **avatar_id** from the avatar's settings page.

That avatar_id goes into the `/character/new` form in Reel as `heygen://<avatar_id>`. The form prefixes the scheme automatically.

---

## 4 · Local dev

```bash
cp .env.example .env.local
# fill the keys from steps 2-3
# pick a strong password for APP_PASSWORD
# pick a random string for CRON_SECRET
npm install
npm run dev
```

Open http://localhost:3000. Sign in with `APP_PASSWORD`.

### Validate the script first

Per BIBLE.md §6 Phase 0: don't render any expensive HeyGen videos until you trust the script.

```bash
npm run smoke:script
```

Generates 5 long-form comedy scripts against a fixture persona and prints them. Read each out loud. Score 1–5 ("would I watch all the way through"). If <40% score 4+, iterate `src/lib/prompts/script.ts` and run again. Don't move on until the comedy lands at length.

### End-to-end test

1. Sign in.
2. Go to `/character/new`. Paste your HeyGen avatar_id, pick voice, write persona, save.
3. Go to `/generate`. Type a topic. Click Generate.
4. Status updates show *Writing script → Recording voice → Rendering video*. Total wall-clock 5–15 min.
5. Video plays inline. Download MP4. Upload to YouTube manually.

---

## 5 · Deploy to Railway

1. railway.app → New Project → Deploy from GitHub repo.
2. **Settings → Environment** → paste in everything from `.env.local`. The `/api/health` endpoint will 503 if any required key is missing (and tell you which).
3. **Settings → Healthcheck Path** → `/api/health`.
4. **Settings → Networking → Generate Domain**.
5. Deploy.

### Cron the polling endpoint

HeyGen renders are 5–15 min. Without a cron, finished videos never flip to `done` and you'd have to poll manually.

Add a Railway cron schedule:
- **Schedule**: `*/1 * * * *` (every minute)
- **Command**: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $RAILWAY_PUBLIC_DOMAIN/api/jobs/poll`

Or use any external cron service that can hit a URL with a bearer token.

---

## 6 · Going to production

A solo deploy is "production" once it's on Railway with a real domain. But before relying on it for a daily upload schedule:

- Verify HeyGen quotas / pricing fit your volume
- Test 5+ end-to-end videos against your actual persona before publishing any
- Set up a basic uptime monitor on `/api/health`

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` returns 503 | Some required env var is missing. Response body lists which. |
| Login page rejects every password | `APP_PASSWORD` either isn't set, or has whitespace / quotes you didn't expect. Echo it from a terminal to confirm. |
| Script generation 401 | `ANTHROPIC_API_KEY` invalid or missing |
| Voice synth 401 | `ELEVENLABS_API_KEY` invalid, or the `voice_id` on your character isn't in your ElevenLabs account |
| Character save fails: "HeyGen requires reference_image_url to be 'heygen://<avatar_id>'" | The form should prefix `heygen://` automatically. Double-check the avatar_id is just the ID string (no scheme, no URL). |
| HeyGen render fails | Check HeyGen dashboard for the job. Common: avatar_id wrong, audio_url not publicly fetchable, account out of credit. |
| Video stuck at `rendering` for >30 min | Cron isn't running. Hit `/api/jobs/poll` manually with the bearer token to confirm logic works, then fix the cron config. |

---

Total cost to validate end-to-end: ~$10–15 of API spend (one persona + 5 sample scripts + one finished 8-minute video).
