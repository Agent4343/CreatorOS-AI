# FieldForm — AI-native digital forms for the field

**A SaaS platform for any business that runs work in the field.** Design forms, or upload a paper form and let AI digitize it. Workers complete forms on phone or tablet — with compliant, auditable signatures. Multi-tenant, security-first.

---

## What it does

1. **Sign up your business** — gets its own isolated workspace.
2. **Create a form** — drag-and-drop builder, OR upload a paper form / PDF and AI converts it into a digital form schema you can edit.
3. **Invite your team** — each user has a role (owner / admin / member).
4. **Workers complete forms in the field** — on phone or tablet, capturing photos, GPS, and compliant electronic signatures.
5. **Multi-signer flows** — one form, multiple people complete and sign different sections.
6. **Audit-ready** — every signature is bound to a verified user identity with timestamp, IP, geolocation, and a SHA-256 hash of the signed data.

Industry-agnostic. Same engine handles construction safety, HVAC service tickets, manufacturing QC, vehicle pre-trip inspections, field clinic intake.

## The wedge

Existing tools (SafetyCulture, Fluix, ProntoForms) all have one painful workflow: **converting a paper form into a digital one is manual and slow.** They use 2018-era OCR + drag-and-drop rebuilding. We use multimodal Claude — upload the paper, get a working form back in 15–30 seconds.

Time-to-first-form: **under 30 minutes from signup**. SafetyCulture takes weeks.

## Stack

- **Next.js** (App Router) on Railway
- **Supabase** — Postgres + Auth + Storage. **Row Level Security** on every tenant table.
- **Anthropic Claude** — multimodal vision for paper-to-digital
- **Stripe** — per-user/month billing

## Security

This is a B2B compliance product, so security isn't a feature; it's the product:

- Row Level Security on every tenant-scoped table; no cross-tenant data leakage by design
- Email + password auth, optional TOTP 2FA
- Role-based access (owner / admin / member)
- Compliant electronic signatures with full audit trail (timestamp, IP, geolocation, SHA-256 hash of the signed data — tamper-evident, defensible under 21 CFR Part 11 / eIDAS / ESIGN)
- Append-only audit log of every consequential action; admin-readable, not modifiable
- TLS 1.3 in transit, AES-256 at rest

Full security architecture: see [BIBLE.md §7](./BIBLE.md#7-security-architecture--the-table-stakes).

## Pricing (planned)

| Tier | Price | What you get |
|---|---|---|
| Trial | Free 14 days | 3 users, 5 forms, 5 AI imports |
| Starter | $19 / user / mo | Up to 10 users, unlimited forms |
| Pro | $39 / user / mo | Up to 50 users, unlimited AI import, audit-log export |
| Enterprise | Custom | SSO, custom retention, SOC2 compliance docs |

## Roadmap

- **Phase 0** (Weeks 1–2) — validate AI paper-to-digital hits ≥80% success rate on real-world paper forms. Don't ship anything else until this works.
- **Phase 1** (Weeks 3–10) — paid MVP with multi-tenant auth, form builder, AI import, mobile-web completion, compliant signatures, audit log, Stripe billing.
- **Phase 2** (Month 4+) — only after 20 paying orgs across 2 industries. Adds: native apps, offline mode, multi-step signers, conditional logic, SOC2.

## Prior projects in this repo

This repo previously held two earlier products: **CreatorOS AI** (long-form text → social posts) and **Reel** (AI long-form comedy video factory). Both are preserved at `_archive/` and in git history. The current direction is a clean break.

---

Full strategy: [BIBLE.md](./BIBLE.md). Setup recipe: [SETUP.md](./SETUP.md).
