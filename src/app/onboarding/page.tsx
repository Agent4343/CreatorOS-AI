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

      <ImportPanel
        onImport={(pieces) => {
          const blocks = pieces
            .map((p) => (p.title ? `# ${p.title}\n\n${p.body}` : p.body))
            .join("\n\n---\n\n");
          setCorpus((prev) => (prev.trim() ? prev + "\n\n---\n\n" + blocks : blocks));
        }}
      />

      <section className="space-y-3">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
          Source corpus ({corpusPieces.length} pieces)
        </h2>
        <p className="text-sm text-ink/70">
          Paste 30+ pieces of your published work, or import them above.
          Separate each piece with a line containing only{" "}
          <code className="font-mono">---</code>. Long-form essays, transcripts,
          threads — all welcome.
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

type ScrapedPiece = { title: string; body: string; url?: string };

function ImportPanel({
  onImport,
}: {
  onImport: (pieces: ScrapedPiece[]) => void;
}) {
  const [mode, setMode] = useState<"feed" | "urls">("feed");
  const [feedUrl, setFeedUrl] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const body =
        mode === "feed"
          ? { mode: "feed", url: feedUrl.trim() }
          : {
              mode: "urls",
              urls: urlsText
                .split(/\n+/)
                .map((s) => s.trim())
                .filter(Boolean),
            };
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scrape failed");
      if (data.pieces.length === 0) {
        setError(
          `Fetched ${data.total_fetched}, but every piece was under 200 chars. Try a different feed.`,
        );
      } else {
        onImport(data.pieces as ScrapedPiece[]);
        setInfo(
          `Imported ${data.kept}/${data.total_fetched} pieces${data.dropped_short ? ` (${data.dropped_short} too short)` : ""}.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-ink/15 bg-white/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
          Import from URL
        </h2>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode("feed")}
            className={
              "rounded-md px-2 py-1 " +
              (mode === "feed" ? "bg-ink text-cream" : "border border-ink/20")
            }
          >
            RSS / Atom feed
          </button>
          <button
            type="button"
            onClick={() => setMode("urls")}
            className={
              "rounded-md px-2 py-1 " +
              (mode === "urls" ? "bg-ink text-cream" : "border border-ink/20")
            }
          >
            URL list
          </button>
        </div>
      </div>

      {mode === "feed" ? (
        <>
          <p className="text-xs text-ink/70">
            Paste a Substack, blog, or podcast RSS feed URL. We'll fetch every
            item.
          </p>
          <input
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://yoursubstack.substack.com/feed"
            className="w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-sm"
          />
        </>
      ) : (
        <>
          <p className="text-xs text-ink/70">
            One URL per line. We'll fetch each page and extract the main text.
          </p>
          <textarea
            rows={6}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder="https://example.com/post-1&#10;https://example.com/post-2"
            className="w-full rounded-md border border-ink/20 bg-white/60 p-2 font-mono text-xs"
          />
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={loading || (mode === "feed" ? !feedUrl.trim() : !urlsText.trim())}
          className="rounded-md border border-ink/30 px-4 py-2 font-sans text-xs font-medium text-ink disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import → append to corpus"}
        </button>
        {info && <span className="text-xs text-ink/70">{info}</span>}
        {error && <span className="text-xs text-accent">{error}</span>}
      </div>
    </section>
  );
}
