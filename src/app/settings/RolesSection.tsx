"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RoleMember = { email: string; name?: string };

export type Role = {
  id: string;
  name: string;
  description: string | null;
  members: RoleMember[];
  created_at: string;
};

/**
 * Manage role rosters for the org. Each role is a named position
 * (Heli admin, OIM, Supervisor) with a list of members. When
 * starting a batch, admins assign signature fields to roles instead
 * of specific people — any roster member can sign.
 *
 * Edits do NOT retroactively affect in-flight batches. Each batch
 * snapshots the roster at start time. Edit the roster → only future
 * batches see the change.
 */
export default function RolesSection({
  orgId,
  initialRoles,
}: {
  orgId: string;
  initialRoles: Role[];
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function createRole() {
    setError(null);
    if (!draftName.trim()) return setError("Role name required");
    setCreating(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          description: draftDesc.trim() || undefined,
          members: [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Create failed");
      setRoles([...roles, body.role]);
      setDraftName("");
      setDraftDesc("");
      setEditingId(body.role.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deleteRole(role: Role) {
    if (!confirm(`Delete the "${role.name}" role?\n\nIn-flight batches keep their snapshotted member list, so existing inductions won't break.`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/roles/${role.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      setRoles(roles.filter((r) => r.id !== role.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function updateRole(roleId: string, patch: Partial<Role>) {
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name,
          description: patch.description,
          members: patch.members,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      setRoles(roles.map((r) => (r.id === roleId ? body.role : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-5">
      <h2 className="text-lg font-bold">Role rosters</h2>
      <p className="mt-1 text-sm text-muted">
        Roles are positions (Heli admin, OIM, Supervisor) with rotating
        rosters. When starting a batch you can assign signatures to a
        role — any roster member can sign. Edits don&apos;t affect
        already-started batches.
      </p>

      {error && (
        <p className="mt-2 rounded-md border border-err/40 bg-err/5 p-2 text-sm text-err">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {roles.map((r) => (
          <RoleCard
            key={r.id}
            role={r}
            isEditing={editingId === r.id}
            onEdit={() => setEditingId(r.id)}
            onClose={() => setEditingId(null)}
            onSave={(patch) => updateRole(r.id, patch)}
            onDelete={() => deleteRole(r)}
          />
        ))}
        {roles.length === 0 && (
          <p className="text-sm text-muted">
            No roles yet. Create one for each position that signs your
            forms — typically Heli admin, OIM, and Supervisor.
          </p>
        )}
      </div>

      <div className="mt-5 rounded-md border border-dashed border-ink/30 bg-bg p-3">
        <h3 className="text-sm font-bold">Add a role</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Heli admin"
            className="rounded-md border border-ink/20 p-1.5 text-sm"
          />
          <input
            type="text"
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-md border border-ink/20 p-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={createRole}
          disabled={creating}
          className="mt-2 rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-bg disabled:opacity-50"
        >
          {creating ? "Creating…" : "Add role"}
        </button>
      </div>
    </section>
  );
}

function RoleCard({
  role,
  isEditing,
  onEdit,
  onClose,
  onSave,
  onDelete,
}: {
  role: Role;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: Partial<Role>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? "");
  const [members, setMembers] = useState<RoleMember[]>(role.members);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftMemberName, setDraftMemberName] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function addMember() {
    setLocalError(null);
    const email = draftEmail.trim().toLowerCase();
    if (!email) return setLocalError("Email required");
    if (!EMAIL_RE.test(email)) return setLocalError("Invalid email");
    if (members.some((m) => m.email === email)) {
      return setLocalError("Already in roster");
    }
    setMembers([
      ...members,
      { email, name: draftMemberName.trim() || undefined },
    ]);
    setDraftEmail("");
    setDraftMemberName("");
  }

  function removeMember(email: string) {
    setMembers(members.filter((m) => m.email !== email));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ name, description: desc, members });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <div className="rounded-md border border-ink/15 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="font-bold">{role.name}</div>
            {role.description && (
              <div className="text-xs text-muted">{role.description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs underline hover:no-underline"
          >
            edit
          </button>
        </div>
        <div className="mt-2 text-xs text-muted">
          {role.members.length === 0
            ? "No members yet"
            : `${role.members.length} member${role.members.length === 1 ? "" : "s"}: ${role.members
                .map((m) => m.name ?? m.email)
                .join(", ")}`}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-ink/40 bg-bg p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-sm">
          <div className="text-xs text-muted">Name</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-ink/20 p-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <div className="text-xs text-muted">Description</div>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-ink/20 p-1.5 text-sm"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs text-muted">Members</div>
        <ul className="mt-1 space-y-1">
          {members.map((m) => (
            <li
              key={m.email}
              className="flex items-baseline justify-between rounded-md bg-white px-2 py-1 text-sm"
            >
              <span>
                <span className="font-medium">{m.name ?? m.email}</span>
                {m.name && (
                  <span className="ml-1.5 font-mono text-xs text-muted">
                    {m.email}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => removeMember(m.email)}
                className="text-xs text-muted hover:text-err"
              >
                remove
              </button>
            </li>
          ))}
          {members.length === 0 && (
            <li className="text-xs text-muted">No members yet</li>
          )}
        </ul>

        {localError && (
          <p className="mt-1 text-xs text-err">{localError}</p>
        )}

        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <input
            type="text"
            value={draftMemberName}
            onChange={(e) => setDraftMemberName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-md border border-ink/20 p-1.5 text-sm"
          />
          <input
            type="email"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            placeholder="email@example.com"
            className="rounded-md border border-ink/20 p-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addMember}
            className="rounded-md border border-ink/30 px-2 py-1.5 text-sm font-bold"
          >
            Add member
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-err hover:underline"
        >
          Delete role
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-ink/30 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-bold text-bg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
