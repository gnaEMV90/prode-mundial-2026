import originalWorker from './index';

type Env = {
  DB: D1Database;
  APP_ENV: string;
  CORS_ORIGIN: string;
  FOOTBALL_DATA_API_TOKEN?: string;
};

type WorkerExport = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;
  scheduled?: (event: unknown, env: Env, ctx: ExecutionContext) => Promise<void> | void;
};

type User = {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
};

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
  last_synced_at: string | null;
  result_source: 'MANUAL' | 'FOOTBALL_DATA';
  manually_locked: number;
};

type LocalMatchForSync = Match & {
  home_team_name: string | null;
  home_team_code: string | null;
  away_team_name: string | null;
  away_team_code: string | null;
};

type Team = {
  id: number;
  name: string;
  code: string;
  flag_code: string | null;
  group_name: string | null;
};

type ScoringRules = {
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
};

type FootballDataTeam = {
  id: number | null;
  name: string | null;
  shortName?: string | null;
  tla?: string | null;
};

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam: FootballDataTeam;
  awayTeam: FootballDataTeam;
  score: {
    fullTime?: {
      home: number | null;
      away: number | null;
    } | null;
  };
};

type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

type SyncMatchSummary = {
  match_order: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
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
  updated_matches: SyncMatchSummary[];
  unmatched_matches: Array<{
    external_match_id: number;
    home_team: string | null;
    away_team: string | null;
    utc_date: string;
    home_score: number | null;
    away_score: number | null;
  }>;
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
        await logAdminAction(request, env.DB, user.id, 'SYNC_RESULTS', 'system', 'football-data', summary);
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
    if (!token) {
      throw new Error('No está configurado FOOTBALL_DATA_API_TOKEN en el Worker.');
    }

    const externalMatches = await fetchFootballDataMatches(token);
    summary.fetched_count = externalMatches.length;
    summary.finished_count = externalMatches.filter(isFinishedWithScore).length;

    const localMatches = await getLocalMatchesForSync(db);
    const usedLocalMatchIds = new Set<number>();

    for (const externalMatch of externalMatches) {
      const homeTeamId = await ensureTeam(db, externalMatch.homeTeam);
      const awayTeamId = await ensureTeam(db, externalMatch.awayTeam);

      if (!homeTeamId || !awayTeamId) {
        summary.unmatched_count += 1;
        summary.unmatched_matches.push(toUnmatchedSummary(externalMatch));
        continue;
      }

      const candidate = findLocalMatchForSync(externalMatch, localMatches, homeTeamId, awayTeamId, usedLocalMatchIds);
      const externalMatchId = String(externalMatch.id);
      const status = mapFootballDataStatus(externalMatch.status);
      const stage = mapFootballDataStage(externalMatch.stage);
      const groupName = stage === 'Fase de grupos' ? normalizeGroup(externalMatch.group) : null;
      const isFinished = isFinishedWithScore(externalMatch);
      const externalHomeScore = isFinished ? Number(externalMatch.score.fullTime?.home) : null;
      const externalAwayScore = isFinished ? Number(externalMatch.score.fullTime?.away) : null;

      if (!candidate) {
        const created = await createLocalMatchFromExternal(db, externalMatch, homeTeamId, awayTeamId, stage, groupName, status, externalHomeScore, externalAwayScore);
        localMatches.push(created);
        usedLocalMatchIds.add(created.id);

        summary.created_count += 1;
        summary.updated_count += 1;
        summary.fixture_updated_count += 1;
        if (isFinished) summary.result_updated_count += 1;
        summary.updated_matches.push(toUpdatedSummary(created, externalMatch.homeTeam.name, externalMatch.awayTeam.name));

        if (isFinished) await recalculateMatch(db, created.id);
        continue;
      }

      const { match: localMatch, isReversed } = candidate;
      usedLocalMatchIds.add(localMatch.id);

      const nextHomeTeamId = isReversed ? awayTeamId : homeTeamId;
      const nextAwayTeamId = isReversed ? homeTeamId : awayTeamId;
      const nextHomeScore = isReversed ? externalAwayScore : externalHomeScore;
      const nextAwayScore = isReversed ? externalHomeScore : externalAwayScore;
      const canUpdateResult = isFinished && localMatch.manually_locked !== 1;

      const fixtureChanged =
        localMatch.external_provider !== FOOTBALL_DATA_PROVIDER ||
        localMatch.external_match_id !== externalMatchId ||
        localMatch.home_team_id !== nextHomeTeamId ||
        localMatch.away_team_id !== nextAwayTeamId ||
        localMatch.starts_at !== externalMatch.utcDate ||
        localMatch.stage !== stage ||
        normalizeNullable(localMatch.group_name) !== normalizeNullable(groupName);

      const resultChanged = Boolean(
        canUpdateResult &&
        (localMatch.status !== 'FINISHED' || localMatch.home_score !== nextHomeScore || localMatch.away_score !== nextAwayScore)
      );

      const liveStatusChanged = !isFinished && localMatch.manually_locked !== 1 && localMatch.status !== status;

      if (!fixtureChanged && !resultChanged && !liveStatusChanged) {
        await touchExternalSync(db, localMatch.id, externalMatchId);
        summary.skipped_count += 1;
        continue;
      }

      await updateLocalMatchFromExternal(db, {
        matchId: localMatch.id,
        stage,
        groupName,
        homeTeamId: nextHomeTeamId,
        awayTeamId: nextAwayTeamId,
        startsAt: externalMatch.utcDate,
        status: canUpdateResult ? 'FINISHED' : status,
        homeScore: canUpdateResult ? nextHomeScore : localMatch.home_score,
        awayScore: canUpdateResult ? nextAwayScore : localMatch.away_score,
        updateResult: canUpdateResult,
        externalMatchId
      });

      const updatedLocalMatch: LocalMatchForSync = {
        ...localMatch,
        stage,
        group_name: groupName,
        home_team_id: nextHomeTeamId,
        away_team_id: nextAwayTeamId,
        starts_at: externalMatch.utcDate,
        status: canUpdateResult ? 'FINISHED' : status,
        home_score: canUpdateResult ? nextHomeScore : localMatch.home_score,
        away_score: canUpdateResult ? nextAwayScore : localMatch.away_score,
        external_provider: FOOTBALL_DATA_PROVIDER,
        external_match_id: externalMatchId,
        home_team_name: isReversed ? externalMatch.awayTeam.name : externalMatch.homeTeam.name,
        away_team_name: isReversed ? externalMatch.homeTeam.name : externalMatch.awayTeam.name,
        home_team_code: isReversed ? externalMatch.awayTeam.tla || null : externalMatch.homeTeam.tla || null,
        away_team_code: isReversed ? externalMatch.homeTeam.tla || null : externalMatch.awayTeam.tla || null
      };

      const index = localMatches.findIndex((item) => item.id === localMatch.id);
      if (index >= 0) localMatches[index] = updatedLocalMatch;

      summary.updated_count += 1;
      if (fixtureChanged) summary.fixture_updated_count += 1;
      if (resultChanged) summary.result_updated_count += 1;
      summary.updated_matches.push(toUpdatedSummary(updatedLocalMatch, externalMatch.homeTeam.name, externalMatch.awayTeam.name));

      if (resultChanged) await recalculateMatch(db, localMatch.id);
    }

    await saveResultSyncLog(db, summary, 'SUCCESS', null);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo sincronizar resultados.';
    await saveResultSyncLog(db, summary, 'ERROR', message);
    throw error;
  }
}

