import originalWorker from './index';

type Env = {
  DB: D1Database;
  APP_ENV: string;
  CORS_ORIGIN: string;
  FOOTBALL_DATA_API_TOKEN?: string;
};

type WorkerExport = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;
};

type User = { id: number; name: string; email: string; role: 'USER' | 'ADMIN' };

type Match = {
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
  external_provider: string | null;
  external_match_id: string | null;
  result_source: 'MANUAL' | 'FOOTBALL_DATA';
  manually_locked: number;
};

type LocalMatch = Match & {
  home_team_name: string | null;
  home_team_code: string | null;
  away_team_name: string | null;
  away_team_code: string | null;
};

type Team = { id: number; name: string; code: string };

type FootballTeam = { id: number | null; name: string | null; shortName?: string | null; tla?: string | null };

type FootballMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam: FootballTeam;
  awayTeam: FootballTeam;
  score: { fullTime?: { home: number | null; away: number | null } | null };
};

type FootballMatchesResponse = { matches?: FootballMatch[] };

type ScoringRules = {
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
};

type ResultSyncSummary = {
  provider: 'FOOTBALL_DATA';
  competition_code: string;
  season: number;
  fetched_count: number;
  finished_count: number;
  updated_count: number;
  skipped_count: number;
  unmatched_count: number;
  created_count: number;
  fixture_updated_count: number;
  result_updated_count: number;
  updated_matches: Array<{ match_order: number; home_team: string; away_team: string; home_score: number | null; away_score: number | null }>;
  unmatched_matches: Array<{ external_match_id: number; home_team: string | null; away_team: string | null; utc_date: string; home_score: number | null; away_score: number | null }>;
};

type MatchPointsDetail = {
  points: number;
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  points_reason: string;
};

const COOKIE_NAME = 'pm_session';
const FOOTBALL_DATA_PROVIDER = 'FOOTBALL_DATA';
const FOOTBALL_DATA_COMPETITION_CODE = 'WC';
const FOOTBALL_DATA_SEASON = 2026;
const original = originalWorker as WorkerExport;

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    if (url.pathname === '/admin/sync-results' && request.method === 'POST') {
      const user = await getAdminFromRequest(request, env.DB);
      if (!user) return json(request, env, { error: 'No autorizado.' }, 401);

      try {
        const summary = await syncFootballDataMatches(env.DB, env.FOOTBALL_DATA_API_TOKEN);
        await logAdminAction(request, env.DB, user.id, summary);
        return json(request, env, { summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo sincronizar resultados.';
        return json(request, env, { error: message }, 500);
      }
    }

    return original.fetch(request, env, ctx);
  },

  scheduled: async (_event: unknown, env: Env) => {
    try {
      await syncFootballDataMatches(env.DB, env.FOOTBALL_DATA_API_TOKEN);
    } catch (error) {
      console.error('No se pudo sincronizar resultados automáticamente.', error);
    }
  }
};

