import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseInitError =
  !url || !anon
    ? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Did you create .env.local/.env.production and restart?"
    : null;

export const supabase: SupabaseClient | null =
  supabaseInitError
    ? null
    : createClient(url!, anon!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase client not initialized.");
  }
  return supabase;
}