async function fetchFootballDataMatches(token: string): Promise<FootballDataMatch[]> {
  const url = `https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION_CODE}/matches?season=${FOOTBALL_DATA_SEASON}`;
  const response = await fetch(url, { headers: { 'X-Auth-Token': token } });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`football-data.org respondió ${response.status}. ${text || 'No se pudieron obtener resultados.'}`);
  }

  const payload = await response.json() as FootballDataMatchesResponse;
  return Array.isArray(payload.matches) ? payload.matches : [];
}

async function getLocalMatchesForSync(db: D1Database): Promise<LocalMatchForSync[]> {
  const rows = await db.prepare(`
    SELECT
      m.*,
      ht.name AS home_team_name,
      ht.code AS home_team_code,
      at.name AS away_team_name,
      at.code AS away_team_code
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.match_order ASC
  `).all<LocalMatchForSync>();

  return rows.results;
}

function findLocalMatchForSync(
  externalMatch: FootballDataMatch,
  localMatches: LocalMatchForSync[],
  homeTeamId: number,
  awayTeamId: number,
  usedLocalMatchIds: Set<number>
) {
  const externalId = String(externalMatch.id);
  const directMatch = localMatches.find((match) => !usedLocalMatchIds.has(match.id) && match.external_provider === FOOTBALL_DATA_PROVIDER && match.external_match_id === externalId);

  if (directMatch) {
    const directDirection = getMatchDirectionForSync(externalMatch, directMatch, homeTeamId, awayTeamId);
    return { match: directMatch, isReversed: directDirection === 'REVERSED' };
  }

  const teamCandidates = localMatches
    .filter((match) => !usedLocalMatchIds.has(match.id))
    .map((match) => ({ match, direction: getMatchDirectionForSync(externalMatch, match, homeTeamId, awayTeamId) }))
    .filter((candidate): candidate is { match: LocalMatchForSync; direction: 'NORMAL' | 'REVERSED' } => candidate.direction !== null)
    .map((candidate) => ({
      match: candidate.match,
      isReversed: candidate.direction === 'REVERSED',
      diff: dateDiffMs(externalMatch.utcDate, candidate.match.starts_at)
    }))
    .sort((a, b) => a.diff - b.diff);

  const closeTeamCandidate = teamCandidates.find((candidate) => candidate.diff <= 48 * 60 * 60 * 1000);
  if (closeTeamCandidate) return closeTeamCandidate;

  const externalStage = mapFootballDataStage(externalMatch.stage);
  const placeholderCandidates = localMatches
    .filter((match) => !usedLocalMatchIds.has(match.id))
    .filter((match) => match.home_team_id === null || match.away_team_id === null)
    .filter((match) => canonicalStage(match.stage) === canonicalStage(externalStage))
    .map((match) => ({
      match,
      isReversed: false,
      diff: dateDiffMs(externalMatch.utcDate, match.starts_at)
    }))
    .sort((a, b) => a.diff - b.diff);

  const closePlaceholder = placeholderCandidates.find((candidate) => candidate.diff <= 72 * 60 * 60 * 1000);
  return closePlaceholder || null;
}

