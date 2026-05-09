# FieldForm — Project Bible v1

**A digital forms + checklists platform for any business that runs work in the field.** Design a form in the app, or upload a paper copy and let AI digitize it. Workers complete forms on phone, tablet, or computer — with compliant, auditable signatures. Multi-tenant, security-first.
*Version 1.0 · May 2026*

---

## 0. What this is

A SaaS platform where:

- A **business signs up** and gets its own isolated workspace.
- The **business owner / admin** designs digital forms — drag-and-drop, OR uploads a paper form/PDF and AI converts it into a digital form they can edit.
- They **invite their employees** as users (with assigned roles).
- Workers **complete forms in the field** on phone or tablet — capturing photos, GPS, and compliant electronic signatures.
- Forms can require **one or many signers** (foreman fills section A → safety officer signs B → manager approves C).
- Every signature is bound to a verified user identity with a full **audit trail** (timestamp, IP, geolocation, hash of the data signed) for regulatory compliance.

Industry-agnostic — the same engine handles a construction safety inspection, an HVAC service ticket, a manufacturing QC checklist, a vehicle pre-trip inspection, or a field clinic intake form.

---

## 1. Vision

The forms-and-checklists category exists (SafetyCulture / iAuditor, Fluix, ProntoForms, GoFormz, Zoho Forms) but every incumbent has the same gap: **converting an existing paper form into a working digital one is painful.** Old OCR + manual field-mapping + form-builder learning curve. Modern multimodal AI eats that workflow whole.

Our wedge: **paper-to-digital that actually works.** Upload the form; AI returns a clean schema; you edit and ship. Ten-minute onboarding instead of three-week implementation.

The rest of the product (form builder, mobile completion, signatures, audit) needs to be table-stakes — clean, fast, secure. The wedge is the door; the rest is the room.

---

## 2. The problem

Every business with field work has three painful workflows:

| Pain | Today |
|---|---|
| Paper forms in pickup trucks, on clipboards, in service vans | Lost, illegible, photographed and emailed, manually re-entered |
| Compliance audits | Dig through filing cabinets / shared drives looking for the signed form from June 2024 |
| Multi-step approvals | Form gets faxed / emailed / passed around, signatures collected by hand, no audit trail |

A platform like FieldForm replaces all three with: forms designed once, completed once, signed compliantly, retrievable in seconds, and always audit-ready.

The reason businesses stay on paper isn't that no software exists — it's that switching is hard. Existing tools require someone to manually rebuild every form. AI removes that friction.

---

## 3. The honest moat

We're not first. SafetyCulture has a $2B+ valuation, ~100k+ paying customers. Fluix is mature. JotForm has a form builder + signatures.

What's actually defensible, ranked:

1. **AI paper-to-digital that genuinely works.** The incumbents use 2018-era OCR. We use multimodal Claude. The gap is real now and will narrow over 18 months. We have to be 10× better while it's open.
2. **Time-to-first-form.** Sign up → first completed form in under 30 minutes. Incumbents take days because of manual form-building. We can collapse that to one upload + a 5-minute review.
3. **Per-industry templates as a network effect.** Once 50 construction companies use us, our construction template library is the best in the market. Same in oil&gas, HVAC, etc.
4. **Compliance posture.** Audit log + signature integrity + RLS isolation isn't differentiating, but lacking any of them is disqualifying. We have to ship them as table stakes.

What is **not** a moat: the form builder UX (everyone has one), the mobile app (everyone has one), e-signatures (commodity).

---

## 4. Initial niche — wedge then expand

The product is industry-agnostic by design, but we **launch into ONE industry** to build the template library and the case-study portfolio. Recommendations, in order of preference:

| Industry | Why | Avg. willingness to pay |
|---|---|---|
| **Construction / contractors** | Broadest market, most existing-paper-form pain, easiest to find pilot customers | $30–80/user/mo |
| **Oil & gas / utilities field crews** | Highest regulatory burden (OSHA, DOT, EPA forms), highest willingness to pay | $80–200/user/mo |
| **HVAC / plumbing / electrical** | Service tickets + permit forms; high turnover means easy onboarding | $25–60/user/mo |
| **Manufacturing QC** | Heavy paper checklist culture, ISO/AS9100 audit requirements | $50–150/user/mo |
| **Transportation / fleet (DVIR)** | DOT-required daily forms; clear regulatory anchor | $20–50/user/mo |

