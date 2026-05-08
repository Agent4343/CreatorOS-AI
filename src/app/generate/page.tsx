"use client";

import { useRef, useState } from "react";
import {
  QA_DIMENSIONS,
  QA_DIMENSION_LABELS,
  ScoredAsset,
} from "@/lib/types";

export default function GeneratePage() {
  const [source, setSource] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [assets, setAssets] = useState<ScoredAsset[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribePrompt, setTranscribePrompt] = useState("");

  async function transcribe() {
    setTranscribeError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setTranscribeError("Pick an audio or video file first.");
      return;
    }
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (transcribePrompt.trim()) fd.append("prompt", transcribePrompt.trim());
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");
      setSource((prev) => (prev ? prev + "\n\n" + data.transcript : data.transcript));
    } catch (e) {
      setTranscribeError(e instanceof Error ? e.message : "Failed");
    } finally {
      setTranscribing(false);
    }
  }

  async function generate() {
    setError(null);
    if (source.trim().length < 100) {
      setError("Source needs at least 100 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, topic }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      const data = await res.json();
      setAssets(data.assets);
      setGenerationId(data.generation_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Generate</h1>
        <p className="mt-2 text-ink/70">
          Paste one source piece — transcript, essay, or topic. Get back
          ~20 assets in 60–90 seconds, scored against your Voice Profile.
        </p>
      </div>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
            Transcribe audio or video
          </h2>
          <span className="font-mono text-[10px] text-ink/50">
            Whisper · ≤25 MB · mp3 / m4a / wav / mp4 / webm
          </span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          className="block w-full font-sans text-xs text-ink/80 file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-cream"
        />
        <input
          type="text"
          value={transcribePrompt}
          onChange={(e) => setTranscribePrompt(e.target.value)}
          placeholder="Optional: names / jargon / acronyms to help Whisper (e.g. 'Stripe, ARR, Patrick Collison')"
          className="w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-xs"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={transcribe}
            disabled={transcribing}
            className="rounded-md border border-ink/30 px-4 py-2 font-sans text-xs font-medium text-ink disabled:opacity-50"
          >
            {transcribing ? "Transcribing..." : "Transcribe → fill source"}
          </button>
          {transcribeError && (
            <span className="text-xs text-accent">{transcribeError}</span>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <label className="block text-sm font-medium">Source content</label>
        <textarea
          className="w-full rounded-md border border-ink/20 bg-white/60 p-3 font-sans text-sm"
          rows={14}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a transcript, essay, or talk here..."
        />

        <label className="block text-sm font-medium">Optional angle</label>
        <input
          className="w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-sm"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. focus on the pricing argument"
        />

        <button
          disabled={loading}
          onClick={generate}
          className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream disabled:opacity-50"
        >
          {loading ? "Generating bundle..." : "Generate bundle"}
        </button>

        {error && (
          <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            {error}
          </div>
        )}
      </section>

      {assets.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
              Bundle · {assets.length} assets
            </h2>
            {generationId && (
              <div className="flex gap-3 text-sm">
                <a href={`/api/export?id=${generationId}&format=csv`}>Export CSV</a>
                <a href={`/api/export?id=${generationId}&format=json`}>Export JSON</a>
              </div>
            )}
          </div>

          {assets.map((asset, i) => (
            <AssetCard
              key={i}
              asset={asset}
              source={source}
              onReplace={(next) => {
                setAssets((cur) => {
                  const copy = [...cur];
                  copy[i] = next;
                  return copy;
                });
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  source,
  onReplace,
}: {
  asset: ScoredAsset;
  source: string;
  onReplace: (next: ScoredAsset) => void;
}) {
  const [open, setOpen] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function regenerate() {
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          kind: asset.kind,
          platform: asset.platform,
          previous: { kind: asset.kind, platform: asset.platform, title: asset.title, body: asset.body },
          qa: asset.qa,
          feedback: feedback.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Regenerate failed");
      onReplace(data.asset);
      setFeedback("");
      setShowFeedback(false);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div
      className={
        "rounded-lg border bg-white/40 p-5 " +
        (asset.qa.overall_pass ? "border-ink/15" : "border-accent/40")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-ink/50">
            {asset.platform} · {asset.kind}
          </div>
          <h3 className="mt-1 text-lg font-semibold">{asset.title}</h3>
        </div>
        <div className="flex items-center gap-3">
          <PassBadge pass={asset.qa.overall_pass} />
          <button
            className="font-sans text-xs text-ink/60"
            onClick={() => setOpen((x) => !x)}
          >
            {open ? "hide" : "show"}
          </button>
          <button
            className="font-sans text-xs text-ink/60"
            onClick={() => navigator.clipboard.writeText(asset.body)}
          >
            copy
          </button>
          <button
            className="font-sans text-xs text-accent disabled:opacity-50"
            onClick={() => setShowFeedback((s) => !s)}
            disabled={regenerating}
          >
            regenerate
          </button>
        </div>
      </div>

      {showFeedback && (
        <div className="mt-3 space-y-2 rounded-md border border-accent/30 bg-accent/5 p-3">
          <label className="block text-xs font-sans uppercase tracking-wider text-ink/60">
            What should change? (optional)
          </label>
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder='e.g. "punchier hook" or "drop the third tweet"'
            className="w-full rounded-md border border-ink/20 bg-white/60 p-2 font-sans text-xs"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={regenerate}
              disabled={regenerating}
              className="rounded-md bg-ink px-3 py-1.5 font-sans text-xs text-cream disabled:opacity-50"
            >
              {regenerating ? "Regenerating..." : "Regenerate this asset"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowFeedback(false);
                setFeedback("");
              }}
              className="font-sans text-xs text-ink/60"
            >
              cancel
            </button>
            {regenError && (
              <span className="text-xs text-accent">{regenError}</span>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <pre className="whitespace-pre-wrap font-serif text-sm text-ink/85">
            {asset.body}
          </pre>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {QA_DIMENSIONS.map((dim) => (
              <Score key={dim} label={QA_DIMENSION_LABELS[dim]} score={asset.qa.scores[dim]} />
            ))}
          </div>
          {asset.qa.flags.length > 0 && (
            <div className="space-y-1 border-t border-ink/10 pt-3">
              {asset.qa.flags.map((f, i) => (
                <div key={i} className="text-xs">
                  <span className="font-mono uppercase text-accent">
                    {f.dimension}:
                  </span>{" "}
                  <span className="text-ink/80">{f.issue}</span>{" "}
                  <span className="text-ink/60">— {f.suggestion}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PassBadge({ pass }: { pass: boolean }) {
  return (
    <span
      className={
        "rounded-md px-2 py-0.5 font-mono text-xs " +
        (pass ? "bg-ink/10 text-ink/70" : "bg-accent/15 text-accent")
      }
    >
      {pass ? "pass" : "review"}
    </span>
  );
}

function Score({ label, score }: { label: string; score: number }) {
  const low = score < 7;
  return (
    <div
      className={
        "rounded-md border p-2 text-center " +
        (low ? "border-accent/40 bg-accent/5" : "border-ink/15 bg-white/40")
      }
    >
      <div
        className={
          "font-mono text-lg " + (low ? "text-accent" : "text-ink/85")
        }
      >
        {score}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-ink/50">
        {label}
      </div>
    </div>
  );
}
