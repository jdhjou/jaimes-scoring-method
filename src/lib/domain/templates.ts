import type { CourseTemplate, Hole, RoundState } from "./types";
import { uid } from "@/lib/utils/id";

export function makeDefaultHoles(count: 9 | 18): Hole[] {
  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    par: 4,
    strokeIndex: ((i % 18) + 1),
    strokes: undefined,
    putts: undefined,
    missedPutts6ft: undefined,
    reachedSD: undefined,
    oopsies: { lostBall: 0, bunker: 0, duffed: 0 },
  }));
}

export function templateFromRound(round: RoundState, name: string): CourseTemplate {
  return {
    id: uid(),
    name,
    holesCount: round.holesCount,
    holes: round.holes.slice(0, round.holesCount).map((h) => ({
      n: h.n,
      par: h.par,
      strokeIndex: h.strokeIndex,
    })),
    createdAt: new Date().toISOString(),
  };
}

export function applyTemplateToNewRound(template: CourseTemplate, baseRound: Omit<RoundState, "holes" | "holesCount">): RoundState {
  const holesCount = template.holesCount;
  const holes = makeDefaultHoles(holesCount).map((h, idx) => {
    const src = template.holes[idx];
    return {
      ...h,
      n: idx + 1,
      par: src?.par ?? h.par,
      strokeIndex: src?.strokeIndex ?? h.strokeIndex,
      // reset round-entry fields:
      strokes: undefined,
      putts: undefined,
      missedPutts6ft: undefined,
      reachedSD: undefined,
      oopsies: { lostBall: 0, bunker: 0, duffed: 0 },
    };
  });

  return { ...baseRound, holesCount, holes };
}

export function resetRoundKeepCourse(round: RoundState): RoundState {
  return {
    ...round,
    holes: round.holes.slice(0, round.holesCount).map((h) => ({
      n: h.n,
      par: h.par,
      strokeIndex: h.strokeIndex,
      strokes: undefined,
      putts: undefined,
      missedPutts6ft: undefined,
      reachedSD: undefined,
      oopsies: { lostBall: 0, bunker: 0, duffed: 0 },
    })),
  };
}
