import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { resolveSignatureImages } from "@/lib/signatureStorage";
import { verifySubmissionToken } from "@/lib/submissionLinks";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  Org,
  SignatureRow,
  Submission,
} from "@/lib/types";
import PrintView from "./PrintView";

/**
 * The permanent-record view of a completed submission.
 *
 * Two ways to access:
 *   1. Logged-in org member — normal Supabase auth + membership check.
 *   2. ?token=... signed HMAC token — used by emailed completion
 *      notifications so external recipients (safety officers,
 *      customers, regulators) can view the artifact without an
 *      account. Tokens expire after 90 days by default.
 *
 * Renders every filled-in field, every photo, every signature, plus
 * the audit trail (signer name, timestamp, IP, geolocation, the
 * SHA-256 data_hash that makes the signature tamper-evident).
 * Browser "Save as PDF" produces a clean compliance-grade artifact.
 */
export default async function SubmissionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  // First gate: signed token, if provided. Bypasses the auth + org
  // check entirely (intentionally — that's the whole point of email
  // notification links).
  let viaToken = false;
  if (token) {
    const verified = verifySubmissionToken(token);
    if (verified && verified.submissionId === id) {
      viaToken = true;
    } else {
      // Bad / expired token. Fall through to user auth so a logged-in
      // member can still view it; otherwise login redirect handles it.
    }
  }

  const sb = supabaseService();

  if (!viaToken) {
    const user = await requireUser();
    const orgs = await listUserOrgs(user.id);
    if (orgs.length === 0) redirect("/onboarding");
    const { data: submission, error } = await sb
      .from("submissions")
      .select("*, form_versions(schema), forms(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!submission) notFound();
    type Joined = Submission & {
      form_versions: { schema: FormDefinition } | null;
      forms: { name: string } | null;
    };
    const s = submission as unknown as Joined;
    const memberOrg = orgs.find((o) => o.org.id === s.org_id);
    if (!memberOrg) notFound();
    return await renderPrint(s, memberOrg.org as Org, false);
  }

  // Token path — load submission + the org name (no membership check).
  const { data: submission, error } = await sb
    .from("submissions")
    .select("*, form_versions(schema), forms(name), orgs(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!submission) notFound();
  type JoinedTok = Submission & {
    form_versions: { schema: FormDefinition } | null;
    forms: { name: string } | null;
    orgs: { id: string; name: string } | null;
  };
  const s = submission as unknown as JoinedTok;
  if (!s.orgs) notFound();
  return await renderPrint(s, { id: s.orgs.id, name: s.orgs.name } as Org, true);
}

async function renderPrint(
  s: Submission & {
    form_versions: { schema: FormDefinition } | null;
    forms: { name: string } | null;
  },
  org: Org,
  viaToken: boolean,
) {
  const sb = supabaseService();
  const schema = s.form_versions?.schema;
  if (!schema) throw new Error("Schema missing");

  const { data: sigs } = await sb
    .from("submission_signatures")
    .select("*")
    .eq("submission_id", s.id)
    .order("signed_at", { ascending: true });
  const rawSignatures = (sigs ?? []) as SignatureRow[];

  // Resolve each signature to a renderable src — signed URL for
  // storage-backed rows, the inline base64 for legacy. Server-side
  // so the PrintView gets a flat string and can pass it straight to
  // <img>. Done in one batched storage call rather than N.
  const resolved = await resolveSignatureImages(
    rawSignatures.map((r) => ({
      signature_image: r.signature_image,
      signature_image_path: r.signature_image_path,
    })),
  );
  const signatures = rawSignatures.map((r, i) => ({
    ...r,
    signature_image: resolved[i] ?? r.signature_image,
  }));

  // Collect every photo-storage path referenced by the submission's
  // data so we can resolve them all to signed URLs at once. Two
  // sources: plain "photo" fields (array of paths) and
  // "document_expiry" fields (object with .photos array). Same
  // bucket, same TTL, same downstream consumer.
  const photoUrls: Record<string, string> = {};
  const photoPaths: string[] = [];
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      if (f.type === "photo") {
        const paths = (s.data?.[f.id] as string[] | undefined) ?? [];
        for (const p of paths) {
          if (typeof p === "string") photoPaths.push(p);
        }
      } else if (f.type === "document_expiry") {
        const v =
          (s.data?.[f.id] as { photos?: string[] } | undefined) ?? {};
        for (const p of v.photos ?? []) {
          if (typeof p === "string") photoPaths.push(p);
        }
      }
    }
  }
  for (const path of photoPaths) {
    if (!path.startsWith(`${s.org_id}/`)) continue;
    const { data: url } = await sb.storage
      .from("form-photos")
      .createSignedUrl(path, 60 * 60 * 24);
    if (url?.signedUrl) photoUrls[path] = url.signedUrl;
  }

  return (
    <PrintView
      submission={s}
      schema={schema}
      signatures={signatures}
      photoUrls={photoUrls}
      orgName={org.name}
      formName={s.forms?.name ?? "Form"}
      viaToken={viaToken}
    />
  );
}
