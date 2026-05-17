"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type SectionLockState,
  computeAllSectionLocks,
} from "@/lib/sectionLocks";
import {
  type FormDefinition,
  type FormField,
  type SignatureAssignments,
  type SubmissionStatus,
  assigneeEmails,
  assigneeLabel,
  isRoleAssignment,
} from "@/lib/types";
import PhotoField from "./PhotoField";
import SignaturePad from "./SignaturePad";

type SubmissionShape = {
  id: string;
  org_id: string;
  status: SubmissionStatus;
  data: Record<string, unknown>;
  form_name: string;
  /** Last-known server updated_at — used as the optimistic-lock
   * token on every PATCH and sign. Updated locally on each
   * successful save. */
  updated_at: string;
  last_edited_at?: string | null;
  /** Birth timestamp. Used as the lower bound when deciding whether
   * a localStorage draft is fresher than the server copy — without
   * this, a brand-new submission (last_edited_at=null) would always
   * lose against any stale ff-draft-<id> entry. */
  created_at: string;
};

type SignedField = {
  field_id: string;
  signer_name: string;
  signed_at: string;
};

type Starter = {
  user_id: string;
  name: string;
  is_self: boolean;
};

type LastEditor = {
  user_id: string;
  name: string;
  at: string | null;
};

type Teammate = {
  user_id: string;
  name: string;
};

type SaveState = "idle" | "saving" | "saved" | "dirty" | "error";

/**
 * Centralised "is this field considered empty for the required-field
 * gate?" check. Used by both the runner's per-section missing-fields
 * memo and (in principle) anywhere else that has to decide if a
 * required field is actually filled.
 *
 * Scalars: null / undefined / empty string = empty.
 * Arrays: empty array = empty.
 * document_expiry: empty when the .date is missing; the optional
 *   photo doesn't gate the section (an inductee can present a paper
 *   card and the operator types the expiry without snapping it).
 */
function isFieldEmpty(fieldType: string, v: unknown): boolean {
  if (fieldType === "document_expiry") {
    return !(v as { date?: string } | null | undefined)?.date;
  }
  return (
    v == null || v === "" || (Array.isArray(v) && v.length === 0)
  );
}

/**
 * Mobile-first form runner.
 *
 * Field workers fill these forms on phones with one hand, often with
 * gloves on, often outside in bad light. The UI has to optimize for
 * that. Decisions:
 *
 *  - Section-by-section navigation, not one giant scroll. A 60-field
 *    form on a 5" screen is misery; one section at a time keeps
 *    scope tight and gives the worker a clear "X of Y" sense of
 *    progress.
 *  - Sticky bottom action bar for Prev / Next / Finish so the
 *    primary action is always reachable with the thumb.
 *  - Full-width 56px tap targets for radio / checkbox / multi-select.
 *  - Loud save indicator ("Saved 2:14 PM" / "Saving…" / "Couldn't
 *    save"). Silent failures are the worst possible field UX — the
 *    worker thinks they filled in 30 fields and then loses them.
 *  - Save errors block Next / Finish until the user sees them.
 */
