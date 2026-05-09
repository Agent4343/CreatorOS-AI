import type { ReviewScorecard } from "./agents";
import { supabaseService } from "./supabase/server";
import { Character, ClipStatus, Persona, Script, UploadPack } from "./types";

// Single-user mode: all rows belong to the same fictitious "owner" user_id.
// Kept as a column so we can flip back to multi-tenant by setting it from
// auth and re-enabling RLS on the tables.
const OWNER_ID = "00000000-0000-0000-0000-000000000001";

export async function listCharacters() {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Character[];
}

export async function getCharacter(id: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Character | null;
}

export async function createCharacter(args: {
  name: string;
  reference_image_url: string;
  voice_id: string;
  persona: Persona;
  voice_stability?: number;
  voice_similarity_boost?: number;
  aspect_ratio?: "9:16" | "1:1" | "16:9";
  target_duration_sec?: number;
}) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .insert({
      user_id: OWNER_ID,
      name: args.name,
      reference_image_url: args.reference_image_url,
      voice_provider: "elevenlabs",
      voice_id: args.voice_id,
      voice_stability: args.voice_stability ?? 0.5,
      voice_similarity_boost: args.voice_similarity_boost ?? 0.75,
      persona: args.persona,
      aspect_ratio: args.aspect_ratio ?? "16:9",
      target_duration_sec: args.target_duration_sec ?? 600,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Character;
}

export async function createClip(args: { characterId: string; topic: string }) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .insert({
      user_id: OWNER_ID,
      character_id: args.characterId,
      topic: args.topic,
      status: "queued" as ClipStatus,
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; character_id: string; topic: string; status: ClipStatus };
}

export async function updateClip(
  clipId: string,
  fields: {
    status?: ClipStatus;
    script?: Script | null;
    upload_pack?: UploadPack | null;
    audio_url?: string | null;
    video_url?: string | null;
    provider_job_id?: string | null;
    review_scorecard?: ReviewScorecard | null;
    error?: string | null;
    completed_at?: string | null;
  },
) {
  const sb = supabaseService();
  const { error } = await sb.from("clips").update(fields).eq("id", clipId);
  if (error) throw error;
}

type ClipRow = {
  id: string;
  user_id: string;
  character_id: string;
  topic: string;
  status: ClipStatus;
  script: Script | null;
  upload_pack: UploadPack | null;
  audio_url: string | null;
  video_url: string | null;
  provider_job_id: string | null;
  review_scorecard: ReviewScorecard | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type ClipSummary = Pick<
  ClipRow,
  "id" | "character_id" | "topic" | "status" | "video_url" | "created_at" | "completed_at"
>;

export async function getClip(id: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ClipRow | null;
}

export async function listClips() {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .select("id, character_id, topic, status, video_url, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ClipSummary[];
}

export async function listInFlightClips(limit = 20) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .select("*")
    .in("status", ["rendering"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ClipRow[];
}
