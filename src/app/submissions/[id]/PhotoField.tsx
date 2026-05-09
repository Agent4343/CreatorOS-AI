"use client";

import { useEffect, useRef, useState } from "react";
import type { FormField } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/browser";

const BUCKET = "form-photos";

/**
 * Photo upload + thumbnail viewer for the `photo` field type.
 *
 * Storage flow:
 *  1. Browser uploads directly to Supabase Storage. The bucket's RLS
 *     policy gates by `is_org_member((storage.foldername(name))[1])`,
 *     so the upload only succeeds if the path starts with this user's
 *     org_id. Uploads bypass the API server entirely.
 *  2. We persist the storage PATH (not a URL) on the submission's
 *     data, so the row stays small and the URL can be re-issued any
 *     time (signed URLs expire).
 *  3. To display existing photos, we hit /api/uploads/photo/sign which
 *     returns a 10-minute signed URL.
 */
export default function PhotoField({
  field,
  orgId,
  submissionId,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  orgId: string;
  submissionId: string;
  value: string[] | undefined;
  onChange: (paths: string[]) => void;
  disabled: boolean;
}) {
  const paths = value ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const next: Record<string, string> = {};
      for (const path of paths) {
        if (urls[path]) {
          next[path] = urls[path];
          continue;
        }
        try {
          const res = await fetch("/api/uploads/photo/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, org_id: orgId }),
          });
          const body = await res.json();
          if (res.ok) next[path] = body.url;
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setUrls(next);
    }
    refresh();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|"), orgId]);

  async function uploadFiles(files: FileList) {
    setError(null);
    setUploading(true);
    const sb = supabaseBrowser();
    const newPaths: string[] = [];
    try {
      for (const file of Array.from(files)) {
        // Limit per BIBLE §10 — small enough to round-trip on phone
        if (file.size > 8 * 1024 * 1024) {
          setError(`${file.name} is over 8 MB; please compress.`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "jpg";
        const key = `${orgId}/${submissionId}/${field.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(key, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        newPaths.push(key);
      }
      if (newPaths.length > 0) {
        onChange([...(paths ?? []), ...newPaths]);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removePhoto(path: string) {
    onChange(paths.filter((p) => p !== path));
    // We don't delete the storage object on remove — older Supabase
    // versions of the path stay accessible if a signed URL is leaked.
    // Treat storage as append-only at the user-action layer; admins
    // can lifecycle-rule old objects away.
  }

  const max = field.max ?? 10;
  const limitReached = paths.length >= max;

  return (
    <div>
      <label className="block text-sm font-medium">
        {field.label}
        {field.required && <span className="ml-1 text-err">*</span>}
        {field.description && (
          <span className="ml-2 text-xs text-muted">{field.description}</span>
        )}
      </label>

      {paths.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-5">
          {paths.map((p) => (
            <div
              key={p}
              className="relative aspect-square overflow-hidden rounded-md border border-ink/15 bg-ink/5"
            >
              {urls[p] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={urls[p]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                  loading…
                </div>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removePhoto(p)}
                  className="absolute right-1 top-1 rounded-md bg-ink/70 px-1.5 py-0.5 text-[10px] text-bg"
                >
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && !limitReached && (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple={!!field.multiple}
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadFiles(e.target.files);
              }
            }}
            className="block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-bg"
          />
          <p className="mt-1 text-[11px] text-muted">
            {uploading
              ? "Uploading…"
              : `${paths.length}/${max} · max 8 MB each${field.multiple ? "" : " · single file"}`}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-1 text-xs text-err">{error}</div>
      )}
    </div>
  );
}
