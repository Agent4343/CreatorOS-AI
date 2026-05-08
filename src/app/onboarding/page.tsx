"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INTAKE_QUESTIONS = [
  "Who specifically is your audience? Be concrete (e.g. 'indie SaaS founders pre-PMF, ARR < $200k').",
  "What three pains does your audience feel most acutely?",
  "What objections do they have to your worldview?",
  "Name 5 phrases you say a lot.",
  "Name 5 phrases you'd never say.",
  "Which writers do you sound least like?",
  "What's your typical hook style? Give one recent example.",
  "How long is a typical thread for you? LinkedIn post? Newsletter section?",
  "Do you use emojis? Em-dashes? Horizontal rules?",
  "Where on each axis: formal↔casual, earnest↔ironic, prescriptive↔reflective, warm↔clinical?",
  "What's your standard close / CTA?",
  "What topics do you refuse to write about?",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [niche, setNiche] = useState("");
  const [answers, setAnswers] = useState<string[]>(
    INTAKE_QUESTIONS.map(() => ""),
  );
  const [corpus, setCorpus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corpusPieces = corpus
    .split(/\n---\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  async function submit() {
    setError(null);
    if (corpusPieces.length < 30) {
      setError(
        `Need 30+ pieces separated by lines containing only "---". You have ${corpusPieces.length}.`,
      );
      return;
    }
    setLoading(true);
    try {
      const intake: Record<string, string> = {};
      INTAKE_QUESTIONS.forEach((q, i) => (intake[q] = answers[i]));

      const res = await fetch("/api/voice/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake,
          corpus: corpusPieces,
          displayName,
          niche,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      router.push("/voice");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
        <p className="mt-2 text-ink/70">
          Twelve questions, then 30+ pieces of source content. Takes ten minutes.
          Building the profile takes another three.
        </p>
      </div>

      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="e.g. Patrick Collison"
          />
          <Field
            label="Niche"
            value={niche}
            onChange={setNiche}
            placeholder="e.g. operator-creator / B2B SaaS"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
          Voice intake
        </h2>
        {INTAKE_QUESTIONS.map((q, i) => (
          <div key={i}>
            <label className="block text-sm font-medium">{q}</label>
            <textarea
              className="mt-1 w-full rounded-md border border-ink/20 bg-white/60 p-3 font-sans text-sm"
              rows={2}
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value;
                setAnswers(next);
              }}
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
          Source corpus ({corpusPieces.length} pieces)
        </h2>
        <p className="text-sm text-ink/70">
          Paste 30+ pieces of your published work. Separate each piece with a
          line containing only <code className="font-mono">---</code>. Long-form
          essays, transcripts, threads — all welcome.
        </p>
        <textarea
          className="w-full rounded-md border border-ink/20 bg-white/60 p-3 font-mono text-sm"
          rows={20}
          value={corpus}
          onChange={(e) => setCorpus(e.target.value)}
          placeholder="First essay text here...&#10;&#10;---&#10;&#10;Second essay text here...&#10;&#10;---&#10;&#10;..."
        />
      </section>

      {error && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          {error}
        </div>
      )}

      <button
        disabled={loading}
        onClick={submit}
        className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream disabled:opacity-50"
      >
        {loading ? "Building Voice Profile (≈3 min)..." : "Build Voice Profile"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input
        className="mt-1 w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
