import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

// OpenAI Whisper API limit
const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/mpeg",
]);

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    if (!process.env.WHISPER_API_KEY) {
      return NextResponse.json(
        { error: "WHISPER_API_KEY not set on the server" },
        { status: 500 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Expected multipart 'file' field" },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Whisper accepts files up to 25 MB. Split or compress before uploading.`,
        },
        { status: 413 },
      );
    }

    if (file.type && !ACCEPTED_TYPES.has(file.type)) {
      // Not a hard reject — Whisper accepts these by extension too — but warn.
      // Some browsers send empty type for some uploads, so only block obvious mismatches.
    }

    const upstream = new FormData();
    upstream.append("file", file, file.name || "audio");
    upstream.append("model", "whisper-1");
    upstream.append("response_format", "json");
    const language = form.get("language");
    if (typeof language === "string" && language.trim()) {
      upstream.append("language", language.trim());
    }
    const prompt = form.get("prompt");
    if (typeof prompt === "string" && prompt.trim()) {
      // A short prompt of names/jargon improves Whisper accuracy.
      upstream.append("prompt", prompt.trim());
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHISPER_API_KEY}`,
      },
      body: upstream,
    });

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: `Whisper failed (${res.status}): ${errBody.slice(0, 500)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { text?: string };
    if (!data.text) {
      return NextResponse.json(
        { error: "Whisper returned no transcript" },
        { status: 502 },
      );
    }

    return NextResponse.json({ transcript: data.text });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