async function syncFootballDataMatches(db: D1Database, token?: string): Promise<ResultSyncSummary> {
  const summary: ResultSyncSummary = {
    provider: FOOTBALL_DATA_PROVIDER,
    competition_code: FOOTBALL_DATA_COMPETITION_CODE,
    season: FOOTBALL_DATA_SEASON,
    fetched_count: 0,
    finished_count: 0,
    updated_count: 0,
    skipped_count: 0,
    unmatched_count: 0,
    created_count: 0,
    fixture_updated_count: 0,
    result_updated_count: 0,
    updated_matches: [],
    unmatched_matches: []
  };

  try {
    if (!token) throw new Error('No está configurado FOOTBALL_DATA_API_TOKEN en el Worker.');

    const externalMatches = await fetchFootballDataMatches(token);
    summary.fetched_count = externalMatches.length;
    summary.finished_count = externalMatches.filter(isFinishedWithScore).length;

    const localMatches = await getLocalMatches(db);
    const usedLocalIds = new Set<number>();

    for (const externalMatch of externalMatches) {
      const homeTeamId = await ensureTeam(db, externalMatch.homeTeam);
      const awayTeamId = await ensureTeam(db, externalMatch.awayTeam);

      if (!homeTeamId || !awayTeamId) {
        summary.unmatched_count += 1;
        summary.unmatched_matches.push(toUnmatchedSummary(externalMatch));
        continue;
      }

      const status = mapStatus(externalMatch.status);
      const stage = mapStage(externalMatch.stage, externalMatch.utcDate);
      const groupName = stage === 'Fase de grupos' ? normalizeGroup(externalMatch.group) : null;
      const externalId = String(externalMatch.id);
      const finished = isFinishedWithScore(externalMatch);
      const externalHomeScore = finished ? Number(externalMatch.score.fullTime?.home) : null;
      const externalAwayScore = finished ? Number(externalMatch.score.fullTime?.away) : null;
      const candidate = findLocalMatch(externalMatch, localMatches, homeTeamId, awayTeamId, usedLocalIds);

      if (!candidate) {
        const created = await createMatch(db, externalMatch, homeTeamId, awayTeamId, stage, groupName, status, externalHomeScore, externalAwayScore);
        localMatches.push(created);
        usedLocalIds.add(created.id);
        summary.created_count += 1;
        summary.updated_count += 1;
        summary.fixture_updated_count += 1;
        if (finished) {
          summary.result_updated_count += 1;
          await recalculateMatch(db, created.id);
        }
        summary.updated_matches.push(toUpdatedSummary(created, externalMatch.homeTeam.name, externalMatch.awayTeam.name));
        continue;
      }

      const { match, isReversed } = candidate;
      usedLocalIds.add(match.id);

      const nextHomeTeamId = isReversed ? awayTeamId : homeTeamId;
      const nextAwayTeamId = isReversed ? homeTeamId : awayTeamId;
      const nextHomeScore = isReversed ? externalAwayScore : externalHomeScore;
      const nextAwayScore = isReversed ? externalHomeScore : externalAwayScore;
      const canUpdateResult = finished && match.manually_locked !== 1;

      const fixtureChanged =
        match.external_provider !== FOOTBALL_DATA_PROVIDER ||
        match.external_match_id !== externalId ||
        match.home_team_id !== nextHomeTeamId ||
        match.away_team_id !== nextAwayTeamId ||
        match.starts_at !== externalMatch.utcDate ||
        match.stage !== stage ||
        normalizeNullable(match.group_name) !== normalizeNullable(groupName);

      const resultChanged = Boolean(
        canUpdateResult &&
        (match.status !== 'FINISHED' || match.home_score !== nextHomeScore || match.away_score !== nextAwayScore)
      );
      const liveStatusChanged = !finished && match.manually_locked !== 1 && match.status !== status;

      if (!fixtureChanged && !resultChanged && !liveStatusChanged) {
        await touchSync(db, match.id, externalId);
        summary.skipped_count += 1;
        continue;
      }

      await updateMatch(db, {
        matchId: match.id,
        stage,
        groupName,
        homeTeamId: nextHomeTeamId,
        awayTeamId: nextAwayTeamId,
        startsAt: externalMatch.utcDate,
        status: canUpdateResult ? 'FINISHED' : status,
        homeScore: canUpdateResult ? nextHomeScore : match.home_score,
        awayScore: canUpdateResult ? nextAwayScore : match.away_score,
        updateResult: canUpdateResult,
        externalId
      });

      const updatedMatch: LocalMatch = {
        ...match,
        stage,
        group_name: groupName,
        home_team_id: nextHomeTeamId,
        away_team_id: nextAwayTeamId,
        starts_at: externalMatch.utcDate,
        status: canUpdateResult ? 'FINISHED' : status,
        home_score: canUpdateResult ? nextHomeScore : match.home_score,
        away_score: canUpdateResult ? nextAwayScore : match.away_score,
        external_provider: FOOTBALL_DATA_PROVIDER,
        external_match_id: externalId,
        home_team_name: isReversed ? externalMatch.awayTeam.name : externalMatch.homeTeam.name,
        away_team_name: isReversed ? externalMatch.homeTeam.name : externalMatch.awayTeam.name,
        home_team_code: isReversed ? externalMatch.awayTeam.tla || null : externalMatch.homeTeam.tla || null,
        away_team_code: isReversed ? externalMatch.homeTeam.tla || null : externalMatch.awayTeam.tla || null
      };

      const index = localMatches.findIndex((item) => item.id === match.id);
      if (index >= 0) localMatches[index] = updatedMatch;

      summary.updated_count += 1;
      if (fixtureChanged) summary.fixture_updated_count += 1;
      if (resultChanged) {
        summary.result_updated_count += 1;
        await recalculateMatch(db, match.id);
      }
      summary.updated_matches.push(toUpdatedSummary(updatedMatch, externalMatch.homeTeam.name, externalMatch.awayTeam.name));
    }

    await saveResultSyncLog(db, summary, 'SUCCESS', null);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar resultados.';
    await saveResultSyncLog(db, summary, 'ERROR', message);
    throw error;
  }
}

