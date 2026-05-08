# Setup — go from zero to a running CreatorOS AI

End-to-end recipe for bootstrapping the app, signing yourself up as the admin, and using it as a real creator.

Three accounts you need:
- **Supabase** — free tier is fine
- **Anthropic** — pay-as-you-go, ~$5 of credit gets you started
- **Railway** — for hosting

OpenAI (Whisper) and Stripe are **optional** — paste-only generation works without Whisper, and `/billing` is hidden until you set Stripe keys.

---

## 1 · Supabase

### Create the project

1. supabase.com → New project. Pick a name, region, set a DB password (save it).
2. Wait for it to provision (~2 min).

### Apply the migrations

3. Left sidebar → **SQL Editor** → New query.
4. Paste the contents of `supabase/migrations/0001_init.sql`. Run.
5. New query. Paste `supabase/migrations/0002_subscriptions.sql`. Run.

### Grab the keys

6. Left sidebar → **Settings → API**. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses RLS. Never put it in client code.

---

## 2 · Anthropic key

console.anthropic.com → API Keys → Create. Copy → `ANTHROPIC_API_KEY`. Add at least $5 of credit.

---

## 3 · Local dev

```bash
cp .env.example .env.local
# fill in the four required vars from steps 1-2
npm install
npm run dev
```

Open http://localhost:3000.

### Sign up as yourself

1. Click **Sign in** → "New here? Create account" → enter your email + password (or use a magic link).
2. After confirming, you'll land on `/dashboard`.

### Make yourself admin

3. In Supabase → **Authentication → Users**, find your row, copy the `id` (a UUID).
4. Add it to `.env.local`:
   ```
   ADMIN_USER_IDS=<paste the UUID>
   ```
5. Restart `npm run dev`.
6. Refresh the app. You should see an **Admin** link in the nav. Click it → `/admin` shows counts and all creators (currently just you, with no profile).

Add more admins by comma-separating: `ADMIN_USER_IDS=uuid1,uuid2,uuid3`.

---

## 4 · Walk through the product

1. Click **Onboarding**.
2. Either paste an RSS feed URL (your blog, your Substack) or paste 30+ pieces of your own writing separated by lines containing only `---`.
3. Wait until the progress bar shows **30/30 · ready**.
4. Optionally open the "About you" section and fill in 4 quick questions. Skipping is fine — Claude infers from the corpus.
5. Click **Build style profile**. ~3 minutes. Costs ~$0.50 in Anthropic tokens.
6. Lands on `/style` showing your structured profile.
7. Click **Generate**. Paste a podcast transcript or essay. Click **Generate bundle**. ~60–90 seconds. Costs ~$0.50–1 per generation.
8. Review the 20 assets. Click **regenerate** on any flagged ones. Optionally type feedback.
9. Click **Export CSV** or **Export JSON** to get the bundle out.

### Smoke test (without going through the UI)

```bash
npm run smoke
```

Runs `style-build → generate → QA(first 3)` against a synthetic operator-creator fixture. ~$1–2 per run. Lets you validate the prompt chain produces parseable JSON without touching Supabase or the API routes.

---

## 5 · Deploy to Railway

1. railway.app → New Project → Deploy from GitHub repo. Pick `Agent4343/CreatorOS-AI`. Pick the branch.
2. **Settings → Environment**: paste in everything from your `.env.local`. At minimum:
   ```
   ANTHROPIC_API_KEY
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ADMIN_USER_IDS
   ```
3. **Settings → Networking → Generate Domain**.
4. **Settings → Healthcheck Path**: `/api/health`. Save.
5. Deploy. First build takes ~3 min.
6. Visit your Railway domain. Sign up using the same email as locally if you want to share data, or fresh if you want a clean prod environment.

---

## 6 · Optional add-ons

### Whisper (audio/video → transcript)

Get an OpenAI API key. Add to env:
```
WHISPER_API_KEY=sk-...
```
The "Transcribe audio or video" panel on `/generate` becomes functional.

### Stripe billing

1. dashboard.stripe.com → in test mode → **Products**. Create three recurring products:
   - Solo · $99 / month
   - Pro · $199 / month
   - Team · $399 / month
2. Copy each price ID (`price_...`) and add to env:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_SOLO=price_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_PRICE_TEAM=price_...
   ```
3. **Webhooks** → Add endpoint → URL: `https://<your-railway-domain>/api/stripe/webhook` → events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

`/billing` will now drive real test-mode checkouts.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` returns 503 with a `missing` array | One of the required env vars isn't set. The list tells you which. |
| Onboarding 401s on submit | Cookie didn't propagate after signup. Sign out and back in. |
| `npm run smoke` fails with "ANTHROPIC_API_KEY is not set" | Either fill `.env.local` or `export ANTHROPIC_API_KEY=...` in your shell. |
| Build profile fails with "At least 30 source pieces required" | The corpus separator is exactly a line containing `---` and nothing else. Imported pieces use this automatically. |
| Admin link doesn't appear | Restart `npm run dev` after editing `.env.local`. Confirm the UUID matches the one in Supabase → Authentication → Users. |
| Generation produces JSON parse errors | Likely a transient Claude issue. Retry once. If persistent, file an issue. |

---

That's the whole setup. Total cost to validate end-to-end: ~$3 of Anthropic tokens, $0 of infra (Supabase + Railway free tiers).
