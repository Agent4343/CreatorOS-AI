"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CURATED_VOICES } from "@/lib/providers/elevenlabs";
import { DELIVERIES, Delivery } from "@/lib/types";

export default function NewCharacterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [voiceId, setVoiceId] = useState(CURATED_VOICES[0]?.voice_id ?? "");
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
          reference_image_url: imageUrl,
          voice_id: voiceId,
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
        <h1 className="text-3xl font-bold tracking-tight">
          New character
        </h1>
        <p className="mt-2 text-sm text-muted">
          Set this up once. Every clip you make uses this character.
        </p>
      </div>

      <Field label="Name" value={name} onChange={setName} placeholder="Tom" />

      <Field
        label="Reference image URL"
        value={imageUrl}
        onChange={setImageUrl}
        placeholder="https://... (1024×1024, face-forward, neutral expression)"
      />

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
                (delivery === d
                  ? "bg-ink text-bg"
                  : "border border-ink/20 text-ink")
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
          Persona (100 words — what they care about, what they sound like)
        </label>
        <textarea
          rows={5}
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          value={perspective}
          onChange={(e) => setPerspective(e.target.value)}
          placeholder="Has worked at three failed unicorns. Suspicious of any sentence containing 'AI-native.' Reads every TechCrunch piece for the drama, never the news."
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
        disabled={loading}
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
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
