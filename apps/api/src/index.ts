import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';

type Env = {
  DB: D1Database;
  APP_ENV: string;
  CORS_ORIGIN: string;
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
};

type ScoringRules = {
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  champion_bonus_points: number;
  runner_up_bonus_points: number;
  third_place_bonus_points: number;
  fourth_place_bonus_points: number;
};

type SpecialPredictionInput = {
  champion_team_id: number;
  runner_up_team_id: number;
  third_place_team_id: number;
  fourth_place_team_id: number;
};

type TournamentResultsInput = {
  champion_team_id: number | null;
  runner_up_team_id: number | null;
  third_place_team_id: number | null;
  fourth_place_team_id: number | null;
};

type MatchPointsDetail = {
  points: number;
  exact_score_points: number;
  correct_winner_points: number;
  correct_draw_points: number;
  goal_difference_points: number;
  points_reason: string;
};

const app = new Hono<{ Bindings: Env; Variables: { user: User | null } }>();

const COOKIE_NAME = 'pm_session';
const SESSION_DAYS = 30;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(120)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(120)
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120)
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(120),
  new_password: z.string().min(8).max(120)
});

const adminResetPasswordSchema = z.object({
  new_password: z.string().min(8).max(120)
});

const predictionSchema = z.object({
  home_score: z.number().int().min(0).max(99),
  away_score: z.number().int().min(0).max(99)
});

const resultSchema = z.object({
  home_score: z.number().int().min(0).max(99),
  away_score: z.number().int().min(0).max(99),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINISHED']).default('FINISHED')
});

const updateMatchSchema = z.object({
  stage: z.string().trim().min(1).max(80).optional(),
  group_name: z.string().trim().max(20).nullable().optional(),
  home_team_id: z.number().int().positive().nullable().optional(),
  away_team_id: z.number().int().positive().nullable().optional(),
  starts_at: z.string().datetime().optional(),
  venue: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINISHED']).optional()
});

const scoringRulesSchema = z.object({
  exact_score_points: z.number().int().min(0).max(100),
  correct_winner_points: z.number().int().min(0).max(100),
  correct_draw_points: z.number().int().min(0).max(100),
  goal_difference_points: z.number().int().min(0).max(100),
  champion_bonus_points: z.number().int().min(0).max(100),
  runner_up_bonus_points: z.number().int().min(0).max(100),
  third_place_bonus_points: z.number().int().min(0).max(100),
  fourth_place_bonus_points: z.number().int().min(0).max(100)
});

const specialPredictionSchema = z.object({
  champion_team_id: z.number().int().positive(),
  runner_up_team_id: z.number().int().positive(),
  third_place_team_id: z.number().int().positive(),
  fourth_place_team_id: z.number().int().positive()
}).superRefine((value, ctx) => {
  const ids = [value.champion_team_id, value.runner_up_team_id, value.third_place_team_id, value.fourth_place_team_id];
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Las selecciones especiales no pueden repetirse.' });
  }
});

const tournamentResultsSchema = z.object({
  champion_team_id: z.number().int().positive().nullable(),
  runner_up_team_id: z.number().int().positive().nullable(),
  third_place_team_id: z.number().int().positive().nullable(),
  fourth_place_team_id: z.number().int().positive().nullable()
}).superRefine((value, ctx) => {
  const ids = [value.champion_team_id, value.runner_up_team_id, value.third_place_team_id, value.fourth_place_team_id].filter((id): id is number => id !== null);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Las posiciones finales no pueden repetir selección.' });
  }
});

app.use('*', async (c, next) => {
  const allowedOrigin = c.env.CORS_ORIGIN || 'http://localhost:5173';
  return cors({
    origin: allowedOrigin,
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })(c, next);
});

app.use('*', async (c, next) => {
  const user = await getCurrentUser(c.env.DB, getCookie(c, COOKIE_NAME));
  c.set('user', user);
  await next();
});

app.get('/health', (c) => c.json({ ok: true, app: 'Prode Mundial 2026' }));

app.post('/auth/register', async (c) => {
  const body = await parseBody(c);
  const input = registerSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Revisá nombre, email y contraseña. La contraseña debe tener al menos 8 caracteres.');

  const email = input.data.email.toLowerCase();
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: number }>();
  if (exists) return badRequest(c, 'Ya existe un usuario registrado con ese email.');

  const passwordHash = await hashPassword(input.data.password);
  const result = await c.env.DB.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, name, email, role'
  ).bind(input.data.name, email, passwordHash, 'USER').first<User>();

  if (!result) return serverError(c);
  await createSession(c, result.id);
  return c.json({ user: result }, 201);
});

