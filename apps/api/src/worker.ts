import originalWorker from './index';

type Env = { DB: D1Database; APP_ENV: string; CORS_ORIGIN: string; FOOTBALL_DATA_API_TOKEN?: string };
type BaseWorker = { fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response };
type User = { id: number; name: string; email: string; role: 'USER' | 'ADMIN'; created_at?: string };
type Match = {
  id: number;
  stage: string;
  group_name: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: number | null;
  starts_at: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  venue: string | null;
  match_order: number;
  external_provider: string | null;
  external_match_id: string | null;
  result_source: 'MANUAL' | 'FOOTBALL_DATA';
  manually_locked: number;
};
type LocalMatch = Match & {
  home_team_code: string | null;
  away_team_code: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
};
type Team = { id: number; name: string; code: string };
type Rules = {
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  champion_bonus_points: number;
  runner_up_bonus_points: number;
  third_place_bonus_points: number;
  fourth_place_bonus_points: number;
};
type Prediction = { id: number; home_score: number; away_score: number; winner_team_id: number | null };
type RankingPrediction = Prediction & {
  user_id: number;
  points: number;
  match_status: Match['status'];
  real_home_score: number | null;
  real_away_score: number | null;
  real_winner_team_id: number | null;
  match_home_team_id: number | null;
  match_away_team_id: number | null;
};
type FootballTeam = { id: number | null; name: string | null; shortName?: string | null; tla?: string | null };
type FootballMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam: FootballTeam;
  awayTeam: FootballTeam;
  score: { winner?: string | null; fullTime?: { home: number | null; away: number | null } | null };
};
type FootballResponse = { matches?: FootballMatch[] };

type SyncSummary = {
  provider: 'FOOTBALL_DATA';
  competition_code: 'WC';
  season: 2026;
  fetched_count: number;
  finished_count: number;
  updated_count: number;
  skipped_count: number;
  unmatched_count: number;
  propagated_count: number;
  updated_matches: Array<{ match_order: number; home_team: string; away_team: string; home_score: number | null; away_score: number | null }>;
  unmatched_matches: Array<{ external_match_id: number; home_team: string | null; away_team: string | null; utc_date: string; home_score: number | null; away_score: number | null }>;
};

const base = originalWorker as BaseWorker;
const COOKIE_NAME = 'pm_session';
const PROVIDER = 'FOOTBALL_DATA';
const COMPETITION = 'WC';
const SEASON = 2026;

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const pathname = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname;
    const predictionMatch = pathname.match(/^\/predictions\/(\d+)$/);
    const adminResultMatch = pathname.match(/^\/admin\/matches\/(\d+)\/result$/);

    if (predictionMatch && request.method === 'PUT') return savePrediction(request, env, Number(predictionMatch[1]));
    if (adminResultMatch && request.method === 'POST') return saveAdminResult(request, env, Number(adminResultMatch[1]));
    if (pathname === '/admin/recalculate' && request.method === 'POST') return recalculateAllFromRequest(request, env);
    if (pathname === '/admin/sync-results' && request.method === 'POST') return syncFromRequest(request, env);
    if (pathname === '/ranking' && request.method === 'GET') return getRanking(request, env);

    return base.fetch(request, env, ctx);
  },

  scheduled: async (_event: unknown, env: Env) => {
    try {
      await syncFootballData(env.DB, env.FOOTBALL_DATA_API_TOKEN);
    } catch (error) {
      console.error('No se pudo sincronizar resultados automÃ¡ticamente.', error);
    }
  }
};

