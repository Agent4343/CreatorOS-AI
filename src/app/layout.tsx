import "./globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = {
  title: "Reel — long-form AI comedy video factory",
  description:
    "Type a topic, get a long-form comedy video starring your recurring AI character.",
};

async function isSignedIn(): Promise<boolean> {
  const c = await cookies();
  return !!c.get("reel_auth")?.value;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const signedIn = await isSignedIn();

  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <header className="mb-12 flex items-baseline justify-between">
            <a
              href="/"
              className="text-2xl font-bold tracking-tight no-underline text-ink"
            >
              Reel<span className="text-accent">.</span>
            </a>
            <nav className="flex items-baseline gap-6 text-sm">
              {signedIn && (
                <>
                  <a href="/generate">Generate</a>
                  <a href="/library">Library</a>
                  <a href="/character">Character</a>
                  <SignOutButton />
                </>
              )}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-24 border-t border-ink/10 pt-6 text-xs text-muted">
            Reel · v0.2 · Single-user · One topic in. One long-form comedy video out.
          </footer>
        </div>
      </body>
    </html>
  );
}
