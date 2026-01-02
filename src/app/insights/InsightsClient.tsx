"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/storage/useSession";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

import type { Level, RoundState, Weights } from "@/lib/domain/types";
import { makeDefaultHoles } from "@/lib/domain/templates";
import { computeRoundSummary } from "@/lib/domain/scoring";

type RoundMeta = {
  id: string;
  course_id: string | null;
  holes_count: number | null;
  level: string | null;
  scoring_distance: number | null;
  weights: any | null;
  completed: boolean;
  completed_at: string | null;
  finished_at: string | null;
  started_at: string | null;
};

type HoleRow = {
  round_id: string;
  hole_no: number;
  par: number | null;
  stroke_index: number | null;
  strokes: number | null;
  putts: number | null;
  reached_sd: boolean | null;
  oopsies: any | null; // expects { lostBall: number, bunker: number, duffed: number }
};

type MetricKey =
  | "strokesLostTotal"
  | "toPar"
  | "puttsLostTotal"
  | "sdPct"
  | "npirPct"
  | "p3Pct"
  | "lostBalls"
  | "duffedShots";

const METRICS: Array<{
  key: MetricKey;
  title: string;
  subtitle: string;
  better: "down" | "up";
}> = [
  { key: "strokesLostTotal", title: "Strokes lost", subtitle: "Lower is better", better: "down" },
  { key: "toPar", title: "To Par", subtitle: "Lower is better", better: "down" },
  { key: "puttsLostTotal", title: "Putts lost", subtitle: "Lower is better", better: "down" },
  { key: "sdPct", title: "SD%", subtitle: "Higher is better", better: "up" },
  { key: "npirPct", title: "NPIR%", subtitle: "Lower is better (Not-Puttable-In-Regulation)", better: "down" },
  { key: "p3Pct", title: "Par-3%", subtitle: "Higher is better", better: "up" },
  { key: "lostBalls", title: "Lost balls", subtitle: "Lower is better", better: "down" },
  { key: "duffedShots", title: "Duffed shots", subtitle: "Lower is better", better: "down" },
];