async function fetchFootballDataMatches(token: string) {
  const url = `https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION_CODE}/matches?season=${FOOTBALL_DATA_SEASON}`;
  const response = await fetch(url, { headers: { 'X-Auth-Token': token } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`football-data.org respondió ${response.status}. ${text || 'No se pudieron obtener resultados.'}`);
  }
  const payload = await response.json() as FootballMatchesResponse;
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

function findLocalMatch(externalMatch: FootballMatch, localMatches: LocalMatch[], homeTeamId: number, awayTeamId: number, usedLocalIds: Set<number>) {
  const externalId = String(externalMatch.id);
  const direct = localMatches.find((match) => !usedLocalIds.has(match.id) && match.external_provider === FOOTBALL_DATA_PROVIDER && match.external_match_id === externalId);
  if (direct) {
    const direction = getDirection(externalMatch, direct, homeTeamId, awayTeamId);
    return { match: direct, isReversed: direction === 'REVERSED' };
  }

  const teamCandidates = localMatches
    .filter((match) => !usedLocalIds.has(match.id))
    .map((match) => ({ match, direction: getDirection(externalMatch, match, homeTeamId, awayTeamId) }))
    .filter((candidate): candidate is { match: LocalMatch; direction: 'NORMAL' | 'REVERSED' } => candidate.direction !== null)
    .map((candidate) => ({ match: candidate.match, isReversed: candidate.direction === 'REVERSED', diff: dateDiffMs(externalMatch.utcDate, candidate.match.starts_at) }))
    .sort((a, b) => a.diff - b.diff);

  const closeTeamCandidate = teamCandidates.find((candidate) => candidate.diff <= 48 * 60 * 60 * 1000);
  if (closeTeamCandidate) return closeTeamCandidate;

  const externalStage = mapStage(externalMatch.stage, externalMatch.utcDate);
  const placeholderCandidates = localMatches
    .filter((match) => !usedLocalIds.has(match.id))
    .filter((match) => match.home_team_id === null || match.away_team_id === null)
    .filter((match) => canonicalStage(match.stage) === canonicalStage(externalStage))
    .map((match) => ({ match, isReversed: false, diff: dateDiffMs(externalMatch.utcDate, match.starts_at) }))
    .sort((a, b) => a.diff - b.diff);

  return placeholderCandidates.find((candidate) => candidate.diff <= 72 * 60 * 60 * 1000) || null;
}

function getDirection(externalMatch: FootballMatch, localMatch: LocalMatch, homeTeamId: number, awayTeamId: number): 'NORMAL' | 'REVERSED' | null {
  if (localMatch.home_team_id === homeTeamId && localMatch.away_team_id === awayTeamId) return 'NORMAL';
  if (localMatch.home_team_id === awayTeamId && localMatch.away_team_id === homeTeamId) return 'REVERSED';

  const homeHome = teamMatches(externalMatch.homeTeam, localMatch.home_team_name, localMatch.home_team_code);
  const awayAway = teamMatches(externalMatch.awayTeam, localMatch.away_team_name, localMatch.away_team_code);
  if (homeHome && awayAway) return 'NORMAL';

  const homeAway = teamMatches(externalMatch.homeTeam, localMatch.away_team_name, localMatch.away_team_code);
  const awayHome = teamMatches(externalMatch.awayTeam, localMatch.home_team_name, localMatch.home_team_code);
  if (homeAway && awayHome) return 'REVERSED';

  return null;
}

async function ensureTeam(db: D1Database, externalTeam: FootballTeam): Promise<number | null> {
  const name = externalTeam.name?.trim() || externalTeam.shortName?.trim() || externalTeam.tla?.trim();
  const code = normalizeTeamCode(externalTeam.tla || externalTeam.shortName || externalTeam.name);
  if (!name || !code) return null;

  const byCode = await db.prepare('SELECT id FROM teams WHERE UPPER(code) = ?').bind(code).first<{ id: number }>();
  if (byCode) return byCode.id;

  const rows = await db.prepare('SELECT id, name, code FROM teams').all<Team>();
  const found = rows.results.find((team) => canonicalTeamName(team.name) === canonicalTeamName(name) || canonicalTeamName(team.code) === canonicalTeamName(code));
  if (found) return found.id;

  const inserted = await db.prepare('INSERT INTO teams (name, code, flag_code, group_name) VALUES (?, ?, ?, NULL) RETURNING id')
    .bind(name, code, flagCodeForTeam(code))
    .first<{ id: number }>();
  return inserted?.id || null;
}

async function createMatch(
  db: D1Database,
  externalMatch: FootballMatch,
  homeTeamId: number,
  awayTeamId: number,
  stage: string,
  groupName: string | null,
  status: Match['status'],
  homeScore: number | null,
  awayScore: number | null
): Promise<LocalMatch> {
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(match_order), 0) AS value FROM matches').first<{ value: number }>();
  const matchOrder = Number(maxOrder?.value || 0) + 1;
  const finished = status === 'FINISHED' && homeScore !== null && awayScore !== null;

  const row = await db.prepare(`
    INSERT INTO matches (stage, group_name, home_team_id, away_team_id, home_score, away_score, starts_at, status, venue, match_order, external_provider, external_match_id, last_synced_at, result_source, manually_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
    RETURNING *
  `).bind(
    stage,
    groupName,
    homeTeamId,
    awayTeamId,
    finished ? homeScore : null,
    finished ? awayScore : null,
    externalMatch.utcDate,
    status,
    matchOrder,
    FOOTBALL_DATA_PROVIDER,
    String(externalMatch.id),
    finished ? FOOTBALL_DATA_PROVIDER : 'MANUAL'
  ).first<Match>();

  if (!row) throw new Error('No se pudo crear un partido faltante durante la sincronización.');
  return { ...row, home_team_name: externalMatch.homeTeam.name, home_team_code: externalMatch.homeTeam.tla || null, away_team_name: externalMatch.awayTeam.name, away_team_code: externalMatch.awayTeam.tla || null };
}

