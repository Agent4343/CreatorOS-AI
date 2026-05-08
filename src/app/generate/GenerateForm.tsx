"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipStatus } from "@/lib/types";

type CharacterSummary = {
  id: string;
  name: string;
  one_liner: string;
  aspect_ratio: string;
  target_duration_min: number;
};

const STATUS_LABEL: Record<ClipStatus, string> = {
  queued: "Queued…",
  scripting: "Writing the script…",
  voicing: "Recording the voice…",
  rendering: "Rendering the video (long-form takes 5-15 min)…",
  done: "Done",
  failed: "Failed",
};

export default function GenerateForm({
  characters,
}: {
  characters: CharacterSummary[];
}) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [clipId, setClipId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClipStatus | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const selected = characters.find((c) => c.id === characterId);

  async function start() {
    if (!characterId || topic.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    setStatus(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId, topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setClipId(data.clip_id);
      setStatus("rendering");
      startPolling(data.clip_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/clips/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const clip = data.clip;
        setStatus(clip.status as ClipStatus);
        if (clip.status === "done") {
          setVideoUrl(clip.video_url);
          if (pollRef.current) clearInterval(pollRef.current);
        }
        if (clip.status === "failed") {
          setError(clip.error ?? "Render failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient — keep polling
      }
    }, 15000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate a video</h1>
        <p className="mt-2 text-muted">
          One topic in. One long-form comedy video out. Total wall-clock 5–15 min.
        </p>
      </div>

      <section>
        <label className="block text-sm font-medium">Character</label>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {characters.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCharacterId(c.id)}
              className={
                "rounded-md border p-3 text-left " +
                (characterId === c.id
                  ? "border-accent bg-white"
                  : "border-ink/15 bg-white hover:border-ink/30")
              }
            >
              <div className="text-sm font-bold">{c.name}</div>
              <div className="text-xs text-muted">{c.one_liner}</div>
              <div className="mt-1 font-mono text-[10px] text-muted">
                {c.aspect_ratio} · {c.target_duration_min} min target
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <label className="block text-sm font-medium">Topic</label>
        <input
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-3 text-sm"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. 'why every founder pretends to like their investors'"
          disabled={loading || (status !== null && status !== "failed" && status !== "done")}
        />
        {selected && (
          <p className="mt-1 text-xs text-muted">
            Will produce a ~{selected.target_duration_min}-minute video starring {selected.name}.
          </p>
        )}
        <button
          onClick={start}
          disabled={
            loading ||
            !characterId ||
            topic.trim().length < 3 ||
            (status !== null && status !== "done" && status !== "failed")
          }
          className="mt-3 rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
        >
          {loading ? "Starting…" : "Generate video"}
        </button>
      </section>

      {status && (
        <section className="rounded-md border border-ink/15 bg-white p-4">
          <div className="text-sm font-medium">{STATUS_LABEL[status]}</div>
          {status !== "done" && status !== "failed" && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-1/2 animate-pulse bg-accent" />
            </div>
          )}
        </section>
      )}

      {videoUrl && (
        <section className="rounded-lg border border-ink/15 bg-white p-4">
          <video
            src={videoUrl}
            controls
            className="mx-auto w-full max-w-3xl rounded-md"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={videoUrl}
              download
              className="rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
            >
              Download MP4
            </a>
            <a
              href="/library"
              className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink no-underline"
            >
              View library
            </a>
            <button
              onClick={() => {
                setClipId(null);
                setStatus(null);
                setVideoUrl(null);
                setTopic("");
              }}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink"
            >
              Generate another
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Upload to YouTube / Facebook / TikTok manually for now. Auto-post is Phase 2.
          </p>
        </section>
      )}

      {error && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          {error}
        </div>
      )}
    </div>
  );
}