app.post('/auth/login', async (c) => {
  const body = await parseBody(c);
  const input = loginSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Email o contraseña inválidos.');

  const email = input.data.email.toLowerCase();
  const row = await c.env.DB.prepare(
    'SELECT id, name, email, role, password_hash FROM users WHERE email = ?'
  ).bind(email).first<User & { password_hash: string }>();

  if (!row) return unauthorized(c, 'Email o contraseña inválidos.');
  const valid = await verifyPassword(input.data.password, row.password_hash);
  if (!valid) return unauthorized(c, 'Email o contraseña inválidos.');

  await createSession(c, row.id);
  return c.json({ user: cleanUser(row) });
});

app.post('/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, COOKIE_NAME, cookieOptions(c.req.url));
  return c.json({ ok: true });
});

app.get('/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

app.put('/auth/profile', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await parseBody(c);
  const input = updateProfileSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Revisá nombre y email.');

  const email = input.data.email.toLowerCase();
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(email, user.id).first<{ id: number }>();
  if (exists) return badRequest(c, 'Ya existe otro usuario registrado con ese email.');

  const updated = await c.env.DB.prepare(`
    UPDATE users
    SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING id, name, email, role
  `).bind(input.data.name, email, user.id).first<User>();

  if (!updated) return serverError(c);
  return c.json({ user: updated });
});

app.put('/auth/password', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await parseBody(c);
  const input = changePasswordSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'La nueva contraseña debe tener al menos 8 caracteres.');
  if (input.data.current_password === input.data.new_password) {
    return badRequest(c, 'La nueva contraseña debe ser distinta a la actual.');
  }

  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row) return unauthorized(c, 'Tenés que iniciar sesión.');

  const valid = await verifyPassword(input.data.current_password, row.password_hash);
  if (!valid) return unauthorized(c, 'La contraseña actual no es correcta.');

  const passwordHash = await hashPassword(input.data.new_password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(passwordHash, user.id)
    .run();

  const token = getCookie(c, COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, tokenHash).run();
  }

  return c.json({ ok: true });
});

app.get('/teams', async (c) => {
  const teams = await c.env.DB.prepare('SELECT * FROM teams ORDER BY group_name, name').all();
  return c.json({ teams: teams.results });
});

app.get('/matches', async (c) => {
  const matches = await c.env.DB.prepare(`
    SELECT
      m.*,
      ht.name AS home_team_name,
      ht.code AS home_team_code,
      ht.flag_code AS home_flag_code,
      at.name AS away_team_name,
      at.code AS away_team_code,
      at.flag_code AS away_flag_code
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.match_order ASC
  `).all();
  return c.json({ matches: matches.results });
});

app.get('/predictions/me', requireAuth, async (c) => {
  const user = c.get('user')!;
  const rows = await c.env.DB.prepare(`
    SELECT
      p.*,
      m.starts_at,
      m.status,
      m.home_score AS real_home_score,
      m.away_score AS real_away_score,
      ht.name AS home_team_name,
      ht.code AS home_team_code,
      ht.flag_code AS home_flag_code,
      at.name AS away_team_name,
      at.code AS away_team_code,
      at.flag_code AS away_flag_code
    FROM predictions p
    INNER JOIN matches m ON m.id = p.match_id
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    WHERE p.user_id = ?
    ORDER BY m.match_order ASC
  `).bind(user.id).all();
  return c.json({ predictions: rows.results });
});

