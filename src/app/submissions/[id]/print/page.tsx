import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
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
 * Renders every filled-in field, every photo, every signature, plus
 * the audit trail (signer name, timestamp, IP, geolocation, the
 * SHA-256 data_hash that makes the signature tamper-evident). Styled
 * for print — the user's browser "Save as PDF" produces a clean
 * compliance-grade artifact.
 *
 * Available on any submission, not just completed — useful for
 * in-progress reviews. The print stylesheet hides the toolbar so
 * what comes out of the printer is just the form.
 */
export default async function SubmissionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { id } = await params;

  const sb = supabaseService();
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

  // Verify membership.
  const memberOrg = orgs.find((o) => o.org.id === s.org_id);
  if (!memberOrg) notFound();
  const org = memberOrg.org as Org;

  const schema = s.form_versions?.schema;
  if (!schema) throw new Error("Schema missing");

  // Pull signatures + sign URLs for every photo path stored on the
  // submission so we can render them inline.
  const { data: sigs } = await sb
    .from("submission_signatures")
    .select("*")
    .eq("submission_id", s.id)
    .order("signed_at", { ascending: true });
  const signatures = (sigs ?? []) as SignatureRow[];

  // Resolve photo paths on every photo field into signed URLs.
  const photoUrls: Record<string, string> = {};
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      if (f.type !== "photo") continue;
      const paths = (s.data?.[f.id] as string[] | undefined) ?? [];
      for (const path of paths) {
        if (typeof path !== "string") continue;
        if (!path.startsWith(`${s.org_id}/`)) continue;
        const { data: url } = await sb.storage
          .from("form-photos")
          .createSignedUrl(path, 60 * 60 * 24); // 24 hr — long enough for printing
        if (url?.signedUrl) photoUrls[path] = url.signedUrl;
      }
    }
  }

  return (
    <PrintView
      submission={s}
      schema={schema}
      signatures={signatures}
      photoUrls={photoUrls}
      orgName={org.name}
      formName={s.forms?.name ?? "Form"}
    />
  );
}
