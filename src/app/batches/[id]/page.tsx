import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  FormSection,
  SignatureAssignments,
  SubmissionStatus,
} from "@/lib/types";
import { isRoleAssignment } from "@/lib/types";
import CancelBatchButton from "./CancelBatchButton";
import ReassignInducteeButton from "./ReassignInducteeButton";

/**
 * Per-batch dashboard. The heli admin starts a batch of 8 and now
 * needs to know — without opening 8 tabs — who has signed what.
 *
 * Layout: a grid. One row per inductee, one column per section.
 * Cells show the section's signer label + whether their signature
 * landed. Color-coded so the admin can scan from across the cab:
 *   green   = signed
 *   amber   = open & assigned to a specific person (waiting)
 *   slate   = locked / open-clipboard
 *   red     = rejected/cancelled
 *
 * Also: total count, batch label, who started it, "cancel batch"
 * for admins, and a per-section "still waiting on X" summary so the
 * admin can chase the outliers.
 */
export default async function BatchDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org, role } = orgs[0];
  const { id: batchId } = await params;

  const sb = supabaseService();

  const { data: subsRows, error: subsErr } = await sb
    .from("submissions")
    .select(
      "id, status, data, form_id, form_version_id, signature_assignments, batch_label, started_by, created_at, completed_at",
    )
    .eq("batch_id", batchId)
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });
  if (subsErr) throw subsErr;
  const subs = (subsRows ?? []) as {
    id: string;
    status: SubmissionStatus;
    data: Record<string, unknown> | null;
    form_id: string;
    form_version_id: string;
    signature_assignments: SignatureAssignments | null;
    batch_label: string | null;
    started_by: string;
    created_at: string;
    completed_at: string | null;
  }[];

  if (subs.length === 0) notFound();

  const batchLabel = subs.find((s) => s.batch_label)?.batch_label ?? "Batch";
  const formId = subs[0].form_id;
  const formVersionId = subs[0].form_version_id;

  const [{ data: formRow }, { data: versionRow }, { data: sigsRows }] =
    await Promise.all([
      sb.from("forms").select("name").eq("id", formId).maybeSingle(),
      sb
        .from("form_versions")
        .select("schema")
        .eq("id", formVersionId)
        .maybeSingle(),
      sb
        .from("submission_signatures")
        .select("submission_id, field_id, signer_name, signed_at")
        .in(
          "submission_id",
          subs.map((s) => s.id),
        ),
    ]);

  const formName = (formRow as { name: string } | null)?.name ?? "Form";
  const schema = (versionRow as { schema: FormDefinition } | null)?.schema;
  if (!schema) notFound();

  const signedSet = new Set<string>();
  for (const r of (sigsRows ?? []) as {
    submission_id: string;
    field_id: string;
  }[]) {
    signedSet.add(`${r.submission_id}|${r.field_id}`);
  }

  // Pull the inductee identity out of each submission's
  // signature_assignments — we wrote the inductee's email there at
  // batch creation. The "inductee section" is whichever section has
  // inductee_section: true; its signature field's assignment names
  // the person.
  function inducteeOf(s: (typeof subs)[number]): {
    name: string;
    email: string | null;
  } {
    const inducteeSection = schema!.sections.find(
      (sec) => sec.inductee_section,
    );
    const assigns = s.signature_assignments ?? {};
    if (inducteeSection) {
      for (const f of inducteeSection.fields) {
        if (f.type !== "signature") continue;
        const a = assigns[f.id];
        if (!a) continue;
        if (isRoleAssignment(a)) continue;
        const email = (a as { email?: string }).email ?? null;
        const name = (a as { name?: string }).name ?? email ?? "(unknown)";
        return { name, email };
      }
    }
    // Fallback: any assignment whose email matches the inductee
    // name we stored in data. We don't always have that.
    return { name: "(unknown)", email: null };
  }

  // Counts for the top-of-page summary.
  const totals = {
    total: subs.length,
    completed: subs.filter((s) => s.status === "completed").length,
    in_progress: subs.filter(
      (s) => s.status === "in_progress" || s.status === "awaiting_signature",
    ).length,
    rejected: subs.filter((s) => s.status === "rejected").length,
  };

  // For each section, count how many submissions still need its
  // signature signed. Drives the "still waiting on …" strip under
  // the grid so the admin can call the right person.
  type SectionPending = {
    section: FormSection;
    pendingCount: number;
    waitingOn: Map<string, number>; // signer label -> count of subs
  };
  const sectionPending: SectionPending[] = [];
  for (const section of schema.sections) {
    const sig = section.fields.find((f) => f.type === "signature");
    if (!sig) continue;
    const waitingOn = new Map<string, number>();
    let pendingCount = 0;
    for (const s of subs) {
      if (s.status === "completed" || s.status === "rejected") continue;
      if (signedSet.has(`${s.id}|${sig.id}`)) continue;
      pendingCount++;
      const a = s.signature_assignments?.[sig.id];
      const label = a
        ? isRoleAssignment(a)
          ? `Any ${a.role_label}`
          : (a as { name?: string; email?: string }).name ??
            (a as { email?: string }).email ??
            "unassigned"
        : "open";
      waitingOn.set(label, (waitingOn.get(label) ?? 0) + 1);
    }
    sectionPending.push({ section, pendingCount, waitingOn });
  }

  const sectionsWithSig = schema.sections.filter((sec) =>
    sec.fields.some((f) => f.type === "signature"),
  );

  const isAdmin = role === "owner" || role === "admin";
  const cancelable = subs.some(
    (s) => s.status === "in_progress" || s.status === "awaiting_signature",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Batch · {formName}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{batchLabel}</h1>
          <p className="mt-1 text-sm text-muted">
            {totals.total} inductee{totals.total === 1 ? "" : "s"} ·{" "}
            {totals.completed} complete · {totals.in_progress} in progress
            {totals.rejected > 0 && (
              <>
                {" "}
                · <span className="text-err">{totals.rejected} cancelled</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/submissions?batch_id=${batchId}`}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-sm no-underline"
          >
            List view
          </Link>
          {isAdmin && cancelable && (
            <CancelBatchButton batchId={batchId} />
          )}
        </div>
      </div>

      {/* Status-by-section grid */}
      <div className="overflow-x-auto rounded-md border border-ink/15">
        <table className="min-w-full text-sm">
          <thead className="bg-bg/60 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-bg/60 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted">
                Inductee
              </th>
              {sectionsWithSig.map((sec) => (
                <th
                  key={sec.id}
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted"
                >
                  {sec.title}
                </th>
              ))}
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const ind = inducteeOf(s);
              return (
                <tr
                  key={s.id}
                  className="border-t border-ink/10 hover:bg-bg/60"
                >
                  <td className="sticky left-0 z-10 bg-bg px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <Link
                        href={`/submissions/${s.id}`}
                        className="font-medium no-underline"
                      >
                        {ind.name}
                      </Link>
                      {isAdmin &&
                        (s.status === "in_progress" ||
                          s.status === "awaiting_signature") && (
                          <ReassignInducteeButton
                            submissionId={s.id}
                            currentName={ind.name}
                            currentEmail={ind.email}
                          />
                        )}
                    </div>
                    {ind.email && (
                      <div className="font-mono text-[11px] text-muted">
                        {ind.email}
                      </div>
                    )}
                  </td>
                  {sectionsWithSig.map((sec) => {
                    const sig = sec.fields.find((f) => f.type === "signature");
                    if (!sig) return <td key={sec.id} />;
                    const signed = signedSet.has(`${s.id}|${sig.id}`);
                    const a = s.signature_assignments?.[sig.id];
                    const signerLabel = a
                      ? isRoleAssignment(a)
                        ? `Any ${a.role_label}`
                        : (a as { name?: string; email?: string }).name ??
                          (a as { email?: string }).email ??
                          "—"
                      : "open";
                    return (
                      <td key={sec.id} className="px-3 py-2 align-top">
                        {signed ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">
                            <span aria-hidden>●</span> signed
                          </span>
                        ) : s.status === "completed" ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                              <span aria-hidden>○</span> waiting
                            </span>
                            <div className="text-[11px] text-muted">
                              {signerLabel}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-top">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-section "still waiting on" strip */}
      {sectionPending.some((s) => s.pendingCount > 0) && (
        <div className="rounded-md border border-ink/15 bg-white p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Still waiting on
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {sectionPending
              .filter((s) => s.pendingCount > 0)
              .map(({ section, pendingCount, waitingOn }) => (
                <li key={section.id}>
                  <span className="font-medium">{section.title}:</span>{" "}
                  <span className="text-muted">
                    {pendingCount} pending —{" "}
                    {Array.from(waitingOn.entries())
                      .map(([who, n]) => `${who} (${n})`)
                      .join(", ")}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const map: Record<SubmissionStatus, { label: string; cls: string }> = {
    in_progress: {
      label: "in progress",
      cls: "bg-bg/60 text-ink",
    },
    awaiting_signature: {
      label: "awaiting signature",
      cls: "bg-warn/15 text-warn",
    },
    completed: { label: "completed", cls: "bg-ok/15 text-ok" },
    rejected: { label: "cancelled", cls: "bg-err/15 text-err" },
  };
  const m = map[status] ?? { label: status, cls: "bg-bg/60 text-ink" };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
