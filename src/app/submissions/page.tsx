import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";

export default async function SubmissionsPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org } = orgs[0];

  const sb = supabaseService();
  const { data, error } = await sb
    .from("submissions")
    .select("id, status, form_id, started_by, created_at, completed_at, forms(name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
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
      <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>

      {rows.length === 0 && (
        <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
          <p className="text-muted">No submissions yet.</p>
          <a
            href="/forms"
            className="mt-4 inline-block text-sm text-accent no-underline"
          >
            Pick a form to start →
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
