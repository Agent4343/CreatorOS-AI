export default function Home() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight">
          Drop in one podcast.
          <br />
          Get back twenty social posts.
          <br />
          <span className="text-accent">Written in your style, not generic AI.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/80">
          Made one long thing this week — a podcast, a YouTube video, an essay,
          a talk? Paste the transcript here. Sixty seconds later you have
          twenty short posts in your writing style — Twitter threads, LinkedIn
          posts, newsletter sections, video captions — ready to copy and paste.
          No rewriting.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href="/onboarding"
            className="rounded-md bg-ink px-5 py-3 font-sans text-sm font-medium text-cream no-underline hover:bg-accent"
          >
            Get started
          </a>
          <a
            href="/audit"
            className="rounded-md border border-ink/20 px-5 py-3 font-sans text-sm font-medium text-ink no-underline"
          >
            Try the free audit first (no signup)
          </a>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-3">
        <Card
          n="1"
          title="Show us how you write"
          body="Paste 30+ posts you've already written. We learn your sentence patterns, your hooks, the phrases you use, the phrases you'd never use."
        />
        <Card
          n="2"
          title="Drop in your long content"
          body="A podcast transcript. An essay. A YouTube video transcript. One paste, one click, sixty seconds."
        />
        <Card
          n="3"
          title="Copy out twenty posts"
          body="Three Twitter threads, five tweets, three LinkedIn posts, two newsletter sections, two newsletter teasers, five video captions. Each one ready to ship."
        />
      </section>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-6">
        <h2 className="text-xl font-semibold">What this is — and isn't</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
              What it does
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>Turns one long-form piece into ~20 short social posts</li>
              <li>Posts sound like you wrote them, not like ChatGPT</li>
              <li>Saves the 15 hours/week of manual cutting and rewriting</li>
              <li>Scores every post before you see it (six checks)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
              What it doesn't do
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>Make videos — text out only (use Opus Clip / Descript for video)</li>
              <li>Clone your spoken voice — writing style only, no audio</li>
              <li>Build an audience — it makes posts, not readers</li>
              <li>Help if you don't already make long-form content</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink/60">
          Strategy and reasoning behind the build:{" "}
          <a href="https://github.com/agent4343/creatoros-ai/blob/main/BIBLE.md">
            BIBLE.md
          </a>
          .
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
