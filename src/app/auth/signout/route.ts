import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthed } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const sb = await supabaseAuthed();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
