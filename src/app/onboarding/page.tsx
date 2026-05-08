"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Four questions Claude can't extract from corpus alone. Everything else
// (signature phrases, sentence patterns, hook style, format prefs, tone,
// reading level) is inferred. All four are optional — the profile builds
// from corpus alone if you skip them.
const INTAKE_QUESTIONS: { key: string; label: string; placeholder: string }[] = [
  {
    key: "audience_who",
    label: "Who do you write for?",
    placeholder: "e.g. indie SaaS founders pre-PMF, ARR < $200k",
  },
  {
    key: "audience_pains",
    label: "What's keeping them up at night?",
    placeholder: "Two or three specific pains, comma-separated",
  },
  {
    key: "avoided_phrases",
    label: "Phrases you'd never say",
    placeholder:
      "AI tells, corporate-speak, anything that makes you cringe. Comma-separated.",
  },
  {
    key: "cta",
    label: "Your standard close / CTA",
    placeholder: "Paste one recent example, exactly as you wrote it",
  },
];

const REQUIRED_PIECES = 30;

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [niche, setNiche] = useState("");
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [corpus, setCorpus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const corpusPieces = corpus
    .split(/\n---\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const ready = corpusPieces.length >= REQUIRED_PIECES;
  const remaining = Math.max(0, REQUIRED_PIECES - corpusPieces.length);

  async function submit() {
    setError(null);
    if (!ready) {
      setError(
        `Need ${REQUIRED_PIECES}+ pieces. You have ${corpusPieces.length}.`,
      );
      return;
    }
    setLoading(true);
    try {
      const filledIntake = Object.fromEntries(
        INTAKE_QUESTIONS.map((q) => [q.label, (intake[q.key] ?? "").trim()]).filter(
          ([, v]) => v.length > 0,
        ),
      );

      const res = await fetch("/api/voice/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake: filledIntake,
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
        <h1 className="text-3xl font-semibold tracking-tight">Build your voice profile</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          One thing only: get us 30+ pieces of your writing. Paste an RSS feed,
          paste a list of URLs, or drop in essays directly. Everything else is
          optional.
        </p>
      </div>

      <ImportPanel
        onImport={(pieces) => {
          const blocks = pieces
            .map((p) => (p.title ? `# ${p.title}\n\n${p.body}` : p.body))
            .join("\n\n---\n\n");
          setCorpus((prev) => (prev.trim() ? prev + "\n\n---\n\n" + blocks : blocks));
        }}
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
            Your archive
          </h2>
          <span
            className={
              "font-mono text-xs " +
              (ready ? "text-ink/70" : "text-accent")
            }
          >
            {corpusPieces.length}/{REQUIRED_PIECES} pieces{ready ? " · ready" : ` · need ${remaining} more`}
          </span>
        </div>
        <Progress count={corpusPieces.length} target={REQUIRED_PIECES} />
        <p className="text-xs text-ink/60">
          Imported pieces appear here. Paste more directly if needed —
          separated by lines containing only{" "}
          <code className="font-mono">---</code>.
        </p>
        <textarea
          className="w-full rounded-md border border-ink/20 bg-white/60 p-3 font-mono text-xs"
          rows={14}
          value={corpus}
          onChange={(e) => setCorpus(e.target.value)}
          placeholder={"Paste essays / posts / transcripts...\n\n---\n\n..."}
        />
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-4">
        <button
          type="button"
          onClick={() => setIntakeOpen((o) => !o)}
          className="flex w-full items-baseline justify-between text-left"
        >
          <span>
            <span className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
              Optional · about you
            </span>
            <span className="ml-2 text-xs text-ink/50">
              4 questions · ~2 min · skip and we'll infer from your archive
            </span>
          </span>
          <span className="font-sans text-xs text-ink/60">
            {intakeOpen ? "hide" : "open"}
          </span>
        </button>

        {intakeOpen && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Display name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="What should we call you?"
              />
              <Field
                label="Niche"
                value={niche}
                onChange={setNiche}
                placeholder="e.g. B2B SaaS / fitness / writing"
              />
            </div>
            {INTAKE_QUESTIONS.map((q) => (
              <div key={q.key}>
                <label className="block text-sm font-medium">{q.label}</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-sm"
                  value={intake[q.key] ?? ""}
                  onChange={(e) =>
                    setIntake((cur) => ({ ...cur, [q.key]: e.target.value }))
                  }
                  placeholder={q.placeholder}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          disabled={loading || !ready}
          onClick={submit}
          className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream disabled:opacity-50"
        >
          {loading
            ? "Building voice profile (≈3 min)..."
            : ready
              ? "Build voice profile"
              : `Add ${remaining} more piece${remaining === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-ink/60">
          One Claude call. Costs us a few cents. Yields the structured profile
          you can review and edit on the next screen.
        </span>
      </div>
    </div>
  );
}

function Progress({ count, target }: { count: number; target: number }) {
  const pct = Math.min(100, (count / target) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
      <div
        className={
          "h-full transition-all " +
          (count >= target ? "bg-ink" : "bg-accent")
        }
        style={{ width: `${pct}%` }}
      />
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
