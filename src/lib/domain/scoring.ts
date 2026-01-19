import type { Hole, Level, RoundState, RoundSummary, Weights } from "./types";
import { round1 } from "@/lib/utils/math";

export function allowedShotsToSD(level: Level, h: Hole): number | null {
  if (h.par === 3) return null;
  if (level === "Bogey Golf") return 2;
  if (level === "Break 80") return h.strokeIndex >= 10 ? 1 : 2;
  return 1; // Scratch
}

// After reaching SD: treat rest like a Par 3.
// Par-3 difficulty rule: SI 1–9 => Par 4 target (4), SI 10–18 => Par 3 target (3).
export function targetAfterSD(h: Hole): number {
  if (h.par === 3) return h.strokeIndex <= 9 ? 4 : 3;
  return 3;
}

export function puttingLost(putts?: number): number {
  if (putts == null) return 0;
  return Math.max(0, putts - 2);
}

export function holeStrokesLost(h: Hole, w: Weights): number {
  const lostBallLost = h.oopsies.lostBall * 2;
  const other = h.oopsies.bunker * w.bunker + h.oopsies.duffed * w.duffed;
  const puttLost = puttingLost(h.putts);
  return round1(lostBallLost + other + puttLost);
}

/**
 * Par-3% approximation without shots-to-SD entry:
 * - Par 3 holes: success if strokes <= targetAfterSD
 * - Non-par3 holes: assume you used allowed shots to reach SD, so remaining ≈ strokes - allowedShots
 */
export function par3Equivalent(level: Level, h: Hole): boolean | undefined {
  if (h.strokes == null) return undefined;
  const tgt = targetAfterSD(h);

  if (h.par === 3) return h.strokes <= tgt;

  const allow = allowedShotsToSD(level, h);
  if (allow == null) return undefined;

  return h.strokes - allow <= tgt;
}

export function computeRoundSummary(round: RoundState): RoundSummary {
  const used = round.holes.slice(0, round.holesCount);

  let totalStrokes = 0;
  let totalPar = 0;
  let holesWithStrokes = 0;

  let sdEligible = 0;
  let sdMade = 0;

  let npirEligible = 0;
  let npirMade = 0;

  let p3Eligible = 0;
  let p3Made = 0;

  let puttsEntered = 0;
  let puttsTotal = 0;
  let puttsLostTotal = 0;

  let missedPutts6ftTotal = 0;
  let holesWithPutts = 0;
  let holesWithMissedPutts6ft = 0;

  let teeShotsFairwayTotal = 0;
  let teeShotsTroubleTotal = 0;

  let strokesLostTotal = 0;

  for (const h of used) {
    totalPar += h.par;

    // strokes lost can be tracked even if hole isn't complete yet (fine)
    strokesLostTotal += holeStrokesLost(h, round.weights);

    if (h.strokes != null) {
      holesWithStrokes += 1;
      totalStrokes += h.strokes;

      // SD% counts only non-par3 holes once strokes exist (unchecked counts as miss)
      if (h.par !== 3) {
        sdEligible += 1;
        if (h.reachedSD === true) sdMade += 1;
        
        // NPIR% (Not-Puttable-In-Regulation): Tracks holes where GIR was NOT achieved
        // (reachedSD === false or undefined on eligible non-par-3 holes).
        //
        // Why NPIR correlates better with scoring than GIR alone:
        // 1. Direct failure tracking: NPIR directly measures missed opportunities to reach
        //    the green in regulation, which are strongly associated with higher scores.
        // 2. Penalty amplification: Missing GIR typically requires an up-and-down to save par,
        //    and most golfers struggle with scrambling, leading to bogeys or worse.
        // 3. Psychological impact: Tracking failures (NPIR) often provides clearer feedback
        //    than tracking successes (GIR), as it highlights specific areas needing improvement.
        // 4. Score prediction: A high NPIR% is a stronger predictor of poor scores than a low
        //    GIR% alone, because missing greens forces difficult recovery shots and increases
        //    the probability of additional strokes.
        npirEligible += 1;
        if (h.reachedSD !== true) npirMade += 1;
      }

      const p3 = par3Equivalent(round.level, h);
      if (p3 != null) {
        p3Eligible += 1;
        if (p3) p3Made += 1;
      }
    }

    if (h.putts != null) {
      puttsEntered += 1;
      puttsTotal += h.putts;
      puttsLostTotal += puttingLost(h.putts);
      holesWithPutts += 1;
    }

    // Track missed putts within 6ft
    if (h.missedPutts6ft != null && h.missedPutts6ft > 0) {
      missedPutts6ftTotal += h.missedPutts6ft;
      if (h.putts != null) {
        holesWithMissedPutts6ft += 1;
      }
    }

    // Tee shot result (par 4/5 only)
    if (h.par !== 3) {
      if (h.teeShotResult === "fairway") teeShotsFairwayTotal += 1;
      if (h.teeShotResult === "trouble") teeShotsTroubleTotal += 1;
    }
  }

  const strokes = holesWithStrokes ? totalStrokes : undefined;
  const toPar = holesWithStrokes ? totalStrokes - totalPar : undefined;

  const sdPct = sdEligible ? Math.round((sdMade / sdEligible) * 100) : undefined;
  const npirPct = npirEligible ? Math.round((npirMade / npirEligible) * 100) : undefined;
  const p3Pct = p3Eligible ? Math.round((p3Made / p3Eligible) * 100) : undefined;

  const avgPutts =
    puttsEntered ? round1(puttsTotal / puttsEntered) : undefined;

  const missedPutts6ftPct = holesWithPutts
    ? Math.round((holesWithMissedPutts6ft / holesWithPutts) * 100)
    : undefined;

  const teeShotsRecorded = teeShotsFairwayTotal + teeShotsTroubleTotal;
  const teeShotsFairwayPct = teeShotsRecorded
    ? Math.round((teeShotsFairwayTotal / teeShotsRecorded) * 100)
    : undefined;

  return {
    strokes,
    toPar,

    sdPct,
    sdMade,
    sdEligible,

    npirPct,
    npirMade,
    npirEligible,

    p3Pct,
    p3Made,
    p3Eligible,

    avgPutts,
    puttsLostTotal: round1(puttsLostTotal),

    missedPutts6ftTotal,
    missedPutts6ftPct,

    teeShotsFairwayTotal,
    teeShotsTroubleTotal,
    teeShotsFairwayPct,

    strokesLostTotal: round1(strokesLostTotal),
  };
}
