import { listCharacters } from "@/lib/db";

export default async function CharacterPage() {
  const characters = await listCharacters();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Your characters</h1>
        <a
          href="/character/new"
          className="rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
        >
          New character
        </a>
      </div>

      {characters.length === 0 && (
        <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
          <p className="text-muted">
            No characters yet. Set one up to start generating clips.
          </p>
          <a
            href="/character/new"
            className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
          >
            Create your first character
          </a>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {characters.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-ink/15 bg-white p-4"
          >
            <h2 className="text-lg font-bold">{c.name}</h2>
            <p className="text-sm text-muted">{c.persona.one_liner}</p>
            <p className="mt-2 font-mono text-xs text-muted">
              {c.persona.delivery} · {c.aspect_ratio} · {Math.round(c.target_duration_sec / 60)} min
            </p>
            <p className="mt-2 break-all font-mono text-[10px] text-muted">
              {c.reference_image_url}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
