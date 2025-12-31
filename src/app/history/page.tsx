"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/storage/useSession";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

type RoundRow = {
  id: string;
  course_id: string | null;
  holes_count: number | null;
  level: string | null;
  started_at: string | null;
  finished_at: string | null;
  completed: boolean;
  completed_at: string | null;
};

type RoundSummaryRow = {
  round_id: string;
  strokes?: number | null;
  to_par?: number | null;
  sd_pct?: number | null;
  p3_pct?: number | null;
  putts_lost_total?: number | null;
  strokes_lost_total?: number | null;
};

export default function HistoryPage() {
  const { session, loading, error } = useSession();

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [summaries, setSummaries] = useState<Map<string, RoundSummaryRow>>(new Map());
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (error || supabaseInitError) return;
    if (!session?.user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        if (!supabase) throw new Error("Supabase client not initialized.");
        setMsg("Loading history…");

        const { data: r, error: rErr } = await supabase
          .from("rounds")
          .select("id, course_id, holes_count, level, started_at, finished_at, completed, completed_at")
          .eq("created_by", session.user.id)
          .order("started_at", { ascending: false });

        if (rErr) throw rErr;
        const list = (r ?? []) as RoundRow[];
        if (cancelled) return;

        setRounds(list);

        const finishedIds = list.filter((x) => x.completed).map((x) => x.id);
        if (!finishedIds.length) {
          setSummaries(new Map());
          setMsg("Synced");
          return;
        }

        // Optional summaries (if table exists). If it errors, we just hide leaderboard/metrics.
        const { data: s, error: sErr } = await supabase
          .from("round_summaries")
          .select("round_id, strokes, to_par, sd_pct, p3_pct, putts_lost_total, strokes_lost_total")
          .in("round_id", finishedIds);

        if (sErr) {
          setSummaries(new Map());
          setMsg("Synced (no summaries)");
          return;
        }

        const map = new Map<string, RoundSummaryRow>();
        for (const row of (s ?? []) as RoundSummaryRow[]) map.set(row.round_id, row);
        if (cancelled) return;

        setSummaries(map);
        setMsg("Synced");
      } catch (e: any) {
        if (!cancelled) setMsg(`History error: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, error, session?.user?.id]);

  const inProgress = useMemo(() => rounds.filter((r) => !r.completed), [rounds]);
  const finished = useMemo(() => rounds.filter((r) => r.completed), [rounds]);

  const leaderboard = useMemo(() => {
    return finished
      .map((r) => ({ r, s: summaries.get(r.id) }))
      .filter((x) => x.s && x.s.strokes_lost_total != null)
      .sort((a, b) => {
        const asl = a.s!.strokes_lost_total ?? 9999;
        const bsl = b.s!.strokes_lost_total ?? 9999;
        if (asl !== bsl) return asl - bsl;

        const atp = a.s!.to_par ?? 9999;
        const btp = b.s!.to_par ?? 9999;
        if (atp !== btp) return atp - btp;

        return (b.r.completed_at ?? "").localeCompare(a.r.completed_at ?? "");
      })
      .slice(0, 10);
  }, [finished, summaries]);

  // gates
  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (error || supabaseInitError) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <h1 style={styles.h1}>History</h1>
          <div style={styles.card}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Runtime / config error</div>
            <pre style={styles.pre}>{String(error ?? supabaseInitError)}</pre>
            <div style={{ marginTop: 10 }}>
              <Link href="/" style={styles.link}>← Back</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <h1 style={styles.h1}>History</h1>
          <div style={styles.card}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>You’re not logged in.</div>
            <Link href="/login" style={styles.link}>Go to login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h1 style={styles.h1}>History</h1>
          <Link href="/" style={styles.link}>← Back to scoring</Link>
        </div>

        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Logged in as <b>{session.user.email}</b>
            <span style={{ marginLeft: 10 }}>• <b>{msg}</b></span>
          </div>
        </div>

        {leaderboard.length > 0 && (
          <section style={styles.card}>
            <h2 style={styles.h2}>Leaderboard (best finished rounds)</h2>
            <div style={styles.table}>
              <div style={{ ...styles.thead, gridTemplateColumns: "60px 1fr 90px 90px 90px 120px" }}>
                <div>Rank</div>
                <div>Round</div>
                <div>To Par</div>
                <div>Strokes</div>
                <div>Lost</div>
                <div>Date</div>
              </div>
              {leaderboard.map(({ r, s }, idx) => (
                <div key={r.id} style={{ ...styles.trow, gridTemplateColumns: "60px 1fr 90px 90px 90px 120px" }}>
                  <div style={{ fontWeight: 900 }}>{idx + 1}</div>
                  <div>
                    <Link href={`/?round=${r.id}`} style={styles.roundLink}>
                      {shortId(r.id)} • {r.level ?? "—"} • {r.holes_count ?? "—"} holes
                    </Link>
                    <div style={styles.subline}>course_id: {r.course_id ?? "—"}</div>
                  </div>
                  <div>{fmtToPar(s?.to_par)}</div>
                  <div>{s?.strokes ?? "—"}</div>
                  <div><b>{s?.strokes_lost_total ?? "—"}</b></div>
                  <div>{fmtDate(r.completed_at ?? r.finished_at ?? r.started_at)}</div>
                </div>
              ))}
            </div>
            <div style={styles.note}>
              Leaderboard shows only if <code>round_summaries</code> exists and has <code>strokes_lost_total</code>.
            </div>
          </section>
        )}

        <section style={styles.card}>
          <h2 style={styles.h2}>In progress</h2>
          {inProgress.length === 0 ? (
            <div style={styles.empty}>No in-progress rounds.</div>
          ) : (
            <div style={styles.list}>
              {inProgress.map((r) => (
                <div key={r.id} style={styles.item}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>
                      <Link href={`/?round=${r.id}`} style={styles.roundLink}>
                        {shortId(r.id)} • {r.level ?? "—"} • {r.holes_count ?? "—"} holes
                      </Link>
                    </div>
                    <div style={styles.muted}>{fmtDate(r.started_at)}</div>
                  </div>
                  <div style={styles.subline}>course_id: {r.course_id ?? "—"}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>Finished</h2>
          {finished.length === 0 ? (
            <div style={styles.empty}>No finished rounds yet.</div>
          ) : (
            <div style={styles.list}>
              {finished.map((r) => {
                const s = summaries.get(r.id);
                return (
                  <div key={r.id} style={styles.item}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>
                        <Link href={`/?round=${r.id}`} style={styles.roundLink}>
                          {shortId(r.id)} • {r.level ?? "—"} • {r.holes_count ?? "—"} holes
                        </Link>
                      </div>
                      <div style={styles.muted}>{fmtDate(r.completed_at ?? r.finished_at ?? r.started_at)}</div>
                    </div>

                    <div style={styles.subline}>course_id: {r.course_id ?? "—"}</div>

                    {s && (
                      <div style={styles.metrics}>
                        <span><b>To Par:</b> {fmtToPar(s.to_par)}</span>
                        <span><b>Strokes:</b> {s.strokes ?? "—"}</span>
                        <span><b>SD%:</b> {fmtPct(s.sd_pct)}</span>
                        <span><b>P3%:</b> {fmtPct(s.p3_pct)}</span>
                        <span><b>Putts lost:</b> {s.putts_lost_total ?? "—"}</span>
                        <span><b>Strokes lost:</b> {s.strokes_lost_total ?? "—"}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function shortId(id: string) {
  return `${id.slice(0, 8)}…`;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtPct(v?: number | null) {
  if (v == null) return "—";
  return `${Math.round(v)}%`;
}

function fmtToPar(v?: number | null) {
  if (v == null) return "—";
  if (v > 0) return `+${v}`;
  return `${v}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { background: "#0b1220", minHeight: "100vh", color: "#e6e8ee", padding: 16 },
  shell: { maxWidth: 1100, margin: "0 auto" },
  h1: { margin: 0, fontSize: 26, fontWeight: 900 },
  h2: { margin: "0 0 10px", fontSize: 16, fontWeight: 900 },
  link: { color: "#9ecbff", textDecoration: "underline", fontWeight: 800 },
  roundLink: { color: "#e6e8ee", textDecoration: "none" },
  muted: { opacity: 0.85, fontSize: 12 },

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  list: { display: "flex", flexDirection: "column", gap: 10 },
  item: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    padding: 10,
    background: "rgba(0,0,0,0.15)",
  },
  subline: { fontSize: 12, opacity: 0.8, marginTop: 4 },

  metrics: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 12, opacity: 0.95 },
  empty: { fontSize: 13, opacity: 0.85 },

  table: { border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" },
  thead: {
    display: "grid",
    background: "rgba(0,0,0,0.35)",
    padding: "10px 12px",
    fontWeight: 900,
    gap: 10,
    alignItems: "center",
    fontSize: 12,
    opacity: 0.95,
  },
  trow: {
    display: "grid",
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    gap: 10,
    alignItems: "center",
    fontSize: 13,
  },

  pre: { whiteSpace: "pre-wrap", background: "#111", color: "#fff", padding: 12, borderRadius: 8, margin: 0 },
  note: { marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.35 },
};
