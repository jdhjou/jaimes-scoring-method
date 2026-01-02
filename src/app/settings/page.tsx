"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/storage/useSession";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

function clampInt(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export default function SettingsPage() {
  const router = useRouter();
  const { session, profile, loading, error } = useSession();

  const [sd, setSd] = useState<number>(120);
  const [tee, setTee] = useState<number>(200);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Initialize form from profile when available
  useEffect(() => {
    if (!profile) return;
    if (profile.scoring_distance_yards != null) setSd(profile.scoring_distance_yards);
    if (profile.safe_tee_distance_yards != null) setTee(profile.safe_tee_distance_yards);
  }, [profile?.id]);

  const sdHelp = useMemo(() => {
    if (sd <= 80) return "Very conservative (great for avoiding big numbers).";
    if (sd <= 120) return "Typical range for many mid-handicaps.";
    if (sd <= 150) return "Solid scoring range if you can hit greens from here.";
    return "Aggressive—make sure this is truly a controlled scoring shot.";
  }, [sd]);

  async function save() {
    if (!supabase) return;

    if (!session?.user?.id) {
      router.replace("/login");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const scoring_distance_yards = clampInt(sd, 40, 200);
      const safe_tee_distance_yards = clampInt(tee, 80, 350);

      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          scoring_distance_yards,
          safe_tee_distance_yards,
          // do not flip onboarding_complete off here; keep it true once set
        })
        .eq("id", session.user.id);

      if (upErr) throw upErr;

      setMsg("Saved ✓");
    } catch (e: any) {
      setMsg(`Save error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // --- Render gates ---
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (error || supabaseInitError) {
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px" }}>Settings</h1>
        <p style={{ opacity: 0.85 }}>
          There’s a runtime/config error. Fix this first:
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#111",
            color: "#fff",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {String(error ?? supabaseInitError)}
        </pre>
        <p style={{ marginTop: 12 }}>
          <Link href="/">Go home</Link>
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px" }}>Settings</h1>
        <p style={{ opacity: 0.85, lineHeight: 1.4 }}>
          Please log in first.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/login">Go to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>Settings</h1>
            <p style={styles.sub}>
              Update your distances anytime. Conservative numbers are better than optimistic ones.
            </p>
          </div>

          <div style={styles.headerRight}>
            <Link href="/" style={styles.link}>
              Back to Home
            </Link>
          </div>
        </header>

        <section style={styles.card}>
          <h2 style={styles.h2}>Scoring distance (yards)</h2>
          <p style={styles.p}>
            Farthest yardage where you can hit a <b>controlled</b> scoring shot that typically finishes
            on/near the green (or a puttable miss).
          </p>

          <div style={styles.row}>
            <label style={styles.label}>
              Scoring distance (40–200)
              <input
                type="number"
                inputMode="numeric"
                value={sd}
                onChange={(e) => setSd(Number(e.target.value))}
                style={styles.input}
                min={40}
                max={200}
              />
              <div style={styles.hint}>{sdHelp}</div>
            </label>
          </div>

          <details style={styles.details}>
            <summary style={styles.summary}>How to measure in 10–15 minutes</summary>
            <ol style={styles.ol}>
              <li>Warm up a few swings first.</li>
              <li>Start at <b>80 yards</b> and hit <b>5 balls</b>.</li>
              <li>
                If <b>3 of 5</b> finish on/near the green (or would be puttable), move back <b>10 yards</b> and repeat.
              </li>
              <li>Your scoring distance is the <b>farthest</b> yardage where you still get <b>3/5</b>.</li>
              <li>If unsure, round <b>down</b>.</li>
            </ol>
          </details>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>Safe tee distance (yards)</h2>
          <p style={styles.p}>
            Distance you can hit off the tee while keeping the ball in play most days (not your max).
          </p>

          <div style={styles.row}>
            <label style={styles.label}>
              Safe tee distance (80–350)
              <input
                type="number"
                inputMode="numeric"
                value={tee}
                onChange={(e) => setTee(Number(e.target.value))}
                style={styles.input}
                min={80}
                max={350}
              />
              <div style={styles.hint}>
                Tip: if you only know your “good” driver distance, use about <b>85%</b> of it.
              </div>
            </label>
          </div>

          <details style={styles.details}>
            <summary style={styles.summary}>Quick estimate (no gadgets)</summary>
            <ul style={styles.ul}>
              <li>Pick the club you use when accuracy matters most off the tee.</li>
              <li>Enter a distance you can repeat and keep in play most days.</li>
              <li>If unsure, round down.</li>
            </ul>
          </details>
        </section>

        <section style={styles.footer}>
          <button
            style={saving ? styles.btnDisabled : styles.btnPrimary}
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {msg && <span style={{ marginLeft: 12, opacity: 0.9 }}>{msg}</span>}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#0b1220",
    minHeight: "100vh",
    color: "#e6e8ee",
    padding: 16,
  },
  shell: { maxWidth: 860, margin: "0 auto" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },

  h1: { margin: 0, fontSize: 24, fontWeight: 900 },
  h2: { margin: "0 0 8px", fontSize: 16, fontWeight: 900 },
  sub: { opacity: 0.85, maxWidth: 740, margin: "6px 0 0", lineHeight: 1.4 },

  link: { color: "#9ecbff", textDecoration: "underline", fontWeight: 900 },

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  p: { opacity: 0.92, lineHeight: 1.4, margin: "8px 0 0" },

  row: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 },
  label: { display: "block", fontWeight: 900, width: "100%" },

  input: {
    marginTop: 6,
    width: "100%",
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.12)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
    outline: "none",
  },

  hint: { marginTop: 6, fontSize: 12, opacity: 0.85, fontWeight: 700 },

  details: { marginTop: 10, opacity: 0.95 },
  summary: { cursor: "pointer", fontWeight: 900, color: "#9ecbff" },

  ol: { paddingLeft: 18, margin: "10px 0 0", lineHeight: 1.55, opacity: 0.92 },
  ul: { paddingLeft: 18, margin: "10px 0 0", lineHeight: 1.55, opacity: 0.92 },

  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 6,
  },

  btnPrimary: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(46, 204, 113, 0.18)",
    color: "#e6e8ee",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },

  btnDisabled: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(230,232,238,0.6)",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "not-allowed",
  },
};
