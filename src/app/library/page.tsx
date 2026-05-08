import { listClips } from "@/lib/db";

export default async function LibraryPage() {
  const clips = await listClips();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-2 text-muted">All your generated videos. Newest first.</p>
      </div>

      {clips.length === 0 && (
        <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
          <p className="text-muted">No videos yet.</p>
          <a
            href="/generate"
            className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
          >
            Generate your first video
          </a>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {clips.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-ink/15 bg-white p-3"
          >
            {c.video_url ? (
              <video
                src={c.video_url}
                controls
                className="aspect-video w-full rounded-md"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-md bg-ink/5 text-xs text-muted">
                {c.status}
              </div>
            )}
            <div className="mt-2 line-clamp-2 text-sm font-medium">{c.topic}</div>
            <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
              <span>{new Date(c.created_at).toLocaleDateString()}</span>
              <span
                className={
                  c.status === "done"
                    ? "text-ink/70"
                    : c.status === "failed"
                      ? "text-accent"
                      : "text-muted"
                }
              >
                {c.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
