import { cookies } from "next/headers";

export default async function Home() {
  const c = await cookies();
  const signedIn = !!c.get("reel_auth")?.value;

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-5xl font-bold leading-tight tracking-tight">
          Type a topic.
          <br />
          Get a long-form video.
          <br />
          <span className="text-accent">Starring the same AI character every time.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink/80">
          Single-user comedy video factory. Set up a recurring AI character
          once — name, face, voice, comedic point of view. Then type a topic
          and get back a 5–15 minute video for YouTube or Facebook. Manual
          download, manual upload — for now.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href={signedIn ? "/generate" : "/login"}
            className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg no-underline hover:bg-accent"
          >
            {signedIn ? "Open the app" : "Sign in"}
          </a>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-3">
        <Card
          n="1"
          title="Set up your character"
          body="Create a Photo Avatar in HeyGen, paste its avatar_id, pick a voice from ElevenLabs, write a 100-word persona. Five minutes, one time."
        />
        <Card
          n="2"
          title="Type a topic"
          body='"Why every founder pretends to like their investors." Whatever you want a 10-minute monologue on.'
        />
        <Card
          n="3"
          title="Wait 5–15 minutes"
          body="Claude writes the long-form script. ElevenLabs voices it. HeyGen renders the video. 16:9 MP4 lands in your library, ready to upload."
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
              <li>Long-form (3–20 min) AI presenter videos</li>
              <li>16:9 horizontal (YouTube / Facebook feed) by default</li>
              <li>Recurring character anchors your channel's identity</li>
              <li>Topic → finished MP4 in 5–15 min</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              What it doesn't do (yet)
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              <li>No b-roll, no scene cuts — straight talking head</li>
              <li>No music or VFX</li>
              <li>No automated posting — manual upload to YouTube / Facebook</li>
              <li>Not a deepfake tool — characters are clearly AI</li>
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
