export default function Home() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight">
          One source.
          <br />
          Twenty platform-ready assets.
          <br />
          <span className="text-accent">In your writing style.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/80">
          A content workflow engine for operator-creators. Drop in a podcast
          transcript, a long essay, or a recorded talk. Get back clips,
          captions, threads, LinkedIn posts, and newsletter sections — every
          asset scored against your Style Profile before it reaches you.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href="/onboarding"
            className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream no-underline hover:bg-accent"
          >
            Build my style profile
          </a>
          <a
            href="/audit"
            className="rounded-md border border-ink/20 px-5 py-3 font-sans text-sm font-medium text-ink no-underline"
          >
            Free style audit (no signup)
          </a>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-3">
        <Card
          n="1"
          title="Capture your writing style"
          body="Upload 30+ source pieces. We extract a structured Style Profile — signature phrases, hook patterns, tone vectors, audience specifics."
        />
        <Card
          n="2"
          title="Generate"
          body="Paste one source. Get ~20 assets in 60–90 seconds: threads, posts, clips, teasers — formatted per platform."
        />
        <Card
          n="3"
          title="Score & ship"
          body="Every asset comes with a six-dimension QA scorecard. Approve, regenerate, or edit. Edits feed back into your style profile."
        />
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-6">
        <h2 className="text-xl font-semibold">The two specs that matter</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-ink/80">
          <li>
            <strong>Style Profile</strong> — a real, structured JSON object built
            from your writing corpus. Captures how you write (sentence patterns,
            hooks, signature phrases) — not your spoken voice. Not a fine-tune,
            not embeddings, not a vector DB.
          </li>
          <li>
            <strong>QA Rubric</strong> — six dimensions scored 0–10: style match,
            AI-tell density, specificity, hook strength, format fitness, CTA
            quality.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink/60">
          Full strategy in <a href="https://github.com/agent4343/creatoros-ai/blob/main/BIBLE.md">BIBLE.md</a>.
        </p>
      </section>
    </div>
  );
}

function Card({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-5">
      <div className="font-mono text-xs text-accent">Step {n}</div>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink/75">{body}</p>
    </div>
  );
}
