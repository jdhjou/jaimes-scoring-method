"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "rolling" | "30d";

const METRICS = [
  { key: "total_strokes_lost", label: "Strokes lost", dir: "asc" as const },
  { key: "putting_lost", label: "Putts lost", dir: "asc" as const },
  { key: "lost_ball_penalty", label: "Lost balls", dir: "asc" as const, displayDiv: 2 },
  { key: "duffed_lost", label: "Duffed shots", dir: "asc" as const },
  { key: "off_tee_lost", label: "Off the tee lost", dir: "asc" as const },
  { key: "approach_lost", label: "Approach lost", dir: "asc" as const },
  { key: "short_game_lost", label: "Short game lost", dir: "asc" as const },
  { key: "bunker_lost", label: "Bunker lost", dir: "asc" as const },
] as const;

const LEVELS = ["All", "Bogey Golf", "Break 80", "Scratch"] as const;
const WINDOWS = [3, 5, 10, 20] as const;

export default function LeaderboardPage() {
  const [mode, setMode] = useState<Mode>("rolling");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("total_strokes_lost");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("All");
  const [windowN, setWindowN] = useState<(typeof WINDOWS)[number]>(5);

  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const metricMeta = useMemo(() => METRICS.find(m => m.key === metric)!, [metric]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const supabase = createClient();
        const levelFilter = level === "All" ? null : level;

        if (mode === "rolling") {
          const { data, error } = await supabase.rpc("get_leaderboard_rolling", {
            metric,
            window_n: windowN,
            level_filter: levelFilter,
          });

          if (error) throw error;
          if (!cancelled) setRows(data ?? []);
        } else {
          // 30d: assumes leaderboard_30d has avg_* columns
          const col =
            metric === "total_strokes_lost" ? "avg_total_strokes_lost" :
            metric === "putting_lost" ? "avg_putting_lost" :
            metric === "lost_ball_penalty" ? "avg_lost_ball_penalty" :
            metric === "duffed_lost" ? "avg_duffed_lost" :
            metric === "off_tee_lost" ? "avg_off_tee_lost" :
            metric === "approach_lost" ? "avg_approach_lost" :
            metric === "short_game_lost" ? "avg_short_game_lost" :
            metric === "bunker_lost" ? "avg_bunker_lost" :
            "avg_total_strokes_lost";

          // If leaderboard_30d has a "level" column, filter it; otherwise remove this filter.
          let q = supabase.from("leaderboard_30d").select("*").order(col, { ascending: true }).limit(100);
          if (levelFilter) q = q.eq("level", levelFilter);

          const { data, error } = await q;
          if (error) throw error;
          if (!cancelled) setRows(data ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load leaderboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [mode, metric, level, windowN]);

  function fmtValue(v: any) {
    if (v == null) return "—";
    const num = Number(v);
    const adjusted = metricMeta.displayDiv ? (num / metricMeta.displayDiv) : num;
    // Lost balls should be integer-ish; others keep 1 decimal
    if (metricMeta.key === "lost_ball_penalty") return `${Math.round(adjusted)}`;
    return adjusted.toFixed(1);
  }

  return (
    <main className="min-h-[100dvh] bg-[#0b1220] text-[#e6e8ee] p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Leaderboard</h1>
            <p className="opacity-80 text-sm mt-1">Sort by any insight metric across all players.</p>
          </div>
          <nav className="text-lg font-bold">
            <Link className="underline mr-4" href="/">Home</Link>
            <Link className="underline" href="/insights">Insights</Link>
          </nav>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm font-semibold">
              Period
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 font-bold"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="rolling">Rolling (last N rounds)</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>

            <label className="text-sm font-semibold">
              Metric
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 font-bold"
                value={metric}
                onChange={(e) => setMetric(e.target.value as any)}
              >
                {METRICS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold">
              Level
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 font-bold"
                value={level}
                onChange={(e) => setLevel(e.target.value as any)}
              >
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>

            <label className={`text-sm font-semibold ${mode === "rolling" ? "" : "opacity-50"}`}>
              Window
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 font-bold disabled:opacity-50"
                value={windowN}
                onChange={(e) => setWindowN(Number(e.target.value) as any)}
                disabled={mode !== "rolling"}
              >
                {WINDOWS.map(n => <option key={n} value={n}>{n} rounds</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {loading ? (
            <div className="p-4 opacity-80">Loading…</div>
          ) : err ? (
            <div className="p-4 text-red-200">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-4 opacity-80">No leaderboard data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left">
                  <th className="p-3 w-16">#</th>
                  <th className="p-3">Player</th>
                  <th className="p-3 w-32">{METRICS.find(m => m.key === metric)?.label}</th>
                  <th className="p-3 w-28">Rounds</th>
                  <th className="p-3 w-44">Last played</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.user_id ?? i} className="border-t border-white/10">
                    <td className="p-3 font-black">{i + 1}</td>
                    <td className="p-3 font-bold">{r.display_name ?? "Player"}</td>
                    <td className="p-3 font-black">{fmtValue(r.value ?? r[Object.keys(r).find(k => k.startsWith("avg_"))!])}</td>
                    <td className="p-3">{r.rounds_counted ?? r.rounds ?? "—"}</td>
                    <td className="p-3 opacity-80">{String(r.last_played_at ?? r.last_played ?? r.latest ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
