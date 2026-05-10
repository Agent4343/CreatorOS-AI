"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  FormDefinition,
  FormField,
  SignatureAssignment,
  SignatureAssignments,
} from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RoleRoster = {
  id: string;
  name: string;
  description: string | null;
  members: { email: string; name?: string }[];
};

/** How a single shared signature field is assigned in the batch UI. */
type SharedMode =
  | { kind: "user"; email: string; name: string; role: string }
  | { kind: "role"; role_id: string }
  | { kind: "per_inductee"; role: string };

type Inductee = {
  name: string;
  email: string;
  /** Per-inductee assignment overrides — for signature fields toggled
   * 'Different per inductee'. Keyed by field_id. */
  overrides: Record<string, { email: string; name?: string; role?: string }>;
};

/**
 * "Start a batch" — create N submissions in one go, with role-based
 * signature assignment so the form auto-routes through Heli admin →
 * OIM → Supervisor → Inductee. Each inductee gets their own copy
 * sharing a batch_id.
 *
 * Admin-only. The endpoint enforces the same.
 */
export default function BatchStartButton({
  formId,
  orgId,
  schema,
  roles,
}: {
  formId: string;
  orgId: string;
  schema: FormDefinition;
  roles: RoleRoster[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pull every signature field + every text field — those are what the
  // user can route or pre-fill with the inductee's name.
  const sigFields = useMemo<FormField[]>(
    () =>
      schema.sections
        .flatMap((s) => s.fields)
        .filter((f) => f.type === "signature"),
    [schema],
  );
  const textFields = useMemo<FormField[]>(
    () =>
      schema.sections
        .flatMap((s) => s.fields)
        .filter((f) => f.type === "text" || f.type === "textarea"),
    [schema],
  );

  // The "inductee signature" field — most forms only have one signature
  // and that one IS the inductee's. If multiple, default to the last.
  const [inducteeSigFieldId, setInducteeSigFieldId] = useState<string>(() =>
    sigFields.length > 0 ? sigFields[sigFields.length - 1].id : "",
  );
  // Pre-fill inductee name into a text field — usually labelled
  // "NAME (PRINT)" or similar. Default to the first text field.
  const [inducteeNameFieldId, setInducteeNameFieldId] = useState<string>(() =>
    textFields[0]?.id ?? "",
  );

  // Optional: pick a text/textarea field on the form that should
  // receive the full list of inductee names on every submission.
  // Lets the Heli admin's Section 1 show "Today's group: Ashley,
  // Marcus, Priya, Tom" so their signature attests to the whole
  // group. Empty string = don't populate any field.
  const [batchRosterFieldId, setBatchRosterFieldId] = useState<string>("");

  /** Per-signature user-mode assignments for the non-inductee signers
   * (OIM, Supervisor, Heli admin). Keyed by field_id. Role-mode and
   * per-inductee assignments live in their own state maps.
   *
   * Always specific-person here — role-mode entries are tracked in
   * roleByField; the union'd SignatureAssignments type only appears
   * at submit time. */
  type UserAssignment = { email: string; name?: string; role?: string };
  const [sharedAssignments, setSharedAssignments] = useState<
    Record<string, UserAssignment>
  >({});

  /** Field IDs the user has marked "Different per inductee". The
   * shared-assignment row hides for these; instead, each inductee
   * gets a column to enter that person's email. */
  const [perInducteeFieldIds, setPerInducteeFieldIds] = useState<Set<string>>(
    new Set(),
  );

  /** Field IDs assigned to a *role roster* (any roster member can
   * sign). Keyed field_id → role_id. Mutually exclusive with
   * perInducteeFieldIds and with email-based sharedAssignments. */
  const [roleByField, setRoleByField] = useState<Record<string, string>>({});

  type FieldMode = "user" | "role" | "per_inductee";
  function fieldMode(fieldId: string): FieldMode {
    if (perInducteeFieldIds.has(fieldId)) return "per_inductee";
    if (roleByField[fieldId]) return "role";
    return "user";
  }
  function setFieldMode(fieldId: string, mode: FieldMode) {
    // Switching modes clears the other two — they're mutually exclusive.
    setPerInducteeFieldIds((cur) => {
      const next = new Set(cur);
      if (mode === "per_inductee") next.add(fieldId);
      else next.delete(fieldId);
      return next;
    });
    setRoleByField((cur) => {
      if (mode === "role") {
        // Default to the first role if none picked yet.
        return { ...cur, [fieldId]: cur[fieldId] ?? roles[0]?.id ?? "" };
      }
      const { [fieldId]: _, ...rest } = cur;
      return rest;
    });
    if (mode !== "user") {
      // Clear any email so a stale value doesn't leak through.
      setSharedAssignments((cur) => {
        const a = cur[fieldId];
        if (!a) return cur;
        return { ...cur, [fieldId]: { ...a, email: "", name: "" } };
      });
    }
  }

  // Inductee list.
  const [inductees, setInductees] = useState<Inductee[]>([
    { name: "", email: "", overrides: {} },
  ]);

  function addInductee() {
    setInductees([...inductees, { name: "", email: "", overrides: {} }]);
  }
  function updateInductee(
    i: number,
    key: "name" | "email",
    value: string,
  ) {
    setInductees(
      inductees.map((ind, idx) =>
        idx === i ? { ...ind, [key]: value } : ind,
      ),
    );
  }
  function updateOverride(
    i: number,
    fieldId: string,
    key: "email" | "name" | "role",
    value: string,
  ) {
    setInductees(
      inductees.map((ind, idx) =>
        idx === i
          ? {
              ...ind,
              overrides: {
                ...ind.overrides,
                [fieldId]: {
                  ...(ind.overrides[fieldId] ?? { email: "" }),
                  [key]: value,
                },
              },
            }
          : ind,
      ),
    );
  }
  function removeInductee(i: number) {
    setInductees(inductees.filter((_, idx) => idx !== i));
  }

  function setAssignment(
    fieldId: string,
    key: "email" | "name" | "role",
    value: string,
  ) {
    setSharedAssignments((cur) => ({
      ...cur,
      [fieldId]: { ...(cur[fieldId] ?? { email: "" }), [key]: value },
    }));
  }

  async function submit() {
    setError(null);
    if (inductees.length === 0) {
      setError("Add at least one inductee");
      return;
    }
    for (const [i, ind] of inductees.entries()) {
      if (!ind.name.trim()) return setError(`Inductee #${i + 1}: name required`);
      if (!EMAIL_RE.test(ind.email.trim())) {
        return setError(`Inductee #${i + 1}: valid email required`);
      }
    }
    // Validate every assignment that has any data has a real email.
    for (const [fid, a] of Object.entries(sharedAssignments)) {
      if (a.email && !EMAIL_RE.test(a.email.trim())) {
        const f = sigFields.find((x) => x.id === fid);
        return setError(`Assignment for "${f?.label ?? fid}": invalid email`);
      }
    }

    // Per-inductee assignments must all have an email when their
    // field is in per-inductee mode.
    for (const fid of perInducteeFieldIds) {
      for (const [idx, ind] of inductees.entries()) {
        const o = ind.overrides[fid];
        if (!o?.email?.trim() || !EMAIL_RE.test(o.email.trim())) {
          const f = sigFields.find((x) => x.id === fid);
          return setError(
            `Inductee #${idx + 1}: missing/invalid email for "${f?.label ?? fid}"`,
          );
        }
      }
    }

    // Role-mode assignments must reference a role with at least one
    // member — otherwise nobody could sign.
    for (const [fid, roleId] of Object.entries(roleByField)) {
      const role = roles.find((r) => r.id === roleId);
      const f = sigFields.find((x) => x.id === fid);
      if (!role) {
        return setError(
          `Assignment for "${f?.label ?? fid}": role no longer exists`,
        );
      }
      if (role.members.length === 0) {
        return setError(
          `Role "${role.name}" has no members. Add members in Settings → Role rosters first.`,
        );
      }
    }

    setSubmitting(true);
    try {
      // Shared assignments — three sources:
      //   1) Role-mode: snapshot the roster into a kind:"role" entry.
      //   2) User-mode: regular {email, name?, role?}.
      //   3) Per-inductee mode: NOT in cleaned — written per-inductee.
      // Inductee's own signature field is always per-inductee, never
      // shared.
      const cleaned: SignatureAssignments = {};
      for (const f of sigFields) {
        if (f.id === inducteeSigFieldId) continue;
        const mode = fieldMode(f.id);
        if (mode === "per_inductee") continue;
        if (mode === "role") {
          const role = roles.find((r) => r.id === roleByField[f.id]);
          if (!role) continue;
          cleaned[f.id] = {
            kind: "role",
            role_id: role.id,
            role_label: role.name,
            member_emails: role.members.map((m) => m.email.toLowerCase()),
            member_names: Object.fromEntries(
              role.members
                .filter((m) => m.name)
                .map((m) => [m.email.toLowerCase(), m.name!]),
            ),
          };
          continue;
        }
        // user mode
        const a = sharedAssignments[f.id];
        if (a?.email?.trim()) {
          cleaned[f.id] = {
            email: a.email.trim().toLowerCase(),
            name: a.name?.trim() || undefined,
            role: a.role?.trim() || undefined,
          };
        }
      }

      const res = await fetch("/api/submissions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          form_id: formId,
          inductees: inductees.map((i) => {
            const perAssignments: SignatureAssignments = {};
            for (const fid of perInducteeFieldIds) {
              const o = i.overrides[fid];
              if (o?.email?.trim()) {
                perAssignments[fid] = {
                  email: o.email.trim().toLowerCase(),
                  name: o.name?.trim() || undefined,
                  // Fall back to the shared assignment's role label so
                  // the runner shows "Supervisor" not blank.
                  role:
                    o.role?.trim() ||
                    sharedAssignments[fid]?.role?.trim() ||
                    undefined,
                };
              }
            }
            return {
              name: i.name.trim(),
              email: i.email.trim().toLowerCase(),
              assignments:
                Object.keys(perAssignments).length > 0
                  ? perAssignments
                  : undefined,
            };
          }),
          shared_assignments: cleaned,
          inductee_signature_field_id: inducteeSigFieldId || undefined,
          inductee_name_field_id: inducteeNameFieldId || undefined,
          batch_roster_field_id: batchRosterFieldId || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Batch start failed");
      // Land on the submissions list filtered to this batch's form;
      // each submission shows up under "In progress · ready to finish".
      router.push(`/submissions?form_id=${formId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (sigFields.length === 0) {
    // Form has no signature fields — batch flow doesn't really apply.
    return null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-ink/30 bg-white px-4 py-2 text-sm font-medium text-ink"
      >
        {open ? "Cancel batch" : "Start batch · multiple inductees"}
      </button>

      {open && (
        <div className="mt-3 space-y-5 rounded-lg border border-ink/15 bg-bg p-4">
          <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
            <div className="font-bold text-ink">
              How a batch works
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink">
              <li>
                One form per inductee — list them below.
              </li>
              <li>
                Each inductee signs <strong>their own</strong> form.
              </li>
              <li>
                Supervisors / admins sign <strong>once</strong>; that
                signature applies to every inductee in the batch.
              </li>
              <li>
                Everyone gets an email when it&apos;s their turn.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Set up the batch
              </h3>
              <p className="text-[11px] text-muted">
                Tell the system which fields on the form mean what.
                You only do this once per template — get it right and
                future batches just work.
              </p>
            </div>

            <label className="block rounded-md border border-ink/10 bg-white p-2.5 text-sm">
              <div className="font-medium">
                Which signature does each inductee sign?
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                The signature block that&apos;s for the inductee
                themselves (not the supervisor or admin). Each
                inductee will only see their own.
              </div>
              <select
                value={inducteeSigFieldId}
                onChange={(e) => setInducteeSigFieldId(e.target.value)}
                className="mt-1.5 rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
              >
                <option value="">— pick one —</option>
                {sigFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block rounded-md border border-ink/10 bg-white p-2.5 text-sm">
              <div className="font-medium">
                Auto-fill each inductee&apos;s name into:
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                Saves the inductee from typing their own name. Each
                form gets that inductee&apos;s name only — usually a
                &ldquo;Full name&rdquo; or &ldquo;Print name&rdquo;
                field near the sign-off.
              </div>
              <select
                value={inducteeNameFieldId}
                onChange={(e) => setInducteeNameFieldId(e.target.value)}
                className="mt-1.5 rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
              >
                <option value="">— don&apos;t auto-fill —</option>
                {textFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block rounded-md border border-ink/10 bg-white p-2.5 text-sm">
              <div className="font-medium">
                Show the full crew list inside:
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                Drops the names of every inductee in this batch into
                one field on every form — so when Heli admin opens
                any inductee&apos;s form, they see the whole crew
                they&apos;re signing off. Usually a textarea in
                Section 1.
              </div>
              <select
                value={batchRosterFieldId}
                onChange={(e) => setBatchRosterFieldId(e.target.value)}
                className="mt-1.5 rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
              >
                <option value="">— don&apos;t show the list —</option>
                {textFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                    {f.type === "textarea" ? " (textarea)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Assignments for non-inductee signature fields */}
          {sigFields.filter((f) => f.id !== inducteeSigFieldId).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Who signs the supervisor / admin blocks?
              </h3>
              <p className="text-[11px] text-muted">
                These are the signatures that sign{" "}
                <strong>once for the whole batch</strong>. Role-gated
                fields are filled in automatically based on the form
                template.
              </p>
              {sigFields
                .filter((f) => f.id !== inducteeSigFieldId)
                .map((f) => {
                  const a = sharedAssignments[f.id] ?? { email: "" };
                  const mode = fieldMode(f.id);
                  // Template-level required role wins. If the form
                  // editor tagged this field with a required role, the
                  // batch route auto-assigns it — no picker needed (or
                  // wanted, since the user shouldn't be able to bypass
                  // the template's choice).
                  const requiredRole = f.required_role_id
                    ? roles.find((r) => r.id === f.required_role_id)
                    : null;
                  if (f.required_role_id) {
                    return (
                      <div
                        key={f.id}
                        className="rounded-md border border-ink/15 bg-white p-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">{f.label}</div>
                          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-mono text-accent">
                            role-gated
                          </span>
                        </div>
                        {requiredRole ? (
                          <div className="mt-1.5 text-xs text-muted">
                            Auto-assigned to <strong>{requiredRole.name}</strong>
                            {" "}({requiredRole.members.length} member
                            {requiredRole.members.length === 1 ? "" : "s"}).
                            Only role members can sign — set in the form
                            template.
                          </div>
                        ) : (
                          <div className="mt-1.5 text-xs text-err">
                            Form template requires a role that no longer
                            exists. Re-add it in Settings → Role rosters, or
                            edit the template.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={f.id}
                      className="rounded-md border border-ink/15 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-medium">{f.label}</div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`mode-${f.id}`}
                            checked={mode === "user"}
                            onChange={() => setFieldMode(f.id, "user")}
                          />
                          Specific person
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`mode-${f.id}`}
                            checked={mode === "role"}
                            onChange={() => setFieldMode(f.id, "role")}
                            disabled={roles.length === 0}
                          />
                          Role roster
                          {roles.length === 0 && (
                            <span className="ml-1 text-[11px] text-muted">
                              (define one in Settings first)
                            </span>
                          )}
                        </label>
                      </div>

                      {mode === "user" && (
                        <div className="mt-1.5 grid gap-2 md:grid-cols-3">
                          <input
                            type="text"
                            value={a.role ?? ""}
                            onChange={(e) =>
                              setAssignment(f.id, "role", e.target.value)
                            }
                            placeholder="Role label (e.g. OIM)"
                            className="rounded-md border border-ink/20 p-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={a.name ?? ""}
                            onChange={(e) =>
                              setAssignment(f.id, "name", e.target.value)
                            }
                            placeholder="Name"
                            className="rounded-md border border-ink/20 p-1.5 text-sm"
                          />
                          <input
                            type="email"
                            value={a.email ?? ""}
                            onChange={(e) =>
                              setAssignment(f.id, "email", e.target.value)
                            }
                            placeholder="Email"
                            className="rounded-md border border-ink/20 p-1.5 text-sm"
                          />
                        </div>
                      )}

                      {mode === "role" && (
                        <div className="mt-1.5">
                          <select
                            value={roleByField[f.id] ?? ""}
                            onChange={(e) =>
                              setRoleByField((cur) => ({
                                ...cur,
                                [f.id]: e.target.value,
                              }))
                            }
                            className="rounded-md border border-ink/20 p-1.5 text-sm"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.members.length} member
                                {r.members.length === 1 ? "" : "s"})
                              </option>
                            ))}
                          </select>
                          {(() => {
                            const selected = roles.find(
                              (r) => r.id === roleByField[f.id],
                            );
                            if (!selected) return null;
                            if (selected.members.length === 0) {
                              return (
                                <p className="mt-1 text-[11px] text-err">
                                  This role has no members yet — add some in
                                  Settings → Role rosters.
                                </p>
                              );
                            }
                            return (
                              <div className="mt-1 text-[11px] text-muted">
                                Any of {selected.members.length} member
                                {selected.members.length === 1 ? "" : "s"} can sign:
                                <ul className="mt-0.5 space-y-0.5">
                                  {selected.members.map((m) => (
                                    <li key={m.email}>
                                      <span className="text-ink">
                                        {m.name ?? m.email}
                                      </span>
                                      {m.name && (
                                        <span className="ml-1.5 font-mono">
                                          {m.email}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    </div>
                  );
                })}
              <p className="text-[11px] text-muted">
                Leave a Specific-person row blank to keep that
                signature open — anyone in your org can sign it.
              </p>
            </div>
          )}

          {/* Inductee list */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              Inductees ({inductees.length})
            </h3>
            {inductees.map((ind, i) => (
              <div
                key={i}
                className="space-y-1.5 rounded-md border border-ink/10 bg-white p-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted">
                    #{i + 1}
                  </span>
                  <input
                    type="text"
                    value={ind.name}
                    onChange={(e) => updateInductee(i, "name", e.target.value)}
                    placeholder="Full name"
                    className="flex-1 rounded-md border border-ink/20 p-1.5 text-sm"
                  />
                  <input
                    type="email"
                    value={ind.email}
                    onChange={(e) => updateInductee(i, "email", e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 rounded-md border border-ink/20 p-1.5 text-sm"
                  />
                  {inductees.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInductee(i)}
                      className="text-xs text-muted hover:text-err"
                    >
                      remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addInductee}
              className="rounded-md border border-ink/20 px-3 py-1.5 text-xs"
            >
              + Add another inductee
            </button>
          </div>

          {/* Pre-flight preview: every signature field × every inductee,
              showing exactly who will be emailed when. Catches the
              silent failure where someone forgot to toggle "Different
              per inductee" or left an override blank — visible BEFORE
              submitting, not after when supervisors aren't signing. */}
          <div className="rounded-md border border-ink/15 bg-bg-2 p-3 text-xs">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              Who will be asked to sign
            </div>
            {sigFields.length === 0 ? (
              <div className="text-muted">No signature fields on this form.</div>
            ) : (
              <ul className="space-y-1">
                {sigFields.map((f) => {
                  const isInductee = f.id === inducteeSigFieldId;
                  const mode = fieldMode(f.id);
                  const requiredRole = f.required_role_id
                    ? roles.find((r) => r.id === f.required_role_id)
                    : null;
                  let detail: ReactNode;
                  if (isInductee) {
                    detail = (
                      <span>
                        each inductee signs their own (
                        {inductees.filter((i) => i.email.trim()).length}/
                        {inductees.length} have email)
                      </span>
                    );
                  } else if (f.required_role_id) {
                    detail = requiredRole ? (
                      <span>
                        role-gated → any of{" "}
                        <strong>{requiredRole.name}</strong> (
                        {requiredRole.members.length} member
                        {requiredRole.members.length === 1 ? "" : "s"})
                      </span>
                    ) : (
                      <span className="text-err">
                        template requires a role that no longer exists
                      </span>
                    );
                  } else if (mode === "role") {
                    const role = roles.find((r) => r.id === roleByField[f.id]);
                    detail = role ? (
                      <span>
                        any of <strong>{role.name}</strong> ({role.members.length}{" "}
                        member{role.members.length === 1 ? "" : "s"})
                      </span>
                    ) : (
                      <span className="text-err">role not selected</span>
                    );
                  } else if (mode === "per_inductee") {
                    const filled = inductees.filter((i) =>
                      i.overrides[f.id]?.email?.trim(),
                    ).length;
                    detail =
                      filled === inductees.length ? (
                        <span>
                          per-inductee — {filled}/{inductees.length} filled in
                        </span>
                      ) : (
                        <span className="text-err">
                          per-inductee — only {filled}/{inductees.length} filled
                          in (won&apos;t be emailed)
                        </span>
                      );
                  } else {
                    const a = sharedAssignments[f.id];
                    detail = a?.email?.trim() ? (
                      <span>
                        <strong>{a.name?.trim() || a.email}</strong>
                        {a.name?.trim() ? ` (${a.email})` : ""}
                      </span>
                    ) : (
                      <span className="text-err">
                        no email entered (won&apos;t be emailed)
                      </span>
                    );
                  }
                  return (
                    <li key={f.id} className="flex flex-wrap gap-x-2">
                      <span className="text-muted">{f.label}:</span>
                      {detail}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-err/40 bg-err/5 p-2 text-sm text-err">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {submitting
                ? "Creating…"
                : `Create ${inductees.length} submission${inductees.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
