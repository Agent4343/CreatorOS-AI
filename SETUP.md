# Setup — FieldForm from zero to running

End-to-end recipe for the multi-tenant digital forms platform.

---

## 1 · Accounts

| Service | Purpose | Cost |
|---|---|---|
| Supabase | Postgres + Auth + Storage. **Required.** | Free tier ample for early use |
| Anthropic | Multimodal Claude for paper-to-digital import | Pay-as-you-go (~$0.05–0.20 per form import) |
| Railway | Hosting | Free tier for testing |
| Stripe (later) | Per-user/month billing | Pay-as-you-go on transactions |

---

## 2 · Supabase

1. supabase.com → New project.
2. **SQL Editor** → New query → paste `supabase/migrations/0001_init.sql` → Run.
3. **Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
4. **Authentication → Providers** → ensure **Email** is enabled. (Optional: enable Google / Microsoft for SSO later.)
5. **Authentication → Email Templates** → set the confirm-email and magic-link redirect to `https://<your-domain>/auth/callback`.

The migration creates:
- `orgs`, `memberships`, `invites`
- `forms`, `form_versions`
- `submissions`, `submission_signatures`
- `audit_logs` (append-only via DB triggers)
- Three Storage buckets (`form-photos`, `form-paper-imports`, `signatures`) with per-org folder isolation
- Row Level Security on every tenant table, keyed on org membership

---

## 3 · Anthropic key

console.anthropic.com → API Keys → Create. Add to env:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Add at least $5 of credit. The paper-to-digital import is one Claude call per form (~$0.05–0.20 each).

---

## 4 · Local dev

```bash
cp .env.example .env.local
# fill in Supabase + Anthropic keys
npm install
npm run dev
```

Open http://localhost:3000.

### Walk through

1. Sign up at `/login` → confirm via email.
2. Land on `/onboarding` → name your business.
3. Land on `/dashboard` → click **Forms**.
4. Click **✨ Import from paper** → upload a PDF or photo of any paper form (try a downloadable OSHA inspection sheet, or a sample DVIR).
5. Watch AI return a structured form schema in 15–30 seconds.
6. Review, click **Save form**.
7. Back on the form page, click **Start a submission**.
8. Fill it out. Sign any signature fields. Submit.
9. Check `/settings` → Audit log shows every action.

---

## 5 · Deploy to Railway

1. railway.app → New Project → Deploy from GitHub repo.
2. **Environment** → set every variable from `.env.example`.
3. **Healthcheck Path** → `/api/health`. Returns 503 with the missing-key list if env is incomplete.
4. **Networking** → Generate domain.
5. Update Supabase **Authentication → URL Configuration** → add the Railway domain to allowed redirect URLs.

---

## 6 · Security checklist before any real customer

This is a B2B compliance product. Do not ship to a paying customer until:

- [ ] You've manually verified RLS isolation: log in as User A in Org A; try to fetch a form ID from Org B via the API. Should 404 / forbid.
- [ ] You've confirmed `audit_logs` is append-only: try `update audit_logs set action='x' where 1=1` from the SQL editor — should error.
- [ ] You've confirmed signature integrity: complete a submission, sign it, then UPDATE the submission's data in the DB directly. The signature's `data_hash` will no longer match a recomputed hash → tamper-evident.
- [ ] Stripe is wired (or you have a manual billing process).
- [ ] You've gotten one paper form through the paper-to-digital flow that has at least 15 fields, and verified the AI captured them all.
- [ ] You've confirmed the email-based onboarding works on a fresh account.

---

## What's not in this MVP

Per BIBLE.md §6 "Phase 1," the following are deliberately deferred:

- Visual drag-and-drop form editor (current state: JSON schema is auto-built by the importer; manual editing is via the API or by re-importing)
- Multi-step / multi-signer workflows beyond a single form
- Native iOS / Android apps (web is mobile-responsive)
- Offline mode
- Conditional logic
- Stripe billing wiring
- Invite-by-email flow for new members
- SOC2 / 21 CFR Part 11 / eIDAS certifications

These all come after Phase 1 has 20+ paying customers.

---

Total cost to validate end-to-end: **~$5 of Anthropic + $0 of infra** (Supabase + Railway free tiers).