app.put('/predictions/:matchId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const matchId = Number(c.req.param('matchId'));
  if (!Number.isInteger(matchId) || matchId <= 0) return badRequest(c, 'Partido inválido.');

  const globalLock = await getSetting(c.env.DB, 'PREDICTIONS_LOCKED');
  if (globalLock === 'true') return badRequest(c, 'La carga de pronósticos está bloqueada temporalmente.');

  const body = await parseBody(c);
  const input = predictionSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Resultado inválido.');

  const match = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return notFound(c, 'No se encontró el partido.');
  if (isMatchLocked(match)) return badRequest(c, 'Este partido ya empezó o está finalizado. No se puede modificar el pronóstico.');

  await c.env.DB.prepare(`
    INSERT INTO predictions (
      user_id,
      match_id,
      home_score,
      away_score,
      points,
      exact_score_points,
      correct_winner_points,
      correct_draw_points,
      goal_difference_points,
      points_reason,
      locked_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 'Pendiente', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      points = 0,
      exact_score_points = 0,
      correct_winner_points = 0,
      correct_draw_points = 0,
      goal_difference_points = 0,
      points_reason = 'Pendiente',
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.id, matchId, input.data.home_score, input.data.away_score).run();

  return c.json({ ok: true });
});

app.get('/ranking', async (c) => {
  const ranking = await c.env.DB.prepare(`
    WITH match_stats AS (
      SELECT
        u.id AS user_id,
        COALESCE(SUM(p.points), 0) AS match_points,
        SUM(CASE WHEN m.status = 'FINISHED' AND p.home_score = m.home_score AND p.away_score = m.away_score THEN 1 ELSE 0 END) AS exact_hits,
        SUM(CASE
          WHEN m.status = 'FINISHED' AND p.id IS NOT NULL AND (
            (p.home_score = p.away_score AND m.home_score = m.away_score) OR
            (p.home_score > p.away_score AND m.home_score > m.away_score) OR
            (p.home_score < p.away_score AND m.home_score < m.away_score)
          ) THEN 1 ELSE 0 END
        ) AS outcome_hits,
        COUNT(p.id) AS predicted_count
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN matches m ON m.id = p.match_id
      WHERE u.role = 'USER'
      GROUP BY u.id
    )
    SELECT
      u.id,
      u.name,
      COALESCE(ms.match_points, 0) + COALESCE(sp.points, 0) AS points,
      COALESCE(ms.match_points, 0) AS match_points,
      COALESCE(sp.points, 0) AS special_points,
      COALESCE(ms.exact_hits, 0) AS exact_hits,
      COALESCE(ms.outcome_hits, 0) AS outcome_hits,
      COALESCE(ms.predicted_count, 0) AS predicted_count,
      CASE WHEN sp.id IS NULL THEN 0 ELSE 1 END AS special_loaded
    FROM users u
    LEFT JOIN match_stats ms ON ms.user_id = u.id
    LEFT JOIN special_predictions sp ON sp.user_id = u.id
    WHERE u.role = 'USER'
    ORDER BY points DESC, exact_hits DESC, outcome_hits DESC, predicted_count DESC, u.created_at ASC
  `).all();

  const rows = ranking.results.map((row, index) => ({ position: index + 1, ...row }));
  return c.json({ ranking: rows });
});

app.get('/rules', async (c) => {
  const rules = await getScoringRules(c.env.DB);
  return c.json({ rules });
});

app.get('/special-predictions/me', requireAuth, async (c) => {
  const user = c.get('user')!;
  const prediction = await getSpecialPrediction(c.env.DB, user.id);
  const locked = await areSpecialPredictionsLocked(c.env.DB);
  return c.json({ prediction, locked });
});

app.put('/special-predictions/me', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (await areSpecialPredictionsLocked(c.env.DB)) {
    return badRequest(c, 'La carga de predicciones especiales está bloqueada.');
  }

  const body = await parseBody(c);
  const input = specialPredictionSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Elegí cuatro selecciones distintas.');

  const validTeams = await allTeamsExist(c.env.DB, [
    input.data.champion_team_id,
    input.data.runner_up_team_id,
    input.data.third_place_team_id,
    input.data.fourth_place_team_id
  ]);
  if (!validTeams) return badRequest(c, 'Alguna selección elegida no existe.');

  await c.env.DB.prepare(`
    INSERT INTO special_predictions (user_id, champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id, points, locked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      champion_team_id = excluded.champion_team_id,
      runner_up_team_id = excluded.runner_up_team_id,
      third_place_team_id = excluded.third_place_team_id,
      fourth_place_team_id = excluded.fourth_place_team_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    user.id,
    input.data.champion_team_id,
    input.data.runner_up_team_id,
    input.data.third_place_team_id,
    input.data.fourth_place_team_id
  ).run();

  await recalculateSpecialPredictions(c.env.DB);
  return c.json({ ok: true });
});

