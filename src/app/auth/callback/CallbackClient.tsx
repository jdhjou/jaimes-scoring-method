"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [msg, setMsg] = useState("Completing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const code = sp.get("code");

        if (code) {
          setMsg("Exchanging code for session…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        setMsg("Signed in. Redirecting…");
        router.replace("/");
      } catch (e: any) {
        setMsg(`Auth callback error: ${e?.message ?? String(e)}`);
      }
    })();
  }, [router, sp]);

  return <div style={{ padding: 24 }}>{msg}</div>;
}
