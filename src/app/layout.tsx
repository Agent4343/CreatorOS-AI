import "./globals.css";
import type { Metadata } from "next";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { supabaseAuthed } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "FieldForm — AI-native digital forms for the field",
  description:
    "Design forms or upload paper ones. Workers complete on phone or tablet with compliant signatures.",
};

async function getUser() {
  try {
    const sb = await supabaseAuthed();
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
  const admin = isPlatformAdmin(user?.id);
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <header className="mb-10 flex items-baseline justify-between">
            <a
              href="/"
              className="text-2xl font-bold tracking-tight no-underline text-ink"
            >
              FieldForm<span className="text-accent">.</span>
            </a>
            <nav className="flex items-baseline gap-6 text-sm">
              {user ? (
                <>
                  <a href="/dashboard">Dashboard</a>
                  <a href="/forms">Forms</a>
                  <a href="/submissions">Submissions</a>
                  <a href="/settings">Settings</a>
                  {admin && <a href="/admin" className="text-accent">Admin</a>}
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
            FieldForm · v0.1 · Multi-tenant · RLS-isolated · Signature audit trail enforced
          </footer>
        </div>
      </body>
    </html>
  );
}
