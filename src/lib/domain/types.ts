export type Level = "Bogey Golf" | "Break 80" | "Scratch";

export type Weights = {
  bunker: number;
  duffed: number;
};

export type Hole = {
  n: number;
  par: 3 | 4 | 5;
  strokeIndex: number;

  strokes?: number;
  putts?: number;

  // SD checkbox (computed goal by Level + SI)
  reachedSD?: boolean;

  oopsies: {
    lostBall: number; // each = 2 strokes lost
    bunker: number;
    duffed: number;
  };
};

export type RoundState = {
  holesCount: 9 | 18;
  level: Level;
  scoringDistance: number;
  weights: Weights;
  holes: Hole[];
};

export type CourseTemplate = {
  id: string;
  name: string;
  holesCount: 9 | 18;
  holes: Array<{
    n: number;
    par: 3 | 4 | 5;
    strokeIndex: number;
  }>;
  createdAt: string; // ISO
};

export type RoundSummary = {
  strokes?: number;
  toPar?: number;

  sdPct?: number;
  sdMade: number;
  sdEligible: number;

  p3Pct?: number;
  p3Made: number;
  p3Eligible: number;

  // NPIR (Not-Puttable-In-Regulation): Percentage of eligible holes where GIR was NOT achieved
  // This complements SD% by tracking failures. It correlates better with scoring than GIR alone
  // because it directly measures missed opportunities that lead to higher scores.
  npirPct?: number;
  npirMade: number;
  npirEligible: number;

  avgPutts?: number;
  puttsLostTotal: number;

  strokesLostTotal: number;
};
