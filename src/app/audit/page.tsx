"use client";

import { useState } from "react";
import type { AuditResult } from "@/lib/prompts/audit";

const DIMENSIONS = [
  ["ai_tell_density", "AI-tell density"],
  ["specificity", "Specificity"],
  ["hook_strength", "Hook strength"],
  ["format_fitness", "Format fitness"],
  ["original_voice_signal", "Original voice"],
] as const;

export default function AuditPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);

  const posts = text
    .split(/\n---\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Audit failed");
      setAudit(data.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Free voice audit
        </h1>
        <p className="mt-2 max-w-2xl text-ink/80">
          Paste 3–10 of your recent posts. We'll score them against five
          dimensions — AI-tell density, specificity, hook strength, format
          fitness, original voice signal — and send back the three
          highest-leverage edits with concrete before/after examples.
        </p>
        <p className="mt-2 text-xs text-ink/60">
          No signup. Same scorecard we use inside CreatorOS. Takes about a minute.
        </p>
      </div>

      {!audit && (
        <section className="space-y-3">
          <label className="block text-sm font-medium">
            Your posts ({posts.length} detected · 3–10)
          </label>
          <p className="text-xs text-ink/60">
            Separate each post with a line containing only{" "}
            <code className="font-mono">---</code>.
          </p>
          <textarea
            rows={20}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "First post here...\n\n---\n\nSecond post here...\n\n---\n\n..."
            }
            className="w-full rounded-md border border-ink/20 bg-white/60 p-3 font-mono text-sm"
          />

          <button
            onClick={run}
            disabled={loading || posts.length < 3 || posts.length > 10}
            className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream disabled:opacity-50"
          >
            {loading ? "Auditing (≈1 min)..." : "Audit my voice"}
          </button>
          {error && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
              {error}
            </div>
          )}
        </section>
      )}

      {audit && <AuditView audit={audit} onReset={() => setAudit(null)} />}
    </div>
  );
}

function AuditView({
  audit,
  onReset,
}: {
  audit: AuditResult;
  onReset: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">Your audit</h2>
        <button
          onClick={onReset}
          className="font-sans text-xs text-ink/60 underline"
        >
          start over
        </button>
      </div>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-5">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Overall scorecard
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {DIMENSIONS.map(([key, label]) => (
            <ScoreTile
              key={key}
              label={label}
              score={audit.overall[key as keyof typeof audit.overall]}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-5">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Summary
        </h3>
        <p className="mt-3 whitespace-pre-wrap text-ink/85">{audit.summary}</p>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-5">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          What you do well
        </h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-ink/85">
          {audit.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-accent/30 bg-accent/5 p-5">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-accent">
          The 3 highest-leverage edits
        </h3>
        <div className="mt-3 space-y-4">
          {audit.edits.map((edit, i) => (
            <div key={i} className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                #{i + 1} · {edit.dimension}
              </div>
              <div className="text-sm font-medium">{edit.issue}</div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-ink/15 bg-white/60 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    before
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {edit.before}
                  </p>
                </div>
                <div className="rounded-md border border-ink/15 bg-white/60 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                    after
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {edit.after}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-5">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Per-post breakdown
        </h3>
        <div className="mt-3 space-y-2">
          {audit.per_post.map((p) => {
            const avg =
              Object.values(p.scores).reduce((a, b) => a + b, 0) /
              Object.values(p.scores).length;
            return (
              <div
                key={p.index}
                className="rounded-md border border-ink/15 bg-white/60 p-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-ink/50">
                    Post #{p.index + 1}
                  </span>
                  <span className="font-mono text-xs">avg {avg.toFixed(1)}</span>
                </div>
                <div className="mt-1 text-sm text-ink/80">
                  Worst offender: <span className="italic">{p.worst_offender}</span>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {DIMENSIONS.map(([key]) => (
                    <Mini
                      key={key}
                      score={p.scores[key as keyof typeof p.scores]}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-ink p-5 text-cream">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-wider opacity-70">
          Want this scorecard on every asset you ship?
        </h3>
        <p className="mt-2 text-sm">
          CreatorOS AI runs this rubric against everything we generate from
          your source content — clips, threads, posts, newsletter sections —
          tuned to a Voice Profile we build from your archive.
        </p>
        <a
          href="/onboarding"
          className="mt-3 inline-block rounded-md bg-cream px-4 py-2 font-sans text-sm font-medium text-ink no-underline"
        >
          Build my voice profile →
        </a>
      </section>
    </div>
  );
}

function ScoreTile({ label, score }: { label: string; score: number }) {
  const low = score < 6;
  return (
    <div
      className={
        "rounded-md border p-3 text-center " +
        (low ? "border-accent/40 bg-accent/5" : "border-ink/15 bg-white/60")
      }
    >
      <div className={"font-mono text-2xl " + (low ? "text-accent" : "text-ink")}>
        {score}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink/50">
        {label}
      </div>
    </div>
  );
}

function Mini({ score }: { score: number }) {
  const low = score < 6;
  return (
    <div
      className={
        "rounded text-center font-mono text-xs " +
        (low ? "bg-accent/15 text-accent" : "bg-ink/5 text-ink/70")
      }
    >
      {score}
    </div>
  );
}