export default function InsightsClient() {
  const { session, loading, error } = useSession();

  const [msg, setMsg] = useState("");
  const [rounds, setRounds] = useState<RoundMeta[]>([]);
  const [holesByRound, setHolesByRound] = useState<Map<string, HoleRow[]>>(new Map());

  const [levelFilter, setLevelFilter] = useState<"All" | "Bogey Golf" | "Break 80" | "Scratch">("All");
  const [rolling, setRolling] = useState<0 | 3 | 5 | 10>(5);

  useEffect(() => {
    if (loading) return;
    if (error || supabaseInitError) return;
    if (!session?.user?.id) return;

    let cancelled = false;

    (async () => {
      try {
        if (!supabase) throw new Error("Supabase client not initialized.");
        setMsg("Loading finished rounds…");

        // finished rounds metadata (oldest -> newest for trend lines)
        const { data: r, error: rErr } = await supabase
          .from("rounds")
          .select("id, course_id, holes_count, level, scoring_distance, weights, completed, completed_at, finished_at, started_at")
          .eq("created_by", session.user.id)
          .eq("completed", true)
          .order("completed_at", { ascending: true });

        if (rErr) throw rErr;
        if (cancelled) return;

        const list = (r ?? []) as RoundMeta[];
        setRounds(list);

        const ids = list.map((x) => x.id);
        if (!ids.length) {
          setHolesByRound(new Map());
          setMsg("No finished rounds yet.");
          return;
        }

        setMsg("Loading holes…");

        // all holes for those rounds (single query)
        const { data: h, error: hErr } = await supabase
          .from("round_holes")
          .select("round_id, hole_no, par, stroke_index, strokes, putts, reached_sd, oopsies")
          .in("round_id", ids)
          .order("round_id", { ascending: true })
          .order("hole_no", { ascending: true });

        if (hErr) throw hErr;
        if (cancelled) return;

        const map = new Map<string, HoleRow[]>();
        for (const row of (h ?? []) as HoleRow[]) {
          const arr = map.get(row.round_id) ?? [];
          arr.push(row);
          map.set(row.round_id, arr);
        }

        setHolesByRound(map);
        setMsg("Synced");
      } catch (e: any) {
        if (!cancelled) setMsg(`Insights error: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, error, session?.user?.id]);

  const points = useMemo(() => {
    const list = rounds.map((rm) => {
      const rows = holesByRound.get(rm.id) ?? [];
      const holesCount = (rm.holes_count === 9 ? 9 : 18) as 9 | 18;

      // Rehydrate RoundState (for computeRoundSummary)
      const holes = makeDefaultHoles(holesCount);

      // Totals for standalone trends
      let lostBalls = 0;
      let duffedShots = 0;

      for (const row of rows) {
        const idx = (row.hole_no ?? 0) - 1;
        if (idx >= 0 && idx < holes.length) {
          holes[idx] = {
            ...holes[idx],
            par: (row.par as any) ?? holes[idx].par,
            strokeIndex: (row.stroke_index as any) ?? holes[idx].strokeIndex,
            strokes: row.strokes ?? undefined,
            putts: row.putts ?? undefined,
            reachedSD: row.reached_sd ?? undefined,
            oopsies: (row.oopsies as any) ?? holes[idx].oopsies,
          };
        }

        const o = (row.oopsies ?? {}) as any;
        lostBalls += safeInt(o.lostBall);
        duffedShots += safeInt(o.duffed);
      }

      const level = (rm.level as Level) ?? "Bogey Golf";
      const weights = (rm.weights as Weights) ?? { bunker: 1, duffed: 1 };

      const round: RoundState = {
        holesCount,
        level,
        scoringDistance: rm.scoring_distance ?? 125,
        weights,
        holes,
      };

      const summary = computeRoundSummary(round);
      const date = rm.completed_at ?? rm.finished_at ?? rm.started_at ?? null;

      return {
        id: rm.id,
        level,
        holesCount,
        date,
        summary,
        lostBalls,
        duffedShots,
      };
    });

    return levelFilter === "All" ? list : list.filter((x) => x.level === levelFilter);
  }, [rounds, holesByRound, levelFilter]);

  const seriesByMetric = useMemo(() => {
    const out: Record<MetricKey, number[]> = {
      strokesLostTotal: [],
      toPar: [],
      puttsLostTotal: [],
      sdPct: [],
      npirPct: [],
      p3Pct: [],
      lostBalls: [],
      duffedShots: [],
    };

    for (const p of points) {
      const s = p.summary as any;

      pushIfFinite(out.strokesLostTotal, s?.strokesLostTotal);
      pushIfFinite(out.toPar, s?.toPar);
      pushIfFinite(out.puttsLostTotal, s?.puttsLostTotal);
      pushIfFinite(out.sdPct, s?.sdPct);
      pushIfFinite(out.npirPct, s?.npirPct);
      pushIfFinite(out.p3Pct, s?.p3Pct);

      // Standalone trends (counts)
      pushIfFinite(out.lostBalls, p.lostBalls);
      pushIfFinite(out.duffedShots, p.duffedShots);
    }

    return out;
  }, [points]);

  // gates
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (error || supabaseInitError) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <h1 style={styles.h1}>Insights</h1>
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
          <h1 style={styles.h1}>Insights</h1>
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
        <div style={styles.top}>
          <h1 style={styles.h1}>Insights</h1>
          <div style={styles.nav}>
            <Link href="/" style={styles.link}>Home</Link>
            <Link href="/history" style={styles.link}>History</Link>
          </div>
        </div>

        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Logged in as <b>{session.user.email}</b>
            <span style={{ marginLeft: 10 }}>• <b>{msg}</b></span>
          </div>

          <div style={styles.controls}>
            <label style={styles.control}>
              <span style={styles.controlLabel}>Level</span>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as any)} style={styles.select}>
                <option>All</option>
                <option>Bogey Golf</option>
                <option>Break 80</option>
                <option>Scratch</option>
              </select>
            </label>

            <label style={styles.control}>
              <span style={styles.controlLabel}>Rolling avg</span>
              <select value={rolling} onChange={(e) => setRolling(Number(e.target.value) as any)} style={styles.select}>
                <option value={0}>Off</option>
                <option value={3}>3 rounds</option>
                <option value={5}>5 rounds</option>
                <option value={10}>10 rounds</option>
              </select>
            </label>

            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Using <b>{points.length}</b> rounds.
            </div>
          </div>
        </div>

        {points.length === 0 ? (
          <div style={styles.card}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>No chartable data yet.</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Finish a round and make sure it has rows in <code>round_holes</code>.
            </div>
          </div>
        ) : (
          <div style={styles.grid}>
            {METRICS.map((m) => {
              const raw = seriesByMetric[m.key];
              const y = rolling ? rollingAvg(raw, rolling) : raw;
              const slope = linearSlope(y);
              const dir = slopeDirection(m.better, slope);

              return (
                <div key={m.key} style={styles.card}>
                  <div style={styles.metricHead}>
                    <div>
                      <div style={styles.metricTitle}>{m.title}</div>
                      <div style={styles.metricSub}>{m.subtitle}</div>
                    </div>
                    <div
                      style={{
                        ...styles.badge,
                        ...(dir === "up" ? styles.badgeUp : dir === "down" ? styles.badgeDown : styles.badgeFlat),
                      }}
                    >
                      {dir === "up" ? "Improving" : dir === "down" ? "Worse" : "Flat"}
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <Sparkline values={y} height={54} />
                  </div>

                  <div style={styles.metricFoot}>
                    <div>
                      <div style={styles.smallLabel}>Latest</div>
                      <div style={styles.bigValue}>{fmtValue(m.key, last(y))}</div>
                    </div>
                    <div>
                      <div style={styles.smallLabel}>Avg</div>
                      <div style={styles.bigValue}>{fmtValue(m.key, avg(y))}</div>
                    </div>
                    <div>
                      <div style={styles.smallLabel}>Δ (last - first)</div>
                      <div style={styles.bigValue}>{fmtDelta(m.key, delta(y))}</div>
                    </div>
                  </div>

                  <div style={styles.note}>{rolling ? `Showing ${rolling}-round rolling average.` : "Showing raw values."}</div>
                </div>
              );
            })}
          </div>
        )}

        {points.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.h2}>Quick jump</h2>
            <div style={styles.list}>
              {points
                .slice()
                .reverse()
                .slice(0, 12)
                .map((p) => (
                  <div key={p.id} style={styles.item}>
                    <Link href={`/?round=${p.id}`} style={{ ...styles.link, textDecoration: "none" }}>
                      {p.id.slice(0, 8)}… • {p.level} • {p.holesCount} holes
                    </Link>
                    <div style={styles.subline}>{fmtDate(p.date)}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- helpers
function safeInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function pushIfFinite(arr: number[], v: any) {
  const n = Number(v);
  if (Number.isFinite(n)) arr.push(n);
}

function last(arr: number[]) {
  return arr.length ? arr[arr.length - 1] : null;
}
function avg(arr: number[]) {
  if (!arr.length) return null;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
function delta(arr: number[]) {
  if (arr.length < 2) return null;
  return arr[arr.length - 1] - arr[0];
}
function rollingAvg(arr: number[], window: number) {
  if (!arr.length || window <= 1) return arr;
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    let cnt = 0;
    for (let j = start; j <= i; j++) {
      sum += arr[j];
      cnt++;
    }
    out.push(sum / cnt);
  }
  return out;
}
function linearSlope(y: number[]) {
  const n = y.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += y[i];
    sumXY += i * y[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
function slopeDirection(better: "down" | "up", slope: number): "up" | "down" | "flat" {
  const eps = 0.02;
  if (Math.abs(slope) < eps) return "flat";
  if (better === "down") return slope < 0 ? "up" : "down";
  return slope > 0 ? "up" : "down";
}

function fmtValue(key: MetricKey, v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  if (key === "sdPct" || key === "npirPct" || key === "p3Pct") return `${n}%`;
  if (key === "toPar") return n > 0 ? `+${n}` : `${n}`;
  return `${n}`;
}
function fmtDelta(key: MetricKey, v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  if (key === "sdPct" || key === "npirPct" || key === "p3Pct") return `${n > 0 ? "+" : ""}${n}%`;
  if (key === "toPar") return `${n > 0 ? "+" : ""}${n}`;
  return `${n > 0 ? "+" : ""}${n}`;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// ---- tiny sparkline
function Sparkline({ values, height }: { values: number[]; height: number }) {
  const w = 320;
  const h = height;
  const pad = 6;

  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ opacity: 0.75, fontSize: 12 }}>Not enough data.</div>;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;

  const pts = clean.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (clean.length - 1);
    const y = pad + ((max - v) * (h - pad * 2)) / span;
    return `${x},${y}`;
  });

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { background: "#0b1220", minHeight: "100vh", color: "#e6e8ee", padding: 16 },
  shell: { maxWidth: 1100, margin: "0 auto" },

  top: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" },
  nav: { display: "flex", gap: 12, flexWrap: "wrap" },

  h1: { margin: 0, fontSize: 26, fontWeight: 900 },
  h2: { margin: "0 0 10px", fontSize: 16, fontWeight: 900 },

  link: { color: "#9ecbff", textDecoration: "underline", fontWeight: 900 },
  subline: { fontSize: 12, opacity: 0.8, marginTop: 6 },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 },

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  controls: { display: "flex", gap: 12, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" },
  control: { display: "flex", flexDirection: "column", gap: 6 },
  controlLabel: { fontSize: 12, opacity: 0.85, fontWeight: 900 },
  select: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.12)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
  },

  metricHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  metricTitle: { fontWeight: 900, fontSize: 16 },
  metricSub: { fontSize: 12, opacity: 0.8, marginTop: 2 },

  metricFoot: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 10,
    alignItems: "end",
  },
  smallLabel: { fontSize: 11, opacity: 0.8, fontWeight: 900 },
  bigValue: { fontSize: 18, fontWeight: 900, marginTop: 2 },

  badge: { padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, border: "1px solid rgba(255,255,255,0.18)" },
  badgeUp: { background: "rgba(46, 204, 113, 0.18)" },
  badgeDown: { background: "rgba(231, 76, 60, 0.18)" },
  badgeFlat: { background: "rgba(255,255,255,0.08)" },

  list: { display: "flex", flexDirection: "column", gap: 10 },
  item: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    padding: 10,
    background: "rgba(0,0,0,0.15)",
  },

  note: { marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.35 },
  pre: { whiteSpace: "pre-wrap", background: "#111", color: "#fff", padding: 12, borderRadius: 8, margin: 0 },
};