Default starting wedge: **construction**. Largest pool of small operators, easiest cold outreach, most existing relationships you can tap.

---

## 5. Positioning

**Not** a form builder. **Not** an e-signature tool. **Not** an inspection app.

A **field operations platform** that turns paper into compliant digital workflows in minutes.

The category we want to own: *AI-native field forms.*

---

## 6. Phases

### Phase 0 — validate the wedge (Weeks 1–2)

Before paying customers, prove the thing that has to be true: **AI paper-to-digital actually produces a usable form schema.**

- Collect 20 real paper forms from real industries (construction safety, HVAC service tickets, DVIR, etc. — Google Images + form-supply websites).
- Run each through the import pipeline. Score 1–5 on: did it identify all fields? Field types correct? Sections preserved? Required fields flagged?
- Iterate the prompt until ≥80% of forms come back with a schema that needs only minor cleanup (not a full rebuild).

If <80%, the wedge isn't real yet — tune before building anything else.

### Phase 1 — paid MVP (Weeks 3–10)

End-to-end SaaS for one customer per industry:

- Multi-tenant: org sign-up, member invites, role-based access
- Form builder (visual, JSON schema underneath)
- AI paper-to-digital import
- Form completion on web (mobile-responsive, no native app yet)
- Photo upload, GPS capture, signature pad
- Compliant signatures with full audit trail
- Submissions list + PDF export
- Audit log readable by admins
- Stripe billing per-user / per-month

Deferred to Phase 2:

- Native iOS / Android apps
- Offline mode (PWA cache)
- Multi-step / multi-signer workflows
- Conditional logic
- API + webhooks
- Custom branding / white-label
- SOC2 / 21 CFR Part 11 / eIDAS certifications

### Phase 2 — what wins enterprise (Month 4+)

Only build after Phase 1 has 20 paying customers across 2 industries. At that point: enterprise-readiness investments (SOC2, native mobile, offline) earn their cost.

---

## 7. Security architecture — the table stakes

Lacking any of these is disqualifying for the kinds of businesses we want as customers. None are differentiating; all are required.

### 7.1 Tenant isolation

- Every business is an `org`. Every form, submission, file, audit log row is scoped to an `org_id`.
- Postgres **Row Level Security** is the primary isolation layer. Every table that contains tenant data has an RLS policy keyed on `auth.uid() ∈ (members of org)`.
- The service-role key is used only in two contexts: (a) server-side actions that have already verified org membership for the requesting user, (b) the audit-log writer.
- Cross-tenant data leakage is the only Sev-1 bug class. We test for it explicitly.

### 7.2 Identity

- Email + password (Supabase auth) by default.
- TOTP 2FA optional in Phase 1, mandatory for admin roles.
- SSO (Google Workspace, Microsoft 365, SAML for enterprise) in Phase 2.
- Session timeout configurable per-org (default 12 hrs; some industrial customers need 1 hr).

### 7.3 Roles

| Role | What they can do |
|---|---|
| **Owner** | Everything. Can transfer ownership. Cannot be deleted by a non-owner. |
| **Admin** | Manage users, forms, billing. Cannot delete the org. |
| **Member** | Complete forms, view their own submissions, view forms shared with them. |
| **Viewer** | Read-only on submissions assigned to them. (Phase 2 — for clients/auditors.) |

### 7.4 Compliant electronic signatures

A signature is not just an image of a name. To be defensible under 21 CFR Part 11 / eIDAS / ESIGN Act, every signature record stores:

- Signer's verified user_id
- Signer's full name and email at time of signing
- ISO 8601 timestamp
- IP address
- Geolocation (if mobile and permission granted)
- The full submission data being signed
- A cryptographic hash (SHA-256) of the submission data + user_id + timestamp — so any tampering with the form contents after signing invalidates the signature
- Signature image (canvas drawing or typed name)

The audit trail for any submission can be exported as a PDF at any time and is admissible as evidence.

### 7.5 Audit logs

Every consequential action writes to `audit_logs`:

