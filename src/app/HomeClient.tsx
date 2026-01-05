"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import type { CourseTemplate, Level, RoundState } from "@/lib/domain/types";
import {
  allowedShotsToSD,
  computeRoundSummary,
  holeStrokesLost,
  puttingLost,
  targetAfterSD,
} from "@/lib/domain/scoring";
import {
  applyTemplateToNewRound,
  makeDefaultHoles,
  resetRoundKeepCourse,
} from "@/lib/domain/templates";
import { sanitizeName } from "@/lib/utils/sanitize";

import { useSession } from "@/lib/storage/useSession";
import { supabase, supabaseInitError } from "@/lib/storage/supabaseClient";
import {
  createRound,
  createTemplateFromRound,
  deleteTemplate,
  fetchLatestRound,
  fetchRoundById,
  fetchTemplates,
  upsertRound,
} from "@/lib/storage/remoteSupabase";

// Added Goal column after SI, Missed 6ft after Putts
const COLS = "34px 70px 70px 70px 90px 80px 90px 260px 120px 1fr";

function defaultRound(holesCount: 9 | 18): RoundState {
  return {
    holesCount,
    level: "Bogey Golf",
    scoringDistance: 125,
    weights: { bunker: 1, duffed: 1 },
    holes: makeDefaultHoles(holesCount),
  };
}

/**
 * Goal score per hole
 * SI 1 = hardest, SI 18 = easiest
 *
 * Scratch: Par
 * Bogey Golf: Par + 1 (every hole)
 * Break 80: Par + 1 on HIGH SI holes (10–18), otherwise Par
 */
function goalScore(level: Level, par: number, strokeIndex: number): number {
  if (level === "Scratch") return par;
  if (level === "Bogey Golf") return par + 1;
  return par + (strokeIndex >= 10 ? 1 : 0);
}

