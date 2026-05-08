import { supabaseService } from "./supabase/server";
import { Character, ClipStatus, Persona, Script } from "./types";

export async function listCharacters(userId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Character[];
}

export async function getCharacter(id: string, userId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Character | null;
}

export async function createCharacter(args: {
  userId: string;
  name: string;
  reference_image_url: string;
  voice_id: string;
  persona: Persona;
  voice_stability?: number;
  voice_similarity_boost?: number;
}) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("characters")
    .insert({
      user_id: args.userId,
      name: args.name,
      reference_image_url: args.reference_image_url,
      voice_provider: "elevenlabs",
      voice_id: args.voice_id,
      voice_stability: args.voice_stability ?? 0.5,
      voice_similarity_boost: args.voice_similarity_boost ?? 0.75,
      persona: args.persona,
      aspect_ratio: "9:16",
      target_duration_sec: 30,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Character;
}

export async function createClip(args: {
  userId: string;
  characterId: string;
  topic: string;
}) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .insert({
      user_id: args.userId,
      character_id: args.characterId,
      topic: args.topic,
      status: "queued" as ClipStatus,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClip(
  clipId: string,
  fields: {
    status?: ClipStatus;
    script?: Script | null;
    audio_url?: string | null;
    video_url?: string | null;
    hedra_job_id?: string | null;
    error?: string | null;
    completed_at?: string | null;
  },
) {
  const sb = supabaseService();
  const { error } = await sb.from("clips").update(fields).eq("id", clipId);
  if (error) throw error;
}

export async function getClip(id: string, userId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listClips(userId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("clips")
    .select("id, character_id, topic, status, video_url, created_at, completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
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
  return data ?? [];
}
