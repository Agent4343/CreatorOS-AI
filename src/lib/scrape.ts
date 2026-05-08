import { XMLParser } from "fast-xml-parser";

export type ScrapedPiece = {
  title: string;
  body: string;
  url?: string;
};

const UA =
  "Mozilla/5.0 (compatible; CreatorOSBot/0.1; +https://creatoros.ai/bot)";

async function fetchText(url: string): Promise<{ body: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html, application/xml, application/rss+xml, application/atom+xml" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch ${url} failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  return { body, contentType };
}

/** Strip HTML tags + collapse whitespace. Lossy but good enough for voice training. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function scrapeFeed(url: string): Promise<ScrapedPiece[]> {
  const { body } = await fetchText(url);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "__cdata",
  });
  const parsed = parser.parse(body);

  // RSS 2.0
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    return items.map((it: Record<string, unknown>) => ({
      title: stringify(it.title) || "(untitled)",
      url: stringify(it.link),
      body: htmlToText(
        stringify(
          (it as Record<string, unknown>)["content:encoded"] ??
            it.description ??
            "",
        ),
      ),
    }));
  }

  // Atom
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) {
    const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    return entries.map((e: Record<string, unknown>) => {
      const link = e.link as { "@_href"?: string } | { "@_href"?: string }[] | string | undefined;
      let href: string | undefined;
      if (typeof link === "string") href = link;
      else if (Array.isArray(link)) href = link[0]?.["@_href"];
      else if (link && typeof link === "object") href = link["@_href"];
      return {
        title: stringify(e.title) || "(untitled)",
        url: href,
        body: htmlToText(stringify(e.content ?? e.summary ?? "")),
      };
    });
  }

  throw new Error("Couldn't find <rss><channel><item> or <feed><entry> — is this a feed URL?");
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.__cdata === "string") return o.__cdata;
    if (typeof o["#text"] === "string") return o["#text"] as string;
    if (typeof o._ === "string") return o._ as string;
    return "";
  }
  return String(v);
}

/** Fetch a single page and extract the main text. Best-effort — pulls <article> or <main> if present. */
export async function scrapePage(url: string): Promise<ScrapedPiece> {
  const { body } = await fetchText(url);
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? htmlToText(titleMatch[1]) : url;

  // Prefer <article>, then <main>, then full body.
  const article = body.match(/<article[\s\S]*?<\/article>/i);
  const main = body.match(/<main[\s\S]*?<\/main>/i);
  const region = article?.[0] ?? main?.[0] ?? body;

  return { title, url, body: htmlToText(region) };
}

export async function scrapeUrlList(urls: string[]): Promise<ScrapedPiece[]> {
  const results: ScrapedPiece[] = [];
  for (const url of urls) {
    try {
      results.push(await scrapePage(url));
    } catch (e) {
      console.warn("scrape failed:", url, e);
    }
  }
  return results;
}
