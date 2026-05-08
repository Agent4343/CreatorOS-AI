import "./globals.css";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "CreatorOS AI",
  description:
    "A content workflow engine that turns one source into twenty platform-ready assets in your voice.",
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
  const admin = isAdmin(user?.id);

  return (
    <html lang="en">
      <body className="min-h-screen font-serif">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <header className="mb-12 flex items-baseline justify-between">
            <a
              href="/"
              className="text-2xl font-semibold tracking-tight no-underline text-ink"
            >
              CreatorOS<span className="text-accent">·</span>AI
            </a>
            <nav className="flex items-baseline gap-6 text-sm">
              {user ? (
                <>
                  <a href="/dashboard">Dashboard</a>
                  <a href="/generate">Generate</a>
                  <a href="/style">Style</a>
                  <a href="/billing">Billing</a>
                  {admin && <a href="/admin" className="text-accent">Admin</a>}
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="font-sans text-xs text-ink/60 underline"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <a href="/audit">Free style audit</a>
                  <a href="/login">Sign in</a>
                </>
              )}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-24 border-t border-ink/10 pt-6 text-xs text-ink/60">
            CreatorOS AI · v0.1 · One source → twenty platform-ready assets, in
            your voice.
          </footer>
        </div>
      </body>
    </html>
  );
}
