import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { Form } from "@/lib/types";

export default async function FormsPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org } = orgs[0];

  const sb = supabaseService();
  const { data, error } = await sb
    .from("forms")
    .select("*")
    .eq("org_id", org.id)
    .eq("archived", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const forms = (data ?? []) as Form[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Form templates</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable blank forms for {org.name}. Anyone on your team can open
            one and fill out a fresh copy — submissions are saved separately.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/forms/import"
            className="rounded-md bg-accent px-4 py-2 text-sm text-bg no-underline"
          >
            ✨ Import from paper
          </a>
          <a
            href="/forms/new"
            className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink no-underline"
          >
            New blank form
          </a>
        </div>
      </div>

      {forms.length === 0 && (
        <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
          <p className="text-muted">No forms yet.</p>
          <p className="mt-2 text-sm text-muted">
            Drop in a paper form (PDF or photo) and we'll digitize it for you.
          </p>
          <a
            href="/forms/import"
            className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm text-bg no-underline"
          >
            Import from paper
          </a>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {forms.map((f) => (
          <a
            key={f.id}
            href={`/forms/${f.id}`}
            className="rounded-lg border border-ink/15 bg-white p-4 no-underline hover:border-ink/30"
          >
            <h2 className="text-lg font-bold text-ink">{f.name}</h2>
            {f.description && (
              <p className="mt-1 text-sm text-muted">{f.description}</p>
            )}
            <p className="mt-2 font-mono text-xs text-muted">
              {f.schema.sections.length} sections ·{" "}
              {f.schema.sections.reduce((n, s) => n + s.fields.length, 0)} fields ·
              v{f.current_version}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
