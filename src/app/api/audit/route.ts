import { NextRequest, NextResponse } from "next/server";
import { auditPosts } from "@/lib/prompts/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

// Public route — no auth. Capped per-request to discourage abuse.
// Real rate-limiting should happen at the edge (Vercel KV / Upstash);
// for v1 this just bounds a single request.
const MIN_POSTS = 3;
const MAX_POSTS = 10;
const MIN_CHARS = 80;
const MAX_CHARS_PER_POST = 4000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { posts?: unknown };
    if (!Array.isArray(body.posts)) {
      return NextResponse.json({ error: "posts: string[] required" }, { status: 400 });
    }

    const posts = body.posts
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter((p) => p.length >= MIN_CHARS)
      .map((p) => p.slice(0, MAX_CHARS_PER_POST));

    if (posts.length < MIN_POSTS) {
      return NextResponse.json(
        { error: `At least ${MIN_POSTS} posts of ≥${MIN_CHARS} chars required.` },
        { status: 400 },
      );
    }
    if (posts.length > MAX_POSTS) {
      return NextResponse.json(
        { error: `Up to ${MAX_POSTS} posts. Drop the oldest first.` },
        { status: 400 },
      );
    }

    const audit = await auditPosts(posts);
    return NextResponse.json({ audit });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
