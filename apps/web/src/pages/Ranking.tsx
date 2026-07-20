import { useEffect, useMemo, useState } from 'react';
import { api, RankingRow } from '../lib/api';
import { Message } from '../components/Message';
import { useAuth } from '../lib/auth';

export function Ranking() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<{ ranking: RankingRow[] }>('/ranking')
      .then((response) => setRanking(response.ranking))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el ranking.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredRanking = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ranking;
    return ranking.filter((row) => row.name.toLowerCase().includes(term));
  }, [ranking, search]);

  const winner = ranking[0] || null;
  const totalPredictions = ranking.reduce((sum, row) => sum + Number(row.predicted_count || 0), 0);
  const totalPoints = ranking.reduce((sum, row) => sum + Number(row.points || 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-5 sm:p-6">
        <div className="text-sm font-black uppercase tracking-[0.2em] text-amber-100">Ranking definitivo</div>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Gracias a todos los participantes</h1>
        <p className="mt-3 max-w-3xl leading-7 text-slate-300">
          El Prode Mundial 2026 finalizó. La tabla quedó cerrada y se conserva como resultado definitivo de la competencia.
        </p>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-black">Clasificación final</h2>
          <p className="mt-2 text-slate-300">
            Ordenada por puntos totales, exactos, aciertos de ganador o empate y cantidad de pronósticos.
          </p>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar jugador..."
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-300"
        />
      </div>

      {loading && <Message>Cargando ranking...</Message>}
      {error && <Message type="error">{error}</Message>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RankingMetric label="Participantes" value={ranking.length} />
        <RankingMetric label="Pronósticos cargados" value={totalPredictions} />
        <RankingMetric label="Puntos repartidos" value={totalPoints} />
        <RankingMetric label="Especiales cargados" value={ranking.filter((row) => Number(row.special_loaded) === 1).length} />
      </section>

      {winner && (
        <section className="rounded-3xl border border-emerald-400/40 bg-emerald-400/10 p-5 sm:p-6">
          <div className="text-sm font-black uppercase tracking-[0.2em] text-emerald-200">Ganador del Prode Mundial 2026</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-3xl font-black text-white sm:text-4xl">{winner.name}</div>
              <div className="mt-2 text-slate-300">
                {winner.exact_hits} exactos · {winner.outcome_hits} aciertos · {winner.predicted_count} pronósticos · {winner.special_points} bonus
              </div>
              <div className="mt-3 font-bold text-emerald-100">Felicitaciones por alcanzar el primer puesto definitivo.</div>
            </div>
            <div className="text-4xl font-black text-emerald-300 sm:text-5xl">{winner.points} pts</div>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white/10 text-left text-slate-300">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Jugador</th>
                <th className="px-4 py-3 text-right">Puntos</th>
                <th className="px-4 py-3 text-right">Pts. partidos</th>
                <th className="px-4 py-3 text-right">Bonus</th>
                <th className="px-4 py-3 text-right">Exactos</th>
                <th className="px-4 py-3 text-right">Aciertos</th>
                <th className="px-4 py-3 text-right">Pronósticos</th>
              </tr>
            </thead>
            <tbody>
              {filteredRanking.map((row) => (
                <tr key={row.id} className={`border-t border-white/10 ${row.id === user?.id ? 'bg-emerald-400/10' : ''}`}>
                  <td className="px-4 py-3 font-black text-emerald-300">{row.position}</td>
                  <td className="px-4 py-3 font-bold">
                    {row.name}
                    {row.id === user?.id && <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs text-slate-950">Vos</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-black">{row.points}</td>
                  <td className="px-4 py-3 text-right">{row.match_points}</td>
                  <td className="px-4 py-3 text-right">{row.special_points}</td>
                  <td className="px-4 py-3 text-right">{row.exact_hits}</td>
                  <td className="px-4 py-3 text-right">{row.outcome_hits}</td>
                  <td className="px-4 py-3 text-right">{row.predicted_count}</td>
                </tr>
              ))}
              {filteredRanking.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-300" colSpan={8}>
                    No hay jugadores para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filteredRanking.map((row) => (
            <article key={row.id} className={`rounded-2xl bg-slate-900 p-4 ${row.id === user?.id ? 'ring-2 ring-emerald-300' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-emerald-300">#{row.position}</div>
                  <div className="mt-1 font-black text-white">
                    {row.name}
                    {row.id === user?.id && <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs text-slate-950">Vos</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">{row.points}</div>
                  <div className="text-xs text-slate-400">puntos</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                <SmallStat label="Pts. partidos" value={row.match_points} />
                <SmallStat label="Bonus" value={row.special_points} />
                <SmallStat label="Exactos" value={row.exact_hits} />
                <SmallStat label="Pronósticos" value={row.predicted_count} />
              </div>
            </article>
          ))}

          {filteredRanking.length === 0 && (
            <div className="rounded-2xl bg-slate-900 p-4 text-center text-sm text-slate-300">No hay jugadores para mostrar.</div>
          )}
        </div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-5 text-sm text-slate-300">
        <h2 className="font-black text-emerald-300">Criterios de desempate aplicados</h2>
        <p className="mt-2">
          Primero puntos totales, incluyendo partidos y bonus especiales. Si hay empate: más resultados exactos, luego más aciertos de ganador o empate,
          luego más pronósticos cargados y finalmente fecha de registro.
        </p>
      </section>
    </div>
  );
}

function RankingMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
    </article>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-3">
      <div className="font-black text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
