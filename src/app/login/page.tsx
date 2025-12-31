"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(supabaseInitError);

  async function sendLink() {
    setErr(null);
    if (supabaseInitError || !supabase) {
      setErr(supabaseInitError ?? "Supabase client not initialized.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main style={{ padding: 24, minHeight: "100vh", background: "#0b1220", color: "#e6e8ee" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ margin: 0 }}>Login</h1>
        <p style={{ opacity: 0.85, marginTop: 8 }}>Enter your email and we’ll send you a magic link.</p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.08)",
            color: "#e6e8ee",
            outline: "none",
            fontWeight: 700,
            marginTop: 10,
          }}
        />

        <button
          onClick={sendLink}
          disabled={!email || !!supabaseInitError}
          style={{
            marginTop: 10,
            width: "100%",
            padding: 12,
            borderRadius: 10,
            fontWeight: 900,
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.12)",
            color: "#e6e8ee",
          }}
        >
          Send login link
        </button>

        {sent && <p style={{ marginTop: 12 }}>✅ Sent! Check your email for the link.</p>}
        {err && (
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", background: "#111", color: "#fff", padding: 12, borderRadius: 10, fontSize: 12 }}>
            {err}
          </pre>
        )}

        <div style={{ marginTop: 16 }}>
          <Link href="/" style={{ color: "#9ecbff" }}>← Back home</Link>
        </div>
      </div>
    </main>
  );
}
