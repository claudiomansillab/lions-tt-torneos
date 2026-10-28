export type Status = 'setup' | 'round1' | 'round2' | 'knockout' | 'finished';
export type Stage = 'r1' | 'r2' | 'ko';
export type SetScore = [number, number];

export interface Tournament {
  id: string;
  owner_id: string;
  name: string;
  event_date: string | null;
  group_size: number;
  qualifiers: number;
  sets_to_win_group: number;
  sets_to_win_ko: number;
  status: Status;
  created_at: string;
}

export interface Player {
  id: string;
  tournament_id: string;
  name: string;
  created_at?: string;
}

export interface Group {
  id: string;
  tournament_id: string;
  round: 1 | 2;
  label: string;
  position: number;
  player_ids: string[];
}

export interface Match {
  id: string;
  tournament_id: string;
  stage: Stage;
  group_id: string | null;
  ko_round: number | null;
  slot: number | null;
  order_no: number;
  player1_id: string | null;
  player2_id: string | null;
  sets: SetScore[];
  p1_sets: number | null;
  p2_sets: number | null;
  winner_id: string | null;
  walkover: boolean;
}

export interface TournamentData {
  tournament: Tournament;
  players: Player[];
  groups: Group[];
  matches: Match[];
}

export interface NewTournamentInput {
  name: string;
  event_date: string | null;
  group_size: number;
  qualifiers: number;
  sets_to_win_group: number;
  sets_to_win_ko: number;
}

export type MatchResult = Pick<Match, 'sets' | 'p1_sets' | 'p2_sets' | 'winner_id' | 'walkover'>;
