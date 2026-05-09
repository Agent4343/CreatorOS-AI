import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { Form } from "@/lib/types";
import StartSubmissionButton from "./StartSubmissionButton";

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org } = orgs[0];

  const { id } = await params;
  const sb = supabaseService();
  const { data, error } = await sb
    .from("forms")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const form = data as Form;

  const totalFields = form.schema.sections.reduce(
    (n, s) => n + s.fields.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <a href="/forms" className="font-mono text-xs">
          ← back to forms
        </a>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{form.name}</h1>
        {form.description && (
          <p className="mt-1 text-muted">{form.description}</p>
        )}
        <p className="mt-2 font-mono text-xs text-muted">
          {form.schema.sections.length} sections · {totalFields} fields · v
          {form.current_version}
        </p>
      </div>

      <StartSubmissionButton formId={form.id} orgId={org.id} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Form layout
        </h2>
        {form.schema.sections.map((sec, i) => (
          <div
            key={sec.id}
            className="rounded-lg border border-ink/15 bg-white p-4"
          >
            <h3 className="font-bold">
              {i + 1}. {sec.title}
            </h3>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {sec.fields.map((f) => (
                <li key={f.id}>
                  <span className="text-accent">[{f.type}]</span> {f.label}
                  {f.required && <span className="ml-1 text-err">*</span>}
                  {f.options && (
                    <span className="ml-2 text-muted">
                      ({f.options.join(" · ")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
