import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";

export default async function DashboardPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");

  // For now, single-org assumption (most users will have one). When
  // someone joins multiple orgs we'll add an org-picker here.
  const { org, role } = orgs[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted">
          Plan: {org.plan} · Your role: {role}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          title="Forms"
          body="Design forms or import paper ones. AI converts PDFs and photos to working digital forms."
          href="/forms"
          cta="Manage forms"
        />
        <Tile
          title="Submissions"
          body="See completed and in-progress forms across your team. Export, audit, sign."
          href="/submissions"
          cta="View submissions"
        />
        <Tile
          title="Settings"
          body="Invite teammates, manage roles, view audit log."
          href="/settings"
          cta="Open settings"
        />
      </div>
    </div>
  );
}

function Tile({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-ink/75">{body}</p>
      <a
        href={href}
        className="mt-4 inline-block text-sm text-accent no-underline hover:underline"
      >
        {cta} →
      </a>
    </div>
  );
}
