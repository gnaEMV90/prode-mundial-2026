import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api, Match } from '../lib/api';
import { Message } from '../components/Message';
import { FlagIcon } from '../components/FlagIcon';

export function Fixture() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ matches: Match[] }>('/matches')
      .then((response) => setMatches(response.matches))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el fixture.'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = matches.reduce<Record<string, Match[]>>((acc, match) => {
    const key = match.group_name ? `Grupo ${match.group_name}` : match.stage;
    acc[key] = acc[key] || [];
    acc[key].push(match);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Fixture</h1>
        <p className="mt-2 text-slate-300">Partidos ordenados por fecha. El admin puede editar equipos, horarios, sede y resultados.</p>
      </div>
      {loading && <Message>Cargando fixture...</Message>}
      {error && <Message type="error">{error}</Message>}
      <div className="space-y-8">
        {Object.entries(grouped).map(([group, rows]) => (
          <section key={group} className="space-y-3">
            <h2 className="text-xl font-black text-emerald-300">{group}</h2>
            <div className="grid gap-3">
              {rows.map((match) => <MatchCard key={match.id} match={match} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function MatchCard({ match, children }: { match: Match; children?: ReactNode }) {
  const home = match.home_team_name || 'Equipo por definir';
  const away = match.away_team_name || 'Equipo por definir';
  const date = new Date(match.starts_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <article className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-400">{match.stage} · {date}</div>
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
            <div className="mt-1 text-xl font-black">{match.home_score} - {match.away_score}</div>
          )}
        </div>
      </div>
      {children && <div className="mt-4 border-t border-white/10 pt-4">{children}</div>}
    </article>
  );
}

export function TeamBadge({ name, flagCode }: { name: string; flagCode: string | null }) {
  const isPending = name === 'Equipo por definir';

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-950/40 px-3 py-2">
      <span className="flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-slate-800">
        {isPending ? <span className="text-xs text-slate-400">—</span> : <FlagIcon code={flagCode} label={`Bandera de ${name}`} />}
      </span>
      <span className="font-black text-white">{name}</span>
    </div>
  );
}

function statusText(status: Match['status']) {
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'LIVE') return 'En vivo';
  return 'Programado';
}
