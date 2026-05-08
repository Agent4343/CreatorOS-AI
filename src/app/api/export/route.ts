import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseService } from "@/lib/supabase/server";
import { ScoredAsset } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const sb = supabaseService();
    const { data, error } = await sb
      .from("generations")
      .select("assets")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const assets = data.assets as ScoredAsset[];

    if (format === "json") {
      return new NextResponse(JSON.stringify(assets, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="bundle-${id}.json"`,
        },
      });
    }

    const csv = toCsv(assets);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="bundle-${id}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function toCsv(assets: ScoredAsset[]): string {
  const header = ["platform", "kind", "title", "body", "overall_pass", "voice_match", "ai_tell_density", "specificity", "hook_strength", "format_fitness", "cta_quality"];
  const rows = assets.map((a) => [
    a.platform,
    a.kind,
    a.title,
    a.body,
    String(a.qa.overall_pass),
    String(a.qa.scores.voice_match),
    String(a.qa.scores.ai_tell_density),
    String(a.qa.scores.specificity),
    String(a.qa.scores.hook_strength),
    String(a.qa.scores.format_fitness),
    String(a.qa.scores.cta_quality),
  ]);
  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

function esc(v: string) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
