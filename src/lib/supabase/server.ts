import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Permissive Database type. Real generated types are nice but require the
// Supabase CLI + a live project. Until then this lets TypeScript stop
// inferring `never` on every insert/update.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = { Row: any; Insert: any; Update: any; Relationships: [] };
type Database = {
  public: {
    Tables: {
      characters: AnyTable;
      clips: AnyTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let _client: SupabaseClient<Database> | null = null;

/**
 * Service-role Supabase client. In single-user mode there's no separate
 * authenticated client — we trust the request because middleware
 * already gated it via APP_PASSWORD.
 */
export function supabaseService(): SupabaseClient<Database> {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("Supabase env vars not set");
    }
    _client = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
