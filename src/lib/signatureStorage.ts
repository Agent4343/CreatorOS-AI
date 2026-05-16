import { supabaseService } from "@/lib/supabase/server";

/**
 * Storage helpers for signature PNGs.
 *
 * Bucket: "signatures", private (no public read). Each row's image
 * lives at `<org_id>/<submission_id>/<signature_id>.png`. Reads
 * come back as signed URLs scoped to a short TTL — long enough for
 * a print job (5 min) but not durable enough to be useful if leaked.
 *
 * Why storage at all: base64 in the DB row makes every signature
 * lookup ~50-200 KB heavier than it needs to be, slows print jobs,
 * and bloats backups. Moving the bytes out also unblocks future
 * features like signature thumbnails and EXIF-stripped photo
 * uploads.
 *
 * Backwards compatibility: rows written before this code shipped
 * still have `signature_image` (base64); the read helper returns
 * that when there's no `signature_image_path`. New rows get only
 * the path.
 */

const BUCKET = "signatures";
const SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 min — covers a print job.

let bucketEnsured = false;

/**
 * Best-effort bucket creation on first use. If it already exists or
 * the user lacks permissions, this is a no-op — the upload calls
 * will surface the real error if the bucket is genuinely missing.
 * Wrapped to avoid hot-path latency after the first hit per
 * server lifetime.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  bucketEnsured = true;
  const sb = supabaseService();
  // createBucket is idempotent-ish: returns an error if the bucket
  // already exists. We swallow that specific case and proceed.
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: false,
  });
  if (error && !/already exists/i.test(error.message)) {
    // Reset the flag so a transient failure doesn't permanently lock
    // out the storage path for this server lifetime.
    bucketEnsured = false;
    throw error;
  }
}

/**
 * Upload a base64 PNG data URL to storage. Returns the storage
 * object path, NOT a URL. Persist the path on the signature row.
 */
export async function uploadSignaturePng(args: {
  orgId: string;
  submissionId: string;
  signatureId: string;
  dataUrl: string;
}): Promise<string> {
  if (!args.dataUrl.startsWith("data:image/")) {
    throw new Error("signature_image must be a data: URL");
  }
  await ensureBucket();
  const sb = supabaseService();

  // Strip the data: prefix and decode to a Buffer. We don't try to
  // re-encode or compress here — the canvas already produced a
  // ~lossless PNG at the size we want.
  const commaIdx = args.dataUrl.indexOf(",");
  const b64 = args.dataUrl.slice(commaIdx + 1);
  const bytes = Buffer.from(b64, "base64");

  const path = `${args.orgId}/${args.submissionId}/${args.signatureId}.png`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (error) throw error;
  return path;
}

/**
 * Return something the runner can stick into <img src=…>:
 *   - a signed URL when the row stores a storage path,
 *   - the legacy base64 data URL otherwise.
 *
 * Why not always upload at read time: we don't want a print job
 * triggering N storage writes. Backfill is its own one-time pass.
 */
export async function resolveSignatureImage(args: {
  signature_image: string | null;
  signature_image_path: string | null;
}): Promise<string | null> {
  if (args.signature_image_path) {
    const sb = supabaseService();
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(args.signature_image_path, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  }
  if (args.signature_image) return args.signature_image;
  return null;
}

/** Resolve a batch in one query when rendering a print page or the
 * audit detail view. Same fallback logic per row. */
export async function resolveSignatureImages(
  rows: { signature_image: string | null; signature_image_path: string | null }[],
): Promise<(string | null)[]> {
  // Group storage lookups so we don't issue N signed-URL requests
  // when most rows need it. createSignedUrls accepts a list of paths.
  const pathIndices: number[] = [];
  const paths: string[] = [];
  rows.forEach((r, i) => {
    if (r.signature_image_path) {
      pathIndices.push(i);
      paths.push(r.signature_image_path);
    }
  });

  const out: (string | null)[] = rows.map((r) => r.signature_image ?? null);

  if (paths.length > 0) {
    const sb = supabaseService();
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    (data ?? []).forEach((d, i) => {
      const rowIdx = pathIndices[i];
      if (d.signedUrl) out[rowIdx] = d.signedUrl;
    });
  }
  return out;
}