export default function SubmissionRunner({
  submission,
  schema,
  signedFields,
  canEdit,
  currentUserId,
  currentUserEmail,
  starter,
  lastEditor,
  teammates,
  signatureAssignments,
  batchId,
  batchSiblingCount,
  userRoleIds,
  roleNameById,
  inducteeEmail,
}: {
  submission: SubmissionShape;
  schema: FormDefinition;
  signedFields: SignedField[];
  canEdit: boolean;
  currentUserId: string;
  currentUserEmail: string;
  starter: Starter;
  lastEditor: LastEditor | null;
  teammates: Teammate[];
  signatureAssignments: SignatureAssignments;
  batchId: string | null;
  batchSiblingCount: number;
  userRoleIds: string[];
  roleNameById: Record<string, string>;
  inducteeEmail: string | null;
}) {
  const [data, setData] = useState<Record<string, unknown>>(submission.data ?? {});
  const [status, setStatus] = useState<SubmissionStatus>(submission.status);
  const [signed, setSigned] = useState<SignedField[]>(signedFields);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Last-known server updated_at — the optimistic-lock token we
   * send with every PATCH and sign. Updates on each successful save
   * so subsequent saves keep matching. */
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string>(
    submission.updated_at,
  );
  /** Set when the server returns a 409. Holds the freshly-loaded
   * server state so the user can compare and pick a side. */
  const [conflict, setConflict] = useState<{
    current_updated_at: string;
    current_data: Record<string, unknown>;
    last_edited_at: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cascadeNotice, setCascadeNotice] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const dirtyRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const totalSections = schema.sections.length;
  const isLastSection = currentSection >= totalSections - 1;
  const sec = schema.sections[currentSection];

  // Per-section lock state — recomputes whenever a signature lands.
  // Open/reserved-for-me sections allow edits; reserved-for-other and
  // signed-locked sections render read-only banners and disable inputs.
  const userRoleIdSet = useMemo(() => new Set(userRoleIds), [userRoleIds]);
  const roleNameMap = useMemo(
    () => new Map(Object.entries(roleNameById)),
    [roleNameById],
  );
  const sectionLocks = useMemo(
    () =>
      computeAllSectionLocks({
        schema,
        signatureAssignments,
        signedFields: signed.map((s) => ({
          field_id: s.field_id,
          signer_name: s.signer_name,
          signed_at: s.signed_at,
        })),
        currentUserEmail,
        userRoleIds: userRoleIdSet,
        roleNameById: roleNameMap,
        inducteeEmail,
      }),
    [
      schema,
      signatureAssignments,
      signed,
      currentUserEmail,
      userRoleIdSet,
      roleNameMap,
      inducteeEmail,
    ],
  );

  // Pre-compute which sections still have unfilled required fields
  // so we can warn before "Finish".
  const missingByIndex = useMemo(() => {
    return schema.sections.map((s) => {
      const missing: string[] = [];
      for (const f of s.fields) {
        if (!f.required) continue;
        if (f.type === "section_header" || f.type === "divider") continue;
        if (f.type === "signature") continue; // handled separately
        const v = data[f.id];
        const empty = isFieldEmpty(f.type, v);
        if (empty) missing.push(f.label);
      }
      return missing;
    });
  }, [data, schema]);

  // Auto-save every 5 sec when dirty.
  useEffect(() => {
    if (status === "completed" || status === "rejected") return;
    const t = setInterval(() => {
      if (dirtyRef.current) save();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Warn before unloading with unsaved changes.
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  // Online/offline state. Field workers fill these forms at sites
  // with patchy cell — the form keeps accepting input offline
  // (localStorage holds the draft), and the moment connectivity
  // returns we trigger a save to flush the queue.
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      if (dirtyRef.current) save();
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore a local draft on first mount if it's newer than what
  // the server returned. A signal of "tab crashed mid-fill, you
  // reloaded, here's your work back" without making the user
  // suspect the server failed.
  useEffect(() => {
    try {
      const raw = window.localStorage?.getItem(`ff-draft-${submission.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        data: Record<string, unknown>;
        at: string;
      };
      const draftAt = new Date(parsed.at).getTime();
      // Trust the server copy if it's newer than the local draft
      // (someone else saved over our work on another device).
      // On a freshly-created submission last_edited_at is null, so
      // fall back to created_at — a draft predating the submission's
      // birth can't possibly belong to it and must be a stale leftover.
      const serverAt = submission.last_edited_at
        ? new Date(submission.last_edited_at).getTime()
        : new Date(submission.created_at).getTime();
      if (draftAt > serverAt) {
        setData(parsed.data);
        dataRef.current = parsed.data;
        dirtyRef.current = true;
        setSaveState("dirty");
      }
    } catch {
      // ignore malformed drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(fieldId: string, value: unknown) {
    setData((d) => ({ ...d, [fieldId]: value }));
    dirtyRef.current = true;
    setSaveState("dirty");
  }

  async function save(overrideExpected?: string): Promise<boolean> {
    if (!canEdit) return true;
    setSaveState("saving");
    setError(null);
    // Persist a local copy of the current data first — if the
    // network drops mid-save, this is the recovery anchor. The key
    // is per-submission so reloading the tab restores exactly the
    // form you were filling, not someone else's.
    try {
      window.localStorage?.setItem(
        `ff-draft-${submission.id}`,
        JSON.stringify({
          data: dataRef.current,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      // Storage quota or privacy mode — ignore. Auto-save will keep
      // retrying against the server.
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline. Mark dirty, surface state, and short-circuit before
      // we waste cycles on a fetch that will fail. The "online"
      // listener below replays the queue once connectivity returns.
      setSaveState("dirty");
      return false;
    }
    try {
      const res = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: dataRef.current,
          // Caller can pass an override to bypass an in-flight
          // conflict resolution. Without that, the React-closure
          // reading of serverUpdatedAt is one render behind the
          // setState that follows a 409, so the immediate retry
          // would 409 again.
          expected_updated_at: overrideExpected ?? serverUpdatedAt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && (body as { conflict?: boolean }).conflict) {
        // Concurrent edit. Surface the server's current state so the
        // user can decide whether to keep their local edits or
        // adopt the server version. Either branch resolves the
        // conflict by updating serverUpdatedAt and resuming saves.
        setConflict({
          current_updated_at: (body as { current_updated_at: string })
            .current_updated_at,
          current_data: (body as { current_data: Record<string, unknown> })
            .current_data,
          last_edited_at:
            (body as { last_edited_at?: string | null }).last_edited_at ??
            null,
        });
        setSaveState("error");
        return false;
      }
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      // Server returns the new updated_at — keep our token in sync
      // so the next save's optimistic check passes.
      const newUpdatedAt = (body as { updated_at?: string }).updated_at;
      if (newUpdatedAt) setServerUpdatedAt(newUpdatedAt);
      setSavedAt(new Date().toLocaleTimeString());
      dirtyRef.current = false;
      setSaveState("saved");
      // Drop the local draft once the server has confirmed the save —
      // keeps stale data out of localStorage and avoids "restore an
      // older copy" confusion if the user comes back later.
      try {
        window.localStorage?.removeItem(`ff-draft-${submission.id}`);
      } catch {
        // ignore
      }
      // Server-side cascade hit a sibling? Surface a quiet inline
      // notice so the heli admin sees that filling in once spread to
      // the rest of the batch — no popup, no extra click.
      const cascade = (
        body as {
          cascade?: { siblings_updated: number; fields_written: number } | null;
        }
      ).cascade;
      if (cascade && cascade.siblings_updated > 0) {
        setCascadeNotice(
          `Synced to ${cascade.siblings_updated} other submission${cascade.siblings_updated === 1 ? "" : "s"} in this batch.`,
        );
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveState("error");
      return false;
    }
  }

  /**
   * Block navigation if the latest save failed. Saving silently and
   * letting the worker keep going is the recipe for lost field data.
   */
  async function next() {
    if (canEdit && dirtyRef.current) {
      const ok = await save();
      if (!ok) return;
    }
    if (saveState === "error") return;
    setCurrentSection((s) => Math.min(s + 1, totalSections - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function prev() {
    setCurrentSection((s) => Math.max(s - 1, 0));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  async function printNow() {
    if (canEdit && dirtyRef.current) {
      const ok = await save();
      if (!ok) return;
    }
    window.location.href = `/submissions/${submission.id}/print`;
  }

  async function applySignature(
    fieldId: string,
    signatureImage: string,
    overrideExpected?: string,
  ) {
    setError(null);
    try {
      // Save current data first so the signature's data_hash binds to it.
      if (dirtyRef.current) {
        const ok = await save();
        if (!ok) return;
      }

      // Batch siblings cascade automatically. The server checks per
      // sibling whether this user is the assignee for this field, and
      // skips siblings where they aren't. So defaulting to true is
      // safe — heli admin / OIM signatures spread to every sibling
      // they're assigned to (the whole batch); supervisor signatures
      // spread only within the supervisor's crew; inductee signatures
      // never spread (different inductee per sibling). One signature
      // gesture, correct propagation — no prompt needed.
      const batchApply = batchId !== null && batchSiblingCount > 0;

      const geo = await tryGeolocation();
      const res = await fetch(`/api/submissions/${submission.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_id: fieldId,
          signature_image: signatureImage,
          geolocation: geo,
          batch_apply: batchApply,
          // Override exists for symmetry with save() — currently
          // unused since the sign-time conflict UI asks the user to
          // reload rather than offering "force-sign with their
          // version." If we ever add that branch, this hook is the
          // bypass.
          expected_updated_at: overrideExpected ?? serverUpdatedAt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && (body as { conflict?: boolean }).conflict) {
        // The data changed between the user looking at the form and
        // hitting sign. Refuse — a signature attests to data the
        // signer saw, and we won't bind a hash to data they didn't.
        // Tell them to reload and reconsider.
        setError(
          "The form was edited after you loaded it. Reload, re-check, and sign again.",
        );
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Sign failed");
      setSigned((s) => [
        ...s,
        {
          field_id: fieldId,
          signer_name: "you",
          signed_at: new Date().toISOString(),
        },
      ]);
      if (body.completed) setStatus("completed");
      else if (status === "in_progress") setStatus("awaiting_signature");
      if (batchApply && body.batch?.siblings_signed > 0) {
        // Non-blocking inline notice rather than alert(). The signer
        // doesn't need to dismiss anything to keep working.
        setCascadeNotice(
          `Signature applied to ${body.batch.siblings_signed} other submission${body.batch.siblings_signed === 1 ? "" : "s"} in this batch` +
            (body.batch.siblings_completed
              ? ` · ${body.batch.siblings_completed} now complete.`
              : "."),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    }
  }

  /**
   * "Apply this section to everyone in the batch." Sends current
   * data to every sibling submission in the same batch where the
   * section is still writable for the current user.
   */
  async function propagateSection(sectionId: string) {
    if (!batchId || batchSiblingCount === 0) return;
    setError(null);
    if (dirtyRef.current) {
      const ok = await save();
      if (!ok) return;
    }
    try {
      const res = await fetch(
        `/api/submissions/${submission.id}/propagate-section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section_id: sectionId }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Propagation failed");
      alert(
        `Applied to ${body.propagated} of ${body.total_siblings} sibling submission${body.total_siblings === 1 ? "" : "s"}` +
          (body.skipped > 0
            ? ` (${body.skipped} skipped — already signed or owned by someone else)`
            : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Propagation failed");
    }
  }

  return (
    <div className="pb-28">
      {/* Sticky header — title, progress, save state, always visible */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-ink/10 bg-bg/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <a
            href="/submissions"
            className="font-mono text-xs text-muted no-underline"
          >
            ← back
          </a>
          <div className="flex items-center gap-2">
            {!online && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn"
                title="Offline — changes are kept locally and will sync when you reconnect."
              >
                <span aria-hidden>●</span> offline
              </span>
            )}
            <SaveIndicator state={saveState} savedAt={savedAt} canEdit={canEdit} />
          </div>
        </div>
        <h1 className="mt-1 truncate text-base font-bold md:text-xl">
          {submission.form_name}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
          <span className="font-mono">
            Section {currentSection + 1} of {totalSections}
          </span>
          <span>·</span>
          <StatusTag status={status} />
        </div>
        <ProgressBar current={currentSection + 1} total={totalSections} />
      </div>

      {/* Handoff banner: who started, who edited last, and a button
          to hand off to a teammate. Only shows while the form is
          editable — once it's signed/completed, the audit trail is
          locked and a banner about handoffs is just noise. */}
      {canEdit && (
        <HandoffBanner
          submissionId={submission.id}
          starter={starter}
          lastEditor={lastEditor}
          teammates={teammates}
        />
      )}

      {!canEdit && (
        <div className="mt-3 rounded-md border border-ink/15 bg-white p-3 text-sm text-muted">
          Read-only — submission is {status}.
        </div>
      )}

      {/* Current section */}
      {sec && (() => {
        const lock = sectionLocks[sec.id] ?? { state: "open" as const };
        const sectionCanEdit =
          canEdit && (lock.state === "open" || lock.state === "reserved_for_me");
        return (
        <section className="mt-4 rounded-lg border border-ink/15 bg-white p-4">
          <h2 className="text-lg font-bold">{sec.title}</h2>
          {sec.description && (
            <p className="mt-1 text-sm text-muted">{sec.description}</p>
          )}
          <SectionLockBanner lock={lock} />
          {/* Batch shortcut: when this submission is in a batch and the
              user owns this section, offer one-tap propagation to every
              other inductee in the batch. Saves Heli admin / OIM from
              re-keying sections 1-2 N times. */}
          {sectionCanEdit && batchId && batchSiblingCount > 0 && (
            <div className="mt-2 rounded-md border border-accent/30 bg-accent/5 p-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs text-ink">
                  This submission is part of a batch of {batchSiblingCount + 1}.
                </span>
                <button
                  type="button"
                  onClick={() => propagateSection(sec.id)}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-bg"
                >
                  Apply this section to all {batchSiblingCount + 1} →
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Copies every field in this section (not signatures) to the
                other inductee submissions in this batch. Already-signed
                sections are skipped.
              </p>
            </div>
          )}
          <div className="mt-4 space-y-5">
            {sec.fields.map((f) => (
              <FieldRenderer
                key={f.id}
                field={f}
                value={data[f.id]}
                onChange={(v) => set(f.id, v)}
                canEdit={sectionCanEdit}
                signed={signed.find((s) => s.field_id === f.id)}
                onSign={(img) => applySignature(f.id, img)}
                currentUserId={currentUserId}
                currentUserEmail={currentUserEmail}
                orgId={submission.org_id}
                submissionId={submission.id}
                assignment={signatureAssignments[f.id]}
                missingInSection={missingByIndex[currentSection]}
              />
            ))}
          </div>
        </section>
        );
      })()}

      {/* Section dots — quick jump nav for desktop / longer-form.
          Color encodes lock state at a glance:
            green border = signed (locked)
            accent fill  = your turn
            yellow tint  = waiting on someone else
            grey         = open with missing fields
       */}
      {totalSections > 1 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {schema.sections.map((s, i) => {
            const missing = missingByIndex[i].length;
            const active = i === currentSection;
            const lock = sectionLocks[s.id] ?? { state: "open" as const };
            let cls = "border border-ink/15 text-ink";
            if (active) cls = "bg-ink text-bg";
            else if (lock.state === "signed_locked")
              cls = "border border-ok/50 bg-ok/10 text-ink";
            else if (lock.state === "reserved_for_me")
              cls = "border border-accent bg-accent/10 text-ink";
            else if (
              lock.state === "reserved_for_other" ||
              lock.state === "waiting_prior" ||
              lock.state === "role_required" ||
              lock.state === "inductee_required"
            )
              cls = "border border-warn/40 bg-warn/5 text-muted";
            else if (missing > 0)
              cls = "border border-warn/40 bg-warn/5 text-ink";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (canEdit && dirtyRef.current) save();
                  setCurrentSection(i);
                  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
                }}
                title={
                  s.title +
                  (lock.state === "signed_locked"
                    ? " — signed"
                    : lock.state === "reserved_for_me"
                      ? " — your turn"
                      : lock.state === "reserved_for_other"
                        ? ` — waiting for ${lock.assigneeLabel}`
                        : lock.state === "waiting_prior"
                          ? ` — waiting for "${lock.priorSectionTitle}" to be signed`
                          : lock.state === "role_required"
                            ? ` — only ${lock.requiredRoleName} can edit`
                            : lock.state === "inductee_required"
                              ? " — only the inductee can edit"
                              : "")
                }
                className={"min-w-[2.25rem] rounded-md px-2 py-1 text-xs " + cls}
              >
                {i + 1}
                {missing > 0 && !active && (
                  <span className="ml-1 text-[10px] text-warn">●</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-err/40 bg-err/10 p-3 text-sm text-err">
          <strong>{error}</strong>
          <div className="mt-1 text-xs">
            Your changes were not saved. Try the Save button or check your
            connection before continuing.
          </div>
        </div>
      )}

      {conflict && (
        <div className="mt-3 rounded-md border border-warn/50 bg-warn/10 p-3 text-sm">
          <div className="font-bold text-warn">
            This form was edited elsewhere
          </div>
          <p className="mt-1 text-xs text-ink/80">
            Someone else saved a newer version
            {conflict.last_edited_at
              ? ` at ${new Date(conflict.last_edited_at).toLocaleTimeString()}`
              : ""}
            . Your unsaved changes are still here — pick one:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                // "Use my version" — push the server's new
                // updated_at into save() as an override (state set
                // here won't be visible to the save closure until
                // after the next render), force-saves over their
                // copy, and clears the conflict on success.
                const newToken = conflict.current_updated_at;
                setServerUpdatedAt(newToken);
                setConflict(null);
                dirtyRef.current = true;
                await save(newToken);
              }}
              className="rounded-md bg-warn px-3 py-1.5 text-sm font-medium text-bg"
            >
              Use my version (overwrites theirs)
            </button>
            <button
              type="button"
              onClick={() => {
                // Adopt the server version wholesale.
                setData(conflict.current_data);
                dataRef.current = conflict.current_data;
                dirtyRef.current = false;
                setServerUpdatedAt(conflict.current_updated_at);
                setConflict(null);
                setSaveState("saved");
              }}
              className="rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm"
            >
              Use their version (discards mine)
            </button>
          </div>
        </div>
      )}

      {cascadeNotice && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          <span>{cascadeNotice}</span>
          <button
            type="button"
            onClick={() => setCascadeNotice(null)}
            className="text-xs text-accent/80 hover:text-accent"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-ink/15 bg-bg/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={currentSection === 0}
            className="min-h-[48px] rounded-md border border-ink/20 px-4 text-sm font-medium text-ink disabled:opacity-40"
          >
            ← Back
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => save()}
              disabled={saveState === "saving"}
              className="min-h-[48px] rounded-md border border-ink/20 px-3 text-sm text-ink disabled:opacity-50"
            >
              Save
            </button>
          )}
          <div className="flex-1" />
          {isLastSection ? (
            <button
              type="button"
              onClick={printNow}
              disabled={saveState === "saving"}
              className="min-h-[48px] flex-1 rounded-md bg-accent px-5 text-sm font-bold text-bg disabled:opacity-50 md:flex-none"
            >
              {saveState === "saving" ? "Saving…" : "Finish · Download / Print"}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={saveState === "saving"}
              className="min-h-[48px] flex-1 rounded-md bg-ink px-5 text-sm font-bold text-bg disabled:opacity-50 md:flex-none"
            >
              {saveState === "saving" ? "Saving…" : "Next →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HandoffBanner({
  submissionId,
  starter,
  lastEditor,
  teammates,
}: {
  submissionId: string;
  starter: Starter;
  lastEditor: LastEditor | null;
  teammates: Teammate[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/submissions/${submissionId}`
      : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — long-press the URL bar to copy manually.");
    }
  }

  async function shareNative() {
    if (typeof navigator === "undefined" || !navigator.share) {
      copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "FieldForm — please finish this form",
        text: `Can you finish this form? ${starter.is_self ? "I" : starter.name} started it.`,
        url,
      });
    } catch {
      // User cancelled — no-op.
    }
  }

  async function emailTeammate(t: Teammate) {
    setEmailing(t.user_id);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user_id: t.user_id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't send");
      setOpen(false);
      alert(`Sent ${t.name} a link to finish this form.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setEmailing(null);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-ink/15 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted">
            Started by{" "}
            <strong className="text-ink">
              {starter.is_self ? "you" : starter.name}
            </strong>
            {lastEditor && (
              <>
                {" · "}
                last edited by{" "}
                <strong className="text-ink">{lastEditor.name}</strong>
                {lastEditor.at && <> · {timeAgo(lastEditor.at)}</>}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-xs"
        >
          {open ? "Close" : "Hand off ↗"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
          <p className="text-xs text-muted">
            Anyone on your team can already pick up this form from
            their submissions list. Use the options below if you want
            to nudge a specific teammate.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={shareNative}
              className="rounded-md bg-ink px-3 py-2 text-xs text-bg"
            >
              Share link
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-md border border-ink/20 px-3 py-2 text-xs"
            >
              {copied ? "✓ Copied" : "Copy link"}
            </button>
          </div>

          {teammates.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Email a teammate
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {teammates.slice(0, 12).map((t) => (
                  <button
                    key={t.user_id}
                    type="button"
                    onClick={() => emailTeammate(t)}
                    disabled={emailing === t.user_id}
                    className="flex items-center justify-between rounded-md border border-ink/15 bg-bg px-3 py-2 text-left text-sm disabled:opacity-50"
                  >
                    <span>{t.name}</span>
                    <span className="text-xs text-muted">
                      {emailing === t.user_id ? "Sending…" : "Email →"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-err/40 bg-err/5 p-2 text-xs text-err">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function SectionLockBanner({ lock }: { lock: SectionLockState }) {
  if (lock.state === "open" || lock.state === "reserved_for_me") {
    // No banner for editable sections. (reserved_for_me means "your
    // turn" — we don't loud-banner it, the existing signature-field
    // assignment line covers that.)
    return null;
  }
  if (lock.state === "waiting_prior") {
    return (
      <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs">
        <strong className="text-ink">
          ⏳ Waiting for &ldquo;{lock.priorSectionTitle}&rdquo;
        </strong>
        <span className="text-muted">
          {" — this section opens once Section "}
          {lock.priorSectionIndex + 1}
          {" is signed."}
        </span>
      </div>
    );
  }
  if (lock.state === "role_required") {
    return (
      <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs">
        <strong className="text-ink">
          🔒 Only {lock.requiredRoleName} can edit this section
        </strong>
        <span className="text-muted">
          {" — you'll need to be added to that role in Settings → Role rosters."}
        </span>
      </div>
    );
  }
  if (lock.state === "inductee_required") {
    return (
      <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs">
        <strong className="text-ink">
          🔒 Inductee&apos;s section
        </strong>
        <span className="text-muted">
          {lock.inducteeEmail
            ? ` — only ${lock.inducteeEmail} can fill in and sign here.`
            : " — only the inductee assigned to this submission can edit here."}
        </span>
      </div>
    );
  }
  if (lock.state === "reserved_for_other") {
    return (
      <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs">
        <strong className="text-ink">🔒 Waiting for {lock.assigneeLabel}</strong>
        <span className="text-muted">
          {" — this section is read-only until "}
          {lock.assignedToRole ? "any roster member" : "they"}
          {" fill and sign it."}
        </span>
      </div>
    );
  }
  // signed_locked
  return (
    <div className="mt-2 rounded-md border border-ok/40 bg-ok/5 p-2.5 text-xs">
      <strong className="text-ink">✓ Signed by {lock.signerName}</strong>
      <span className="text-muted">
        {lock.signedAt && <> on {new Date(lock.signedAt).toLocaleString()}</>}
        {" — section locked to preserve signature integrity."}
      </span>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SaveIndicator({
  state,
  savedAt,
  canEdit,
}: {
  state: SaveState;
  savedAt: string | null;
  canEdit: boolean;
}) {
  if (!canEdit) return null;
  if (state === "saving")
    return (
      <span className="text-xs text-muted">
        <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-warn" />
        Saving…
      </span>
    );
  if (state === "error")
    return (
      <span className="text-xs font-bold text-err">
        ⚠ Couldn&apos;t save — tap Save
      </span>
    );
  if (state === "dirty")
    return <span className="text-xs text-muted">● Unsaved changes</span>;
  if (state === "saved" || savedAt)
    return (
      <span className="text-xs text-ok">
        ✓ Saved{savedAt ? ` ${savedAt}` : ""}
      </span>
    );
  return <span className="text-xs text-muted">—</span>;
}

function StatusTag({ status }: { status: SubmissionStatus }) {
  const cls =
    status === "completed"
      ? "text-ok"
      : status === "rejected"
        ? "text-err"
        : status === "awaiting_signature"
          ? "text-warn"
          : "text-muted";
  return <span className={cls}>{status.replace("_", " ")}</span>;
}

function FieldRenderer({
  field,
  value,
  onChange,
  canEdit,
  signed,
  onSign,
  currentUserEmail,
  orgId,
  submissionId,
  assignment,
  missingInSection,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  canEdit: boolean;
  signed?: SignedField;
  onSign: (img: string) => void;
  currentUserId: string;
  currentUserEmail: string;
  orgId: string;
  submissionId: string;
  assignment?: SignatureAssignments[string];
  /** Labels of required fields in this section that are still empty.
   * Drives the gate on the SignaturePad — you can't sign-off on
   * data you haven't entered. */
  missingInSection?: string[];
}) {
  const disabled = !canEdit || !!signed;
  const labelEl = (
    <label className="block text-base font-medium">
      {field.label}
      {field.required && <span className="ml-1 text-err">*</span>}
      {field.description && (
        <div className="mt-0.5 text-xs font-normal text-muted">
          {field.description}
        </div>
      )}
    </label>
  );

  switch (field.type) {
    case "section_header":
      return (
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
          {field.label}
        </h3>
      );
    case "divider":
      return <hr className="border-ink/10" />;
    case "text":
      return (
        <div>
          {labelEl}
          <input
            type="text"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="mt-1.5 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg"
          />
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            rows={4}
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg"
          />
        </div>
      );
    case "number":
      return (
        <div>
          {labelEl}
          <input
            type="number"
            inputMode="decimal"
            disabled={disabled}
            value={(value as number | string) ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className="mt-1.5 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg"
          />
        </div>
      );
    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg md:w-auto"
          />
        </div>
      );
    case "datetime":
      return (
        <div>
          {labelEl}
          <input
            type="datetime-local"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg md:w-auto"
          />
        </div>
      );
    case "dropdown":
      return (
        <div>
          {labelEl}
          <select
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg"
          >
            <option value="">— select —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    case "multi_select": {
      const selected = (value as string[] | undefined) ?? [];
      return (
        <div>
          {labelEl}
          <div className="mt-1.5 flex flex-col gap-2">
            {(field.options ?? []).map((opt) => {
              const on = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      on
                        ? selected.filter((s) => s !== opt)
                        : [...selected, opt],
                    )
                  }
                  className={
                    "flex min-h-[52px] w-full items-center justify-between rounded-md border px-4 py-2 text-left text-base transition-colors " +
                    (on
                      ? "border-ink bg-ink text-bg"
                      : "border-ink/20 bg-white text-ink")
                  }
                >
                  <span>{opt}</span>
                  <span className="text-lg">{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "checkbox":
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={
            "flex min-h-[56px] w-full items-center gap-3 rounded-md border px-4 py-2 text-left text-base transition-colors " +
            (value
              ? "border-ok bg-ok/10 text-ink"
              : "border-ink/20 bg-white text-ink")
          }
        >
          <span
            className={
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 text-base font-bold " +
              (value ? "border-ok bg-ok text-bg" : "border-ink/40")
            }
          >
            {value ? "✓" : ""}
          </span>
          <span className="flex-1">
            {field.label}
            {field.required && <span className="ml-1 text-err">*</span>}
          </span>
        </button>
      );
    case "radio":
      return (
        <div>
          {labelEl}
          <div className="mt-1.5 flex flex-col gap-2">
            {(field.options ?? []).map((opt) => {
              const on = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(opt)}
                  className={
                    "flex min-h-[52px] w-full items-center gap-3 rounded-md border px-4 py-2 text-left text-base transition-colors " +
                    (on
                      ? "border-ink bg-ink text-bg"
                      : "border-ink/20 bg-white text-ink")
                  }
                >
                  <span
                    className={
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 " +
                      (on ? "border-bg" : "border-ink/40")
                    }
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-bg" />}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    case "photo":
      return (
        <PhotoField
          field={field}
          orgId={orgId}
          submissionId={submissionId}
          value={value as string[] | undefined}
          onChange={(paths) => onChange(paths)}
          disabled={disabled}
        />
      );
    case "document_expiry": {
      // Stored shape: { date: "YYYY-MM-DD", photos: string[] }.
      // Photos array reuses the same PhotoField storage path so
      // existing storage policies and signed-URL flows work
      // unchanged; date is a plain ISO date input. Reminders fire
      // off the date alone — the photo is for the auditor's record.
      const cur = (value ?? { date: "", photos: [] }) as {
        date: string;
        photos: string[];
      };
      const today = new Date();
      const expDate = cur.date ? new Date(cur.date) : null;
      const daysUntil =
        expDate && !isNaN(expDate.getTime())
          ? Math.ceil(
              (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
            )
          : null;
      let warn: string | null = null;
      if (daysUntil != null) {
        if (daysUntil < 0) warn = `Expired ${-daysUntil} day(s) ago.`;
        else if (daysUntil <= 7) warn = `Expires in ${daysUntil} day(s).`;
        else if (daysUntil <= 30)
          warn = `Expires in ${daysUntil} day(s) — schedule a refresh.`;
      }
      return (
        <div>
          {labelEl}
          <div className="mt-1.5 grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] text-muted">Expiry date</span>
              <input
                type="date"
                disabled={disabled}
                value={cur.date}
                onChange={(e) =>
                  onChange({ ...cur, date: e.target.value })
                }
                className="mt-1 min-h-[48px] w-full rounded-md border border-ink/20 bg-white p-3 text-base disabled:bg-bg"
              />
            </label>
            <div>
              <span className="text-[11px] text-muted">
                Photo of document (optional)
              </span>
              <div className="mt-1">
                <PhotoField
                  field={{ ...field, type: "photo", multiple: false, max: 1 }}
                  orgId={orgId}
                  submissionId={submissionId}
                  value={cur.photos}
                  onChange={(paths) =>
                    onChange({ ...cur, photos: paths })
                  }
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
          {warn && (
            <div
              className={`mt-2 rounded-md border p-2 text-xs ${
                daysUntil != null && daysUntil < 0
                  ? "border-err/40 bg-err/5 text-err"
                  : daysUntil != null && daysUntil <= 7
                    ? "border-err/40 bg-err/5 text-err"
                    : "border-warn/40 bg-warn/5 text-warn"
              }`}
            >
              {warn}
            </div>
          )}
        </div>
      );
    }
    case "gps":
      return (
        <div>
          {labelEl}
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              const g = await tryGeolocation();
              if (g) onChange(g);
            }}
            className="mt-1.5 min-h-[48px] rounded-md border border-ink/20 px-4 py-2 text-sm"
          >
            {value
              ? `📍 ${(value as { lat: number; lng: number }).lat.toFixed(5)}, ${(value as { lat: number; lng: number }).lng.toFixed(5)}`
              : "📍 Capture location"}
          </button>
        </div>
      );
    case "timestamp":
      return (
        <div>
          {labelEl}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(new Date().toISOString())}
            className="mt-1.5 min-h-[48px] rounded-md border border-ink/20 px-4 py-2 text-sm"
          >
            {value
              ? `🕒 ${new Date(value as string).toLocaleString()}`
              : "🕒 Capture timestamp"}
          </button>
        </div>
      );
    case "signature": {
      const me = currentUserEmail.toLowerCase();
      const allowed = assignment ? assigneeEmails(assignment) : [];
      const isAssignedToMe = !!assignment && allowed.includes(me);
      const isAssignedToOther = !!assignment && !isAssignedToMe;
      const aLabel = assignment ? assigneeLabel(assignment) : "";
      return (
        <div>
          {labelEl}
          {assignment && (
            <div className="mt-1 text-xs text-muted">
              Assigned to <strong className="text-ink">{aLabel}</strong>
              {isAssignedToMe && (
                <span className="ml-1 text-ok">
                  {isRoleAssignment(assignment)
                    ? "— you're in this role"
                    : "— that's you"}
                </span>
              )}
            </div>
          )}
          {signed ? (
            <div className="mt-1.5 rounded-md border border-ok/40 bg-ok/5 p-3 text-sm">
              ✓ Signed by {signed.signer_name} on{" "}
              {new Date(signed.signed_at).toLocaleString()}
            </div>
          ) : isAssignedToOther ? (
            <div className="mt-1.5 rounded-md border border-ink/15 bg-bg p-3 text-sm text-muted">
              Waiting for {aLabel} to sign. The system will refuse a
              signature from anyone outside that{" "}
              {isRoleAssignment(assignment) ? "role" : "person"}.
            </div>
          ) : canEdit ? (
            missingInSection && missingInSection.length > 0 ? (
              <div className="mt-1.5 rounded-md border border-warn/40 bg-warn/5 p-3 text-sm">
                <div className="font-medium text-warn">
                  Fill these in before signing
                </div>
                <ul className="mt-1 list-disc pl-4 text-muted">
                  {missingInSection.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-muted">
                  A signature attests to the data in this section.
                  Required fields must be filled before the system
                  will accept a signature.
                </p>
              </div>
            ) : (
              <SignaturePad onSign={onSign} />
            )
          ) : (
            <div className="mt-1.5 text-sm text-muted">Not signed yet.</div>
          )}
        </div>
      );
    }
    default:
      return (
        <div className="text-sm text-muted">
          Field type {field.type} not yet supported.
        </div>
      );
  }
}

async function tryGeolocation(): Promise<
  { lat: number; lng: number; accuracy?: number } | null
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}
