"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(supabaseInitError);

  const validEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  async function sendLink() {
    setErr(null);

    if (supabaseInitError || !supabase) {
      setErr(supabaseInitError ?? "Supabase client not initialized.");
      return;
    }

    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setErr("Enter a valid email address.");
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
    setSending(false);

    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-[100dvh] bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950">
      {/* soft background accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-200/60 blur-3xl dark:bg-zinc-800/60" />
        <div className="absolute bottom-[-6rem] right-[-6rem] h-96 w-96 rounded-full bg-zinc-200/40 blur-3xl dark:bg-zinc-800/40" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] max-w-md items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70 sm:p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-900 dark:bg-white" />
            Golf App
          </Link>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            {sent ? "Check your email" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {sent
              ? `We sent a magic link to ${email.trim()}. Click it to finish signing in.`
              : "Enter your email and we’ll send you a one-time magic link. No passwords."}
          </p>

          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                Didn’t get it? Check spam/promotions. You can also try again with a different email.
              </div>

              <button
                onClick={() => {
                  setSent(false);
                  setErr(null);
                }}
                className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-sm outline-none ring-zinc-900/10 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                />
              </label>

              <button
                onClick={sendLink}
                disabled={!validEmail || !!supabaseInitError || sending}
                className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                {sending ? "Sending link…" : "Email me a magic link"}
              </button>

              {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                  {err}
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">
                  ← Back home
                </Link>
                <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-white">
                  Privacy
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
