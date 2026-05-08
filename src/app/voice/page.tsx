import {
  getCurrentCreator,
  getLatestVoiceProfile,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { VoiceProfile } from "@/lib/types";

export default async function VoicePage() {
  const user = await requireUser();
  const creator = await getCurrentCreator(user.id);
  if (!creator) {
    return (
      <Empty
        body="No profile yet."
        cta={{ href: "/onboarding", label: "Run onboarding" }}
      />
    );
  }
  const row = await getLatestVoiceProfile(creator.id);
  if (!row) {
    return (
      <Empty
        body="No voice profile built yet."
        cta={{ href: "/onboarding", label: "Build my voice profile" }}
      />
    );
  }
  const profile = row.profile as VoiceProfile;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Voice Profile</h1>
        <p className="mt-2 text-sm text-ink/60">
          Last built {new Date(row.created_at).toLocaleString()}.{" "}
          <a href="/onboarding">Rebuild</a> to incorporate new source pieces.
        </p>
      </div>

      <Section title="Audience">
        <KV k="Who" v={profile.audience.who} />
        <KV k="Pains" v={profile.audience.pains.join(" · ")} />
        <KV k="Objections" v={profile.audience.objections.join(" · ")} />
      </Section>

      <Section title="Vocabulary">
        <KV k="Reading level" v={`Grade ${profile.vocabulary.reading_level_grade}`} />
        <KV k="Technical level" v={profile.vocabulary.technical_level} />
        <Tags label="Signature phrases" items={profile.vocabulary.signature_phrases} />
        <Tags label="Avoided phrases" items={profile.vocabulary.avoided_phrases} muted />
      </Section>

      <Section title="Sentence patterns">
        <KV k="Avg length (words)" v={String(profile.sentence_patterns.avg_length_words)} />
        <KV k="Fragment frequency" v={profile.sentence_patterns.fragment_frequency} />
        <KV k="Starts with conjunctions" v={profile.sentence_patterns.starts_with_conjunction ? "yes" : "no"} />
        <KV k="List density" v={profile.sentence_patterns.list_density} />
      </Section>

      <Section title="Hook library">
        {profile.hook_library.map((h, i) => (
          <div key={i} className="border-l-2 border-accent/40 pl-3">
            <div className="font-sans text-xs uppercase tracking-wider text-ink/50">
              {h.pattern}
            </div>
            <div className="text-sm">{h.example}</div>
          </div>
        ))}
      </Section>

      <Section title="CTA library">
        {profile.cta_library.map((c, i) => (
          <div key={i} className="border-l-2 border-ink/30 pl-3">
            <div className="font-sans text-xs uppercase tracking-wider text-ink/50">
              {c.context} — {c.pattern}
            </div>
            <div className="text-sm">{c.example}</div>
          </div>
        ))}
      </Section>

      <Section title="Tone vectors">
        <ToneBar label="formal ↔ casual" value={profile.tone_vectors.formal_casual} />
        <ToneBar label="earnest ↔ ironic" value={profile.tone_vectors.earnest_ironic} />
        <ToneBar label="prescriptive ↔ reflective" value={profile.tone_vectors.prescriptive_reflective} />
        <ToneBar label="warm ↔ clinical" value={profile.tone_vectors.warm_clinical} />
      </Section>

      <Section title="Format preferences">
        <KV
          k="Twitter thread length"
          v={`${profile.format_preferences.twitter.thread_length[0]}–${profile.format_preferences.twitter.thread_length[1]} tweets · emojis: ${profile.format_preferences.twitter.uses_emojis ? "yes" : "no"}`}
        />
        <KV
          k="LinkedIn paragraph"
          v={`${profile.format_preferences.linkedin.para_length_lines[0]}–${profile.format_preferences.linkedin.para_length_lines[1]} lines · horizontal rules: ${profile.format_preferences.linkedin.uses_horizontal_rules ? "yes" : "no"}`}
        />
        <KV
          k="Newsletter"
          v={`${profile.format_preferences.newsletter.section_count[0]}–${profile.format_preferences.newsletter.section_count[1]} sections · subheads: ${profile.format_preferences.newsletter.subhead_style}`}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-5">
      <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-ink/85">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 text-sm">
      <div className="text-ink/50">{k}</div>
      <div>{v}</div>
    </div>
  );
}

function Tags({
  label,
  items,
  muted,
}: {
  label: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <div className="text-sm">
      <div className="text-ink/50">{label}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map((s, i) => (
          <span
            key={i}
            className={
              "rounded-md border px-2 py-0.5 font-mono text-xs " +
              (muted
                ? "border-ink/20 text-ink/50"
                : "border-accent/40 text-accent")
            }
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function ToneBar({ label, value }: { label: string; value: number }) {
  // value is -1..1; render a position dot on a horizontal bar
  const pct = ((value + 1) / 2) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs text-ink/60">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-ink/10">
        <div
          className="absolute -top-1 h-4 w-4 rounded-full bg-accent"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  );
}

function Empty({
  body,
  cta,
}: {
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-8 text-center">
      <p className="text-ink/70">{body}</p>
      <a
        href={cta.href}
        className="mt-4 inline-block rounded-md bg-ink px-4 py-2 font-sans text-sm text-cream no-underline"
      >
        {cta.label}
      </a>
    </div>
  );
}