async function updateMatch(db: D1Database, input: {
  matchId: number;
  stage: string;
  groupName: string | null;
  homeTeamId: number;
  awayTeamId: number;
  startsAt: string;
  status: Match['status'];
  homeScore: number | null;
  awayScore: number | null;
  updateResult: boolean;
  externalId: string;
}) {
  if (input.updateResult) {
    await db.prepare(`
      UPDATE matches
      SET stage = ?, group_name = ?, home_team_id = ?, away_team_id = ?, home_score = ?, away_score = ?, starts_at = ?, status = 'FINISHED', external_provider = ?, external_match_id = ?, last_synced_at = CURRENT_TIMESTAMP, result_source = 'FOOTBALL_DATA', manually_locked = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(input.stage, input.groupName, input.homeTeamId, input.awayTeamId, input.homeScore, input.awayScore, input.startsAt, FOOTBALL_DATA_PROVIDER, input.externalId, input.matchId).run();
    return;
  }

  await db.prepare(`
    UPDATE matches
    SET stage = ?, group_name = ?, home_team_id = ?, away_team_id = ?, starts_at = ?, status = CASE WHEN manually_locked = 1 THEN status ELSE ? END, external_provider = ?, external_match_id = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(input.stage, input.groupName, input.homeTeamId, input.awayTeamId, input.startsAt, input.status, FOOTBALL_DATA_PROVIDER, input.externalId, input.matchId).run();
}

async function touchSync(db: D1Database, matchId: number, externalId: string) {
  await db.prepare('UPDATE matches SET external_provider = ?, external_match_id = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(FOOTBALL_DATA_PROVIDER, externalId, matchId)
    .run();
}

async function recalculateMatch(db: D1Database, matchId: number) {
  const match = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return;

  if (match.status !== 'FINISHED' || match.home_score === null || match.away_score === null) {
    await db.prepare(`
      UPDATE predictions
      SET points = 0, exact_score_points = 0, correct_winner_points = 0, correct_draw_points = 0, goal_difference_points = 0, points_reason = 'Pendiente', updated_at = CURRENT_TIMESTAMP
      WHERE match_id = ?
    `).bind(matchId).run();
    return;
  }

  const rules = await getScoringRules(db);
  const predictions = await db.prepare('SELECT id, home_score, away_score FROM predictions WHERE match_id = ?').bind(matchId).all<{ id: number; home_score: number; away_score: number }>();

  for (const prediction of predictions.results) {
    const detail = calculatePointsDetail(prediction.home_score, prediction.away_score, match.home_score, match.away_score, rules);
    await db.prepare(`
      UPDATE predictions
      SET points = ?, exact_score_points = ?, correct_winner_points = ?, correct_draw_points = ?, goal_difference_points = ?, points_reason = ?, locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(detail.points, detail.exact_score_points, detail.correct_winner_points, detail.correct_draw_points, detail.goal_difference_points, detail.points_reason, prediction.id).run();
  }
}

async function getScoringRules(db: D1Database): Promise<ScoringRules> {
  const rules = await db.prepare('SELECT exact_score_points, correct_winner_points, correct_draw_points, goal_difference_points FROM scoring_rules WHERE id = 1').first<ScoringRules>();
  return rules || { exact_score_points: 5, correct_winner_points: 3, correct_draw_points: 3, goal_difference_points: 1 };
}

function calculatePointsDetail(predHome: number, predAway: number, realHome: number, realAway: number, rules: ScoringRules): MatchPointsDetail {
  if (predHome === realHome && predAway === realAway) {
    return { points: rules.exact_score_points, exact_score_points: rules.exact_score_points, correct_winner_points: 0, correct_draw_points: 0, goal_difference_points: 0, points_reason: 'Resultado exacto' };
  }

  const predictedOutcome = getOutcome(predHome, predAway);
  const realOutcome = getOutcome(realHome, realAway);
  if (predictedOutcome !== realOutcome) {
    return { points: 0, exact_score_points: 0, correct_winner_points: 0, correct_draw_points: 0, goal_difference_points: 0, points_reason: 'Sin puntos' };
  }

  if (realOutcome === 'DRAW') {
    return { points: rules.correct_draw_points, exact_score_points: 0, correct_winner_points: 0, correct_draw_points: rules.correct_draw_points, goal_difference_points: 0, points_reason: 'Empate correcto' };
  }

  const goalDifferenceHit = predHome - predAway === realHome - realAway;
  const goalDifferencePoints = goalDifferenceHit ? rules.goal_difference_points : 0;
  return { points: rules.correct_winner_points + goalDifferencePoints, exact_score_points: 0, correct_winner_points: rules.correct_winner_points, correct_draw_points: 0, goal_difference_points: goalDifferencePoints, points_reason: goalDifferenceHit ? 'Ganador correcto + diferencia de goles' : 'Ganador correcto' };
}

function getOutcome(home: number, away: number) {
  if (home === away) return 'DRAW';
  return home > away ? 'HOME' : 'AWAY';
}

async function saveResultSyncLog(db: D1Database, summary: ResultSyncSummary, status: 'SUCCESS' | 'ERROR', errorMessage: string | null) {
  await db.prepare(`
    INSERT INTO result_sync_logs (provider, competition_code, season, status, fetched_count, finished_count, updated_count, skipped_count, unmatched_count, detail, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    summary.provider,
    summary.competition_code,
    summary.season,
    status,
    summary.fetched_count,
    summary.finished_count,
    summary.updated_count,
    summary.skipped_count,
    summary.unmatched_count,
    JSON.stringify({ updated_matches: summary.updated_matches, unmatched_matches: summary.unmatched_matches, created_count: summary.created_count, fixture_updated_count: summary.fixture_updated_count, result_updated_count: summary.result_updated_count }),
    errorMessage
  ).run();
}

async function getAdminFromRequest(request: Request, db: D1Database) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const user = await db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.role = 'ADMIN'
  `).bind(tokenHash).first<User>();
  return user || null;
}

async function logAdminAction(request: Request, db: D1Database, adminUserId: number, summary: ResultSyncSummary) {
  try {
    await db.prepare('INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(adminUserId, 'SYNC_RESULTS', 'system', 'football-data', JSON.stringify(summary), getClientIp(request))
      .run();
  } catch (error) {
    console.warn('No se pudo registrar auditoría admin para sync.', error);
  }
}

function isFinishedWithScore(match: FootballMatch) {
  return match.status === 'FINISHED' && Number.isInteger(match.score.fullTime?.home) && Number.isInteger(match.score.fullTime?.away);
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
  return value;
}

function normalizeGroup(group?: string | null) {
  if (!group) return null;
  const match = group.toUpperCase().match(/[A-L]/);
  return match ? match[0] : null;
}

function normalizeTeamCode(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized ? normalized.slice(0, 12) : null;
}

function flagCodeForTeam(code: string) {
  const flags: Record<string, string> = { ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BIH: 'ba', BRA: 'br', CAN: 'ca', CIV: 'ci', COD: 'cd', COL: 'co', CPV: 'cv', CRO: 'hr', CZE: 'cz', ECU: 'ec', EGY: 'eg', ENG: 'gb-eng', ESP: 'es', FRA: 'fr', GER: 'de', GHA: 'gh', IRQ: 'iq', IRN: 'ir', JPN: 'jp', KOR: 'kr', KSA: 'sa', MAR: 'ma', MEX: 'mx', NED: 'nl', NOR: 'no', PAN: 'pa', PAR: 'py', POR: 'pt', QAT: 'qa', RSA: 'za', SCO: 'gb-sct', SEN: 'sn', SUI: 'ch', SWE: 'se', TUN: 'tn', TUR: 'tr', URU: 'uy', USA: 'us', UZB: 'uz' };
  return flags[code] || code.toLowerCase();
}

function teamMatches(externalTeam: FootballTeam, localName: string | null, localCode: string | null) {
  const externalValues = [externalTeam.tla, externalTeam.shortName, externalTeam.name].filter((value): value is string => Boolean(value)).map(canonicalTeamName);
  const localValues = [localCode, localName].filter((value): value is string => Boolean(value)).map(canonicalTeamName);
  return externalValues.some((value) => localValues.includes(value));
}

function canonicalTeamName(value: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases: Record<string, string> = {
    alg: 'algeria', algeria: 'algeria', arg: 'argentina', argentina: 'argentina', aus: 'australia', australia: 'australia', aut: 'austria', austria: 'austria', bel: 'belgium', belgium: 'belgium', belgica: 'belgium', bih: 'bosnia and herzegovina', bosnia: 'bosnia and herzegovina', 'bosnia and herzegovina': 'bosnia and herzegovina', bra: 'brazil', brazil: 'brazil', brasil: 'brazil', can: 'canada', canada: 'canada', civ: 'ivory coast', 'cote d ivoire': 'ivory coast', 'ivory coast': 'ivory coast', 'costa de marfil': 'ivory coast', cod: 'dr congo', 'dr congo': 'dr congo', 'rd congo': 'dr congo', col: 'colombia', colombia: 'colombia', cpv: 'cape verde', 'cape verde': 'cape verde', 'cabo verde': 'cape verde', cro: 'croatia', croatia: 'croatia', croacia: 'croatia', cze: 'czechia', czechia: 'czechia', 'republica checa': 'czechia', ecu: 'ecuador', ecuador: 'ecuador', egy: 'egypt', egypt: 'egypt', egipto: 'egypt', eng: 'england', england: 'england', inglaterra: 'england', esp: 'spain', spain: 'spain', espana: 'spain', fra: 'france', france: 'france', francia: 'france', ger: 'germany', germany: 'germany', alemania: 'germany', gha: 'ghana', irq: 'iraq', iraq: 'iraq', irak: 'iraq', irn: 'iran', iran: 'iran', jpn: 'japan', japan: 'japan', japon: 'japan', kor: 'south korea', korea: 'south korea', 'korea republic': 'south korea', 'south korea': 'south korea', 'corea del sur': 'south korea', ksa: 'saudi arabia', 'saudi arabia': 'saudi arabia', 'arabia saudita': 'saudi arabia', mar: 'morocco', morocco: 'morocco', marruecos: 'morocco', mex: 'mexico', mexico: 'mexico', ned: 'netherlands', netherlands: 'netherlands', holanda: 'netherlands', 'paises bajos': 'netherlands', nor: 'norway', norway: 'norway', noruega: 'norway', pan: 'panama', panama: 'panama', par: 'paraguay', paraguay: 'paraguay', por: 'portugal', qat: 'qatar', qatar: 'qatar', rsa: 'south africa', 'south africa': 'south africa', sudafrica: 'south africa', sco: 'scotland', scotland: 'scotland', escocia: 'scotland', sen: 'senegal', swe: 'sweden', sweden: 'sweden', suecia: 'sweden', sui: 'switzerland', switzerland: 'switzerland', suiza: 'switzerland', tun: 'tunisia', tunisia: 'tunisia', tunez: 'tunisia', tur: 'turkiye', turkey: 'turkiye', turkiye: 'turkiye', turquia: 'turkiye', uru: 'uruguay', usa: 'usa', 'united states': 'usa', 'united states of america': 'usa', 'estados unidos': 'usa', uzb: 'uzbekistan'
  };
  return aliases[normalized] || normalized;
}

function dateDiffMs(valueA: string, valueB: string) {
  const dateA = new Date(valueA).getTime();
  const dateB = new Date(valueB).getTime();
  return Number.isNaN(dateA) || Number.isNaN(dateB) ? Number.MAX_SAFE_INTEGER : Math.abs(dateA - dateB);
}

function normalizeNullable(value: string | null) {
  return value || null;
}

function toUpdatedSummary(match: LocalMatch, fallbackHome: string | null, fallbackAway: string | null) {
  return { match_order: match.match_order, home_team: match.home_team_name || fallbackHome || 'Local', away_team: match.away_team_name || fallbackAway || 'Visitante', home_score: match.status === 'FINISHED' ? match.home_score : null, away_score: match.status === 'FINISHED' ? match.away_score : null };
}

function toUnmatchedSummary(match: FootballMatch) {
  return { external_match_id: match.id, home_team: match.homeTeam.name, away_team: match.awayTeam.name, utc_date: match.utcDate, home_score: Number.isInteger(match.score.fullTime?.home) ? Number(match.score.fullTime?.home) : null, away_score: Number.isInteger(match.score.fullTime?.away) ? Number(match.score.fullTime?.away) : null };
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const prefix = `${name}=`;
  const found = cookieHeader.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(prefix));
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
