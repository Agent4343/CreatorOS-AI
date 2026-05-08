"use client";

import { useState } from "react";
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
            <AssetCard key={i} asset={asset} />
          ))}
        </section>
      )}
    </div>
  );
}

function AssetCard({ asset }: { asset: ScoredAsset }) {
  const [open, setOpen] = useState(true);
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
        </div>
      </div>

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
