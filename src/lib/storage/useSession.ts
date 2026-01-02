"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";
import { ensureUsername } from "@/lib/storage/ensureUsername";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  scoring_distance_yards?: number | null;
  safe_tee_distance_yards?: number | null;
};

export type UseSessionReturn = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(supabaseInitError);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message ?? String(e));
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Ensure username exists (creates/updates profiles row if needed)
  useEffect(() => {
    if (!supabase) return;
    if (!session?.user?.id) return;

    const email = session.user.email;
    if (!email) return;

    ensureUsername(session.user.id, email).catch((e) => {
      console.error("ensureUsername failed:", e);
    });
  }, [session?.user?.id]);

  // Load profile (username/display_name) when logged in
  useEffect(() => {
    if (!supabase) return;

    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    supabase
      .from("profiles")
      .select("id, username, display_name, scoring_distance_yards, safe_tee_distance_yards")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("profile load error:", error);
          return;
        }
        setProfile(data as Profile);
      });
  }, [session?.user?.id]);

  return { session, profile, loading, error };
}