async function savePrediction(request: Request, env: Env, matchId: number) {
  const user = await getUser(request, env.DB);
  if (!user) return json(request, env, { error: 'TenÃ©s que iniciar sesiÃ³n.' }, 401);

  if ((await getSetting(env.DB, 'PREDICTIONS_LOCKED')) === 'true') {
    return json(request, env, { error: 'La carga de pronÃ³sticos estÃ¡ bloqueada temporalmente.' }, 400);
  }

  const body = await readJson(request);
  const home = toScore(body.home_score);
  const away = toScore(body.away_score);
  if (home === null || away === null) return json(request, env, { error: 'Resultado invÃ¡lido.' }, 400);

  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return json(request, env, { error: 'No se encontrÃ³ el partido.' }, 404);
  if (isMatchLocked(match)) return json(request, env, { error: 'Este partido ya empezÃ³ o estÃ¡ finalizado. No se puede modificar el pronÃ³stico.' }, 400);

  const winner = normalizePredictionWinner(match, home, away, toNullableNumber(body.winner_team_id));
  if (winner instanceof Error) return json(request, env, { error: winner.message }, 400);

  await env.DB.prepare(`
    INSERT INTO predictions (user_id, match_id, home_score, away_score, winner_team_id, points, exact_score_points, correct_winner_points, correct_draw_points, goal_difference_points, points_reason, locked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'Pendiente', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      winner_team_id = excluded.winner_team_id,
      points = 0,
      exact_score_points = 0,
      correct_winner_points = 0,
      correct_draw_points = 0,
      goal_difference_points = 0,
      points_reason = 'Pendiente',
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.id, matchId, home, away, winner).run();

  return json(request, env, { ok: true });
}

async function saveAdminResult(request: Request, env: Env, matchId: number) {
  const user = await getAdmin(request, env.DB);
  if (!user) return json(request, env, { error: 'No autorizado.' }, 401);

  const body = await readJson(request);
  const home = toScore(body.home_score);
  const away = toScore(body.away_score);
  const status = typeof body.status === 'string' && ['SCHEDULED', 'LIVE', 'FINISHED'].includes(body.status) ? body.status as Match['status'] : 'FINISHED';
  if (home === null || away === null) return json(request, env, { error: 'Resultado invÃ¡lido.' }, 400);

  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return json(request, env, { error: 'No se encontrÃ³ el partido.' }, 404);

  const winner = normalizeResultWinner(match, home, away, status, toNullableNumber(body.winner_team_id));
  if (winner instanceof Error) return json(request, env, { error: winner.message }, 400);

  await env.DB.prepare(`
    UPDATE matches
    SET home_score = ?, away_score = ?, winner_team_id = ?, status = ?, result_source = 'MANUAL', manually_locked = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(home, away, winner, status, matchId).run();

  await recalculateMatch(env.DB, matchId);
  if (status === 'FINISHED' && winner !== null) await propagateKnockoutWinners(env.DB);
  await logAdmin(env.DB, user.id, 'UPDATE_RESULT', 'match', String(matchId), { home_score: home, away_score: away, winner_team_id: winner, status }, request);
  return json(request, env, { ok: true });
}

async function recalculateAllFromRequest(request: Request, env: Env) {
  const user = await getAdmin(request, env.DB);
  if (!user) return json(request, env, { error: 'No autorizado.' }, 401);
  await recalculateAll(env.DB);
  await logAdmin(env.DB, user.id, 'RECALCULATE', 'system', null, { ok: true }, request);
  return json(request, env, { ok: true });
}

async function syncFromRequest(request: Request, env: Env) {
  const user = await getAdmin(request, env.DB);
  if (!user) return json(request, env, { error: 'No autorizado.' }, 401);

  try {
    const summary = await syncFootballData(env.DB, env.FOOTBALL_DATA_API_TOKEN);
    await logAdmin(env.DB, user.id, 'SYNC_RESULTS', 'system', 'football-data', summary, request);
    return json(request, env, { summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar resultados.';
    return json(request, env, { error: message }, 500);
  }
}

async function syncFootballData(db: D1Database, token?: string): Promise<SyncSummary> {
  const summary: SyncSummary = { provider: PROVIDER, competition_code: COMPETITION, season: SEASON, fetched_count: 0, finished_count: 0, updated_count: 0, skipped_count: 0, unmatched_count: 0, propagated_count: 0, updated_matches: [], unmatched_matches: [] };

  try {
    if (!token) throw new Error('No estÃ¡ configurado FOOTBALL_DATA_API_TOKEN en el Worker.');
    const externalMatches = await fetchFootballMatches(token);
    summary.fetched_count = externalMatches.length;
    summary.finished_count = externalMatches.filter(isFinishedWithScore).length;
    const localMatches = await getLocalMatches(db);
    const usedLocalIds = new Set<number>();

    for (const external of externalMatches) {
      const homeTeamId = await ensureTeam(db, external.homeTeam);
      const awayTeamId = await ensureTeam(db, external.awayTeam);
      if (!homeTeamId || !awayTeamId) {
        summary.unmatched_count += 1;
        summary.unmatched_matches.push(toUnmatched(external));
        continue;
      }

      const stage = mapStage(external.stage, external.utcDate);
      const groupName = stage === 'Fase de grupos' ? normalizeGroup(external.group) : null;
      const status = mapStatus(external.status);
      const finished = isFinishedWithScore(external);
      const homeScore = finished ? Number(external.score.fullTime?.home) : null;
      const awayScore = finished ? Number(external.score.fullTime?.away) : null;
      const winnerTeamId = finished ? winnerFromExternal(external, homeTeamId, awayTeamId) : null;
      const candidate = findLocalMatch(external, localMatches, homeTeamId, awayTeamId, usedLocalIds, stage);
      const externalId = String(external.id);

      if (!candidate) {
        const created = await createMatch(db, external, homeTeamId, awayTeamId, stage, groupName, status, homeScore, awayScore, winnerTeamId);
        localMatches.push(created);
        usedLocalIds.add(created.id);
        summary.updated_count += 1;
        summary.updated_matches.push(toUpdated(created));
        if (finished) await recalculateMatch(db, created.id);
        continue;
      }

      const match = candidate.match;
      usedLocalIds.add(match.id);
      const nextHomeTeamId = candidate.reversed ? awayTeamId : homeTeamId;
      const nextAwayTeamId = candidate.reversed ? homeTeamId : awayTeamId;
      const nextHomeScore = candidate.reversed ? awayScore : homeScore;
      const nextAwayScore = candidate.reversed ? homeScore : awayScore;
      const canUpdateResult = finished && match.manually_locked !== 1;
      const nextStatus = match.manually_locked === 1 && !canUpdateResult ? match.status : status;
      const nextWinnerTeamId = canUpdateResult ? winnerTeamId : match.winner_team_id;

      const changed =
        match.external_match_id !== externalId ||
        match.home_team_id !== nextHomeTeamId ||
        match.away_team_id !== nextAwayTeamId ||
        match.starts_at !== external.utcDate ||
        match.stage !== stage ||
        (match.group_name || null) !== (groupName || null) ||
        (match.manually_locked !== 1 && match.status !== status) ||
        (canUpdateResult && (
          match.home_score !== nextHomeScore ||
          match.away_score !== nextAwayScore ||
          (match.winner_team_id || null) !== (nextWinnerTeamId || null)
        ));

      if (!changed) {
        await db.prepare('UPDATE matches SET external_provider = ?, external_match_id = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(PROVIDER, externalId, match.id).run();
        summary.skipped_count += 1;
        continue;
      }

      await db.prepare(`
        UPDATE matches
        SET
          stage = ?,
          group_name = ?,
          home_team_id = ?,
          away_team_id = ?,
          home_score = ?,
          away_score = ?,
          winner_team_id = ?,
          starts_at = ?,
          status = ?,
          external_provider = ?,
          external_match_id = ?,
          last_synced_at = CURRENT_TIMESTAMP,
          result_source = CASE WHEN ? THEN 'FOOTBALL_DATA' ELSE result_source END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        stage,
        groupName,
        nextHomeTeamId,
        nextAwayTeamId,
        canUpdateResult ? nextHomeScore : match.home_score,
        canUpdateResult ? nextAwayScore : match.away_score,
        nextWinnerTeamId,
        external.utcDate,
        nextStatus,
        PROVIDER,
        externalId,
        canUpdateResult ? 1 : 0,
        match.id
      ).run();

      const updated: LocalMatch = {
        ...match,
        stage,
        group_name: groupName,
        home_team_id: nextHomeTeamId,
        away_team_id: nextAwayTeamId,
        home_score: canUpdateResult ? nextHomeScore : match.home_score,
        away_score: canUpdateResult ? nextAwayScore : match.away_score,
        winner_team_id: nextWinnerTeamId,
        starts_at: external.utcDate,
        status: nextStatus,
        external_provider: PROVIDER,
        external_match_id: externalId
      };
      const index = localMatches.findIndex((item) => item.id === match.id);
      if (index >= 0) localMatches[index] = updated;
      summary.updated_count += 1;
      summary.updated_matches.push(toUpdated(updated));
      if (canUpdateResult) await recalculateMatch(db, match.id);
    }

    const propagatedCount = await propagateKnockoutWinners(db);
    if (propagatedCount > 0) {
      summary.propagated_count = propagatedCount;
      summary.updated_count += propagatedCount;
    }

    await saveSyncLog(db, summary, 'SUCCESS', null);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar resultados.';
    await saveSyncLog(db, summary, 'ERROR', message);
    throw error;
  }
}

async function fetchFootballMatches(token: string) {
  const response = await fetch(`https://api.football-data.org/v4/competitions/${COMPETITION}/matches?season=${SEASON}`, { headers: { 'X-Auth-Token': token } });
  if (!response.ok) throw new Error(`football-data.org respondiÃ³ ${response.status}.`);
  const payload = await response.json() as FootballResponse;
  return Array.isArray(payload.matches) ? payload.matches : [];
}

async function getLocalMatches(db: D1Database) {
  const rows = await db.prepare(`
    SELECT m.*, ht.name AS home_team_name, ht.code AS home_team_code, at.name AS away_team_name, at.code AS away_team_code
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.match_order ASC
  `).all<LocalMatch>();
  return rows.results;
}

function findLocalMatch(external: FootballMatch, matches: LocalMatch[], homeTeamId: number, awayTeamId: number, used: Set<number>, stage: string) {
  const externalId = String(external.id);
  const direct = matches.find((match) => !used.has(match.id) && match.external_provider === PROVIDER && match.external_match_id === externalId);
  if (direct) return { match: direct, reversed: false };

  const byTeams = matches
    .filter((match) => !used.has(match.id))
    .map((match) => ({
      match,
      reversed: match.home_team_id === awayTeamId && match.away_team_id === homeTeamId,
      normal: match.home_team_id === homeTeamId && match.away_team_id === awayTeamId,
      diff: dateDiffMs(external.utcDate, match.starts_at)
    }))
    .filter((item) => (item.normal || item.reversed) && item.diff <= 48 * 60 * 60 * 1000)
    .sort((a, b) => a.diff - b.diff)[0];
  if (byTeams) return { match: byTeams.match, reversed: byTeams.reversed };

  const placeholder = matches
    .filter((match) => !used.has(match.id) && (match.home_team_id === null || match.away_team_id === null) && canonicalStage(match.stage) === canonicalStage(stage))
    .map((match) => ({ match, diff: dateDiffMs(external.utcDate, match.starts_at) }))
    .filter((item) => item.diff <= 72 * 60 * 60 * 1000)
    .sort((a, b) => a.diff - b.diff)[0];
  return placeholder ? { match: placeholder.match, reversed: false } : null;
}

async function ensureTeam(db: D1Database, externalTeam: FootballTeam) {
  const code = normalizeCode(externalTeam.tla || externalTeam.shortName || externalTeam.name);
  const name = externalTeam.name?.trim() || externalTeam.shortName?.trim() || code;
  if (!code || !name) return null;
  const existing = await db.prepare('SELECT id FROM teams WHERE UPPER(code) = ?').bind(code).first<{ id: number }>();
  if (existing) return existing.id;
  const byName = await db.prepare('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)').bind(name).first<{ id: number }>();
  if (byName) return byName.id;
  const inserted = await db.prepare('INSERT INTO teams (name, code, flag_code, group_name) VALUES (?, ?, ?, NULL) RETURNING id').bind(name, code, code.toLowerCase()).first<{ id: number }>();
  return inserted?.id || null;
}

async function createMatch(db: D1Database, external: FootballMatch, homeTeamId: number, awayTeamId: number, stage: string, groupName: string | null, status: Match['status'], homeScore: number | null, awayScore: number | null, winnerTeamId: number | null) {
  const max = await db.prepare('SELECT COALESCE(MAX(match_order), 0) AS value FROM matches').first<{ value: number }>();
  const order = Number(max?.value || 0) + 1;
  const finished = status === 'FINISHED' && homeScore !== null && awayScore !== null;
  const row = await db.prepare(`
    INSERT INTO matches (stage, group_name, home_team_id, away_team_id, home_score, away_score, winner_team_id, starts_at, status, venue, match_order, external_provider, external_match_id, last_synced_at, result_source, manually_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
    RETURNING *
  `).bind(stage, groupName, homeTeamId, awayTeamId, finished ? homeScore : null, finished ? awayScore : null, finished ? winnerTeamId : null, external.utcDate, status, order, PROVIDER, String(external.id), finished ? PROVIDER : 'MANUAL').first<LocalMatch>();
  if (!row) throw new Error('No se pudo crear el partido faltante.');
  return row;
}

async function getRanking(request: Request, env: Env) {
  const users = await env.DB.prepare("SELECT id, name, created_at FROM users WHERE role = 'USER'").all<User>();
  const predictions = await env.DB.prepare(`
    SELECT p.id, p.user_id, p.home_score, p.away_score, p.winner_team_id, p.points, m.status AS match_status, m.home_score AS real_home_score, m.away_score AS real_away_score, m.winner_team_id AS real_winner_team_id, m.home_team_id AS match_home_team_id, m.away_team_id AS match_away_team_id
    FROM predictions p
    INNER JOIN matches m ON m.id = p.match_id
  `).all<RankingPrediction>();
  const specials = await env.DB.prepare('SELECT id, user_id, points FROM special_predictions').all<{ id: number; user_id: number; points: number }>();
  const specialByUser = new Map(specials.results.map((special) => [special.user_id, special]));
  const predictionByUser = new Map<number, RankingPrediction[]>();
  for (const row of predictions.results) predictionByUser.set(row.user_id, [...(predictionByUser.get(row.user_id) || []), row]);

  const rows = users.results.map((user) => {
    const userPredictions = predictionByUser.get(user.id) || [];
    const special = specialByUser.get(user.id);
    const matchPoints = userPredictions.reduce((sum, row) => sum + Number(row.points || 0), 0);
    return {
      id: user.id,
      name: user.name,
      points: matchPoints + Number(special?.points || 0),
      match_points: matchPoints,
      special_points: Number(special?.points || 0),
      exact_hits: userPredictions.filter(rankingExactHit).length,
      outcome_hits: userPredictions.filter(rankingOutcomeHit).length,
      predicted_count: userPredictions.length,
      special_loaded: special ? 1 : 0,
      created_at: user.created_at || ''
    };
  })
    .sort((a, b) => b.points - a.points || b.exact_hits - a.exact_hits || b.outcome_hits - a.outcome_hits || b.predicted_count - a.predicted_count || a.created_at.localeCompare(b.created_at))
    .map((row, index) => ({ position: index + 1, ...row }));

  return json(request, env, { ranking: rows });
}

async function recalculateAll(db: D1Database) {
  const rows = await db.prepare("SELECT id FROM matches WHERE status = 'FINISHED'").all<{ id: number }>();
  for (const row of rows.results) await recalculateMatch(db, row.id);
  await recalculateSpecialPredictions(db);
}

async function recalculateMatch(db: D1Database, matchId: number) {
  const match = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match || match.status !== 'FINISHED' || match.home_score === null || match.away_score === null) {
    await db.prepare("UPDATE predictions SET points = 0, exact_score_points = 0, correct_winner_points = 0, correct_draw_points = 0, goal_difference_points = 0, points_reason = 'Pendiente', updated_at = CURRENT_TIMESTAMP WHERE match_id = ?").bind(matchId).run();
    return;
  }
  const rules = await getRules(db);
  const predictions = await db.prepare('SELECT id, home_score, away_score, winner_team_id FROM predictions WHERE match_id = ?').bind(matchId).all<Prediction>();
  for (const prediction of predictions.results) {
    const detail = calculatePoints(prediction, match, rules);
    await db.prepare('UPDATE predictions SET points = ?, exact_score_points = ?, correct_winner_points = ?, correct_draw_points = ?, goal_difference_points = ?, points_reason = ?, locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(detail.points, detail.exact_score_points, detail.correct_winner_points, detail.correct_draw_points, detail.goal_difference_points, detail.points_reason, prediction.id).run();
  }
}

async function recalculateSpecialPredictions(db: D1Database) {
  const rules = await getRules(db);
  const results = await db.prepare('SELECT champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id FROM tournament_results WHERE id = 1').first<{
    champion_team_id: number | null;
    runner_up_team_id: number | null;
    third_place_team_id: number | null;
    fourth_place_team_id: number | null;
  }>();
  if (!results) return;
  const predictions = await db.prepare('SELECT id, champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id FROM special_predictions').all<{
    id: number;
    champion_team_id: number;
    runner_up_team_id: number;
    third_place_team_id: number;
    fourth_place_team_id: number;
  }>();
  for (const prediction of predictions.results) {
    let points = 0;
    if (results.champion_team_id !== null && prediction.champion_team_id === results.champion_team_id) points += rules.champion_bonus_points;
    if (results.runner_up_team_id !== null && prediction.runner_up_team_id === results.runner_up_team_id) points += rules.runner_up_bonus_points;
    if (results.third_place_team_id !== null && prediction.third_place_team_id === results.third_place_team_id) points += rules.third_place_bonus_points;
    if (results.fourth_place_team_id !== null && prediction.fourth_place_team_id === results.fourth_place_team_id) points += rules.fourth_place_bonus_points;
    await db.prepare('UPDATE special_predictions SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(points, prediction.id).run();
  }
}

async function getRules(db: D1Database): Promise<Rules> {
  const rules = await db.prepare('SELECT exact_score_points, correct_winner_points, correct_draw_points, goal_difference_points, champion_bonus_points, runner_up_bonus_points, third_place_bonus_points, fourth_place_bonus_points FROM scoring_rules WHERE id = 1').first<Rules>();
  return rules || { exact_score_points: 5, correct_winner_points: 3, correct_draw_points: 3, goal_difference_points: 1, champion_bonus_points: 10, runner_up_bonus_points: 6, third_place_bonus_points: 4, fourth_place_bonus_points: 2 };
}

function calculatePoints(prediction: Pick<Prediction, 'home_score' | 'away_score' | 'winner_team_id'>, match: Match, rules: Rules) {
  const realHome = Number(match.home_score);
  const realAway = Number(match.away_score);
  const realWinner = match.winner_team_id ?? null;
  const predictedWinner = prediction.winner_team_id ?? null;
  const winnerRequired = realHome === realAway && realWinner !== null;
  const exactScore = prediction.home_score === realHome && prediction.away_score === realAway;

  if (exactScore && (!winnerRequired || predictedWinner === realWinner)) {
    return {
      points: rules.exact_score_points,
      exact_score_points: rules.exact_score_points,
      correct_winner_points: 0,
      correct_draw_points: 0,
      goal_difference_points: 0,
      points_reason: winnerRequired ? 'Resultado exacto + ganador por penales' : 'Resultado exacto'
    };
  }

  const realOutcome = resolveOutcome(realHome, realAway, realWinner, match.home_team_id, match.away_team_id);
  const predictedOutcome = resolveOutcome(prediction.home_score, prediction.away_score, predictedWinner, match.home_team_id, match.away_team_id);

  if (realOutcome.type === 'TEAM' && predictedOutcome.type === 'TEAM' && realOutcome.teamId === predictedOutcome.teamId) {
    if (realHome === realAway) {
      return {
        points: rules.correct_winner_points,
        exact_score_points: 0,
        correct_winner_points: rules.correct_winner_points,
        correct_draw_points: 0,
        goal_difference_points: 0,
        points_reason: 'Ganador por penales correcto'
      };
    }
    const diffHit = prediction.home_score - prediction.away_score === realHome - realAway;
    const diffPoints = diffHit ? rules.goal_difference_points : 0;
    return {
      points: rules.correct_winner_points + diffPoints,
      exact_score_points: 0,
      correct_winner_points: rules.correct_winner_points,
      correct_draw_points: 0,
      goal_difference_points: diffPoints,
      points_reason: diffHit ? 'Ganador correcto + diferencia de goles' : 'Ganador correcto'
    };
  }

  if (realOutcome.type === 'DRAW' && predictedOutcome.type === 'DRAW') {
    return {
      points: rules.correct_draw_points,
      exact_score_points: 0,
      correct_winner_points: 0,
      correct_draw_points: rules.correct_draw_points,
      goal_difference_points: 0,
      points_reason: 'Empate correcto'
    };
  }

  return {
    points: 0,
    exact_score_points: 0,
    correct_winner_points: 0,
    correct_draw_points: 0,
    goal_difference_points: 0,
    points_reason: 'Sin puntos'
  };
}

function rankingExactHit(prediction: RankingPrediction) {
  if (prediction.match_status !== 'FINISHED' || prediction.real_home_score === null || prediction.real_away_score === null) return false;
  const exactScore = prediction.home_score === prediction.real_home_score && prediction.away_score === prediction.real_away_score;
  const winnerRequired = prediction.real_home_score === prediction.real_away_score && prediction.real_winner_team_id !== null;
  return exactScore && (!winnerRequired || prediction.winner_team_id === prediction.real_winner_team_id);
}

function rankingOutcomeHit(prediction: RankingPrediction) {
  if (prediction.match_status !== 'FINISHED' || prediction.real_home_score === null || prediction.real_away_score === null) return false;
  const realOutcome = resolveOutcome(prediction.real_home_score, prediction.real_away_score, prediction.real_winner_team_id, prediction.match_home_team_id, prediction.match_away_team_id);
  const predictedOutcome = resolveOutcome(prediction.home_score, prediction.away_score, prediction.winner_team_id, prediction.match_home_team_id, prediction.match_away_team_id);
  if (realOutcome.type === 'DRAW') return predictedOutcome.type === 'DRAW';
  return realOutcome.type === 'TEAM' && predictedOutcome.type === 'TEAM' && realOutcome.teamId === predictedOutcome.teamId;
}

function resolveOutcome(home: number, away: number, winnerTeamId: number | null, homeTeamId: number | null, awayTeamId: number | null): { type: 'TEAM'; teamId: number } | { type: 'DRAW' } | { type: 'UNKNOWN' } {
  if (home > away && homeTeamId !== null) return { type: 'TEAM', teamId: homeTeamId };
  if (away > home && awayTeamId !== null) return { type: 'TEAM', teamId: awayTeamId };
  if (home === away && winnerTeamId !== null) return { type: 'TEAM', teamId: winnerTeamId };
  if (home === away) return { type: 'DRAW' };
  return { type: 'UNKNOWN' };
}

function normalizePredictionWinner(match: Match, home: number, away: number, winner: number | null): number | null | Error {
  if (home !== away || !isKnockout(match)) return null;
  if (!match.home_team_id || !match.away_team_id) return new Error('TodavÃ­a no estÃ¡n definidos los equipos para elegir ganador.');
  if (!winner) return new Error('Si pronosticÃ¡s empate en una eliminatoria, elegÃ­ quiÃ©n clasifica/gana por penales.');
  if (![match.home_team_id, match.away_team_id].includes(winner)) return new Error('El ganador debe ser uno de los dos equipos del partido.');
  return winner;
}

function normalizeResultWinner(match: Match, home: number, away: number, status: Match['status'], winner: number | null): number | null | Error {
  if (status !== 'FINISHED') return null;
  if (home > away) return match.home_team_id;
  if (away > home) return match.away_team_id;
  if (!isKnockout(match)) return null;
  if (!match.home_team_id || !match.away_team_id) return new Error('No se puede definir ganador porque faltan equipos en el partido.');
  if (!winner) return new Error('Si el resultado real termina empatado en una eliminatoria, elegÃ­ quiÃ©n ganÃ³ por penales.');
  if (![match.home_team_id, match.away_team_id].includes(winner)) return new Error('El ganador debe ser uno de los dos equipos del partido.');
  return winner;
}

function isKnockout(match: Pick<Match, 'stage' | 'group_name'>) {
  if (match.group_name) return false;
  const stage = canonicalStage(match.stage);
  return stage !== 'fase de grupos' && stage !== 'group stage';
}

function isMatchLocked(match: Match) {
  return match.status !== 'SCHEDULED' || Date.now() >= new Date(match.starts_at).getTime();
}

function winnerFromExternal(external: FootballMatch, homeTeamId: number, awayTeamId: number) {
  const winner = (external.score.winner || '').toUpperCase();
  if (['HOME_TEAM', 'HOME'].includes(winner)) return homeTeamId;
  if (['AWAY_TEAM', 'AWAY'].includes(winner)) return awayTeamId;
  const home = external.score.fullTime?.home;
  const away = external.score.fullTime?.away;
  if (Number.isInteger(home) && Number.isInteger(away)) {
    if (Number(home) > Number(away)) return homeTeamId;
    if (Number(away) > Number(home)) return awayTeamId;
  }
  return null;
}

function isFinishedWithScore(match: FootballMatch) {
  return match.status === 'FINISHED' && Number.isInteger(match.score.fullTime?.home) && Number.isInteger(match.score.fullTime?.away);
}

type AdvancementRule = {
  sourceOrder: number;
  targetOrder: number;
  slot: 'home' | 'away';
  team: 'winner' | 'loser';
};

const ADVANCEMENT_RULES: AdvancementRule[] = [
  { sourceOrder: 73, targetOrder: 90, slot: 'home', team: 'winner' },
  { sourceOrder: 75, targetOrder: 90, slot: 'away', team: 'winner' },
  { sourceOrder: 74, targetOrder: 89, slot: 'home', team: 'winner' },
  { sourceOrder: 77, targetOrder: 89, slot: 'away', team: 'winner' },
  { sourceOrder: 76, targetOrder: 91, slot: 'home', team: 'winner' },
  { sourceOrder: 78, targetOrder: 91, slot: 'away', team: 'winner' },
  { sourceOrder: 79, targetOrder: 92, slot: 'home', team: 'winner' },
  { sourceOrder: 80, targetOrder: 92, slot: 'away', team: 'winner' },
  { sourceOrder: 83, targetOrder: 93, slot: 'home', team: 'winner' },
  { sourceOrder: 84, targetOrder: 93, slot: 'away', team: 'winner' },
  { sourceOrder: 81, targetOrder: 94, slot: 'home', team: 'winner' },
  { sourceOrder: 82, targetOrder: 94, slot: 'away', team: 'winner' },
  { sourceOrder: 86, targetOrder: 95, slot: 'home', team: 'winner' },
  { sourceOrder: 88, targetOrder: 95, slot: 'away', team: 'winner' },
  { sourceOrder: 85, targetOrder: 96, slot: 'home', team: 'winner' },
  { sourceOrder: 87, targetOrder: 96, slot: 'away', team: 'winner' },

  { sourceOrder: 90, targetOrder: 97, slot: 'home', team: 'winner' },
  { sourceOrder: 89, targetOrder: 97, slot: 'away', team: 'winner' },
  { sourceOrder: 94, targetOrder: 98, slot: 'home', team: 'winner' },
  { sourceOrder: 91, targetOrder: 98, slot: 'away', team: 'winner' },
  { sourceOrder: 92, targetOrder: 99, slot: 'home', team: 'winner' },
  { sourceOrder: 93, targetOrder: 99, slot: 'away', team: 'winner' },
  { sourceOrder: 96, targetOrder: 100, slot: 'home', team: 'winner' },
  { sourceOrder: 95, targetOrder: 100, slot: 'away', team: 'winner' },

  { sourceOrder: 97, targetOrder: 101, slot: 'home', team: 'winner' },
  { sourceOrder: 98, targetOrder: 101, slot: 'away', team: 'winner' },
  { sourceOrder: 99, targetOrder: 102, slot: 'home', team: 'winner' },
  { sourceOrder: 100, targetOrder: 102, slot: 'away', team: 'winner' },

  { sourceOrder: 101, targetOrder: 104, slot: 'home', team: 'winner' },
  { sourceOrder: 102, targetOrder: 104, slot: 'away', team: 'winner' },
  { sourceOrder: 101, targetOrder: 103, slot: 'home', team: 'loser' },
  { sourceOrder: 102, targetOrder: 103, slot: 'away', team: 'loser' }
];

async function propagateKnockoutWinners(db: D1Database) {
  const rows = await db.prepare(`
    SELECT id, stage, group_name, home_team_id, away_team_id, home_score, away_score, winner_team_id, starts_at, status, venue, match_order, external_provider, external_match_id, result_source, manually_locked
    FROM matches
    WHERE match_order BETWEEN 73 AND 104
    ORDER BY match_order ASC
  `).all<Match>();

  const byOrder = new Map(rows.results.map((match) => [match.match_order, match]));
  let updates = 0;
  let changed = true;

  while (changed) {
    changed = false;

    for (const rule of ADVANCEMENT_RULES) {
      const source = byOrder.get(rule.sourceOrder);
      const target = byOrder.get(rule.targetOrder);
      if (!source || !target || target.status === 'FINISHED') continue;

      const teamId = resolveAdvancedTeamId(source, rule.team);
      if (teamId === null) continue;

      const currentTeamId = rule.slot === 'home' ? target.home_team_id : target.away_team_id;
      if (currentTeamId === teamId) continue;
      if (currentTeamId !== null && !isTeamFromSource(currentTeamId, source)) continue;

      const field = rule.slot === 'home' ? 'home_team_id' : 'away_team_id';
      await db.prepare(`UPDATE matches SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(teamId, target.id).run();

      if (rule.slot === 'home') target.home_team_id = teamId;
      else target.away_team_id = teamId;

      updates += 1;
      changed = true;
    }
  }

  return updates;
}

function resolveAdvancedTeamId(match: Match, team: 'winner' | 'loser') {
  if (match.status !== 'FINISHED' || match.winner_team_id === null) return null;
  if (team === 'winner') return match.winner_team_id;

  if (match.home_team_id !== null && match.home_team_id !== match.winner_team_id) return match.home_team_id;
  if (match.away_team_id !== null && match.away_team_id !== match.winner_team_id) return match.away_team_id;

  return null;
}

function isTeamFromSource(teamId: number, match: Match) {
  return match.home_team_id === teamId || match.away_team_id === teamId;
}

function mapStatus(status: string): Match['status'] {
  const value = status.toUpperCase();
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(value)) return 'LIVE';
  if (['FINISHED', 'AWARDED'].includes(value)) return 'FINISHED';
  return 'SCHEDULED';
}

function mapStage(stage: string | null | undefined, utcDate: string) {
  const value = (stage || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (['GROUP_STAGE', 'GROUPS'].includes(value)) return 'Fase de grupos';
  if (['LAST_32', 'ROUND_OF_32', 'R32'].includes(value)) return '32avos de final';
  if (['LAST_16', 'ROUND_OF_16', 'R16'].includes(value)) return 'Octavos de final';
  if (['QUARTER_FINALS', 'QUARTERFINAL', 'QUARTER_FINAL'].includes(value)) return 'Cuartos de final';
  if (['SEMI_FINALS', 'SEMIFINAL', 'SEMI_FINAL'].includes(value)) return 'Semifinal';
  if (['THIRD_PLACE', 'THIRD_PLACE_PLAYOFF', 'THIRD_PLACE_GAME'].includes(value)) return 'Tercer puesto';
  if (value === 'FINAL') return 'Final';
  const time = new Date(utcDate).getTime();
  if (Number.isFinite(time)) {
    if (time >= Date.parse('2026-07-19T00:00:00Z')) return 'Final';
    if (time >= Date.parse('2026-07-18T00:00:00Z')) return 'Tercer puesto';
    if (time >= Date.parse('2026-07-14T00:00:00Z')) return 'Semifinal';
    if (time >= Date.parse('2026-07-09T00:00:00Z')) return 'Cuartos de final';
    if (time >= Date.parse('2026-07-04T00:00:00Z')) return 'Octavos de final';
    if (time >= Date.parse('2026-06-28T00:00:00Z')) return '32avos de final';
  }
  return 'Fase de grupos';
}

function canonicalStage(stage: string) {
  const value = stage.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (value.includes('32') || value.includes('dieciseisavos') || value.includes('round of 32')) return '32avos de final';
  if (value.includes('octavos') || value.includes('round of 16') || value.includes('last 16')) return 'octavos de final';
  if (value.includes('cuartos') || value.includes('quarter')) return 'cuartos de final';
  if (value.includes('semi')) return 'semifinal';
  if (value.includes('tercer') || value.includes('third')) return 'tercer puesto';
  if (value.includes('final')) return 'final';
  if (value.includes('grupo') || value.includes('group')) return 'fase de grupos';
  return value;
}

function normalizeGroup(group?: string | null) {
  if (!group) return null;
  const match = group.toUpperCase().match(/[A-L]/);
  return match ? match[0] : null;
}

function normalizeCode(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized ? normalized.slice(0, 12) : null;
}

function dateDiffMs(a: string, b: string) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Number.isNaN(da) || Number.isNaN(db) ? Number.MAX_SAFE_INTEGER : Math.abs(da - db);
}

function toUpdated(match: LocalMatch) {
  return { match_order: match.match_order, home_team: match.home_team_name || 'Local', away_team: match.away_team_name || 'Visitante', home_score: match.status === 'FINISHED' ? match.home_score : null, away_score: match.status === 'FINISHED' ? match.away_score : null };
}

function toUnmatched(match: FootballMatch) {
  return { external_match_id: match.id, home_team: match.homeTeam.name, away_team: match.awayTeam.name, utc_date: match.utcDate, home_score: Number.isInteger(match.score.fullTime?.home) ? Number(match.score.fullTime?.home) : null, away_score: Number.isInteger(match.score.fullTime?.away) ? Number(match.score.fullTime?.away) : null };
}

async function saveSyncLog(db: D1Database, summary: SyncSummary, status: 'SUCCESS' | 'ERROR', errorMessage: string | null) {
  await db.prepare('INSERT INTO result_sync_logs (provider, competition_code, season, status, fetched_count, finished_count, updated_count, skipped_count, unmatched_count, detail, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(summary.provider, summary.competition_code, summary.season, status, summary.fetched_count, summary.finished_count, summary.updated_count, summary.skipped_count, summary.unmatched_count, JSON.stringify({ updated_matches: summary.updated_matches, unmatched_matches: summary.unmatched_matches, propagated_count: summary.propagated_count }), errorMessage)
    .run();
}

async function getSetting(db: D1Database, key: string) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value || null;
}

async function getUser(request: Request, db: D1Database) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  return await db.prepare('SELECT u.id, u.name, u.email, u.role FROM sessions s INNER JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP').bind(tokenHash).first<User>();
}

async function getAdmin(request: Request, db: D1Database) {
  const user = await getUser(request, db);
  return user?.role === 'ADMIN' ? user : null;
}

async function logAdmin(db: D1Database, userId: number, action: string, entityType: string, entityId: string | null, detail: unknown, request: Request) {
  try {
    await db.prepare('INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, action, entityType, entityId, JSON.stringify(detail), getClientIp(request)).run();
  } catch (error) {
    console.warn('No se pudo registrar auditorÃ­a admin.', error);
  }
}

async function readJson(request: Request) {
  return await request.json().catch(() => ({})) as Record<string, unknown>;
}

function toScore(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 99 ? number : null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function getCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  const found = (request.headers.get('Cookie') || '').split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getClientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null;
}

function json(request: Request, env: Env, payload: unknown, status = 200) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.CORS_ORIGIN || 'http://localhost:5173';
  const headers = new Headers({ 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'X-Frame-Options': 'DENY' });
  if (!origin || origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin || allowedOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