app.get('/admin/users', requireAdmin, async (c) => {
  const users = await c.env.DB.prepare(`
    SELECT id, name, email, role, created_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  return c.json({ users: users.results });
});

app.post('/admin/users/:id/reset-password', requireAdmin, async (c) => {
  const currentUser = c.get('user') as User;
  const targetUserId = Number(c.req.param('id'));

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return badRequest(c, 'Usuario inválido.');
  }

  if (targetUserId === currentUser.id) {
    return badRequest(c, 'Para cambiar tu propia contraseña usá la pantalla Mi cuenta.');
  }

  const body = await parseBody(c);
  const input = adminResetPasswordSchema.safeParse(body);
  if (!input.success) {
    return badRequest(c, 'La nueva contraseña debe tener al menos 8 caracteres.');
  }

  const targetUser = await c.env.DB.prepare(`
    SELECT id, name, email, role
    FROM users
    WHERE id = ?
  `).bind(targetUserId).first<User>();

  if (!targetUser) {
    return notFound(c, 'No se encontró el usuario.');
  }

  if (targetUser.role === 'ADMIN') {
    return forbidden(c, 'No se puede resetear la contraseña de otro administrador desde este panel.');
  }

  const passwordHash = await hashPassword(input.data.new_password);

  await c.env.DB.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND role = 'USER'
  `).bind(passwordHash, targetUserId).run();

  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUserId).run();

  return c.json({ ok: true });
});

