import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ form_id?: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org } = orgs[0];
  const { form_id } = await searchParams;

  const sb = supabaseService();

  // Optional form filter — used by the form detail page's "view past
  // submissions" link to scope the list to that template only.
  let filterFormName: string | null = null;
  if (form_id) {
    const { data: f } = await sb
      .from("forms")
      .select("name")
      .eq("id", form_id)
      .eq("org_id", org.id)
      .maybeSingle();
    filterFormName = (f as { name: string } | null)?.name ?? null;
  }

  let q = sb
    .from("submissions")
    .select(
      "id, status, form_id, started_by, created_at, completed_at, forms(name)",
    )
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (form_id) q = q.eq("form_id", form_id);
  const { data, error } = await q;
  if (error) throw error;
  type Row = {
    id: string;
    status: string;
    form_id: string;
    started_by: string;
    created_at: string;
    completed_at: string | null;
    forms: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {filterFormName ? `Submissions · ${filterFormName}` : "Submissions"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {filterFormName
              ? "Each row is a separate filled-in copy of this form."
              : "Every form fill across your team."}
          </p>
        </div>
        {form_id && (
          <a
            href={`/forms/${form_id}`}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-ink no-underline"
          >
            ← back to template
          </a>
        )}
      </div>

      {rows.length === 0 && (
        <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
          <p className="text-muted">
            {filterFormName
              ? "No one has filled out this form yet."
              : "No submissions yet."}
          </p>
          <a
            href={form_id ? `/forms/${form_id}` : "/forms"}
            className="mt-4 inline-block text-sm text-accent no-underline"
          >
            {form_id ? "Start the first one →" : "Pick a form to start →"}
          </a>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <a
            key={r.id}
            href={`/submissions/${r.id}`}
            className="flex items-baseline justify-between rounded-md border border-ink/15 bg-white p-3 no-underline text-ink"
          >
            <span className="text-sm font-medium">
              {r.forms?.name ?? "Untitled form"}
            </span>
            <span className="font-mono text-xs">
              <StatusBadge status={r.status} />{" "}
              <span className="text-muted">
                · {new Date(r.created_at).toLocaleDateString()}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "text-ok"
      : status === "rejected"
        ? "text-err"
        : status === "awaiting_signature"
          ? "text-warn"
          : "text-muted";
  return <span className={cls}>{status}</span>;
}
