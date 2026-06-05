const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | null };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body as BodyInit | undefined;

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body,
    credentials: 'include'
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Ocurrió un error inesperado.');
  }
  return payload as T;
}

export type User = {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
};

export type Team = {
  id: number;
  name: string;
  code: string;
  flag_code: string | null;
  group_name: string | null;
};

export type Match = {
  id: number;
  stage: string;
  group_name: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
  starts_at: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  venue: string | null;
  match_order: number;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  home_flag_code: string | null;
  away_flag_code: string | null;
};

export type Prediction = {
  id: number;
  match_id: number;
  home_score: number;
  away_score: number;
  points: number;
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  points_reason: string;
  locked_at: string | null;
  starts_at: string;
  status: Match['status'];
  real_home_score: number | null;
  real_away_score: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
};

export type RankingRow = {
  position: number;
  id: number;
  name: string;
  points: number;
  match_points: number;
  special_points: number;
  exact_hits: number;
  outcome_hits: number;
  predicted_count: number;
  special_loaded: number;
};

export type ScoringRules = {
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  champion_bonus_points: number;
  runner_up_bonus_points: number;
  third_place_bonus_points: number;
  fourth_place_bonus_points: number;
};

export type SpecialPrediction = {
  id: number;
  user_id: number;
  champion_team_id: number;
  runner_up_team_id: number;
  third_place_team_id: number;
  fourth_place_team_id: number;
  points: number;
  locked_at: string | null;
  champion_team_name: string | null;
  champion_team_code: string | null;
  champion_flag_code: string | null;
  runner_up_team_name: string | null;
  runner_up_team_code: string | null;
  runner_up_flag_code: string | null;
  third_place_team_name: string | null;
  third_place_team_code: string | null;
  third_place_flag_code: string | null;
  fourth_place_team_name: string | null;
  fourth_place_team_code: string | null;
  fourth_place_flag_code: string | null;
};

export type TournamentResults = {
  id: number;
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  third_place_team_id: number | null;
  fourth_place_team_id: number | null;
  champion_team_name: string | null;
  champion_team_code: string | null;
  champion_flag_code: string | null;
  runner_up_team_name: string | null;
  runner_up_team_code: string | null;
  runner_up_flag_code: string | null;
  third_place_team_name: string | null;
  third_place_team_code: string | null;
  third_place_flag_code: string | null;
  fourth_place_team_name: string | null;
  fourth_place_team_code: string | null;
  fourth_place_flag_code: string | null;
};

export type AdminAuditLog = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
  admin_name: string | null;
  admin_email: string | null;
};