app.put('/admin/matches/:id', requireAdmin, async (c) => {
  const matchId = Number(c.req.param('id'));
  if (!Number.isInteger(matchId) || matchId <= 0) return badRequest(c, 'Partido inválido.');

  const body = await parseBody(c);
  const input = updateMatchSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Datos de partido inválidos.');

  const existing = await c.env.DB.prepare('SELECT id FROM matches WHERE id = ?').bind(matchId).first<{ id: number }>();
  if (!existing) return notFound(c, 'No se encontró el partido.');

  const current = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  const next = { ...current!, ...input.data };

  await c.env.DB.prepare(`
    UPDATE matches
    SET stage = ?, group_name = ?, home_team_id = ?, away_team_id = ?, starts_at = ?, venue = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    next.stage,
    next.group_name,
    next.home_team_id,
    next.away_team_id,
    next.starts_at,
    next.venue,
    next.status,
    matchId
  ).run();

  return c.json({ ok: true });
});

app.post('/admin/matches/:id/result', requireAdmin, async (c) => {
  const matchId = Number(c.req.param('id'));
  if (!Number.isInteger(matchId) || matchId <= 0) return badRequest(c, 'Partido inválido.');

  const body = await parseBody(c);
  const input = resultSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Resultado inválido.');

  const match = await c.env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Match>();
  if (!match) return notFound(c, 'No se encontró el partido.');

  await c.env.DB.prepare(`
    UPDATE matches
    SET home_score = ?, away_score = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(input.data.home_score, input.data.away_score, input.data.status, matchId).run();

  await recalculateMatch(c.env.DB, matchId);
  return c.json({ ok: true });
});

app.get('/admin/tournament-results', requireAdmin, async (c) => {
  const results = await getTournamentResults(c.env.DB);
  return c.json({ results });
});

app.put('/admin/tournament-results', requireAdmin, async (c) => {
  const body = await parseBody(c);
  const input = tournamentResultsSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Elegí selecciones válidas y sin repetir.');

  const ids = [
    input.data.champion_team_id,
    input.data.runner_up_team_id,
    input.data.third_place_team_id,
    input.data.fourth_place_team_id
  ].filter((id): id is number => id !== null);

  if (ids.length > 0 && !(await allTeamsExist(c.env.DB, ids))) {
    return badRequest(c, 'Alguna selección elegida no existe.');
  }

  await c.env.DB.prepare(`
    UPDATE tournament_results
    SET champion_team_id = ?, runner_up_team_id = ?, third_place_team_id = ?, fourth_place_team_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).bind(
    input.data.champion_team_id,
    input.data.runner_up_team_id,
    input.data.third_place_team_id,
    input.data.fourth_place_team_id
  ).run();

  await recalculateSpecialPredictions(c.env.DB);
  return c.json({ ok: true });
});

app.post('/admin/settings/special-lock', requireAdmin, async (c) => {
  const body = await parseBody(c);
  const schema = z.object({ locked: z.boolean() });
  const input = schema.safeParse(body);
  if (!input.success) return badRequest(c, 'Valor inválido.');
  await setSetting(c.env.DB, 'SPECIAL_PREDICTIONS_LOCKED', String(input.data.locked));
  return c.json({ ok: true });
});

app.get('/admin/scoring-rules', requireAdmin, async (c) => {
  const rules = await getScoringRules(c.env.DB);
  return c.json({ rules });
});

app.put('/admin/scoring-rules', requireAdmin, async (c) => {
  const body = await parseBody(c);
  const input = scoringRulesSchema.safeParse(body);
  if (!input.success) return badRequest(c, 'Reglas de puntuación inválidas.');

  await c.env.DB.prepare(`
    UPDATE scoring_rules SET
      exact_score_points = ?,
      correct_winner_points = ?,
      correct_draw_points = ?,
      goal_difference_points = ?,
      champion_bonus_points = ?,
      runner_up_bonus_points = ?,
      third_place_bonus_points = ?,
      fourth_place_bonus_points = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).bind(
    input.data.exact_score_points,
    input.data.correct_winner_points,
    input.data.correct_draw_points,
    input.data.goal_difference_points,
    input.data.champion_bonus_points,
    input.data.runner_up_bonus_points,
    input.data.third_place_bonus_points,
    input.data.fourth_place_bonus_points
  ).run();

  await recalculateAll(c.env.DB);
  return c.json({ ok: true });
});

app.post('/admin/recalculate', requireAdmin, async (c) => {
  await recalculateAll(c.env.DB);
  return c.json({ ok: true });
});

app.post('/admin/settings/predictions-lock', requireAdmin, async (c) => {
  const body = await parseBody(c);
  const schema = z.object({ locked: z.boolean() });
  const input = schema.safeParse(body);
  if (!input.success) return badRequest(c, 'Valor inválido.');
  await setSetting(c.env.DB, 'PREDICTIONS_LOCKED', String(input.data.locked));
  return c.json({ ok: true });
});

async function requireAuth(c: any, next: any) {
  if (!c.get('user')) return unauthorized(c, 'Tenés que iniciar sesión.');
  await next();
}

async function requireAdmin(c: any, next: any) {
  const user = c.get('user') as User | null;
  if (!user) return unauthorized(c, 'Tenés que iniciar sesión.');
  if (user.role !== 'ADMIN') return forbidden(c, 'No tenés permisos de administrador.');
  await next();
}

async function parseBody(c: any): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

function badRequest(c: any, message: string) {
  return c.json({ error: message }, 400);
}

function unauthorized(c: any, message: string) {
  return c.json({ error: message }, 401);
}

function forbidden(c: any, message: string) {
  return c.json({ error: message }, 403);
}

function notFound(c: any, message: string) {
  return c.json({ error: message }, 404);
}

function serverError(c: any) {
  return c.json({ error: 'Ocurrió un error inesperado.' }, 500);
}

function cleanUser(user: User & { password_hash?: string }): User {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function cookieOptions(url: string) {
  return {
    httpOnly: true,
    sameSite: 'None' as const,
    secure: url.startsWith('https://'),
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  };
}

async function createSession(c: any, userId: number) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(userId, tokenHash, expiresAt).run();

  setCookie(c, COOKIE_NAME, token, cookieOptions(c.req.url));
}

async function getCurrentUser(db: D1Database, token?: string): Promise<User | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const user = await db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first<User>();
  return user ?? null;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string) {
  const iterations = 100_000;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algo, iterationsRaw, saltRaw, hashRaw] = stored.split('$');
  if (algo !== 'pbkdf2_sha256') return false;

  const iterations = Number(iterationsRaw);
  const salt = base64ToBytes(saltRaw);
  const expected = base64ToBytes(hashRaw);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return constantTimeEqual(new Uint8Array(bits), expected);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isMatchLocked(match: Match) {
  if (match.status !== 'SCHEDULED') return true;
  return Date.now() >= new Date(match.starts_at).getTime();
}

async function getScoringRules(db: D1Database) {
  const rules = await db.prepare('SELECT * FROM scoring_rules WHERE id = 1').first<ScoringRules>();
  if (!rules) throw new Error('No hay reglas de puntuación configuradas.');
  return rules;
}

async function getSetting(db: D1Database, key: string) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(key, value).run();
}