function getMatchDirectionForSync(
  externalMatch: FootballDataMatch,
  localMatch: LocalMatchForSync,
  homeTeamId: number,
  awayTeamId: number
): 'NORMAL' | 'REVERSED' | null {
  if (localMatch.home_team_id === homeTeamId && localMatch.away_team_id === awayTeamId) return 'NORMAL';
  if (localMatch.home_team_id === awayTeamId && localMatch.away_team_id === homeTeamId) return 'REVERSED';

  const homeMatchesHome = teamsMatchForSync(externalMatch.homeTeam, localMatch.home_team_name, localMatch.home_team_code);
  const awayMatchesAway = teamsMatchForSync(externalMatch.awayTeam, localMatch.away_team_name, localMatch.away_team_code);
  if (homeMatchesHome && awayMatchesAway) return 'NORMAL';

  const homeMatchesAway = teamsMatchForSync(externalMatch.homeTeam, localMatch.away_team_name, localMatch.away_team_code);
  const awayMatchesHome = teamsMatchForSync(externalMatch.awayTeam, localMatch.home_team_name, localMatch.home_team_code);
  if (homeMatchesAway && awayMatchesHome) return 'REVERSED';

  return null;
}

async function ensureTeam(db: D1Database, externalTeam: FootballDataTeam): Promise<number | null> {
  const name = externalTeam.name?.trim() || externalTeam.shortName?.trim() || externalTeam.tla?.trim();
  const code = normalizeTeamCode(externalTeam.tla || externalTeam.shortName || externalTeam.name);
  if (!name || !code) return null;

  const byCode = await db.prepare('SELECT id FROM teams WHERE UPPER(code) = ?').bind(code).first<{ id: number }>();
  if (byCode) return byCode.id;

  const teams = await db.prepare('SELECT id, name, code FROM teams').all<Team>();
  const found = teams.results.find((team) => canonicalTeamName(team.name) === canonicalTeamName(name) || canonicalTeamName(team.code) === canonicalTeamName(code));
  if (found) return found.id;

  const inserted = await db.prepare(`
    INSERT INTO teams (name, code, flag_code, group_name)
    VALUES (?, ?, ?, NULL)
    RETURNING id
  `).bind(name, code, flagCodeForTeam(code)).first<{ id: number }>();

  return inserted?.id || null;
}

