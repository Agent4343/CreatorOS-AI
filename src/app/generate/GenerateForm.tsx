"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipStatus, Script, UploadPack } from "@/lib/types";
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
  upload_pack: UploadPack | null;
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
  const [acting, setActing] = useState<"approve" | "regen" | "save" | null>(
    null,
  );
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

  async function saveEdited(editedScript: Script) {
    if (!clipId) return;
    setActing("save");
    setError(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: editedScript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await fetchClip(clipId);
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
          onSaveEdited={saveEdited}
        />
      )}

      {clip?.status === "done" && clip.video_url && (
        <>
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
          </section>
          {clip.upload_pack && <UploadPackPanel pack={clip.upload_pack} />}
        </>
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
  onSaveEdited,
}: {
  clip: ClipShape;
  regenFeedback: string;
  setRegenFeedback: (s: string) => void;
  acting: "approve" | "regen" | "save" | null;
  onApprove: () => void;
  onRegen: () => void;
  onSaveEdited: (script: Script) => void;
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

      {clip.script && (
        <ScriptViewerEditor
          script={clip.script}
          acting={acting}
          onSaveEdited={onSaveEdited}
        />
      )}

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

// ---- Script viewer / editor ----

function ScriptViewerEditor({
  script,
  acting,
  onSaveEdited,
}: {
  script: Script;
  acting: "approve" | "regen" | "save" | null;
  onSaveEdited: (script: Script) => void;
}) {
  // Local edit state. Reset whenever the underlying script changes
  // (e.g. after a regen or a successful save fetches a new clip).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Script>(script);
  // Reset draft when the parent script changes (regen, save).
  useEffect(() => {
    setDraft(script);
    setEditing(false);
  }, [script]);

  function update<K extends keyof Script>(key: K, value: Script[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function updateSegment(idx: number, key: "heading" | "body", value: string) {
    setDraft((d) => ({
      ...d,
      segments: d.segments.map((s, i) =>
        i === idx ? { ...s, [key]: value } : s,
      ),
    }));
  }

  const minutes = (estimateMinutes(draft) / 1).toFixed(1);
  const dirty = JSON.stringify(draft) !== JSON.stringify(script);

  if (!editing) {
    return (
      <details
        className="rounded-md border border-ink/15 bg-white p-3"
        open={false}
      >
        <summary className="flex cursor-pointer items-baseline justify-between text-sm">
          <span className="font-medium">
            Read the script ({Math.round(script.estimated_seconds / 60)} min · {script.segments.length} segments)
          </span>
          <span
            onClick={(e) => {
              e.preventDefault();
              setEditing(true);
            }}
            className="text-xs text-accent underline"
            role="button"
          >
            edit
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="font-bold">{script.title}</div>
          <div className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed">
            <em className="text-muted">[hook]</em>
            {"\n"}
            {script.hook}
          </div>
          {script.segments.map((seg, i) => (
            <div
              key={i}
              className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed"
            >
              <em className="text-muted">
                [segment {i + 1} — {seg.heading}]
              </em>
              {"\n"}
              {seg.body}
            </div>
          ))}
          <div className="whitespace-pre-wrap rounded-md bg-bg p-3 leading-relaxed">
            <em className="text-muted">[outro]</em>
            {"\n"}
            {script.outro}
          </div>
        </div>
      </details>
    );
  }

  return (
    <section className="rounded-md border border-accent/40 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium">Editing script</h3>
          <p className="text-xs text-muted">
            Estimated runtime updates as you type (~150 wpm). Saving re-runs
            the 6 review agents only — no script regeneration. ~$0.60 / ~10s.
          </p>
        </div>
        <span className="font-mono text-xs text-muted">
          ~{minutes} min · {countDraftWords(draft)} words
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <EditField
          label="Title (writer's working title)"
          value={draft.title}
          onChange={(v) => update("title", v)}
        />
        <EditField
          label="Hook (first ~30 sec — earns the rest)"
          value={draft.hook}
          onChange={(v) => update("hook", v)}
          rows={3}
        />
        {draft.segments.map((seg, i) => (
          <div
            key={i}
            className="rounded-md border border-ink/10 bg-bg p-2"
          >
            <EditField
              label={`Segment ${i + 1} heading`}
              value={seg.heading}
              onChange={(v) => updateSegment(i, "heading", v)}
            />
            <EditField
              label={`Segment ${i + 1} body`}
              value={seg.body}
              onChange={(v) => updateSegment(i, "body", v)}
              rows={5}
            />
          </div>
        ))}
        <EditField
          label="Outro (land the plane)"
          value={draft.outro}
          onChange={(v) => update("outro", v)}
          rows={3}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onSaveEdited(draft)}
          disabled={acting !== null || !dirty}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {acting === "save"
            ? "Saving + re-reviewing…"
            : dirty
              ? "Save & re-review"
              : "No changes"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(script);
            setEditing(false);
          }}
          disabled={acting !== null}
          className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function EditField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  if (rows && rows > 1) {
    return (
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </label>
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-ink/20 bg-white p-2 text-sm leading-relaxed"
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
      />
    </div>
  );
}

function countDraftWords(s: Script): number {
  return [s.hook, ...s.segments.map((seg) => seg.body), s.outro]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateMinutes(s: Script): number {
  return countDraftWords(s) / 150;
}

// ---- Upload pack ----

function UploadPackPanel({ pack }: { pack: UploadPack }) {
  const tagsString = pack.youtube_tags.join(", ");
  // Build the YouTube description with chapter list appended in the
  // exact format YouTube uses to auto-create chapters.
  const chapterList = pack.youtube_chapters
    .map((c) => `${formatTimestamp(c.timestamp_sec)} ${c.label}`)
    .join("\n");
  const fullDescription = `${pack.youtube_description}\n\n${chapterList}`;

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-4">
      <h2 className="text-lg font-bold">Upload pack</h2>
      <p className="mt-1 text-xs text-muted">
        Copy these into the YouTube and Facebook upload forms. Chapter list
        is already in YouTube's exact format and will auto-create chapter
        markers in the player.
      </p>

      <div className="mt-4 space-y-4">
        <CopyField label="YouTube title" value={pack.youtube_title} />

        <CopyField
          label={`YouTube description (paste into the description field — chapters auto-format)`}
          value={fullDescription}
          multiline
          rows={8}
        />

        <CopyField label="YouTube tags (comma-separated)" value={tagsString} />

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Chapter timestamps
          </div>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {pack.youtube_chapters.map((c, i) => (
              <li key={i}>
                <span className="inline-block w-12 text-accent">
                  {formatTimestamp(c.timestamp_sec)}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Thumbnail concepts
          </div>
          <ul className="mt-2 space-y-2">
            {pack.thumbnail_concepts.map((t, i) => (
              <li
                key={i}
                className="rounded-md border border-ink/15 bg-bg p-3 text-sm"
              >
                <div className="font-medium">Concept {i + 1}</div>
                <div className="mt-1 text-ink/80">{t.visual}</div>
                <div className="mt-1 font-mono text-xs text-muted">
                  Text overlay: <span className="text-ink">"{t.text_overlay}"</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <CopyField
          label="Facebook caption (≤280 chars — Facebook truncates)"
          value={pack.facebook_caption}
          multiline
          rows={3}
        />
      </div>
    </section>
  );
}

function CopyField({
  label,
  value,
  multiline,
  rows,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </label>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs text-accent underline"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={rows ?? 4}
          className="mt-1 w-full rounded-md border border-ink/20 bg-bg p-2 font-mono text-xs"
        />
      ) : (
        <input
          readOnly
          value={value}
          className="mt-1 w-full rounded-md border border-ink/20 bg-bg p-2 font-mono text-xs"
        />
      )}
    </div>
  );
}

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