- form created / edited / deleted / archived
- submission created / completed / signed
- user invited / role changed / removed
- form imported (with the source filename)
- export (someone downloaded a PDF / CSV)
- failed login attempts (for security investigations)

Audit log is append-only at the DB level. Admins can read their org's audit log; nobody can modify or delete entries.

### 7.6 Encryption + transport

- TLS 1.3 in transit (managed by Railway + Cloudflare)
- AES-256 at rest (managed by Supabase)
- File uploads (photos, paper forms) stored in Supabase Storage; per-org buckets with policy-gated access

### 7.7 Data residency + retention

- Default: data stored in the customer's chosen region (US / EU). Phase 2 enterprise feature.
- Retention configurable per-org. Default: forever for completed submissions; drafts purged after 30 days.

---

## 8. Form schema spec

Forms are JSON. The shape:

```json
{
  "id": "...",
  "name": "Daily site safety inspection",
  "description": "...",
  "version": 3,
  "sections": [
    {
      "id": "s1",
      "title": "Site information",
      "fields": [
        { "id": "f1", "type": "text", "label": "Site name", "required": true },
        { "id": "f2", "type": "date", "label": "Inspection date", "required": true, "default": "today" },
        { "id": "f3", "type": "gps", "label": "Site location", "auto": true }
      ]
    },
    {
      "id": "s2",
      "title": "Hazards",
      "fields": [
        { "id": "f4", "type": "checkbox", "label": "Are all guardrails in place?", "required": true },
        { "id": "f5", "type": "photo", "label": "Photos of any hazards", "multiple": true, "max": 10 }
      ]
    },
    {
      "id": "s3",
      "title": "Sign-off",
      "fields": [
        { "id": "f6", "type": "signature", "label": "Foreman signature", "required": true, "signer_role": "foreman" },
        { "id": "f7", "type": "signature", "label": "Safety officer signature", "required": true, "signer_role": "safety_officer" }
      ]
    }
  ]
}
```

Field types (Phase 1):

`text` · `textarea` · `number` · `date` · `datetime` · `dropdown` · `multi_select` · `checkbox` · `radio` · `photo` · `signature` · `gps` · `timestamp` · `section_header` · `divider`

Field types (Phase 2):

`conditional` (show/hide based on another field) · `formula` (computed) · `file` (PDF upload) · `barcode` · `lookup` (linked to another submission)

---

## 9. Pricing

Per-user, per-month. The category benchmark.

| Tier | Price | What you get |
|---|---|---|
| **Trial** | Free, 14 days | 3 users, 5 forms, AI import 5 forms |
| **Starter** | $19 / user / mo | Up to 10 users, unlimited forms, unlimited submissions, AI import 20 / mo |
| **Pro** | $39 / user / mo | Up to 50 users, unlimited AI import, audit log export, multi-signer workflows |
| **Enterprise** | Custom | SSO, custom retention, dedicated region, SLA, SOC2 compliance docs |

Starter is priced under SafetyCulture's lite tier (~$24/user). Pro is competitive with Fluix. Both undercut the high end on features they care about.

---

## 10. Architecture — Phase 1

```
┌──────────────────────────────────────────────┐
│            Next.js (Railway)                 │
│  /forms · /submissions · /settings · /audit  │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│         Next.js API routes                   │
│  /forms · /forms/import · /submissions       │
│  /signatures · /audit · /invites             │
└─────┬─────────────┬─────────────┬────────────┘
      │             │             │
      ▼             ▼             ▼
┌──────────┐ ┌─────────────┐ ┌──────────────┐
│ Supabase │ │ Claude      │ │ Stripe       │
│ Postgres │ │ (multimodal │ │ (per-user/mo │
│ Auth     │ │  vision for │ │  billing)    │
│ Storage  │ │ paper→form) │ │              │
└──────────┘ └─────────────┘ └──────────────┘
```

**Key tables:**

- `orgs` — businesses
- `memberships` — user ↔ org with role
- `invites` — pending invitations (email, role, token)
- `forms` — current form templates
- `form_versions` — immutable history of every form schema
- `submissions` — completed/in-progress form fills
- `submission_signatures` — one row per signature with full audit trail
- `audit_logs` — append-only consequential events
- Supabase Storage buckets — `form-photos`, `form-paper-imports`, `signatures`