async function createLocalMatchFromExternal(
  db: D1Database,
  externalMatch: FootballDataMatch,
  homeTeamId: number,
  awayTeamId: number,
  stage: string,
  groupName: string | null,
  status: Match['status'],
  homeScore: number | null,
  awayScore: number | null
): Promise<LocalMatchForSync> {
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(match_order), 0) AS value FROM matches').first<{ value: number }>();
  const matchOrder = Number(maxOrder?.value || 0) + 1;
  const externalMatchId = String(externalMatch.id);
  const insertStatus = status === 'FINISHED' && homeScore !== null && awayScore !== null ? 'FINISHED' : status;

  const row = await db.prepare(`
    INSERT INTO matches (
      stage,
      group_name,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      starts_at,
      status,
      venue,
      match_order,
      external_provider,
      external_match_id,
      last_synced_at,
      result_source,
      manually_locked
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
    RETURNING *
  `).bind(
    stage,
    groupName,
    homeTeamId,
    awayTeamId,
    insertStatus === 'FINISHED' ? homeScore : null,
    insertStatus === 'FINISHED' ? awayScore : null,
    externalMatch.utcDate,
    insertStatus,
    matchOrder,
    FOOTBALL_DATA_PROVIDER,
    externalMatchId,
    insertStatus === 'FINISHED' ? FOOTBALL_DATA_PROVIDER : 'MANUAL'
  ).first<Match>();

  if (!row) throw new Error('No se pudo crear un partido faltante durante la sincronización.');

  return {
    ...row,
    home_team_name: externalMatch.homeTeam.name,
    home_team_code: externalMatch.homeTeam.tla || null,
    away_team_name: externalMatch.awayTeam.name,
    away_team_code: externalMatch.awayTeam.tla || null
  };
}

async function updateLocalMatchFromExternal(
  db: D1Database,
  input: {
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
    externalMatchId: string;
  }
) {
  if (input.updateResult) {
    await db.prepare(`
      UPDATE matches
      SET
        stage = ?,
        group_name = ?,
        home_team_id = ?,
        away_team_id = ?,
        home_score = ?,
        away_score = ?,
        starts_at = ?,
        status = 'FINISHED',
        external_provider = ?,
        external_match_id = ?,
        last_synced_at = CURRENT_TIMESTAMP,
        result_source = 'FOOTBALL_DATA',
        manually_locked = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      input.stage,
      input.groupName,
      input.homeTeamId,
      input.awayTeamId,
      input.homeScore,
      input.awayScore,
      input.startsAt,
      FOOTBALL_DATA_PROVIDER,
      input.externalMatchId,
      input.matchId
    ).run();
    return;
  }

  await db.prepare(`
    UPDATE matches
    SET
      stage = ?,
      group_name = ?,
      home_team_id = ?,
      away_team_id = ?,
      starts_at = ?,
      status = CASE WHEN manually_locked = 1 THEN status ELSE ? END,
      external_provider = ?,
      external_match_id = ?,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    input.stage,
    input.groupName,
    input.homeTeamId,
    input.awayTeamId,
    input.startsAt,
    input.status,
    FOOTBALL_DATA_PROVIDER,
    input.externalMatchId,
    input.matchId
  ).run();
}

async function touchExternalSync(db: D1Database, matchId: number, externalMatchId: string) {
  await db.prepare(`
    UPDATE matches
    SET external_provider = ?, external_match_id = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(FOOTBALL_DATA_PROVIDER, externalMatchId, matchId).run();
}

async function recalculateMatch(db: D1Database, matchId: number) {
  const match = await db.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return;

  if (match.status !== 'FINISHED' || match.home_score === null || match.away_score === null) {
    await db.prepare(`
      UPDATE predictions
      SET
        points = 0,
        exact_score_points = 0,
        correct_winner_points = 0,
        correct_draw_points = 0,
        goal_difference_points = 0,
        points_reason = 'Pendiente',
        updated_at = CURRENT_TIMESTAMP
      WHERE match_id = ?
    `).bind(matchId).run();
    return;
  }

  const rules = await getScoringRules(db);
  const predictions = await db.prepare('SELECT id, home_score, away_score FROM predictions WHERE match_id = ?').bind(matchId).all<{
    id: number;
    home_score: number;
    away_score: number;
  }>();

  for (const prediction of predictions.results) {
    const detail = calculatePointsDetail(prediction.home_score, prediction.away_score, match.home_score, match.away_score, rules);

    await db.prepare(`
      UPDATE predictions
      SET
        points = ?,
        exact_score_points = ?,
        correct_winner_points = ?,
        correct_draw_points = ?,
        goal_difference_points = ?,
        points_reason = ?,
        locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      detail.points,
      detail.exact_score_points,
      detail.correct_winner_points,
      detail.correct_draw_points,
      detail.goal_difference_points,
      detail.points_reason,
      prediction.id
    ).run();
  }
}

