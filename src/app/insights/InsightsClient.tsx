"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/storage/useSession";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";

type RoundRow = {
  id: string;
  level: string | null;
  holes_count: number | null;
  completed: boolean;
  completed_at: string | null;
  finished_at: string | null;
  started_at: string | null;
};

type SummaryRow = {
  round_id: string;
  strokes?: number | null;
  to_par?: number | null;
  sd_pct?: number | null;
  p3_pct?: number | null;
  putts_lost_total?: number | null;
  strokes_lost_total?: number | null;
};

type MetricKey =
  | "strokes_lost_total"
  | "to_par"
  | "putts_lost_total"
  | "sd_pct";

const METRICS: Array<{
  key: MetricKey;
  title: string;
  subtitle: string;
  better: "down" | "up";
}> = [
  { key: "strokes_lost_total", title: "Strokes lost", subtitle: "Lower is better", better: "down" },
  { key: "to_par", title: "To Par", subtitle: "Lower is better", better: "down" },
  { key: "putts_lost_total", title: "Putts lost", subtitle: "Lower is better", better: "down" },
  { key: "sd_pct", title: "SD%", subtitle: "Higher is better", better: "up" },
];

export default function InsightsClient() {
  const { session, loading, error } = useSession();

  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [summaries, setSummaries] = useState<Map<string, SummaryRow>>(new Map());
  const [msg, setMsg] = useState("");

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
        setMsg("Loading insights…");

        // 1) Finished rounds
        const { data: r, error: rErr } = await supabase
          .from("rounds")
          .select("id, level, holes_count, completed, completed_at, finished_at, started_at")
          .eq("created_by", session.user.id)
          .eq("completed", true)
          .order("completed_at", { ascending: true });

        if (rErr) throw rErr;
        if (cancelled) return;

        const list = (r ?? []) as RoundRow[];
        setRounds(list);

        const ids = list.map((x) => x.id);
        if (!ids.length) {
          setSummaries(new Map());
          setMsg("No finished rounds yet.");
          return;
        }

        // 2) Summaries for those rounds
        const { data: s, error: sErr } = await supabase
          .from("round_summaries")
          .select("round_id, strokes, to_par, sd_pct, p3_pct, putts_lost_total, strokes_lost_total")
          .in("round_id", ids);

        if (sErr) {
          // Don’t hard fail — insights can still show “no summary data”
          setSummaries(new Map());
          setMsg("Loaded rounds (no summaries).");
          return;
        }

        const map = new Map<string, SummaryRow>();
        for (const row of (s ?? []) as SummaryRow[]) map.set(row.round_id, row);
        if (cancelled) return;

        setSummaries(map);
        setMsg("Synced");
      } catch (e: any) {
        if (!cancelled) setMsg(`Insights error: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, error, session?.user?.id]);

  const filtered = useMemo(() => {
    const list = rounds
      .map((r) => ({ r, s: summaries.get(r.id) }))
      .filter((x) => !!x.s); // require summaries for trend lines

    if (levelFilter === "All") return list;
    return list.filter((x) => (x.r.level ?? "") === levelFilter);
  }, [rounds, summaries, levelFilter]);

  const seriesByMetric = useMemo(() => {
    const out: Record<MetricKey, number[]> = {
      strokes_lost_total: [],
      to_par: [],
      putts_lost_total: [],
      sd_pct: [],
    };

    for (const { s } of filtered) {
      out.strokes_lost_total.push(numOrNaN(s?.strokes_lost_total));
      out.to_par.push(numOrNaN(s?.to_par));
      out.putts_lost_total.push(numOrNaN(s?.putts_lost_total));
      out.sd_pct.push(numOrNaN(s?.sd_pct));
    }

    // drop NaNs (keep alignment by filtering per metric)
    (Object.keys(out) as MetricKey[]).forEach((k) => {
      out[k] = out[k].filter((v) => Number.isFinite(v));
    });

    return out;
  }, [filtered]);

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
              Using <b>{filtered.length}</b> rounds with summaries.
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={styles.card}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>No data to chart yet.</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Finish a round so it lands in History, and make sure <code>round_summaries</code> is being populated.
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
                    <div style={{ ...styles.badge, ...(dir === "up" ? styles.badgeUp : dir === "down" ? styles.badgeDown : styles.badgeFlat) }}>
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

                  <div style={styles.note}>
                    {rolling ? `Showing ${rolling}-round rolling average.` : "Showing raw values."}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- helpers ----------
function numOrNaN(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
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
  // least squares slope (x = 0..n-1). Returns 0 if insufficient points.
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
  // deadband so tiny noise doesn't flip direction
  const eps = 0.02;
  if (Math.abs(slope) < eps) return "flat";

  // For "down is better", negative slope = improving
  if (better === "down") return slope < 0 ? "up" : "down";

  // For "up is better", positive slope = improving
  return slope > 0 ? "up" : "down";
}
function fmtValue(key: MetricKey, v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (key === "sd_pct") return `${Math.round(v)}%`;
  if (key === "to_par") return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
  return `${Math.round(v)}`;
}
function fmtDelta(key: MetricKey, v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  if (key === "sd_pct") return `${n > 0 ? "+" : ""}${n}%`;
  if (key === "to_par") return `${n > 0 ? "+" : ""}${n}`;
  return `${n > 0 ? "+" : ""}${n}`;
}

// ---------- tiny sparkline ----------
function Sparkline({ values, height }: { values: number[]; height: number }) {
  const w = 320;
  const h = height;
  const pad = 6;

  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return <div style={{ opacity: 0.75, fontSize: 12 }}>Not enough data.</div>;
  }

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
  link: { color: "#9ecbff", textDecoration: "underline", fontWeight: 900 },

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

  note: { marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.35 },
  pre: { whiteSpace: "pre-wrap", background: "#111", color: "#fff", padding: 12, borderRadius: 8, margin: 0 },
};
