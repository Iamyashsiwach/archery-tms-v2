import type { Arrow } from "@/lib/rules/types";

export type Stage = "QUALIFICATION" | "ELIMINATION" | "SHOOT_OFF";

/** One end as the judge entered it, and as it is sent to /api/ends. */
export interface EndPayload {
  id: string;
  tournament_id: string;
  division_id: string;
  archer_id: string;
  stage: Stage;
  match_id: string | null;
  distance_index: number;
  end_number: number;
  arrows: Arrow[];
}

export interface QueuedEnd extends EndPayload {
  refused?: string;
}

export interface RecordedEnd {
  archer_id: string;
  stage: Stage;
  match_id: string | null;
  distance_index: number;
  end_number: number;
  arrows: Arrow[];
}

export interface ScoreArcher {
  id: string;
  name: string;
  club: string | null;
  bale: number;
  slot: number;
  divisionId: string;
  divisionName: string;
  distances: { distance: number; arrowsPerEnd: number; ends: number }[];
}

export interface ScoreMatch {
  id: string;
  divisionId: string;
  divisionName: string;
  roundLabel: string;
  bale: number;
  formatCode: string;
  closestToCentre: 1 | 2 | null;
  sides: [{ archerId: string; name: string }, { archerId: string; name: string }];
}

export interface ScoreData {
  tournamentId: string;
  archers: ScoreArcher[];
  matches: ScoreMatch[];
  recorded: RecordedEnd[];
}

/** Per-end outcome returned by /api/ends. */
export type SyncResult = { id: string; result: "saved" } | { id: string; result: "refused"; message: string };