async function getSpecialPrediction(db: D1Database, userId: number) {
  return await db.prepare(`
    SELECT
      sp.*,
      c.name AS champion_team_name, c.code AS champion_team_code, c.flag_code AS champion_flag_code,
      r.name AS runner_up_team_name, r.code AS runner_up_team_code, r.flag_code AS runner_up_flag_code,
      t.name AS third_place_team_name, t.code AS third_place_team_code, t.flag_code AS third_place_flag_code,
      f.name AS fourth_place_team_name, f.code AS fourth_place_team_code, f.flag_code AS fourth_place_flag_code
    FROM special_predictions sp
    LEFT JOIN teams c ON c.id = sp.champion_team_id
    LEFT JOIN teams r ON r.id = sp.runner_up_team_id
    LEFT JOIN teams t ON t.id = sp.third_place_team_id
    LEFT JOIN teams f ON f.id = sp.fourth_place_team_id
    WHERE sp.user_id = ?
  `).bind(userId).first();
}

async function getTournamentResults(db: D1Database) {
  return await db.prepare(`
    SELECT
      tr.*,
      c.name AS champion_team_name, c.code AS champion_team_code, c.flag_code AS champion_flag_code,
      r.name AS runner_up_team_name, r.code AS runner_up_team_code, r.flag_code AS runner_up_flag_code,
      t.name AS third_place_team_name, t.code AS third_place_team_code, t.flag_code AS third_place_flag_code,
      f.name AS fourth_place_team_name, f.code AS fourth_place_team_code, f.flag_code AS fourth_place_flag_code
    FROM tournament_results tr
    LEFT JOIN teams c ON c.id = tr.champion_team_id
    LEFT JOIN teams r ON r.id = tr.runner_up_team_id
    LEFT JOIN teams t ON t.id = tr.third_place_team_id
    LEFT JOIN teams f ON f.id = tr.fourth_place_team_id
    WHERE tr.id = 1
  `).first();
}

async function areSpecialPredictionsLocked(db: D1Database) {
  const manualLock = await getSetting(db, 'SPECIAL_PREDICTIONS_LOCKED');
  if (manualLock === 'true') return true;

  const firstMatch = await db.prepare('SELECT starts_at FROM matches ORDER BY starts_at ASC LIMIT 1').first<{ starts_at: string }>();
  if (!firstMatch) return false;
  return Date.now() >= new Date(firstMatch.starts_at).getTime();
}

async function allTeamsExist(db: D1Database, ids: number[]) {
  if (ids.length === 0) return true;
  const uniqueIds = Array.from(new Set(ids));
  const placeholders = uniqueIds.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT id FROM teams WHERE id IN (${placeholders})`).bind(...uniqueIds).all<{ id: number }>();
  return rows.results.length === uniqueIds.length;
}

async function recalculateAll(db: D1Database) {
  const rows = await db.prepare("SELECT id FROM matches WHERE status = 'FINISHED'").all<{ id: number }>();
  for (const row of rows.results) {
    await recalculateMatch(db, row.id);
  }
  await recalculateSpecialPredictions(db);
}

async function recalculateSpecialPredictions(db: D1Database) {
  const rules = await getScoringRules(db);
  const results = await db.prepare('SELECT * FROM tournament_results WHERE id = 1').first<TournamentResultsInput>();
  if (!results) return;

  const predictions = await db.prepare(`
    SELECT id, champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id
    FROM special_predictions
  `).all<SpecialPredictionInput & { id: number }>();

  for (const prediction of predictions.results) {
    const points = calculateSpecialPoints(prediction, results, rules);
    await db.prepare('UPDATE special_predictions SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(points, prediction.id)
      .run();
  }
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

function calculateSpecialPoints(prediction: SpecialPredictionInput, results: TournamentResultsInput, rules: ScoringRules) {
  let points = 0;
  if (results.champion_team_id !== null && prediction.champion_team_id === results.champion_team_id) points += rules.champion_bonus_points;
  if (results.runner_up_team_id !== null && prediction.runner_up_team_id === results.runner_up_team_id) points += rules.runner_up_bonus_points;
  if (results.third_place_team_id !== null && prediction.third_place_team_id === results.third_place_team_id) points += rules.third_place_bonus_points;
  if (results.fourth_place_team_id !== null && prediction.fourth_place_team_id === results.fourth_place_team_id) points += rules.fourth_place_bonus_points;
  return points;
}

function calculatePointsDetail(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number,
  rules: ScoringRules
): MatchPointsDetail {
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

export default app;
