import { supabase } from "@/lib/storage/supabaseClient";
import { generateUsernameCandidate } from "@/lib/utils/username";

export async function ensureUsername(userId: string, email: string) {
  if (!supabase) throw new Error("Supabase client not initialized.");

  // Read current profile (row may not exist yet)
  const { data: profile, error: readErr } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  if (readErr) {
    // If RLS blocks or other real DB errors, surface it
    throw new Error(readErr.message);
  }

  if (profile?.username) return profile.username;

  // Try candidates until one sticks
  for (let i = 0; i < 12; i++) {
    const candidate = generateUsernameCandidate(email);

    // Optional fast uniqueness check
    const { data: existing, error: existsErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();

    if (existsErr) {
      // not fatal, but useful to know
      console.warn("username existence check error:", existsErr);
    }
    if (existing) continue;

    // Write it (creates row if missing)
    const { error: writeErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, username: candidate, display_name: candidate }, { onConflict: "id" });

    if (!writeErr) return candidate;

    // If we hit unique constraint/race, just try again
    // (message varies by Postgres client; keep it forgiving)
    const msg = (writeErr.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) continue;

    throw new Error(writeErr.message);
  }

  throw new Error("Could not generate a unique username");
}
