import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseInitError =
  !url || !anon
    ? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Did you set prod env and rebuild?"
    : null;

// IMPORTANT: use the SSR-compatible browser client (cookie-based)
export const supabase: SupabaseClient | null = supabaseInitError
  ? null
  : (createBrowserClient() as unknown as SupabaseClient);

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(supabaseInitError ?? "Supabase client not initialized.");
  }
  return supabase;
}
