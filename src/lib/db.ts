import { supabaseService } from "./supabase/server";
import { GeneratedAsset, QAScorecard, VoiceProfile } from "./types";

export async function getCurrentCreator(userId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("creators")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCreator(userId: string, fields: {
  display_name?: string;
  niche?: string;
}) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("creators")
    .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveVoiceProfile(creatorId: string, profile: VoiceProfile) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("voice_profiles")
    .insert({ creator_id: creatorId, profile })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestVoiceProfile(creatorId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("voice_profiles")
    .select("*")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveSourceContent(
  creatorId: string,
  body: string,
  kind: string,
) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("source_content")
    .insert({ creator_id: creatorId, body, kind })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveGeneration(args: {
  creatorId: string;
  sourceId: string;
  voiceProfileId: string;
  assets: Array<GeneratedAsset & { qa: QAScorecard }>;
}) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("generations")
    .insert({
      creator_id: args.creatorId,
      source_id: args.sourceId,
      voice_profile_id: args.voiceProfileId,
      assets: args.assets,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubscriptionByCustomer(
  stripeCustomerId: string,
  fields: {
    stripe_subscription_id?: string;
    tier?: string;
    status?: string;
    current_period_end?: string;
  },
) {
  const sb = supabaseService();
  const { error } = await sb
    .from("subscriptions")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", stripeCustomerId);
  if (error) throw error;
}

export async function getSubscription(creatorId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listGenerations(creatorId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("generations")
    .select("id, created_at, assets")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// ---- Admin queries (service role; bypass RLS) ----

export async function adminListCreators() {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("creators")
    .select("id, user_id, display_name, niche, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function adminGetCreator(creatorId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("creators")
    .select("*")
    .eq("id", creatorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function adminListGenerationsForCreator(creatorId: string) {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("generations")
    .select("id, created_at, assets")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function adminCounts() {
  const sb = supabaseService();
  const [creators, profiles, generations] = await Promise.all([
    sb.from("creators").select("*", { count: "exact", head: true }),
    sb.from("voice_profiles").select("*", { count: "exact", head: true }),
    sb.from("generations").select("*", { count: "exact", head: true }),
  ]);
  return {
    creators: creators.count ?? 0,
    voice_profiles: profiles.count ?? 0,
    generations: generations.count ?? 0,
  };
}
