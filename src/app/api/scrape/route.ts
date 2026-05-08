import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ScrapedPiece, scrapeFeed, scrapePage, scrapeUrlList } from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_URLS = 100;
const MIN_BODY_CHARS = 200;

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = (await req.json()) as
      | { mode: "feed"; url: string }
      | { mode: "urls"; urls: string[] }
      | { mode: "page"; url: string };

    let raw: ScrapedPiece[];
    switch (body.mode) {
      case "feed":
        if (!body.url) {
          return NextResponse.json({ error: "Missing url" }, { status: 400 });
        }
        raw = await scrapeFeed(body.url);
        break;
      case "page":
        if (!body.url) {
          return NextResponse.json({ error: "Missing url" }, { status: 400 });
        }
        raw = [await scrapePage(body.url)];
        break;
      case "urls":
        if (!Array.isArray(body.urls) || body.urls.length === 0) {
          return NextResponse.json({ error: "Empty urls list" }, { status: 400 });
        }
        if (body.urls.length > MAX_URLS) {
          return NextResponse.json(
            { error: `Too many URLs (max ${MAX_URLS})` },
            { status: 400 },
          );
        }
        raw = await scrapeUrlList(body.urls);
        break;
      default:
        return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
    }

    // Drop pieces that are too short to teach voice from.
    const pieces = raw.filter((p) => p.body.length >= MIN_BODY_CHARS);

    return NextResponse.json({
      pieces,
      total_fetched: raw.length,
      kept: pieces.length,
      dropped_short: raw.length - pieces.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