async function getScoringRules(db: D1Database): Promise<ScoringRules> {
  const rules = await db.prepare(`
    SELECT exact_score_points, correct_winner_points, correct_draw_points, goal_difference_points
    FROM scoring_rules
    WHERE id = 1
  `).first<ScoringRules>();

  return rules || {
    exact_score_points: 5,
    correct_winner_points: 3,
    correct_draw_points: 3,
    goal_difference_points: 1
  };
}

function calculatePointsDetail(predHome: number, predAway: number, realHome: number, realAway: number, rules: ScoringRules): MatchPointsDetail {
  if (predHome === realHome && predAway === realAway) {
    return {
      points: rules.exact_score_points,
      exact_score_points: rules.exact_score_points,
      correct_winner_points: 0,
      correct_draw_points: 0,
      goal_difference_points: 0,
      points_reason: 'Resultado exacto'
    };
  }

  const predictedOutcome = getOutcome(predHome, predAway);
  const realOutcome = getOutcome(realHome, realAway);

  if (predictedOutcome !== realOutcome) {
    return {
      points: 0,
      exact_score_points: 0,
      correct_winner_points: 0,
      correct_draw_points: 0,
      goal_difference_points: 0,
      points_reason: 'Sin puntos'
    };
  }

  if (realOutcome === 'DRAW') {
    return {
      points: rules.correct_draw_points,
      exact_score_points: 0,
      correct_winner_points: 0,
      correct_draw_points: rules.correct_draw_points,
      goal_difference_points: 0,
      points_reason: 'Empate correcto'
    };
  }

  const goalDifferenceHit = predHome - predAway === realHome - realAway;
  const goalDifferencePoints = goalDifferenceHit ? rules.goal_difference_points : 0;
  const points = rules.correct_winner_points + goalDifferencePoints;

  return {
    points,
    exact_score_points: 0,
    correct_winner_points: rules.correct_winner_points,
    correct_draw_points: 0,
    goal_difference_points: goalDifferencePoints,
    points_reason: goalDifferenceHit ? 'Ganador correcto + diferencia de goles' : 'Ganador correcto'
  };
}

function getOutcome(home: number, away: number) {
  if (home === away) return 'DRAW';
  return home > away ? 'HOME' : 'AWAY';
}

async function saveResultSyncLog(db: D1Database, summary: ResultSyncSummary, status: 'SUCCESS' | 'ERROR', errorMessage: string | null) {
  await db.prepare(`
    INSERT INTO result_sync_logs (
      provider,
      competition_code,
      season,
      status,
      fetched_count,
      finished_count,
      updated_count,
      skipped_count,
      unmatched_count,
      detail,
      error_message
    )
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
    JSON.stringify({
      updated_matches: summary.updated_matches,
      unmatched_matches: summary.unmatched_matches,
      created_count: summary.created_count,
      fixture_updated_count: summary.fixture_updated_count,
      result_updated_count: summary.result_updated_count
    }),
    errorMessage
  ).run();
}

async function getAdminFromRequest(request: Request, db: D1Database): Promise<User | null> {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const user = await db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.role = 'ADMIN'
  `).bind(tokenHash).first<User>();

  return user || null;
}

