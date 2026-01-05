import { getSupabase } from "@/lib/storage/supabaseClient";
import type { CourseTemplate, RoundState } from "@/lib/domain/types";
import { computeRoundSummary } from "@/lib/domain/scoring";
import { makeDefaultHoles } from "@/lib/domain/templates";

/**
 * Load a full round (metadata + holes) by round ID
 */
export async function fetchRoundById(roundId: string): Promise<{
  roundId: string;
  courseId: string | null;
  completed: boolean;
  round: RoundState;
} | null> {
   const sb = getSupabase();
  if (!sb) throw new Error("Supabase client not initialized.");

  // 1) round metadata
  const { data: r, error: rErr } = await sb    .from("rounds")
    .select("id, course_id, holes_count, level, scoring_distance, weights, completed")
    .eq("id", roundId)
    .single();

  if (rErr) throw rErr;
  if (!r) return null;

  const holesCount = (r.holes_count === 9 ? 9 : 18) as 9 | 18;

  // 2) holes
  const { data: holesRows, error: hErr } = await sb
    .from("round_holes")
    .select("hole_no, par, stroke_index, strokes, putts, reached_sd, oopsies")
    .eq("round_id", roundId)
    .order("hole_no", { ascending: true });

  if (hErr) throw hErr;

  // Build a safe default array first
  const holes = makeDefaultHoles(holesCount);

  // Map DB rows into holes array
  for (const row of holesRows ?? []) {
    const idx = (row.hole_no ?? 0) - 1;
    if (idx < 0 || idx >= holes.length) continue;

    holes[idx] = {
      ...holes[idx],
      par: row.par ?? holes[idx].par,
      strokeIndex: row.stroke_index ?? holes[idx].strokeIndex,
      strokes: row.strokes ?? undefined,
      putts: row.putts ?? undefined,
      reachedSD: row.reached_sd ?? undefined,
      oopsies: (row.oopsies as any) ?? holes[idx].oopsies,
    };
  }

  const round: RoundState = {
    holesCount,
    level: (r.level as any) ?? "Bogey Golf",
    scoringDistance: r.scoring_distance ?? 125,
    weights: (r.weights as any) ?? { bunker: 1, duffed: 1 },
    holes,
  };

  return {
    roundId: r.id,
    courseId: r.course_id ?? null,
    completed: !!r.completed,
    round,
  };
}



function lostBallPenaltyTotal(round: RoundState): number {
  const used = round.holes.slice(0, round.holesCount);
  const total = used.reduce((sum, h) => sum + (h.oopsies?.lostBall ?? 0) * 2, 0);
  return Math.round(total * 10) / 10; // keep 1 decimal like other metrics
}

async function upsertRoundSummaryRow(
  sb: ReturnType<typeof getSupabase>,
  roundId: string,
  round: RoundState,
  courseId: string | null
) {
  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const s = computeRoundSummary(round);

  const row = {
    user_id: user.id,
    round_id: roundId,
    course_id: courseId,
    holes: round.holesCount,

    total_strokes_lost: Number(s.strokesLostTotal ?? 0),
    putting_lost: Number(s.puttsLostTotal ?? 0),
    lost_ball_penalty: Number(lostBallPenaltyTotal(round)),
    missed_putts_6ft_total: Number(s.missedPutts6ftTotal ?? 0),
    missed_putts_6ft_pct: s.missedPutts6ftPct ?? null,

    level: round.level,
    scoring_distance: round.scoringDistance,
  };

  const { error } = await sb
    .from("round_summaries")
    .upsert(row, { onConflict: "user_id,round_id" });

  if (error) throw error;
}


/**
 * Fetch all templates visible to the user (private + public)
 */
export async function fetchTemplates(): Promise<CourseTemplate[]> {
  const sb = getSupabase();

  const { data: courses, error } = await sb
    .from("courses")
    .select("id,name,holes_count,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!courses) return [];

  const templates: CourseTemplate[] = [];

  for (const c of courses) {
    const { data: holes, error: holesErr } = await sb
      .from("course_holes")
      .select("hole_no,par,stroke_index")
      .eq("course_id", c.id)
      .order("hole_no");

    if (holesErr) throw holesErr;

    templates.push({
      id: c.id,
      name: c.name,
      holesCount: c.holes_count,
      createdAt: c.created_at,
      holes: (holes ?? []).map((h) => ({
        n: h.hole_no,
        par: h.par,
        strokeIndex: h.stroke_index,
      })),
    });
  }

  return templates;
}

/**
 * Save the current round as a course template
 */
export async function createTemplateFromRound(
  name: string,
  round: RoundState,
  visibility: "private" | "public" = "private"
): Promise<CourseTemplate> {
  const sb = getSupabase();

  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data: course, error } = await sb
    .from("courses")
    .insert({
      name,
      holes_count: round.holesCount,
      created_by: user.id,
      visibility,
    })
    .select()
    .single();

  if (error || !course) throw error;

  const holeRows = round.holes.slice(0, round.holesCount).map((h) => ({
    course_id: course.id,
    hole_no: h.n,
    par: h.par,
    stroke_index: h.strokeIndex,
  }));

  const { error: holesErr } = await sb.from("course_holes").insert(holeRows);
  if (holesErr) throw holesErr;

  return {
    id: course.id,
    name: course.name,
    holesCount: course.holes_count,
    createdAt: course.created_at,
    holes: holeRows.map((h) => ({
      n: h.hole_no,
      par: h.par,
      strokeIndex: h.stroke_index,
    })),
  };
}

/**
 * Delete a course template (owner only via RLS)
 */
