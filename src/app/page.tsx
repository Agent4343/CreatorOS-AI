export default function Home() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-5xl font-bold leading-tight tracking-tight">
          Type a topic.
          <br />
          Get a comedy clip.
          <br />
          <span className="text-accent">Starring the same AI character every time.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/80">
          Set up a recurring AI character once — name, face, voice, comedic
          point of view. After that, type a one-liner topic. Three minutes
          later you have a 30-second vertical video of that character
          delivering the bit. Ready to post to TikTok, Reels, or Shorts.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href="/login?next=/character/new"
            className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg no-underline hover:bg-accent"
          >
            Start free — 3 clips on us
          </a>
          <a
            href="#how"
            className="rounded-md border border-ink/20 px-5 py-3 text-sm font-medium text-ink no-underline"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="grid gap-8 md:grid-cols-3">
        <Card
          n="1"
          title="Set up your character"
          body="Upload a reference image, pick a voice from our curated list, write a 100-word persona (e.g. 'snarky tech analyst, deadpan delivery'). Five minutes, one time."
        />
        <Card
          n="2"
          title="Type a topic"
          body='"The way LinkedIn talks about Mondays." "Series-B founders discovering Notion." Whatever you want a take on.'
        />
        <Card
          n="3"
          title="Wait three minutes"
          body="Claude writes the script. ElevenLabs voices it. Hedra renders the video. Vertical 9:16 MP4 lands in your library, ready to post."
        />
      </section>

      <section className="rounded-lg border border-ink/15 bg-white p-6">
        <h2 className="text-xl font-bold">What this is — and isn't</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              What it does
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>Recurring AI character that anchors your channel</li>
              <li>30-second vertical comedy clips, finished and ready to post</li>
              <li>Topic → published in under 5 minutes</li>
              <li>Your character, your POV, infinite topics</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              What it doesn't do
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>Not a deepfake tool — characters are clearly AI, not real-person impersonations</li>
              <li>Not a video editor — finished clips only, no timeline / cuts / VFX</li>
              <li>Not yet auto-posting — download manually for now (Phase 2)</li>
              <li>Not multi-character scenes (Phase 2)</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white p-5">
      <div className="font-mono text-xs text-accent">Step {n}</div>
      <h3 className="mt-2 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm text-ink/75">{body}</p>
    </div>
  );
}