async function logAdminAction(
  request: Request,
  db: D1Database,
  adminUserId: number,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: unknown
) {
  try {
    await db.prepare(`
      INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, detail, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(adminUserId, action, entityType, entityId, JSON.stringify(detail), getClientIp(request)).run();
  } catch (error) {
    console.warn('No se pudo registrar auditoría admin para sync.', error);
  }
}

function isFinishedWithScore(match: FootballDataMatch) {
  return match.status === 'FINISHED'
    && Number.isInteger(match.score.fullTime?.home)
    && Number.isInteger(match.score.fullTime?.away);
}

function mapFootballDataStatus(status: string): Match['status'] {
  const normalized = status.toUpperCase();
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(normalized)) return 'LIVE';
  if (['FINISHED', 'AWARDED'].includes(normalized)) return 'FINISHED';
  return 'SCHEDULED';
}

function mapFootballDataStage(stage?: string | null) {
  const normalized = (stage || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  if (['GROUP_STAGE', 'GROUPS'].includes(normalized)) return 'Fase de grupos';
  if (['LAST_32', 'ROUND_OF_32', 'R32'].includes(normalized)) return '32avos de final';
  if (['LAST_16', 'ROUND_OF_16', 'R16'].includes(normalized)) return 'Octavos de final';
  if (['QUARTER_FINALS', 'QUARTERFINAL', 'QUARTER_FINAL'].includes(normalized)) return 'Cuartos de final';
  if (['SEMI_FINALS', 'SEMIFINAL', 'SEMI_FINAL'].includes(normalized)) return 'Semifinal';
  if (['THIRD_PLACE', 'THIRD_PLACE_PLAYOFF', 'THIRD_PLACE_GAME'].includes(normalized)) return 'Tercer puesto';
  if (['FINAL'].includes(normalized)) return 'Final';

  return 'Fase de grupos';
}

function canonicalStage(stage: string) {
  return stage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace('dieciseisavos de final', '32avos de final')
    .replace('treintaidosavos de final', '32avos de final')
    .replace('round of 32', '32avos de final')
    .replace('round of 16', 'octavos de final')
    .replace('quarterfinal', 'cuartos de final')
    .replace('semifinales', 'semifinal')
    .replace('tercer lugar', 'tercer puesto')
    .replace('3rd place playoff', 'tercer puesto');
}

function normalizeGroup(group?: string | null) {
  if (!group) return null;
  const match = group.toUpperCase().match(/[A-L]/);
  return match ? match[0] : null;
}

function normalizeTeamCode(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  const letters = trimmed.replace(/[^A-Z0-9]/g, '');
  return letters ? letters.slice(0, 12) : null;
}

function flagCodeForTeam(code: string) {
  const flags: Record<string, string> = {
    ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BIH: 'ba', BRA: 'br', CAN: 'ca', CIV: 'ci', COD: 'cd', COL: 'co', CPV: 'cv', CRO: 'hr', CZE: 'cz', ECU: 'ec', EGY: 'eg', ENG: 'gb-eng', ESP: 'es', FRA: 'fr', GER: 'de', GHA: 'gh', IRQ: 'iq', IRN: 'ir', JPN: 'jp', KOR: 'kr', KSA: 'sa', MAR: 'ma', MEX: 'mx', NED: 'nl', NOR: 'no', PAN: 'pa', PAR: 'py', POR: 'pt', QAT: 'qa', RSA: 'za', SCO: 'gb-sct', SEN: 'sn', SUI: 'ch', SWE: 'se', TUN: 'tn', TUR: 'tr', URU: 'uy', USA: 'us', UZB: 'uz'
  };
  return flags[code] || code.toLowerCase();
}

function teamsMatchForSync(externalTeam: FootballDataTeam, localName: string | null, localCode: string | null) {
  const externalCodes = [externalTeam.tla, externalTeam.shortName, externalTeam.name].filter((value): value is string => Boolean(value));
  const localCodes = [localCode, localName].filter((value): value is string => Boolean(value));
  const externalCanonical = externalCodes.map(canonicalTeamName);
  const localCanonical = localCodes.map(canonicalTeamName);
  return externalCanonical.some((externalValue) => localCanonical.includes(externalValue));
}

function canonicalTeamName(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const aliases: Record<string, string> = {
    alg: 'algeria', algeria: 'algeria', arg: 'argentina', argentina: 'argentina', aus: 'australia', australia: 'australia', aut: 'austria', austria: 'austria', bel: 'belgium', belgium: 'belgium', belgica: 'belgium', bih: 'bosnia and herzegovina', bosnia: 'bosnia and herzegovina', 'bosnia and herzegovina': 'bosnia and herzegovina', bra: 'brazil', brazil: 'brazil', brasil: 'brazil', can: 'canada', canada: 'canada', civ: 'ivory coast', 'cote d ivoire': 'ivory coast', 'ivory coast': 'ivory coast', 'costa de marfil': 'ivory coast', cod: 'dr congo', 'dr congo': 'dr congo', 'rd congo': 'dr congo', col: 'colombia', colombia: 'colombia', cpv: 'cape verde', 'cape verde': 'cape verde', 'cabo verde': 'cape verde', cro: 'croatia', croatia: 'croatia', croacia: 'croatia', cze: 'czechia', czechia: 'czechia', 'republica checa': 'czechia', ecu: 'ecuador', ecuador: 'ecuador', egy: 'egypt', egypt: 'egypt', egipto: 'egypt', eng: 'england', england: 'england', inglaterra: 'england', esp: 'spain', spain: 'spain', espana: 'spain', fra: 'france', france: 'france', francia: 'france', ger: 'germany', germany: 'germany', alemania: 'germany', gha: 'ghana', ghana: 'ghana', irq: 'iraq', iraq: 'iraq', irak: 'iraq', irn: 'iran', iran: 'iran', jpn: 'japan', japan: 'japan', japon: 'japan', kor: 'south korea', korea: 'south korea', 'korea republic': 'south korea', 'south korea': 'south korea', 'corea del sur': 'south korea', ksa: 'saudi arabia', 'saudi arabia': 'saudi arabia', 'arabia saudita': 'saudi arabia', mar: 'morocco', morocco: 'morocco', marruecos: 'morocco', mex: 'mexico', mexico: 'mexico', ned: 'netherlands', netherlands: 'netherlands', holanda: 'netherlands', 'paises bajos': 'netherlands', nor: 'norway', norway: 'norway', noruega: 'norway', pan: 'panama', panama: 'panama', par: 'paraguay', paraguay: 'paraguay', por: 'portugal', portugal: 'portugal', qat: 'qatar', qatar: 'qatar', rsa: 'south africa', 'south africa': 'south africa', sudafrica: 'south africa', sco: 'scotland', scotland: 'scotland', escocia: 'scotland', sen: 'senegal', senegal: 'senegal', sui: 'switzerland', switzerland: 'switzerland', suiza: 'switzerland', swe: 'sweden', sweden: 'sweden', suecia: 'sweden', tun: 'tunisia', tunisia: 'tunisia', tunez: 'tunisia', tur: 'turkiye', turkey: 'turkiye', turkiye: 'turkiye', turquia: 'turkiye', uru: 'uruguay', uruguay: 'uruguay', usa: 'usa', 'united states': 'usa', 'united states of america': 'usa', 'estados unidos': 'usa', uzb: 'uzbekistan', uzbekistan: 'uzbekistan', uzbekistan: 'uzbekistan'
  };

  return aliases[normalized] || normalized;
}

function dateDiffMs(valueA: string, valueB: string) {
  const dateA = new Date(valueA).getTime();
  const dateB = new Date(valueB).getTime();
  if (Number.isNaN(dateA) || Number.isNaN(dateB)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(dateA - dateB);
}

function normalizeNullable(value: string | null) {
  return value || null;
}

function toUpdatedSummary(match: LocalMatchForSync, fallbackHome: string | null, fallbackAway: string | null): SyncMatchSummary {
  return {
    match_order: match.match_order,
    home_team: match.home_team_name || fallbackHome || 'Local',
    away_team: match.away_team_name || fallbackAway || 'Visitante',
    home_score: match.status === 'FINISHED' ? match.home_score : null,
    away_score: match.status === 'FINISHED' ? match.away_score : null
  };
}

function toUnmatchedSummary(match: FootballDataMatch): ResultSyncSummary['unmatched_matches'][number] {
  return {
    external_match_id: match.id,
    home_team: match.homeTeam.name,
    away_team: match.awayTeam.name,
    utc_date: match.utcDate,
    home_score: Number.isInteger(match.score.fullTime?.home) ? Number(match.score.fullTime?.home) : null,
    away_score: Number.isInteger(match.score.fullTime?.away) ? Number(match.score.fullTime?.away) : null
  };
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const found = cookies.find((cookie) => cookie.startsWith(prefix));
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
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY'
  });

  if (!origin || origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin || allowedOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify(payload), { status, headers });
}
