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
        <p className="mt-2 text-slate-300">Cargá resultados antes de que arranque cada partido.</p>
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
                  {prediction && (
                    <span className="text-sm text-slate-300">
                      Puntos: <strong className="text-white">{prediction.points}</strong>
                    </span>
                  )}

                  <button
                    disabled={locked}
                    className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {locked ? 'Bloqueado' : 'Guardar'}
                  </button>
                </div>
              </form>
            </article>
          );
        })}
      </div>
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