export async function deleteTemplate(courseId: string): Promise<void> {
  const sb = getSupabase();

  const { error } = await sb.from("courses").delete().eq("id", courseId);
  if (error) throw error;
}

/**
 * Fetch the most recent round for the current user
 */
export async function fetchLatestRound(): Promise<{
  roundId: string;
  courseId: string | null;
  round: RoundState;
} | null> {
  const sb = getSupabase();

  const user = (await sb.auth.getUser()).data.user;
  if (!user) return null;

  const { data: roundRow, error } = await sb
    .from("rounds")
    .select("*")
    .eq("created_by", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !roundRow) return null;

  const { data: holeRows, error: holesErr } = await sb
    .from("round_holes")
    .select("*")
    .eq("round_id", roundRow.id)
    .order("hole_no");

  if (holesErr) throw holesErr;

  const round: RoundState = {
    holesCount: roundRow.holes_count,
    level: roundRow.level,
    scoringDistance: roundRow.scoring_distance,
    weights: roundRow.weights,
    holes: (holeRows ?? []).map((h) => ({
      n: h.hole_no,
      par: h.par,
      strokeIndex: h.stroke_index,
      strokes: h.strokes ?? undefined,
      putts: h.putts ?? undefined,
      missedPutts6ft: (h as any).missed_putts_6ft ?? undefined,
      reachedSD: h.reached_sd ?? undefined,
      oopsies: h.oopsies,
    })),
  };

  return {
    roundId: roundRow.id,
    courseId: roundRow.course_id,
    round,
  };
}

/**
 * Create a new round
 */
export async function createRound(
  round: RoundState,
  courseId: string | null
): Promise<string> {
  const sb = getSupabase();

  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data: r, error } = await sb
    .from("rounds")
    .insert({
      created_by: user.id,
      course_id: courseId,
      holes_count: round.holesCount,
      level: round.level,
      scoring_distance: round.scoringDistance,
      weights: round.weights,
    })
    .select()
    .single();

  if (error || !r) throw error;

  const holeRows = round.holes.slice(0, round.holesCount).map((h) => ({
    round_id: r.id,
    hole_no: h.n,
    par: h.par,
    stroke_index: h.strokeIndex,
    strokes: h.strokes ?? null,
    putts: h.putts ?? null,
    missed_putts_6ft: h.missedPutts6ft ?? null,
    reached_sd: h.reachedSD ?? null,
    oopsies: h.oopsies,
  }));

  const { error: holesErr } = await sb.from("round_holes").insert(holeRows);
  if (holesErr) throw holesErr;

async function upsertRoundSummaryRow(
  sb: ReturnType<typeof getSupabase>,
  roundId: string,
  round: RoundState,
  courseId: string | null
) {
  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const s: any = computeRoundSummary(round);

  // NOTE: We’ll map exact field names after we peek at scoring.ts (next step).
  const row = {
    user_id: user.id,
    round_id: roundId,
    course_id: courseId,
    holes: round.holesCount,

    // These will be adjusted to match RoundSummary shape:
    total_strokes_lost: Number(s.totalStrokesLost ?? s.total_strokes_lost ?? 0),
    putting_lost: Number(s.puttingLost ?? s.putting_lost ?? 0),
    lost_ball_penalty: Number(s.lostBallPenalty ?? s.lost_ball_penalty ?? 0),

    level: round.level,
    scoring_distance: round.scoringDistance,
  };

  const { error } = await sb
    .from("round_summaries")
    .upsert(row, { onConflict: "user_id,round_id" });

  if (error) throw error;
}

await upsertRoundSummaryRow(sb, r.id, round, courseId);

  return r.id;
}

/**
 * Update an existing round (autosave)
 */
export async function upsertRound(
  roundId: string,
  round: RoundState,
  courseId: string | null
): Promise<void> {
  const sb = getSupabase();

  const { error: roundErr } = await sb
    .from("rounds")
    .update({
      course_id: courseId,
      holes_count: round.holesCount,
      level: round.level,
      scoring_distance: round.scoringDistance,
      weights: round.weights,
    })
    .eq("id", roundId);

  if (roundErr) throw roundErr;

  for (const h of round.holes.slice(0, round.holesCount)) {
    const { error: holeErr } = await sb.from("round_holes").upsert({
      round_id: roundId,
      hole_no: h.n,
      par: h.par,
      stroke_index: h.strokeIndex,
      strokes: h.strokes ?? null,
      putts: h.putts ?? null,
      missed_putts_6ft: h.missedPutts6ft ?? null,
      reached_sd: h.reachedSD ?? null,
      oopsies: h.oopsies,
    });
	
	await upsertRoundSummaryRow(sb, roundId, round, courseId);


    if (holeErr) throw holeErr;
  }

async function upsertRoundSummaryRow(
  sb: ReturnType<typeof getSupabase>,
  roundId: string,
  round: RoundState,
  courseId: string | null
) {
  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const s: any = computeRoundSummary(round);

  // NOTE: We’ll map exact field names after we peek at scoring.ts (next step).
  const row = {
    user_id: user.id,
    round_id: roundId,
    course_id: courseId,
    holes: round.holesCount,

    // These will be adjusted to match RoundSummary shape:
    total_strokes_lost: Number(s.totalStrokesLost ?? s.total_strokes_lost ?? 0),
    putting_lost: Number(s.puttingLost ?? s.putting_lost ?? 0),
    lost_ball_penalty: Number(s.lostBallPenalty ?? s.lost_ball_penalty ?? 0),

    level: round.level,
    scoring_distance: round.scoringDistance,
  };

  const { error } = await sb
    .from("round_summaries")
    .upsert(row, { onConflict: "user_id,round_id" });

  if (error) throw error;
}

}
