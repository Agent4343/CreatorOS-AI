import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ form_id?: string; batch_id?: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org } = orgs[0];
  const { form_id, batch_id } = await searchParams;

  const sb = supabaseService();

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
      "id, status, form_id, started_by, last_edited_by, last_edited_at, created_at, completed_at, signature_assignments, forms(name)",
    )
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (form_id) q = q.eq("form_id", form_id);
  if (batch_id) q = q.eq("batch_id", batch_id);
  const { data, error } = await q;
  if (error) throw error;
  type Assignment =
    | { kind?: "user"; email: string; name?: string; role?: string }
    | {
        kind: "role";
        role_id: string;
        role_label: string;
        member_emails: string[];
        member_names?: Record<string, string>;
      };
  type Row = {
    id: string;
    status: string;
    form_id: string;
    started_by: string;
    last_edited_by: string | null;
    last_edited_at: string | null;
    created_at: string;
    completed_at: string | null;
    signature_assignments: Record<string, Assignment> | null;
    forms: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Find every signature already collected for in-progress submissions
  // so the "Waiting on you" filter knows which assigned signatures are
  // outstanding. One query, scoped to the rows we just loaded.
  const inProgressIds = rows
    .filter(
      (r) => r.status === "in_progress" || r.status === "awaiting_signature",
    )
    .map((r) => r.id);
  const signedByFieldBySub: Record<string, Set<string>> = {};
  if (inProgressIds.length > 0) {
    const { data: sigs } = await sb
      .from("submission_signatures")
      .select("submission_id, field_id")
      .in("submission_id", inProgressIds);
    for (const s of (sigs ?? []) as {
      submission_id: string;
      field_id: string;
    }[]) {
      const set = signedByFieldBySub[s.submission_id] ?? new Set<string>();
      set.add(s.field_id);
      signedByFieldBySub[s.submission_id] = set;
    }
  }

  // "Waiting on you" — submissions where the current user's email is
  // assigned to a signature field that hasn't been signed yet.
  const userEmail = (user.email ?? "").toLowerCase();
  type WaitingRow = Row & { waiting: { fieldId: string; assignment: Assignment } };
  const waitingOnYou: WaitingRow[] = [];
  if (userEmail) {
    for (const r of rows) {
      if (r.status !== "in_progress" && r.status !== "awaiting_signature") continue;
      const a = r.signature_assignments ?? {};
      const signedFields = signedByFieldBySub[r.id] ?? new Set<string>();
      for (const [fieldId, assignment] of Object.entries(a)) {
        if (signedFields.has(fieldId)) continue;
        const matches =
          (assignment as { kind?: string }).kind === "role"
            ? (assignment as Extract<Assignment, { kind: "role" }>)
                .member_emails.map((e) => e.toLowerCase())
                .includes(userEmail)
            : (assignment as Extract<Assignment, { email: string }>).email
                ?.toLowerCase() === userEmail;
        if (matches) {
          waitingOnYou.push({ ...r, waiting: { fieldId, assignment } });
          break;
        }
      }
    }
  }
  const waitingIds = new Set(waitingOnYou.map((r) => r.id));

  // Resolve user_id → name for the in-progress section so workers can
  // see "Started by Brad" instead of a UUID. Single query for every
  // user that appears, keyed in a map.
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.started_by, r.last_edited_by])
        .filter((id): id is string => !!id),
    ),
  );
  const nameById: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: members } = await sb
      .from("memberships")
      .select("user_id, full_name")
      .eq("org_id", org.id)
      .in("user_id", userIds);
    for (const m of (members ?? []) as { user_id: string; full_name: string | null }[]) {
      nameById[m.user_id] = m.full_name ?? "—";
    }
  }

  // "In progress" excludes anything already in the "Waiting on you"
  // section above so the user doesn't see the same row twice.
  const inProgress = rows.filter(
    (r) =>
      (r.status === "in_progress" || r.status === "awaiting_signature") &&
      !waitingIds.has(r.id),
  );
  const finished = rows.filter(
    (r) => r.status === "completed" || r.status === "rejected",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {batch_id
              ? `Batch · ${rows.length} submission${rows.length === 1 ? "" : "s"}`
              : filterFormName
                ? `Submissions · ${filterFormName}`
                : "Submissions"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {batch_id
              ? `Created ${rows.length} form${rows.length === 1 ? "" : "s"} together — one per inductee. Each one routes signatures independently.`
              : filterFormName
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

      {/* Waiting on you: the user is the assigned signer for an
          unsigned signature field on these submissions. Surface this
          first — it's the only category they can act on uniquely. */}
      {waitingOnYou.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
              Waiting on your signature
            </h2>
            <span className="font-mono text-xs text-muted">
              {waitingOnYou.length}
            </span>
          </div>
          <p className="text-xs text-muted">
            You&apos;re the assigned signer on these forms.
          </p>
          <div className="space-y-2">
            {waitingOnYou.map((r) => (
              <a
                key={r.id}
                href={`/submissions/${r.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/5 p-3 no-underline text-ink"
              >
                <div>
                  <div className="text-sm font-bold">
                    {r.forms?.name ?? "Untitled form"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {(() => {
                      const a = r.waiting.assignment;
                      if ((a as { kind?: string }).kind === "role") {
                        return `Assigned to you as ${(a as Extract<Assignment, { kind: "role" }>).role_label}`;
                      }
                      const u = a as Extract<Assignment, { email: string }>;
                      return u.role
                        ? `Assigned to you as ${u.role}`
                        : "Assigned to you";
                    })()}
                    {" · "}
                    started {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-bg">
                  Sign →
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* In progress: prominent at top so a teammate can pick up a
          form someone else couldn't finish. */}
      {inProgress.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-warn">
              In progress · ready to finish
            </h2>
            <span className="font-mono text-xs text-muted">
              {inProgress.length}
            </span>
          </div>
          <p className="text-xs text-muted">
            Anyone on your team can pick one of these up and continue.
            Signatures still bind to whoever signs.
          </p>
          <div className="space-y-2">
            {inProgress.map((r) => {
              const startedName = nameById[r.started_by] ?? "—";
              const editorName = r.last_edited_by
                ? nameById[r.last_edited_by] ?? "—"
                : null;
              const editorIsOther =
                r.last_edited_by && r.last_edited_by !== r.started_by;
              return (
                <a
                  key={r.id}
                  href={`/submissions/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/40 bg-warn/5 p-3 no-underline text-ink"
                >
                  <div>
                    <div className="text-sm font-bold">
                      {r.forms?.name ?? "Untitled form"}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      Started by {startedName} ·{" "}
                      {new Date(r.created_at).toLocaleString()}
                      {editorIsOther && editorName && (
                        <>
                          {" · "}
                          <span className="text-ink">
                            last edited by {editorName}
                          </span>
                          {r.last_edited_at && (
                            <> · {timeAgo(r.last_edited_at)}</>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-bg">
                    {r.status === "awaiting_signature"
                      ? "Sign →"
                      : "Continue →"}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Completed / rejected — historical record */}
      {finished.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
            Completed
          </h2>
          <div className="space-y-2">
            {finished.map((r) => (
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
        </section>
      )}

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
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
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
