"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURATED_VOICES } from "@/lib/providers/elevenlabs";
import { ASPECT_RATIOS, AspectRatio, DELIVERIES, Delivery } from "@/lib/types";

export default function NewCharacterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState(CURATED_VOICES[0]?.voice_id ?? "");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [durationMin, setDurationMin] = useState(8);
  const [delivery, setDelivery] = useState<Delivery>("deadpan");
  const [oneLiner, setOneLiner] = useState("");
  const [perspective, setPerspective] = useState("");
  const [vocabHits, setVocabHits] = useState("");
  const [avoided, setAvoided] = useState("");
  const [audience, setAudience] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // HeyGen integration: we store the Photo Avatar ID with this
          // scheme so the orchestrator can route it to the right provider.
          reference_image_url: `heygen://${avatarId.trim()}`,
          voice_id: voiceId,
          aspect_ratio: aspect,
          target_duration_sec: durationMin * 60,
          persona: {
            one_liner: oneLiner,
            perspective,
            delivery,
            vocabulary_hits: csv(vocabHits),
            avoided_phrases: csv(avoided),
            running_jokes: [],
            audience,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push("/character");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New character</h1>
        <p className="mt-2 text-sm text-muted">
          Set this up once. Every video you make uses this character.
        </p>
      </div>

      <Field label="Name" value={name} onChange={setName} placeholder="Tom" />

      <div>
        <label className="block text-sm font-medium">HeyGen Photo Avatar ID</label>
        <p className="text-xs text-muted">
          Create a Photo Avatar in your HeyGen dashboard from a reference
          image, then paste its avatar_id here.
        </p>
        <input
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 font-mono text-sm"
          value={avatarId}
          onChange={(e) => setAvatarId(e.target.value)}
          placeholder="ace2c4f1..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Voice</label>
        <select
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
        >
          {CURATED_VOICES.map((v) => (
            <option key={v.voice_id} value={v.voice_id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Aspect ratio</label>
          <div className="mt-2 flex gap-2">
            {ASPECT_RATIOS.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => setAspect(a)}
                className={
                  "rounded-md px-3 py-1.5 text-xs " +
                  (aspect === a ? "bg-ink text-bg" : "border border-ink/20 text-ink")
                }
              >
                {a}
                <span className="ml-1 text-[10px] opacity-60">
                  {a === "16:9" ? "YouTube" : a === "9:16" ? "Shorts/Reels" : "square"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">
            Target length:{" "}
            <span className="font-mono">{durationMin} min</span>
            <span className="ml-2 text-xs font-normal text-muted">
              {monetizationLabel(durationMin)}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="mt-2 w-full"
          />
          {/* Monetization zones: visual bar matched to slider range. */}
          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full">
            {/* 1-2 min: unmonetizable on YouTube long-form + Facebook in-stream */}
            <div className="bg-accent/40" style={{ width: `${(2 / 19) * 100}%` }} title="Not monetizable" />
            {/* 3-7 min: Facebook in-stream OK + YouTube single pre-roll */}
            <div className="bg-amber-300" style={{ width: `${(5 / 19) * 100}%` }} title="Facebook OK; YouTube single pre-roll only" />
            {/* 8-20 min: YouTube mid-roll unlocked */}
            <div className="bg-emerald-500" style={{ width: `${(12 / 19) * 100}%` }} title="YouTube mid-roll ads unlocked" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            <span>1 min</span>
            <span className="text-amber-700">3</span>
            <span className="font-bold text-emerald-700">8</span>
            <span>20 min</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            <span className="text-accent">Red:</span> no ads.{" "}
            <span className="text-amber-700">Amber:</span> Facebook in-stream + YouTube single pre-roll.{" "}
            <span className="text-emerald-700">Green:</span> YouTube mid-roll unlocked. 10–12 min is the sweet spot.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Delivery style</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {DELIVERIES.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDelivery(d)}
              className={
                "rounded-md px-3 py-1.5 text-xs " +
                (delivery === d ? "bg-ink text-bg" : "border border-ink/20 text-ink")
              }
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="One-line persona"
        value={oneLiner}
        onChange={setOneLiner}
        placeholder="Snarky tech analyst who's seen it all"
      />

      <div>
        <label className="block text-sm font-medium">
          Persona (a paragraph — what they care about, what they sound like)
        </label>
        <textarea
          rows={5}
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          value={perspective}
          onChange={(e) => setPerspective(e.target.value)}
          placeholder="Has worked at three failed unicorns. Suspicious of any sentence containing 'AI-native'. Reads every TechCrunch piece for the drama, never the news."
        />
      </div>

      <Field
        label="Vocabulary hits (comma-separated)"
        value={vocabHits}
        onChange={setVocabHits}
        placeholder="actually, look, hot take, the thing about"
      />

      <Field
        label="Avoided phrases (comma-separated)"
        value={avoided}
        onChange={setAvoided}
        placeholder="folks, amazing, in today's, leverage"
      />

      <Field
        label="Audience"
        value={audience}
        onChange={setAudience}
        placeholder="Tech-adjacent millennials"
      />

      {error && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          {error}
        </div>
      )}

      <button
        disabled={loading || !avatarId.trim()}
        onClick={submit}
        className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save character"}
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
        className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function csv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function monetizationLabel(minutes: number): string {
  if (minutes < 3) return "· no ads on either platform";
  if (minutes < 8) return "· Facebook in-stream OK; YouTube pre-roll only";
  if (minutes <= 12) return "· YouTube mid-roll sweet spot";
  return "· YouTube mid-roll OK; watch for retention drop";
}
