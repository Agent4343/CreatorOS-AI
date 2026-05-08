import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CreatorOS AI",
  description:
    "A content workflow engine that turns one source into twenty platform-ready assets in your voice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-serif">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <header className="mb-12 flex items-baseline justify-between">
            <a href="/" className="text-2xl font-semibold tracking-tight no-underline text-ink">
              CreatorOS<span className="text-accent">·</span>AI
            </a>
            <nav className="flex gap-6 text-sm">
              <a href="/dashboard">Dashboard</a>
              <a href="/generate">Generate</a>
              <a href="/voice">Voice</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-24 border-t border-ink/10 pt-6 text-xs text-ink/60">
            CreatorOS AI · v0.1 · One source → twenty platform-ready assets, in your voice.
          </footer>
        </div>
      </body>
    </html>
  );
}
