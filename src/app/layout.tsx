import "./globals.css";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reel — AI comedy clip factory",
  description:
    "Type a topic, get a 30-second comedy video starring your recurring AI character.",
};

async function getUser() {
  try {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

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
              {user ? (
                <>
                  <a href="/generate">Generate</a>
                  <a href="/library">Library</a>
                  <a href="/character">Character</a>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="text-xs text-muted underline">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <a href="/login">Sign in</a>
              )}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-24 border-t border-ink/10 pt-6 text-xs text-muted">
            Reel · v0.1 · One topic in. One comedy clip out. ~3 minutes.
          </footer>
        </div>
      </body>
    </html>
  );
}
