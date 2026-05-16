import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Permissive Database type — would be generated from Supabase CLI in
// a real project. For now this stops `never` inference on inserts/updates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = { Row: any; Insert: any; Update: any; Relationships: [] };
type Database = {
  public: {
    Tables: {
      orgs: AnyTable;
      memberships: AnyTable;
      invites: AnyTable;
      forms: AnyTable;
      form_versions: AnyTable;
      submissions: AnyTable;
      submission_signatures: AnyTable;
      submission_email_log: AnyTable;
      audit_logs: AnyTable;
      org_roles: AnyTable;
      outbound_messages: AnyTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Authenticated Supabase client tied to the request's cookies. Use this
 * for any read or write that should be subject to RLS — i.e., almost
 * everything from a logged-in user's session.
 */
export async function supabaseAuthed() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase env vars not set");

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options as CookieOptions);
        }
      },
    },
  });
}

let _service: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client. Bypasses RLS. Only use after
 * verifying the requesting user's org membership and role through the
 * authed client. Used for: writing to audit_logs, atomic
 * forms+form_versions inserts, signature integrity, invite acceptance.
 *
 * Never expose this to the browser. Never pass user input that
 * targets a different org_id without checking membership first.
 */
export function supabaseService(): SupabaseClient<Database> {
  if (!_service) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("Supabase service env vars not set");
    _service = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _service;
}
