import { supabaseServer } from "./supabase/server";

export async function requireUser() {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return data.user;
}
