export default function Home() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-5xl font-bold leading-tight tracking-tight">
          Paper forms,
          <br />
          digital in 30 seconds.
          <br />
          <span className="text-accent">Signed, audited, on every device.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/80">
          Upload a paper inspection sheet, safety checklist, or service ticket.
          Our AI converts it into a working digital form. Your team completes
          it on phone or tablet — with photos, GPS, and compliant electronic
          signatures backed by a tamper-evident audit trail.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href="/login?next=/onboarding"
            className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg no-underline hover:bg-accent"
          >
            Start free trial
          </a>
          <a
            href="#how"
            className="rounded-md border border-ink/20 px-5 py-3 text-sm font-medium text-ink no-underline"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="grid gap-8 md:grid-cols-3">
        <Card
          n="1"
          title="Sign up your business"
          body="Each business gets its own isolated workspace. Invite your team and assign roles (owner / admin / member). Trial is free for 14 days, no card."
        />
        <Card
          n="2"
          title="Bring your forms"
          body="Drag in a PDF or photo of your existing paper form. AI returns a working digital form schema in seconds. Edit anything you want, save."
        />
        <Card
          n="3"
          title="Field-ready, audit-ready"
          body="Workers fill out forms on phone or tablet — photos, GPS, signatures. Every signature stamped with timestamp, IP, geolocation, and a SHA-256 hash of the data signed. Tamper-evident, defensible."
        />
      </section>

      <section className="rounded-lg border border-ink/15 bg-white p-6">
        <h2 className="text-xl font-bold">Built security-first</h2>
        <ul className="mt-3 grid gap-2 text-sm text-ink/80 md:grid-cols-2">
          <li>• Postgres Row Level Security on every tenant table — zero cross-tenant data exposure by design</li>
          <li>• Append-only audit log of every consequential action</li>
          <li>• SHA-256 integrity hash on every signature — tamper-evident under 21 CFR Part 11 / eIDAS / ESIGN</li>
          <li>• Encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
          <li>• Role-based access (owner / admin / member / viewer)</li>
          <li>• Per-org file storage with policy-gated access</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white p-5">
      <div className="font-mono text-xs text-accent">Step {n}</div>
      <h3 className="mt-2 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-ink/75">{body}</p>
    </div>
  );
}
