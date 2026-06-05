import type { ReactNode } from 'react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Match, Prediction } from '../lib/api';
import { Message } from '../components/Message';
import { TeamBadge } from './Fixture';

type PredictionForm = Record<number, { home_score: string; away_score: string }>;

export function MyPredictions() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [form, setForm] = useState<PredictionForm>({});
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

  const totals = useMemo(() => {
    const loaded = predictions.length;
    const finished = predictions.filter((prediction) => prediction.status === 'FINISHED').length;
    const points = predictions.reduce((sum, prediction) => sum + prediction.points, 0);
    const exactHits = predictions.filter((prediction) => prediction.exact_score_points > 0).length;

    return { loaded, finished, points, exactHits };
  }, [predictions]);

  useEffect(() => {
    const next: PredictionForm = {};

    predictions.forEach((prediction) => {
      next[prediction.match_id] = {
        home_score: String(prediction.home_score),
        away_score: String(prediction.away_score)
      };
    });

    setForm((current) => ({ ...next, ...current }));
  }, [predictions]);

  async function savePrediction(event: FormEvent, match: Match) {
    event.preventDefault();
    setMessage('');
    setError('');

    const values = form[match.id] || { home_score: '', away_score: '' };
    const home = Number(values.home_score);
    const away = Number(values.away_score);

    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setError('Cargá un resultado válido.');
      return;
    }

    try {
      await api(`/predictions/${match.id}`, {
        method: 'PUT',
        body: { home_score: home, away_score: away }
      });

      await load();
      setMessage('Pronóstico guardado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el pronóstico.');
    }
  }

  function update(matchId: number, field: 'home_score' | 'away_score', value: string) {
    setForm((current) => ({
      ...current,
      [matchId]: {
        home_score: current[matchId]?.home_score || '',
        away_score: current[matchId]?.away_score || '',
        [field]: value
      }
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Mis pronósticos</h1>
        <p className="mt-2 text-slate-300">
          Cargá resultados antes de que arranque cada partido. Cuando el partido termina, vas a ver exactamente por qué sumaste puntos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Pronósticos cargados" value={totals.loaded} />
        <SummaryCard label="Partidos con puntos" value={totals.finished} />
        <SummaryCard label="Puntos por partidos" value={totals.points} accent />
        <SummaryCard label="Exactos" value={totals.exactHits} />
      </div>

      {message && <Message type="success">{message}</Message>}
      {error && <Message type="error">{error}</Message>}

      <div className="grid gap-4">
        {matches.map((match) => {
          const prediction = predictionByMatch.get(match.id);
          const locked = match.status !== 'SCHEDULED' || Date.now() >= new Date(match.starts_at).getTime();
          const values = form[match.id] || { home_score: '', away_score: '' };

          return (
            <article key={match.id} className="rounded-3xl border border-white/10 bg-white/10 p-4">
              <PredictionMatchHeader match={match} />

              <form
                onSubmit={(event) => savePrediction(event, match)}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              >
                <div className="grid grid-cols-2 gap-3">
                  <ScoreInput
                    value={values.home_score}
                    disabled={locked}
                    ariaLabel={`Goles de ${match.home_team_name || 'local'}`}
                    onChange={(value) => update(match.id, 'home_score', value)}
                  />

                  <ScoreInput
                    value={values.away_score}
                    disabled={locked}
                    ariaLabel={`Goles de ${match.away_team_name || 'visitante'}`}
                    onChange={(value) => update(match.id, 'away_score', value)}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  <PredictionPointsPill prediction={prediction} match={match} />

                  <button
                    disabled={locked}
                    className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {locked ? 'Bloqueado' : 'Guardar'}
                  </button>
                </div>
              </form>

              <PredictionDetail prediction={prediction} match={match} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function PredictionMatchHeader({ match }: { match: Match }) {
  const home = match.home_team_name || 'Equipo por definir';
  const away = match.away_team_name || 'Equipo por definir';
  const date = new Date(match.starts_at).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {match.stage} · {date}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <TeamBadge name={home} flagCode={match.home_flag_code} />
          <span className="hidden text-center text-sm font-black uppercase text-slate-500 sm:block">vs</span>
          <TeamBadge name={away} flagCode={match.away_flag_code} />
        </div>

        <div className="mt-3 text-sm text-slate-300">{match.venue || 'Sede por definir'}</div>
      </div>

      <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center">
        <div className="text-xs text-slate-400">Estado</div>
        <div className="font-bold text-emerald-300">{statusText(match.status)}</div>

        {match.home_score !== null && match.away_score !== null && (
          <div className="mt-1 text-xl font-black">
            {match.home_score} - {match.away_score}
          </div>
        )}
      </div>
    </div>
  );
}

function PredictionPointsPill({ prediction, match }: { prediction: Prediction | undefined; match: Match }) {
  if (!prediction) {
    return <span className="text-sm text-slate-400">Sin pronóstico</span>;
  }

  if (match.status !== 'FINISHED') {
    return (
      <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-slate-300">
        Pendiente de resultado
      </span>
    );
  }

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-black ${prediction.points > 0 ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
      +{prediction.points} pts
    </span>
  );
}

function PredictionDetail({ prediction, match }: { prediction: Prediction | undefined; match: Match }) {
  const realHome = prediction?.real_home_score ?? match.home_score;
  const realAway = prediction?.real_away_score ?? match.away_score;

  if (!prediction) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
        Todavía no cargaste pronóstico para este partido.
      </div>
    );
  }

  if (match.status !== 'FINISHED' || realHome === null || realAway === null) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <ScoreLine label="Tu pronóstico" home={prediction.home_score} away={prediction.away_score} />
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Resultado real</div>
            <div className="mt-1 font-bold text-slate-300">Pendiente</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-400">Cuando el admin cargue el resultado final, acá vas a ver tus puntos y el motivo.</div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <ScoreLine label="Tu pronóstico" home={prediction.home_score} away={prediction.away_score} />
        <ScoreLine label="Resultado real" home={realHome} away={realAway} />
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Puntos obtenidos</div>
          <div className={`mt-1 text-xl font-black ${prediction.points > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
            +{prediction.points} pts
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ReasonBadge primary>{prediction.points_reason || 'Detalle no disponible'}</ReasonBadge>
        {prediction.exact_score_points > 0 && <ReasonBadge>Exacto: +{prediction.exact_score_points}</ReasonBadge>}
        {prediction.correct_winner_points > 0 && <ReasonBadge>Ganador: +{prediction.correct_winner_points}</ReasonBadge>}
        {prediction.correct_draw_points > 0 && <ReasonBadge>Empate: +{prediction.correct_draw_points}</ReasonBadge>}
        {prediction.goal_difference_points > 0 && <ReasonBadge>Diferencia: +{prediction.goal_difference_points}</ReasonBadge>}
        {prediction.points === 0 && <ReasonBadge>Esta vez no sumó. Duele, pero el fixture sigue.</ReasonBadge>}
      </div>
    </div>
  );
}

function ScoreLine({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">
        {home} - {away}
      </div>
    </div>
  );
}

function ReasonBadge({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${primary ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-200'}`}>
      {children}
    </span>
  );
}

function ScoreInput({
  value,
  disabled,
  ariaLabel,
  onChange
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="number"
      min="0"
      max="99"
      disabled={disabled}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-center text-xl font-black text-white outline-none focus:border-emerald-300 disabled:text-slate-500"
    />
  );
}

function statusText(status: Match['status']) {
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'LIVE') return 'En vivo';
  return 'Programado';
}
