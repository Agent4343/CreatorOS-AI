"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipStatus, Script } from "@/lib/types";
import {
  REVIEW_DIMENSIONS,
  REVIEW_LABELS,
  type ReviewDimension,
  type ReviewResult,
  type ReviewScorecard,
} from "@/lib/agents";

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
  reviewing: "Running the 6 review agents…",
  awaiting_approval: "Waiting for your approval",
  voicing: "Recording the voice…",
  rendering: "Rendering the video (long-form takes 5–15 min)…",
  done: "Done",
  failed: "Failed",
};

type ClipShape = {
  id: string;
  status: ClipStatus;
  topic: string;
  script: Script | null;
  review_scorecard: ReviewScorecard | null;
  video_url: string | null;
  error: string | null;
};

export default function GenerateForm({
  characters,
}: {
  characters: CharacterSummary[];
}) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [clipId, setClipId] = useState<string | null>(null);
  const [clip, setClip] = useState<ClipShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<"approve" | "regen" | null>(null);
  const [regenFeedback, setRegenFeedback] = useState("");

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchClip(id), 5000);
  }

  async function fetchClip(id: string) {
    try {
      const res = await fetch(`/api/clips/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setClip(data.clip);
      if (data.clip.status === "done" || data.clip.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      /* transient */
    }
  }

  async function start() {
    if (!characterId || topic.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setClip(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId, topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setClipId(data.clip_id);
      await fetchClip(data.clip_id);
      // After Phase 1 returns, status is awaiting_approval — no need
      // to poll for the script/review steps. We start polling only
      // once the user clicks Approve and renders begin.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!clipId) return;
    setActing("approve");
    setError(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await fetchClip(clipId);
      startPolling(clipId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  async function regen() {
    if (!clipId) return;
    setActing("regen");
    setError(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/regen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: regenFeedback.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRegenFeedback("");
      await fetchClip(clipId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  const selected = characters.find((c) => c.id === characterId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate a video</h1>
        <p className="mt-2 text-muted">
          Topic in. Six agents review the script. You approve. Voice + video.
        </p>
      </div>

      {!clip && (
        <>
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
              disabled={loading}
            />
            {selected && (
              <p className="mt-1 text-xs text-muted">
                Will draft a ~{selected.target_duration_min}-min script for {selected.name}, then run 6 review agents (~30–60 sec).
              </p>
            )}
            <button
              onClick={start}
              disabled={loading || !characterId || topic.trim().length < 3}
              className="mt-3 rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
            >
              {loading ? "Drafting + reviewing…" : "Draft script"}
            </button>
          </section>
        </>
      )}

      {clip?.status && clip.status !== "awaiting_approval" && (
        <section className="rounded-md border border-ink/15 bg-white p-4">
          <div className="text-sm font-medium">{STATUS_LABEL[clip.status]}</div>
          {clip.status !== "done" && clip.status !== "failed" && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-1/2 animate-pulse bg-accent" />
            </div>
          )}
        </section>
      )}

      {clip?.status === "awaiting_approval" && clip.script && (
        <ReviewGate
          clip={clip}
          regenFeedback={regenFeedback}
          setRegenFeedback={setRegenFeedback}
          acting={acting}
          onApprove={approve}
          onRegen={regen}
        />
      )}

      {clip?.status === "done" && clip.video_url && (
        <section className="rounded-lg border border-ink/15 bg-white p-4">
          <video
            src={clip.video_url}
            controls
            className="mx-auto w-full max-w-3xl rounded-md"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              href={clip.video_url}
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
                setClip(null);
                setTopic("");
              }}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink"
            >
              Generate another
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Upload to YouTube / Facebook manually for now. Auto-post is Phase 2.
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

// ---- Review gate ----

function ReviewGate({
  clip,
  regenFeedback,
  setRegenFeedback,
  acting,
  onApprove,
  onRegen,
}: {
  clip: ClipShape;
  regenFeedback: string;
  setRegenFeedback: (s: string) => void;
  acting: "approve" | "regen" | null;
  onApprove: () => void;
  onRegen: () => void;
}) {
  const sc = clip.review_scorecard;
  const blocked = sc?.monetization_blocked ?? false;

  return (
    <div className="space-y-4">
      <section
        className={
          "rounded-lg border p-4 " +
          (blocked
            ? "border-accent bg-accent/5"
            : sc?.overall_pass
              ? "border-emerald-500 bg-emerald-50"
              : "border-amber-400 bg-amber-50")
        }
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">
            {blocked
              ? "⛔ Monetization-blocked — must regenerate"
              : sc?.overall_pass
                ? "✓ All 6 agents passed"
                : "⚠ Some agents flagged issues"}
          </h2>
          <span className="font-mono text-xs text-muted">
            6 agents reviewed
          </span>
        </div>
        {sc && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {REVIEW_DIMENSIONS.map((d) => (
              <ScoreTile key={d} dimension={d} result={sc[d]} />
            ))}
          </div>
        )}
      </section>

      {sc && (
        <details className="rounded-md border border-ink/15 bg-white p-3" open={!sc.overall_pass}>
          <summary className="cursor-pointer text-sm font-medium">
            Agent details
          </summary>
          <div className="mt-3 space-y-3">
            {REVIEW_DIMENSIONS.map((d) => (
              <AgentDetails key={d} dimension={d} result={sc[d]} />
            ))}
          </div>
        </details>
      )}

      <details className="rounded-md border border-ink/15 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Read the script ({clip.script?.estimated_seconds ? Math.round(clip.script.estimated_seconds / 60) : "?"} min · {clip.script?.segments.length ?? 0} segments)
        </summary>
        {clip.script && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="font-bold">{clip.script.title}</div>
            <div className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed">
              <em className="text-muted">[hook]</em>
              {"\n"}
              {clip.script.hook}
            </div>
            {clip.script.segments.map((seg, i) => (
              <div
                key={i}
                className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed"
              >
                <em className="text-muted">[segment {i + 1} — {seg.heading}]</em>
                {"\n"}
                {seg.body}
              </div>
            ))}
            <div className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed">
              <em className="text-muted">[outro]</em>
              {"\n"}
              {clip.script.outro}
            </div>
          </div>
        )}
      </details>

      <section className="rounded-md border border-ink/15 bg-white p-4">
        <h3 className="text-sm font-medium">What's next?</h3>
        <p className="mt-1 text-xs text-muted">
          Optional: tell the writer what to fix on the next attempt
          (e.g. "punchier hook", "drop the politics in segment 3", "tighter outro").
          Agent feedback from above is auto-included.
        </p>
        <input
          type="text"
          value={regenFeedback}
          onChange={(e) => setRegenFeedback(e.target.value)}
          placeholder="optional creator feedback"
          className="mt-2 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={blocked || acting !== null}
            className={
              "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 " +
              (blocked
                ? "bg-ink/30 text-bg"
                : "bg-ink text-bg hover:bg-emerald-600")
            }
            title={blocked ? "Cannot approve — monetization-blocked" : ""}
          >
            {acting === "approve"
              ? "Starting render…"
              : blocked
                ? "Approve disabled (monetization)"
                : "Approve & render"}
          </button>
          <button
            type="button"
            onClick={onRegen}
            disabled={acting !== null}
            className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            {acting === "regen" ? "Regenerating…" : "Regenerate script"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ScoreTile({
  dimension,
  result,
}: {
  dimension: ReviewDimension;
  result: ReviewResult;
}) {
  const tone =
    result.score >= 8
      ? "border-emerald-500 bg-white text-emerald-700"
      : result.score >= 7
        ? "border-amber-400 bg-white text-amber-700"
        : "border-accent bg-white text-accent";
  return (
    <div className={"rounded-md border p-2 text-center " + tone}>
      <div className="font-mono text-2xl">{result.score}</div>
      <div className="text-[10px] uppercase tracking-wider">
        {REVIEW_LABELS[dimension]}
      </div>
    </div>
  );
}

function AgentDetails({
  dimension,
  result,
}: {
  dimension: ReviewDimension;
  result: ReviewResult;
}) {
  if (result.pass && result.issues.length === 0) {
    return (
      <div className="text-xs">
        <span className="font-mono uppercase text-emerald-700">
          {REVIEW_LABELS[dimension]}: pass {result.score}/10
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-1 border-l-2 border-accent/40 pl-3">
      <div className="text-xs">
        <span className="font-mono uppercase text-accent">
          {REVIEW_LABELS[dimension]}: {result.score}/10
        </span>
      </div>
      <ul className="space-y-1 text-xs">
        {result.issues.map((iss, i) => (
          <li key={i} className="text-ink/80">
            <span
              className={
                "mr-1 font-mono uppercase text-[9px] " +
                (iss.severity === "critical"
                  ? "text-accent"
                  : iss.severity === "major"
                    ? "text-amber-700"
                    : "text-muted")
              }
            >
              {iss.severity}
            </span>
            {iss.text}
            {iss.segment_index !== null && iss.segment_index !== undefined && (
              <span className="ml-1 font-mono text-[10px] text-muted">
                · segment {iss.segment_index}
              </span>
            )}
          </li>
        ))}
      </ul>
      {result.suggestion && (
        <div className="text-[11px] text-ink/60 italic">
          → {result.suggestion}
        </div>
      )}
    </div>
  );
}
