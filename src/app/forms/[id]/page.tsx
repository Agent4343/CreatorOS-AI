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
  const { org, role } = orgs[0];
  const isAdmin = role === "owner" || role === "admin";

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

  // How many times has this template been filled out? Reinforces the
  // "this is a reusable template, not a one-off" mental model and
  // gives admins a quick usage signal.
  const { count: submissionCount } = await sb
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", form.id)
    .eq("org_id", org.id);

  return (
    <div className="space-y-6">
      <div>
        <a href="/forms" className="font-mono text-xs">
          ← back to forms
        </a>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{form.name}</h1>
          {isAdmin && (
            <a
              href={`/forms/${form.id}/edit`}
              className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-ink no-underline"
            >
              Edit template
            </a>
          )}
        </div>
        {form.description && (
          <p className="mt-1 text-muted">{form.description}</p>
        )}
        <p className="mt-2 font-mono text-xs text-muted">
          Template · {form.schema.sections.length} sections · {totalFields}{" "}
          fields · v{form.current_version}
        </p>
      </div>

      {/* Make the template-vs-submission distinction obvious. People
          coming from paper-and-clipboard intuitively expect "Start"
          to overwrite the existing form; spell out that it doesn't. */}
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Fill out this form</h2>
          <span className="font-mono text-xs text-muted">
            Filled {submissionCount ?? 0}{" "}
            {(submissionCount ?? 0) === 1 ? "time" : "times"} so far
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Each time you tap <strong>Start</strong> you get a fresh blank copy.
          Anyone in {org.name} can fill one out independently — submissions
          don&apos;t overwrite each other.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StartSubmissionButton formId={form.id} orgId={org.id} />
          <a
            href={`/submissions?form_id=${form.id}`}
            className="text-sm text-ink no-underline underline-offset-2 hover:underline"
          >
            View past submissions →
          </a>
        </div>
      </div>

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
