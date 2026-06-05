import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { api, Match, Prediction, RankingRow } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Message } from '../components/Message';
import { TeamBadge } from './Fixture';

export function UserPanel() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<{ matches: Match[] }>('/matches'),
      api<{ predictions: Prediction[] }>('/predictions/me'),
      api<{ ranking: RankingRow[] }>('/ranking')
    ])
      .then(([matchesResponse, predictionsResponse, rankingResponse]) => {
        setMatches(matchesResponse.matches);
        setPredictions(predictionsResponse.predictions);
        setRanking(rankingResponse.ranking);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar tu panel.'))
      .finally(() => setLoading(false));
  }, []);

  const predictionByMatch = useMemo(
    () => new Map(predictions.map((prediction) => [prediction.match_id, prediction])),
    [predictions]
  );

  const myRanking = ranking.find((row) => row.id === user?.id) || null;
  const finishedMatches = matches.filter((match) => match.status === 'FINISHED').length;
  const scheduledMatches = matches.filter((match) => match.status === 'SCHEDULED').length;

  const pendingPredictions = matches
    .filter((match) => !predictionByMatch.has(match.id) && !isLocked(match))
    .slice(0, 6);

  const nextMatches = matches
    .filter((match) => match.status === 'SCHEDULED' && new Date(match.starts_at).getTime() >= Date.now())
    .slice(0, 4);

  const scoredPredictions = predictions
    .filter((prediction) => prediction.status === 'FINISHED')
    .slice(-5)
    .reverse();

  if (loading) {
    return <Message>Cargando tu panel...</Message>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black">Mi panel</h1>
          <p className="mt-2 text-slate-300">
            Resumen rápido de tus pronósticos, puntos y próximos partidos.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/mis-pronosticos"
            className="rounded-2xl bg-emerald-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-emerald-300"
          >
            Cargar partidos
          </Link>
          <Link
            to="/especiales"
            className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black hover:bg-white/10"
          >
            Cargar especiales
          </Link>
        </div>
      </div>

      {error && <Message type="error">{error}</Message>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PanelMetric label="Mi posición" value={myRanking ? `#${myRanking.position}` : '—'} hint="Ranking general" />
        <PanelMetric label="Puntos" value={myRanking?.points ?? 0} hint="Total acumulado" />
        <PanelMetric label="Bonus" value={myRanking?.special_points ?? 0} hint={myRanking?.special_loaded ? 'Especiales cargados' : 'Falta cargar especiales'} />
        <PanelMetric label="Exactos" value={myRanking?.exact_hits ?? 0} hint="Marcador completo" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-emerald-300">Pendientes de cargar</h2>
              <p className="mt-1 text-sm text-slate-300">Los primeros partidos sin pronóstico todavía.</p>
            </div>
            <span className="rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-300">
              {pendingPredictions.length} visibles
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {pendingPredictions.map((match) => (
              <MiniMatch key={match.id} match={match} />
            ))}

            {pendingPredictions.length === 0 && (
              <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-300">
                No tenés partidos pendientes para cargar ahora. Limpio como tabla de posiciones antes de la primera fecha.
              </div>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Estado general</h2>
          <div className="mt-4 grid gap-3">
            <StatusLine label="Partidos del fixture" value={matches.length} />
            <StatusLine label="Programados" value={scheduledMatches} />
            <StatusLine label="Finalizados" value={finishedMatches} />
            <StatusLine label="Jugadores en ranking" value={ranking.length} />
            <StatusLine label="Mi bonus especial" value={myRanking?.special_points ?? 0} />
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Próximos partidos</h2>
          <div className="mt-4 grid gap-3">
            {nextMatches.map((match) => (
              <MiniMatch key={match.id} match={match} />
            ))}
            {nextMatches.length === 0 && (
              <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-300">No hay próximos partidos programados.</div>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Últimos puntos calculados</h2>
          <div className="mt-4 grid gap-3">
            {scoredPredictions.map((prediction) => {
              const match = matches.find((item) => item.id === prediction.match_id);
              if (!match) return null;

              return (
                <div key={prediction.id} className="rounded-2xl bg-slate-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">{formatDate(match.starts_at)}</div>
                  <div className="mt-2 text-sm font-bold text-white">
                    {match.home_team_name} {prediction.home_score} - {prediction.away_score} {match.away_team_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    Real: {prediction.real_home_score} - {prediction.real_away_score} · Puntos:{' '}
                    <strong className="text-emerald-300">{prediction.points}</strong>
                  </div>
                </div>
              );
            })}

            {scoredPredictions.length === 0 && (
              <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-300">
                Todavía no tenés puntos calculados. Primero que ruede la pelota.
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function PanelMetric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-300">{hint}</div>
    </article>
  );
}

function MiniMatch({ match }: { match: Match }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">
        {match.stage} · {formatDate(match.starts_at)}
      </div>
      <div className="grid gap-2">
        <TeamBadge name={match.home_team_name || 'Equipo por definir'} flagCode={match.home_flag_code} />
        <TeamBadge name={match.away_team_name || 'Equipo por definir'} flagCode={match.away_flag_code} />
      </div>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <strong className="text-emerald-300">{value}</strong>
    </div>
  );
}

function isLocked(match: Match) {
  if (match.status !== 'SCHEDULED') return true;
  return Date.now() >= new Date(match.starts_at).getTime();
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}