**RLS everywhere.** No table that holds tenant data is readable without a verified org membership claim.

**Environment variables:**

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
```

---

## 11. User flow — Phase 1

1. **Sign up.** Email + password. Auto-creates an `org` with the signer as Owner.
2. **Invite teammates.** Owner sends invite emails; recipients set their own password and join the org.
3. **Create a form.** Two paths:
   - **Drag-and-drop builder** — pick fields, drop them into sections, save.
   - **Upload paper form** — drag in a PDF or photo. AI returns a draft schema in 15–30 seconds. Owner edits, saves.
4. **Assign the form** to specific roles or all members.
5. **A worker fills out the form** on their phone or tablet. Photos uploaded, GPS captured, signature drawn.
6. **Other signers (if any)** are notified, sign their sections.
7. **Submission completes** when the last required signature lands. Audit log writes; PDF export available.
8. **Compliance officer / admin** can search the audit log, export submissions to CSV/PDF, and pull the full chain of custody for any signed form.

---

## 12. Distribution

Three loops, same playbook as any vertical SaaS:

### Loop 1 — Industry-specific cold outreach

Pick the wedge industry. Pull a list of 1,000 small businesses in that industry (LinkedIn / Apollo / Google Maps scrape). Personalized cold email at the owner / safety manager / ops manager level.

The pitch isn't "we're the best forms platform." It's: *"Bring me 5 of your paper forms; I'll have them digital and on your phone before this call ends."*

The 30-minute live demo where you upload their actual paper form and it digitizes in front of them is the entire sales motion. Anyone who's been quoted a 6-week SafetyCulture implementation will sign on the spot.

### Loop 2 — Industry-specific case studies

For every paying customer in the wedge industry: a documented case study. *"How [company] cut daily inspection time from 25 minutes to 6."* Each case study is a landing page, a LinkedIn post, and an outbound asset.

### Loop 3 — Template library as marketing

Public, searchable library of starter templates per industry. SEO. *"Free OSHA daily safety inspection template — works on iPhone."* Drives bottom-of-funnel signups for "they already had this form anyway."

---

## 13. Metrics that matter

| Metric | Phase 1 target (Month 6) |
|---|---|
| Paid orgs | 30 |
| Avg users per org | 5 |
| Time signup → first completed form | <30 min |
| AI import success rate (form usable with minor edits) | >80% |
| Trial → paid conversion | >20% |
| Net revenue retention | >100% |
| MRR | $7k+ |

The leading indicator is **AI import success rate**. If we lose at the wedge, nothing else matters.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI paper-to-digital is unreliable | Phase 0 hand-validation. If <80% success rate after prompt iteration, niche the wedge to a single form type per industry where we can be 100%. |
| RLS misconfiguration leaks one tenant's data to another | Automated tests that try cross-tenant reads with every PR. Sev-1 bug class. |
| Signature challenged in court | Compliant audit trail (§7.4) + SHA-256 of signed data hash. Get a one-time legal review before going to enterprise customers. |
| SafetyCulture or Fluix copies the AI import wedge | They will. Window is 18 months. We have to be 10× better in that window and win the wedge industries before they react. |
| One regulated industry has compliance requirements we missed | Don't sell into healthcare, finance, or government in Phase 1 without a compliance officer on payroll. |
| Stripe disputes from disgruntled trial users | Hard cap trial features. Make cancellation one click. Don't gate cancel behind support. |

---

## 15. Strategic rules

1. **Security is table stakes, not a feature.** RLS everywhere. Audit log on by default. Signatures hashed on write.
2. **The wedge is paper-to-digital.** Every release should make it more reliable, not add unrelated features.
3. **Industry-agnostic engine, industry-specific go-to-market.** Same product, different sales motion per vertical.
4. **One industry until $20k MRR.** Then the second.
5. **No Phase 2 features in Phase 1.** Multi-step signers, offline, native apps, conditional logic — all wait until 20 paying orgs are using the basics.
6. **Pricing is per-user, monthly.** No "unlimited" plans that get gamed.
7. **Don't sell into healthcare/finance/government** without a compliance hire.

---

*v1 is opinionated by design. Disagreement on any specific call is welcome — the document exists to be argued with.*
