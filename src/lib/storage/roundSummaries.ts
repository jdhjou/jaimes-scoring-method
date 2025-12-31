import { getSupabase } from "@/lib/storage/supabaseClient";

export type RoundSummaryRow = {
  user_id: string;
  round_id: string;
  course_id?: string | null;
  course_name?: string | null;
  played_at?: string; // YYYY-MM-DD
  holes: 9 | 18;

  total_strokes_lost: number;
  putting_lost: number;
  lost_ball_penalty: number;

  off_tee_lost?: number | null;
  approach_lost?: number | null;
  short_game_lost?: number | null;
  bunker_lost?: number | null;
  duffed_lost?: number | null;

  level?: string | null;
  scoring_distance?: number | null;
};

export async function upsertRoundSummary(row: RoundSummaryRow) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("round_summaries")
    .upsert(row, { onConflict: "user_id,round_id" });

  if (error) throw error;
}