export default function HomeClient() {
  const searchParams = useSearchParams();
  const roundParam = searchParams.get("round");

  const { session, profile, loading, error } = useSession();
  const router = useRouter();

  const [round, setRound] = useState<RoundState>(() => defaultRound(18));
  const [templates, setTemplates] = useState<CourseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  const [roundId, setRoundId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);

  const [syncMsg, setSyncMsg] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);

  const hydrated = useRef(false);
  const loadingFromDb = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const summary = useMemo(() => computeRoundSummary(round), [round]);

  // Load templates + latest round once logged in
  useEffect(() => {
    if (!session?.user?.id) return;
    if (loadingFromDb.current) return;
    if (supabaseInitError) return;

    loadingFromDb.current = true;

    (async () => {
      try {
        setSyncMsg("Loading from database…");

        const t = await fetchTemplates();
        setTemplates(t);

        // 👉 If URL specifies a round, load it
        if (roundParam) {
          const loaded = await fetchRoundById(roundParam);
          if (loaded) {
            setRound(loaded.round);
            setRoundId(loaded.roundId);
            setCourseId(loaded.courseId);
            setIsCompleted(loaded.completed);
            hydrated.current = true;
            setSyncMsg("Loaded from history");
            return;
          }
        }

        // 👉 Otherwise load latest round (existing behavior)
        const latest = await fetchLatestRound();

        if (latest) {
          if (!supabase) throw new Error("Supabase client not initialized.");

          const { data, error: qErr } = await supabase
            .from("rounds")
            .select("completed")
            .eq("id", latest.roundId)
            .single();

          if (qErr) throw qErr;

          const completed = !!data?.completed;

          // ✅ If latest is finished, automatically start a fresh round (keep course)
          if (completed) {
            const next = resetRoundKeepCourse(latest.round);
            const id = await createRound(next, latest.courseId ?? null);
            setRound(next);
            setRoundId(id);
            setCourseId(latest.courseId ?? null);
            setIsCompleted(false);
            setSyncMsg("Started new round");
          } else {
            setRound(latest.round);
            setRoundId(latest.roundId);
            setCourseId(latest.courseId);
            setIsCompleted(false);
          }

          hydrated.current = true;
        } else {
          const base = defaultRound(18);
          const id = await createRound(base, null);
          setRound(base);
          setRoundId(id);
          setCourseId(null);
          setIsCompleted(false);

          hydrated.current = true;
        }
      } catch (e: any) {
        setSyncMsg(`Load error: ${e?.message ?? String(e)}`);
      } finally {
        loadingFromDb.current = false;
      }
    })();
  }, [session?.user?.id, roundParam]);

  // Autosave to DB (debounced)
  useEffect(() => {
    if (!session?.user?.id) return;
    if (!hydrated.current) return;
    if (!roundId) return;
    if (isCompleted) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      try {
        setSyncMsg("Saving…");
        await upsertRound(roundId, round, courseId);
        setSyncMsg("Synced");
      } catch (e: any) {
        setSyncMsg(`Save error: ${e?.message ?? String(e)}`);
      }
    }, 400);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [session?.user?.id, round, roundId, courseId, isCompleted]);

  function setLevel(level: Level) {
    if (isCompleted) return;
    setRound((r) => ({ ...r, level }));
  }

  function setHolesCount(holesCount: 9 | 18) {
    if (isCompleted) return;
    setRound((r) => {
      const holes = makeDefaultHoles(holesCount);
      const existing = r.holes.slice(0, holesCount);
      const merged = holes.map((h, i) => ({
        ...h,
        ...(existing[i]
          ? {
              par: existing[i].par,
              strokeIndex: existing[i].strokeIndex,
              strokes: existing[i].strokes,
              putts: existing[i].putts,
              missedPutts6ft: existing[i].missedPutts6ft,
              reachedSD: existing[i].reachedSD,
              oopsies: existing[i].oopsies,
            }
          : {}),
      }));
      return { ...r, holesCount, holes: merged };
    });
  }

  function updateHole(
    idx: number,
    patch: Partial<RoundState["holes"][number]>,
  ) {
    if (isCompleted) return;
    setRound((r) => ({
      ...r,
      holes: r.holes.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  }

  function updateOops(
    idx: number,
    key: "lostBall" | "bunker" | "duffed",
    v: number,
  ) {
    if (isCompleted) return;
    setRound((r) => ({
      ...r,
      holes: r.holes.map((h, i) =>
        i === idx ? { ...h, oopsies: { ...h.oopsies, [key]: v } } : h,
      ),
    }));
  }

  async function newRoundKeepCourse() {
    try {
      setSyncMsg("Creating new round…");
      const next = resetRoundKeepCourse(round);
      const id = await createRound(next, courseId);
      setRound(next);
      setRoundId(id);
      setIsCompleted(false);
      setSyncMsg("Synced");
      router.push("/"); // stay home
    } catch (e: any) {
      setSyncMsg(`New round error: ${e?.message ?? String(e)}`);
    }
  }

  async function finishRound() {
    if (!roundId) return;

    const ok = window.confirm("Finish this round? It will move to History.");
    if (!ok) return;

    try {
      if (!supabase) throw new Error("Supabase client not initialized.");
      setSyncMsg("Finishing…");
      const now = new Date().toISOString();

      const { error: uErr } = await supabase
        .from("rounds")
        .update({
          completed: true,
          completed_at: now,
          finished_at: now,
        })
        .eq("id", roundId);

      if (uErr) throw uErr;

      setIsCompleted(true);
      setSyncMsg("Finished ✓");
      router.push("/history");
    } catch (e: any) {
      setSyncMsg(`Finish error: ${e?.message ?? String(e)}`);
    }
  }

  async function saveCurrentTemplate() {
    if (isCompleted) return;
    const name = sanitizeName(templateName);
    if (!name) return;

    try {
      setSyncMsg("Saving template…");
      const created = await createTemplateFromRound(name, round, "private");
      const next = await fetchTemplates();
      setTemplates(next);
      setSelectedTemplateId(created.id);
      setTemplateName("");
      setSyncMsg("Synced");
    } catch (e: any) {
      setSyncMsg(`Template error: ${e?.message ?? String(e)}`);
    }
  }

  function loadTemplate(id: string) {
    if (isCompleted) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;

    setRound((r) =>
      applyTemplateToNewRound(t, {
        level: r.level,
        scoringDistance: r.scoringDistance,
        weights: r.weights,
      }),
    );

    setSelectedTemplateId(id);
    setCourseId(id);
  }

  async function removeTemplate(id: string) {
    if (isCompleted) return;
    try {
      setSyncMsg("Deleting template…");
      await deleteTemplate(id);
      const next = await fetchTemplates();
      setTemplates(next);
      if (selectedTemplateId === id) setSelectedTemplateId("");
      setSyncMsg("Synced");
    } catch (e: any) {
      setSyncMsg(`Delete error: ${e?.message ?? String(e)}`);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  // --- Render gates ---
  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (error || supabaseInitError) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <h1>Runtime / config error</h1>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#111",
            color: "#fff",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {String(error ?? supabaseInitError)}
        </pre>
        <p style={{ marginTop: 12 }}>
          <Link href="/login">Go to login</Link>
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 8 }}>Jaime's Scoring Method</h1>
        <p style={{ opacity: 0.85, lineHeight: 1.4 }}>
          You need to log in to save rounds and templates to the database.
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
        {/* NAV */}
        <nav style={styles.nav}>
          <div style={styles.brand}>Jaime's Scoring Method</div>
          <div style={styles.navLinks}>
            <Link href="/" style={styles.navLink}>
              Home
            </Link>
            <Link href="/history" style={styles.navLink}>
              History
            </Link>
            <Link href="/insights" style={styles.navLink}>
              Insights
            </Link>
            <Link href="/leaderboard" style={styles.navLink}>
              Leaderboard
            </Link>
            <Link href="/settings" style={styles.navLink}>
              Settings
            </Link>
            <button
              style={styles.navBtn}
              onClick={newRoundKeepCourse}
              title="Start a new round"
            >
              New round
            </button>
          </div>
        </nav>

        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>Jaime's Scoring Method</h1>
            <p style={styles.sub}>
              SD goals are automatic by <b>Level + SI</b>. Lost ball ={" "}
              <b>2 strokes</b>. Putting lost = <b>max(0, putts−2)</b>.
            </p>

            <div style={styles.kpis}>
              <span>
                <b>Strokes:</b> {summary.strokes ?? "—"}
              </span>
              <span>
                <b>To Par:</b>{" "}
                {summary.toPar == null
                  ? "—"
                  : summary.toPar > 0
                    ? `+${summary.toPar}`
                    : summary.toPar}
              </span>
              <span>
                <b>SD%:</b> {summary.sdPct != null ? `${summary.sdPct}%` : "—"}
              </span>
              <span>
                <b>NPIR%:</b> {summary.npirPct != null ? `${summary.npirPct}%` : "—"}
              </span>
              <span>
                <b>Par-3%:</b>{" "}
                {summary.p3Pct != null ? `${summary.p3Pct}%` : "—"}
              </span>
              <span>
                <b>Putts lost:</b> {summary.puttsLostTotal}
              </span>
              <span>
                <b>Missed 6ft:</b> {summary.missedPutts6ftTotal} ({summary.missedPutts6ftPct != null ? `${summary.missedPutts6ftPct}%` : "—"})
              </span>
              <span>
                <b>Strokes lost:</b> {summary.strokesLostTotal}
              </span>
            </div>

            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
              Logged in as: <b>{profile?.username ?? session.user.email}</b> •{" "}
              <button style={styles.linkBtn} onClick={signOut}>
                Sign out
              </button>
              <span style={{ marginLeft: 10 }}>
                • <b>{syncMsg}</b>
              </span>
              {isCompleted && (
                <span style={{ marginLeft: 10, opacity: 0.9 }}>
                  • <b>Round finished</b>
                </span>
              )}
            </div>
          </div>

          <div style={styles.actions}>
            <select
              value={round.level}
              onChange={(e) => setLevel(e.target.value as Level)}
              style={styles.selectTop}
              disabled={isCompleted}
            >
              <option>Bogey Golf</option>
              <option>Break 80</option>
              <option>Scratch</option>
            </select>

            <select
              value={round.holesCount}
              onChange={(e) => setHolesCount(Number(e.target.value) as 9 | 18)}
              style={styles.selectTop}
              disabled={isCompleted}
            >
              <option value={9}>9 holes</option>
              <option value={18}>18 holes</option>
            </select>

            <button style={styles.btn} onClick={newRoundKeepCourse}>
              New round
            </button>

            <button
              style={isCompleted ? styles.btnDisabled : styles.btnPrimary}
              onClick={finishRound}
              disabled={!roundId || isCompleted}
              title={isCompleted ? "This round is finished" : "Finish this round"}
            >
              {isCompleted ? "Finished ✓" : "Finish round"}
            </button>
          </div>
        </header>

        <section style={styles.card}>
          <h2 style={styles.h2}>Course templates (database)</h2>

          <div style={styles.templateRow}>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedTemplateId(id);
                if (id) loadTemplate(id);
              }}
              style={styles.selectWide}
              disabled={isCompleted}
            >
              <option value="">Load a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.holesCount})
                </option>
              ))}
            </select>

            <button
              style={styles.btnDanger}
              onClick={() =>
                selectedTemplateId && removeTemplate(selectedTemplateId)
              }
              disabled={!selectedTemplateId || isCompleted}
            >
              Delete
            </button>
          </div>

          <div style={styles.templateRow}>
            <input
              style={styles.inputTop}
              placeholder="Template name (e.g., Patty Jewett)"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={isCompleted}
            />
            <button
              style={styles.btn}
              onClick={saveCurrentTemplate}
              disabled={isCompleted || !sanitizeName(templateName)}
            >
              Save current as template
            </button>
          </div>

          <div style={styles.smallNote}>
            Loading a template sets the round’s <b>course_id</b> and resets
            strokes/putts/oopsies/SD.
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.h2}>How This System Works</h2>
          <div style={styles.explanationText}>
            <p>
              This app is built around one simple idea: <b>your score is the only thing that matters</b>. Traditional stats like fairways and GIR are helpful, but they don't always explain why you're shooting the scores you shoot. This system measures <b>strokes lost</b> instead — identifying where shots are actually costing you strokes relative to a realistic target for your skill level.
            </p>
            <p style={{ marginTop: 12 }}>
              Every hole is broken into phases:
            </p>
            <ul style={styles.explanationList}>
              <li><b>Tee / Long Game</b></li>
              <li><b>Approach & Recovery</b></li>
              <li><b>Putting</b></li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Instead of tracking every shot, you only record the information that directly affects scoring. Misses, duffs, lost balls, and poor putting are weighted more heavily than cosmetic stats. A green in regulation only matters if it results in a realistic chance to hole a putt.
            </p>
            <p style={{ marginTop: 12 }}>
              Over time, the app shows clear trends — not just round summaries — so you can see what's improving, what's getting worse, and what's truly holding your scores back.
            </p>
          </div>

          <h2 style={{ ...styles.h2, marginTop: 24 }}>How to Use the App</h2>
          <ol style={styles.ol}>
            <li style={{ marginBottom: 12 }}>
              <b>Start a Round</b>
              <ul style={{ ...styles.explanationList, marginTop: 6, marginLeft: 20 }}>
                <li>Select a course (or use a saved template).</li>
                <li>Choose your scoring level (Bogey Golf, Break 80, Scratch).</li>
                <li>The app automatically sets realistic shot targets based on hole difficulty.</li>
              </ul>
            </li>
            <li style={{ marginBottom: 12 }}>
              <b>Enter Hole Results</b>
              <div style={{ marginTop: 6, marginLeft: 20 }}>
                For each hole, record:
                <ul style={{ ...styles.explanationList, marginTop: 6 }}>
                  <li>Total strokes</li>
                  <li>Putts</li>
                  <li>Lost balls (each counts as 2 strokes lost)</li>
                  <li>Any major mis-strikes (duffs, punch-outs, forced recoveries)</li>
                </ul>
                You do not need to log every shot — only what impacted your score.
              </div>
            </li>
            <li style={{ marginBottom: 12 }}>
              <b>Smart Scoring Logic</b>
              <ul style={{ ...styles.explanationList, marginTop: 6, marginLeft: 20 }}>
                <li>Putting strokes lost are calculated as: <code style={styles.code}>max(0, putts − 2)</code></li>
                <li>Once you reach your expected scoring distance, the hole is treated like a par-3 finish.</li>
                <li>Greens, fringes, or short fairway positions count the same as long as the ball is puttable.</li>
              </ul>
            </li>
            <li style={{ marginBottom: 12 }}>
              <b>Review Your Results</b>
              <div style={{ marginTop: 6, marginLeft: 20 }}>
                After each round, you'll see:
                <ul style={{ ...styles.explanationList, marginTop: 6 }}>
                  <li>Total strokes lost</li>
                  <li>Breakdown by tee shots, ball striking, short game, and putting</li>
                  <li>Trends over time (lost balls, duffed shots, putting performance)</li>
                </ul>
                This makes it easy to answer: <b>"What would drop my score the fastest?"</b>
              </div>
            </li>
          </ol>

          <h2 style={{ ...styles.h2, marginTop: 24 }}>Why This Is Different</h2>
          <div style={styles.explanationText}>
            <ul style={styles.explanationList}>
              <li><b>No vanity stats</b></li>
              <li><b>No excessive shot tracking</b></li>
              <li><b>No pretending a bad shot was "fine"</b></li>
            </ul>
            <p style={{ marginTop: 12 }}>
              Just honest feedback, clear trends, and actionable insight — so practice time actually lowers your scores.
            </p>
          </div>
        </section>

        {/* TABLE (horizontally scrollable region) */}
        <section style={styles.table}>
          <div style={styles.tableScroll} role="region" aria-label="Scoring table">
            <div style={styles.tableInner}>
              <div style={{ ...styles.head, gridTemplateColumns: COLS }}>
                <div>#</div>
                <div>Par</div>
                <div>SI</div>
                <div>Goal</div>
                <div>Stk</div>
                <div>Putts</div>
                <div>Missed 6ft</div>
                <div>Reached SD</div>
                <div>Stk loss</div>
                <div>Oopsies</div>
              </div>

              {round.holes.slice(0, round.holesCount).map((h, i) => {
              const allow = allowedShotsToSD(round.level, h);
              const tgt = targetAfterSD(h);
              const lost = holeStrokesLost(h, round.weights);
              const goal = goalScore(round.level, h.par, h.strokeIndex);

              return (
                <div key={h.n} style={{ ...styles.row, gridTemplateColumns: COLS }}>
                  <div style={styles.cellNum}>{h.n}</div>

                  <select
                    value={h.par}
                    onChange={(e) =>
                      updateHole(i, { par: Number(e.target.value) as 3 | 4 | 5 })
                    }
                    style={styles.selectCell}
                    disabled={isCompleted}
                  >
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>

                  <select
                    value={h.strokeIndex}
                    onChange={(e) =>
                      updateHole(i, { strokeIndex: Number(e.target.value) })
                    }
                    style={styles.selectCell}
                    disabled={isCompleted}
                  >
                    {Array.from({ length: 18 }, (_, n) => (
                      <option key={n + 1} value={n + 1}>
                        {n + 1}
                      </option>
                    ))}
                  </select>

                  <div style={styles.goalCell}>
                    <b>{goal}</b>
                    <div style={styles.goalSub}>
                      {round.level === "Scratch"
                        ? "Par"
                        : round.level === "Bogey Golf"
                          ? "Par+1"
                          : h.strokeIndex >= 10
                            ? "Par+1"
                            : "Par"}
                    </div>
                  </div>

                  <select
                    value={h.strokes ?? ""}
                    onChange={(e) =>
                      updateHole(i, {
                        strokes:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    style={styles.selectCell}
                    disabled={isCompleted}
                  >
                    <option value="">—</option>
                    {Array.from({ length: 21 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <select
                    value={h.putts ?? ""}
                    onChange={(e) =>
                      updateHole(i, {
                        putts:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    style={styles.selectCell}
                    disabled={isCompleted}
                  >
                    <option value="">—</option>
                    {Array.from({ length: 11 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <select
                    value={h.missedPutts6ft ?? ""}
                    onChange={(e) =>
                      updateHole(i, {
                        missedPutts6ft:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    style={styles.selectCell}
                    disabled={isCompleted}
                    title="Number of missed putts within 6 feet"
                  >
                    <option value="">—</option>
                    {Array.from({ length: 6 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  <div style={styles.sdCell}>
                    {h.par === 3 ? (
                      <div style={styles.sdText}>
                        Par 3 target <b>{tgt}</b>
                        <div style={styles.sdSub}>
                          {h.strokeIndex <= 9
                            ? "SI 1–9 ⇒ treat as Par 4"
                            : "SI 10–18 ⇒ Par 3"}
                        </div>
                      </div>
                    ) : (
                      <label style={styles.sdLabel}>
                        <input
                          type="checkbox"
                          checked={h.reachedSD === true}
                          onChange={(e) =>
                            updateHole(i, { reachedSD: e.target.checked })
                          }
                          disabled={isCompleted}
                        />
                        <span>≤ {allow} shots</span>
                      </label>
                    )}
                  </div>

                  <div style={styles.lostCell}>
                    {lost}
                    <div style={styles.lostSub}>
                      3-putt+: {puttingLost(h.putts)}
                    </div>
                  </div>

                  <div style={styles.oopsiesCell}>
                    <select
                      value={h.oopsies.lostBall}
                      onChange={(e) =>
                        updateOops(i, "lostBall", Number(e.target.value))
                      }
                      style={styles.selectOops}
                      disabled={isCompleted}
                    >
                      {Array.from({ length: 7 }, (_, n) => (
                        <option key={n} value={n}>
                          Lost {n}
                        </option>
                      ))}
                    </select>

                    <select
                      value={h.oopsies.bunker}
                      onChange={(e) =>
                        updateOops(i, "bunker", Number(e.target.value))
                      }
                      style={styles.selectOops}
                      disabled={isCompleted}
                    >
                      {Array.from({ length: 7 }, (_, n) => (
                        <option key={n} value={n}>
                          Bunk {n}
                        </option>
                      ))}
                    </select>

                    <select
                      value={h.oopsies.duffed}
                      onChange={(e) =>
                        updateOops(i, "duffed", Number(e.target.value))
                      }
                      style={styles.selectOops}
                      disabled={isCompleted}
                    >
                      {Array.from({ length: 7 }, (_, n) => (
                        <option key={n} value={n}>
                          Duff {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
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
    overflowX: "hidden", // prevent page-level sideways drift on mobile
    position: "relative",
    width: "100%",
    maxWidth: "100vw",
  },
  shell: { maxWidth: 1200, margin: "0 auto" },

  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  brand: { fontWeight: 900, fontSize: 14, opacity: 0.95 },
  navLinks: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  navLink: {
    color: "#9ecbff",
    textDecoration: "underline",
    fontWeight: 900,
    fontSize: 13,
  },
  navBtn: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.10)",
    color: "#e6e8ee",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 13,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  h1: { margin: 0, fontSize: 24 },
  h2: { margin: "0 0 8px", fontSize: 16 },
  sub: { opacity: 0.85, maxWidth: 900, margin: "6px 0 10px" },

  kpis: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    opacity: 0.92,
  },

  actions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#9ecbff",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
    fontSize: 12,
  },

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  table: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    overflow: "hidden", // keep rounded corners
  },

  // actual horizontal scrolling happens here (inside the rounded container)
  tableScroll: {
    width: "100%",
    overflowX: "auto", // Horizontal scroll for columns
    overflowY: "visible", // Allow content to expand vertically - page handles scrolling
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-x pan-y", // Allow both horizontal and vertical scrolling
    msOverflowStyle: "-ms-autohiding-scrollbar",
    scrollbarWidth: "thin",
    position: "relative",
    overscrollBehaviorX: "contain",
  },
  
  // Inner wrapper to ensure content width is recognized
  tableInner: {
    display: "block", // Block display to allow vertical expansion
    minWidth: "max-content",
    width: "max-content",
    // No height constraint - let content determine height
  },

  head: {
    display: "grid",
    background: "rgba(0,0,0,0.3)",
    padding: "10px 12px",
    fontWeight: 800,
    gap: 8,
    alignItems: "center",
    gridTemplateColumns: COLS,
    width: "max-content",
  },

  row: {
    display: "grid",
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    alignItems: "center",
    gap: 8,
    gridTemplateColumns: COLS,
    width: "max-content",
  },

  cellNum: { fontWeight: 900 },

  selectTop: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.12)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 800,
  },

  selectWide: {
    flex: 1,
    minWidth: 260,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.12)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 800,
  },

  inputTop: {
    flex: 1,
    minWidth: 260,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.12)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 800,
    outline: "none",
  },

  btn: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.10)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
  },

  btnPrimary: {
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(46, 204, 113, 0.18)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
  },

  btnDisabled: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(230,232,238,0.6)",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "not-allowed",
  },

  btnDanger: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(231, 76, 60, 0.18)",
    color: "#e6e8ee",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 900,
    cursor: "pointer",
  },

  templateRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  smallNote: { fontSize: 12, opacity: 0.85, marginTop: 2, lineHeight: 1.35 },
  ol: { paddingLeft: 18, lineHeight: 1.55, margin: 0 },
  explanationText: { 
    fontSize: 14, 
    lineHeight: 1.6, 
    opacity: 0.92,
    marginTop: 8,
  },
  explanationList: {
    listStyle: "disc",
    paddingLeft: 20,
    marginTop: 8,
    lineHeight: 1.6,
    fontSize: 14,
    opacity: 0.92,
  },
  code: {
    background: "rgba(255,255,255,0.1)",
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 13,
  },

  selectCell: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.14)",
    color: "#e6e8ee",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 900,
  },

  goalCell: { fontWeight: 900 },
  goalSub: { fontSize: 12, opacity: 0.78, marginTop: 2, fontWeight: 700 },

  sdCell: { minWidth: 0 },
  sdLabel: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontWeight: 900,
    flexWrap: "wrap",
  },
  sdText: { fontSize: 13, lineHeight: 1.2 },
  sdSub: { fontSize: 12, opacity: 0.8, marginTop: 4 },

  lostCell: { textAlign: "left", fontWeight: 900 },
  lostSub: { fontSize: 12, opacity: 0.82, fontWeight: 700, marginTop: 2 },

  oopsiesCell: { display: "flex", gap: 8, flexWrap: "wrap" },
  selectOops: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.18)",
    color: "#e6e8ee",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 900,
  },
};
