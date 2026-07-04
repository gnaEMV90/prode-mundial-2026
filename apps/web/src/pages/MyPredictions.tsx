import type { ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Match, Prediction } from '../lib/api';
import { Message } from '../components/Message';
import { TeamBadge } from './Fixture';

type PredictionForm = Record<number, { home_score: string; away_score: string; winner_team_id: string }>;
type FilterMode = 'all' | 'pending' | 'loaded' | 'live';

export function MyPredictions() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [form, setForm] = useState<PredictionForm>({});
  const [filter, setFilter] = useState<FilterMode>('all');
  const [showFinished, setShowFinished] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [matchesResponse, predictionsResponse] = await Promise.all([
      api<{ matches: Match[] }>('/matches'),
      api<{ predictions: Prediction[] }>('/predictions/me')
    ]);

    setMatches(matchesResponse.matches);
    setPredictions(predictionsResponse.predictions);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.'));
  }, []);

  const predictionByMatch = useMemo(
    () => new Map(predictions.map((prediction) => [prediction.match_id, prediction])),
    [predictions]
  );

  const activeMatches = useMemo(() => {
    return matches.filter((match) => match.status !== 'FINISHED');
  }, [matches]);

  const finishedMatches = useMemo(() => {
    return matches.filter((match) => match.status === 'FINISHED');
  }, [matches]);

  const totals = useMemo(() => {
    const loaded = predictions.length;
    const activeLoaded = activeMatches.filter((match) => predictionByMatch.has(match.id)).length;
    const activePending = activeMatches.filter((match) => !predictionByMatch.has(match.id)).length;
    const live = activeMatches.filter((match) => match.status === 'LIVE').length;
    const points = predictions.reduce((sum, prediction) => sum + prediction.points, 0);

    return { loaded, activeLoaded, activePending, live, points, finished: finishedMatches.length };
  }, [activeMatches, finishedMatches.length, predictions, predictionByMatch]);

  const filteredMatches = useMemo(() => {
    return activeMatches.filter((match) => {
      const prediction = predictionByMatch.get(match.id);

      if (filter === 'pending') return !prediction;
      if (filter === 'loaded') return Boolean(prediction);
      if (filter === 'live') return match.status === 'LIVE';

      return true;
    });
  }, [activeMatches, predictionByMatch, filter]);

  useEffect(() => {
    const next: PredictionForm = {};

    predictions.forEach((prediction) => {
      next[prediction.match_id] = {
        home_score: String(prediction.home_score),
        away_score: String(prediction.away_score),
        winner_team_id: prediction.winner_team_id ? String(prediction.winner_team_id) : ''
      };
    });

    setForm((current) => ({ ...next, ...current }));
  }, [predictions]);

  async function savePrediction(event: FormEvent, match: Match) {
    event.preventDefault();
    setMessage('');
    setError('');

    const values = form[match.id] || { home_score: '', away_score: '', winner_team_id: '' };
    const home = Number(values.home_score);
    const away = Number(values.away_score);

    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setError('CargÃ¡ un resultado vÃ¡lido.');
      return;
    }

    const winnerTeamId = getWinnerTeamIdForPayload(match, home, away, values.winner_team_id);
    if (winnerTeamId instanceof Error) {
      setError(winnerTeamId.message);
      return;
    }

    try {
      await api(`/predictions/${match.id}`, {
        method: 'PUT',
        body: { home_score: home, away_score: away, winner_team_id: winnerTeamId }
      });

      await load();
      setMessage('PronÃ³stico guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el pronÃ³stico.');
    }
  }

  function update(matchId: number, field: 'home_score' | 'away_score' | 'winner_team_id', value: string) {
    const cleanValue = field === 'winner_team_id' ? value : value.replace(/[^\d]/g, '').slice(0, 2);

    setForm((current) => ({
      ...current,
      [matchId]: {
        home_score: current[matchId]?.home_score || '',
        away_score: current[matchId]?.away_score || '',
        winner_team_id: current[matchId]?.winner_team_id || '',
        [field]: cleanValue
      }
    }));
  }

  function renderPredictionCard(match: Match, historical = false) {
    const prediction = predictionByMatch.get(match.id);
    const locked = isMatchLocked(match);
    const values = form[match.id] || { home_score: '', away_score: '', winner_team_id: '' };
    const showWinnerSelector = shouldShowWinnerSelector(match, values.home_score, values.away_score);

    return (
      <article key={match.id} className={predictionCardClassName(match, historical)}>
        <PredictionMatchHeader match={match} locked={locked} historical={historical} />

        <form onSubmit={(event) => savePrediction(event, match)} className="mt-3 space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <ScoreInputBlock
              label={match.home_team_name || 'Local'}
              value={values.home_score}
              disabled={locked}
              ariaLabel={`Goles de ${match.home_team_name || 'local'}`}
              onChange={(value) => update(match.id, 'home_score', value)}
            />

            <div className="pb-3 text-center text-xs font-black uppercase text-slate-500">vs</div>

            <ScoreInputBlock
              label={match.away_team_name || 'Visitante'}
              value={values.away_score}
              disabled={locked}
              ariaLabel={`Goles de ${match.away_team_name || 'visitante'}`}
              onChange={(value) => update(match.id, 'away_score', value)}
            />
          </div>

          {showWinnerSelector && (
            <WinnerSelector
              match={match}
              value={values.winner_team_id}
              disabled={locked}
              onChange={(value) => update(match.id, 'winner_team_id', value)}
            />
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <PredictionPointsPill prediction={prediction} match={match} />

            <button
              disabled={locked}
              className="w-full rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 sm:w-auto"
            >
              {buttonText(match, locked, prediction)}
            </button>
          </div>
        </form>

        <PredictionDetail prediction={prediction} match={match} historical={historical} />
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
        <h1 className="text-3xl font-black">Mis pronÃ³sticos</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
          Por defecto te mostramos solo los partidos que todavÃ­a podÃ©s cargar o revisar antes de que arranquen. En eliminatorias, si pronosticÃ¡s empate, tambiÃ©n tenÃ©s que elegir quiÃ©n clasifica o gana por penales.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Por jugar" value={activeMatches.length} />
        <SummaryCard label="Sin cargar" value={totals.activePending} />
        <SummaryCard label="Cargados" value={totals.activeLoaded} />
        <SummaryCard label="En vivo" value={totals.live} live={totals.live > 0} />
        <SummaryCard label="Puntos" value={totals.points} accent />
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Partidos pendientes y en vivo</h2>
            <p className="mt-1 text-sm text-slate-400">
              Mostrando lo importante para cargar rÃ¡pido y sin hacer scroll hasta Qatar 2010.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
              Todos
            </FilterButton>
            <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')}>
              Sin cargar
            </FilterButton>
            <FilterButton active={filter === 'loaded'} onClick={() => setFilter('loaded')}>
              Cargados
            </FilterButton>
            <FilterButton active={filter === 'live'} onClick={() => setFilter('live')}>
              En vivo
            </FilterButton>
          </div>
        </div>
      </section>

      {message && <Message type="success">{message}</Message>}
      {error && <Message type="error">{error}</Message>}

      <div className="grid gap-3">{filteredMatches.map((match) => renderPredictionCard(match))}</div>

      {filteredMatches.length === 0 && <Message>No hay partidos para este filtro.</Message>}

      <section className="rounded-3xl border border-white/10 bg-white/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Partidos finalizados</h2>
            <p className="mt-1 text-sm text-slate-400">
              EstÃ¡n ocultos por defecto. PodÃ©s abrirlos para revisar puntos y motivos cuando haga falta.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFinished((current) => !current)}
            className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/15"
          >
            {showFinished ? 'Ocultar finalizados' : `Ver finalizados (${totals.finished})`}
          </button>
        </div>

        {showFinished && (
          <div className="mt-4 grid gap-3">
            {finishedMatches.length > 0 ? (
              finishedMatches.map((match) => renderPredictionCard(match, true))
            ) : (
              <div className="rounded-2xl bg-slate-950/40 p-4 text-sm text-slate-400">TodavÃ­a no hay partidos finalizados.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
  live = false
}: {
  label: string;
  value: number;
  accent?: boolean;
  live?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${live ? 'border-red-400/50 bg-red-500/10' : 'border-white/10 bg-white/10'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">{label}</div>
      <div className={`mt-1 text-2xl font-black ${live ? 'text-red-200' : accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
        active ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}

function PredictionMatchHeader({ match, locked, historical }: { match: Match; locked: boolean; historical: boolean }) {
  const home = match.home_team_name || 'Equipo por definir';
  const away = match.away_team_name || 'Equipo por definir';
  const date = new Date(match.starts_at).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Partido #{match.match_order} Â· {match.group_name ? `Grupo ${match.group_name}` : match.stage}
          </div>
          <div className="mt-1 text-sm font-bold text-slate-200">{date}</div>
          <div className="mt-1 text-xs text-slate-400">{match.venue || 'Sede por definir'}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={statusTone(match.status)}>{statusText(match.status)}</StatusBadge>
          {match.status === 'LIVE' && <StatusBadge tone="live">Cerrado en vivo</StatusBadge>}
          {locked && match.status !== 'LIVE' && <StatusBadge tone={historical ? 'finished' : 'locked'}>{historical ? 'HistÃ³rico' : 'Bloqueado'}</StatusBadge>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <TeamBadge name={home} flagCode={match.home_flag_code} />
        <span className="hidden text-center text-sm font-black uppercase text-slate-500 sm:block">vs</span>
        <TeamBadge name={away} flagCode={match.away_flag_code} />
      </div>

      {match.home_score !== null && match.away_score !== null && (
        <div className="rounded-2xl bg-slate-950/70 p-2.5 text-center">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Resultado real</div>
          <div className="mt-0.5 text-xl font-black text-white">
            {match.home_score} - {match.away_score}
          </div>
          {match.home_score === match.away_score && match.winner_team_id && (
            <div className="mt-1 text-xs font-bold text-emerald-200">
              GanÃ³ por penales: {teamNameById(match, match.winner_team_id)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreInputBlock({
  label,
  value,
  disabled,
  ariaLabel,
  onChange
}: {
  label: string;
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="line-clamp-1 text-xs font-bold text-slate-300">{label}</span>
      <input
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={99}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.target.select()}
        className="mt-1.5 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 text-center text-xl font-black text-white outline-none focus:border-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        placeholder="-"
      />
    </label>
  );
}

function WinnerSelector({
  match,
  value,
  disabled,
  onChange
}: {
  match: Match;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3">
      <span className="text-xs font-black uppercase tracking-wide text-amber-100">
        Empate en eliminatoria: Â¿quiÃ©n clasifica/gana por penales?
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none focus:border-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
      >
        <option value="">ElegÃ­ ganador</option>
        {match.home_team_id && <option value={String(match.home_team_id)}>{match.home_team_name || 'Local'}</option>}
        {match.away_team_id && <option value={String(match.away_team_id)}>{match.away_team_name || 'Visitante'}</option>}
      </select>
    </label>
  );
}

function PredictionPointsPill({ prediction, match }: { prediction: Prediction | undefined; match: Match }) {
  if (!prediction) {
    return <span className="text-sm text-slate-400">Sin pronÃ³stico cargado</span>;
  }

  if (match.status !== 'FINISHED') {
    return (
      <span className="w-fit rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-slate-300">
        PronÃ³stico: {prediction.home_score} - {prediction.away_score}
        {prediction.winner_team_id && prediction.home_score === prediction.away_score ? ` Â· pasa ${teamNameById(match, prediction.winner_team_id)}` : ''}
      </span>
    );
  }

  return (
    <span
      className={`w-fit rounded-full px-3 py-1 text-sm font-black ${
        prediction.points > 0 ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-300'
      }`}
    >
      +{prediction.points} pts
    </span>
  );
}

function PredictionDetail({
  prediction,
  match,
  historical
}: {
  prediction: Prediction | undefined;
  match: Match;
  historical: boolean;
}) {
  const realHome = prediction?.real_home_score ?? match.home_score;
  const realAway = prediction?.real_away_score ?? match.away_score;
  const realWinner = prediction?.real_winner_team_id ?? match.winner_team_id;

  if (!prediction) {
    if (match.status === 'FINISHED') {
      return (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">
          No cargaste pronÃ³stico para este partido.
        </div>
      );
    }

    return null;
  }

  if (match.status !== 'FINISHED' || realHome === null || realAway === null) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">
        Resultado real pendiente. El partido ya estÃ¡ bloqueado cuando empieza, aunque todavÃ­a aparezca acÃ¡.
      </div>
    );
  }

  return (
    <div className={`mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3 ${historical ? 'opacity-95' : ''}`}>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <ScoreLine label="Tu pronÃ³stico" home={prediction.home_score} away={prediction.away_score} winner={prediction.winner_team_id ? teamNameById(match, prediction.winner_team_id) : null} />
        <ScoreLine label="Resultado real" home={realHome} away={realAway} winner={realWinner ? teamNameById(match, realWinner) : null} />

        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Puntos</div>
          <div className={`mt-1 text-xl font-black ${prediction.points > 0 ? 'text-emerald-300' : 'text-slate-300'}`}>
            +{prediction.points}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-900 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Motivo</div>
        <div className="mt-1 font-bold text-white">{prediction.points_reason || 'Sin puntos'}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          {prediction.exact_score_points > 0 && <ReasonBadge>Exacto: +{prediction.exact_score_points}</ReasonBadge>}
          {prediction.correct_winner_points > 0 && <ReasonBadge>Ganador: +{prediction.correct_winner_points}</ReasonBadge>}
          {prediction.correct_draw_points > 0 && <ReasonBadge>Empate: +{prediction.correct_draw_points}</ReasonBadge>}
          {prediction.goal_difference_points > 0 && <ReasonBadge>Diferencia: +{prediction.goal_difference_points}</ReasonBadge>}

          {prediction.points <= 0 && <ReasonBadge muted>Sin puntos</ReasonBadge>}
        </div>
      </div>
    </div>
  );
}

function ScoreLine({ label, home, away, winner }: { label: string; home: number; away: number; winner?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">
        {home} - {away}
      </div>
      {winner && home === away && <div className="mt-1 text-xs font-bold text-emerald-200">Pasa/gana: {winner}</div>}
    </div>
  );
}

function ReasonBadge({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        muted ? 'bg-slate-800 text-slate-300' : 'bg-emerald-400/15 text-emerald-200'
      }`}
    >
      {children}
    </span>
  );
}

function StatusBadge({
  children,
  tone = 'default'
}: {
  children: ReactNode;
  tone?: 'default' | 'locked' | 'live' | 'finished';
}) {
  const className = {
    default: 'bg-emerald-400/15 text-emerald-200',
    locked: 'bg-amber-400/15 text-amber-200',
    live: 'bg-red-400/15 text-red-200 ring-1 ring-red-400/30',
    finished: 'bg-slate-800 text-slate-300'
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${className}`}>
      {tone === 'live' && <span className="h-2 w-2 rounded-full bg-red-300" />}
      {children}
    </span>
  );
}

function statusText(status: Match['status']) {
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'LIVE') return 'En vivo';
  return 'Programado';
}

function statusTone(status: Match['status']): 'default' | 'live' | 'finished' {
  if (status === 'LIVE') return 'live';
  if (status === 'FINISHED') return 'finished';
  return 'default';
}

function isMatchLocked(match: Match) {
  return match.status !== 'SCHEDULED' || Date.now() >= new Date(match.starts_at).getTime();
}

function buttonText(match: Match, locked: boolean, prediction: Prediction | undefined) {
  if (match.status === 'FINISHED') return 'Finalizado';
  if (match.status === 'LIVE') return 'En vivo';
  if (locked) return 'Bloqueado';
  return prediction ? 'Actualizar' : 'Guardar';
}

function predictionCardClassName(match: Match, historical: boolean) {
  const base = 'rounded-2xl border p-3 shadow-lg shadow-black/10 transition';

  if (match.status === 'LIVE') {
    return `${base} border-red-400/70 bg-red-500/10 ring-1 ring-red-400/30`;
  }

  if (historical || match.status === 'FINISHED') {
    return `${base} border-white/10 bg-slate-900/60`;
  }

  return `${base} border-white/10 bg-white/10`;
}

function shouldShowWinnerSelector(match: Match, homeScore: string, awayScore: string) {
  const home = Number(homeScore);
  const away = Number(awayScore);
  return Boolean(Number.isInteger(home) && Number.isInteger(away) && home === away && isKnockoutMatch(match) && match.home_team_id && match.away_team_id);
}

function getWinnerTeamIdForPayload(match: Match, home: number, away: number, rawWinner: string) {
  if (home !== away || !isKnockoutMatch(match)) return null;

  if (!match.home_team_id || !match.away_team_id) {
    return new Error('TodavÃ­a no estÃ¡n definidos los equipos para elegir ganador.');
  }

  const winner = Number(rawWinner);
  if (!Number.isInteger(winner) || ![match.home_team_id, match.away_team_id].includes(winner)) {
    return new Error('Si pronosticÃ¡s empate en una eliminatoria, elegÃ­ quiÃ©n clasifica/gana por penales.');
  }

  return winner;
}

function isKnockoutMatch(match: Match) {
  if (match.group_name) return false;

  const stage = normalizeText(match.stage);
  return !stage.includes('grupo') && !stage.includes('group');
}

function teamNameById(match: Match, teamId: number) {
  if (match.home_team_id === teamId) return match.home_team_name || 'Local';
  if (match.away_team_id === teamId) return match.away_team_name || 'Visitante';
  return 'equipo elegido';
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

