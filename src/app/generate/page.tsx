import { requireUser } from "@/lib/auth";
import { listCharacters } from "@/lib/db";
import GenerateForm from "./GenerateForm";

export default async function GeneratePage() {
  const user = await requireUser();
  const characters = await listCharacters(user.id);

  if (characters.length === 0) {
    return (
      <div className="rounded-md border border-ink/15 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">No character yet</h1>
        <p className="mt-2 text-muted">
          You need a character before you can generate clips.
        </p>
        <a
          href="/character/new"
          className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
        >
          Set up your first character
        </a>
      </div>
    );
  }

  return (
    <GenerateForm
      characters={characters.map((c) => ({
        id: c.id,
        name: c.name,
        one_liner: c.persona.one_liner,
        reference_image_url: c.reference_image_url,
      }))}
    />
  );
}
