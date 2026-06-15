import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api, Match } from '../lib/api';
import { Message } from '../components/Message';
import { FlagIcon } from '../components/FlagIcon';

type FixtureFilter = 'all' | 'groups' | 'knockout' | `group:${string}` | `stage:${string}`;

export function Fixture() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<FixtureFilter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ matches: Match[] }>('/matches')
      .then((response) => setMatches(response.matches))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el fixture.'))
      .finally(() => setLoading(false));
  }, []);

  const groupNames = useMemo(() => {
    return Array.from(new Set(matches.map((match) => match.group_name).filter(Boolean))).sort() as string[];
  }, [matches]);

  const stageNames = useMemo(() => {
    return Array.from(
      new Set(matches.filter((match) => !match.group_name).map((match) => match.stage).filter(Boolean))
    );
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (filter === 'all') return true;
      if (filter === 'groups') return Boolean(match.group_name);
      if (filter === 'knockout') return !match.group_name;
      if (filter.startsWith('group:')) return match.group_name === filter.replace('group:', '');
      if (filter.startsWith('stage:')) return match.stage === filter.replace('stage:', '');

      return true;
    });
  }, [matches, filter]);

  const grouped = useMemo(() => {
    return filteredMatches.reduce<Record<string, Match[]>>((acc, match) => {
      const key = match.group_name ? `Grupo ${match.group_name}` : match.stage;
      acc[key] = acc[key] || [];
      acc[key].push(match);
      return acc;
    }, {});
  }, [filteredMatches]);

  const totalFinished = matches.filter((match) => match.status === 'FINISHED').length;
  const totalScheduled = matches.filter((match) => match.status === 'SCHEDULED').length;
  const totalLive = matches.filter((match) => match.status === 'LIVE').length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
        <h1 className="text-3xl font-black">Fixture</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
          Consultá partidos, fechas, sedes y resultados del Mundial 2026. Los partidos en vivo quedan resaltados para
          encontrarlos de un vistazo.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Partidos" value={matches.length} />
        <SummaryCard label="Pendientes" value={totalScheduled} />
        <SummaryCard label="En vivo" value={totalLive} live={totalLive > 0} />
        <SummaryCard label="Finalizados" value={totalFinished} accent />
      </div>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos
          </FilterButton>

          <FilterButton active={filter === 'groups'} onClick={() => setFilter('groups')}>
            Fase de grupos
          </FilterButton>

          <FilterButton active={filter === 'knockout'} onClick={() => setFilter('knockout')}>
            Eliminatorias
          </FilterButton>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {groupNames.map((group) => (
            <FilterButton key={group} active={filter === `group:${group}`} onClick={() => setFilter(`group:${group}`)}>
              Grupo {group}
            </FilterButton>
          ))}
        </div>

        {stageNames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stageNames.map((stage) => (
              <FilterButton key={stage} active={filter === `stage:${stage}`} onClick={() => setFilter(`stage:${stage}`)}>
                {stage}
              </FilterButton>
            ))}
          </div>
        )}
      </section>

      {loading && <Message>Cargando fixture...</Message>}
      {error && <Message type="error">{error}</Message>}

      {!loading && !error && filteredMatches.length === 0 && <Message>No hay partidos para este filtro.</Message>}

      <div className="space-y-8">
        {Object.entries(grouped).map(([group, rows]) => (
          <section key={group} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-emerald-300">{group}</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                {rows.length} partidos
              </span>
            </div>

            <div className="grid gap-3">
              {rows.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
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

  const date = new Date(match.starts_at).toLocaleString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const hasResult = match.home_score !== null && match.away_score !== null;

  return (
    <article className={matchCardClassName(match)}>
      {match.status === 'LIVE' && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-black text-red-100">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          Partido en vivo
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Partido #{match.match_order} · {match.group_name ? `Grupo ${match.group_name}` : match.stage}
            </div>

            <div className="mt-1 text-sm font-bold capitalize text-slate-200">{date}</div>

            <div className="mt-1 text-sm text-slate-400">{match.venue || 'Sede por definir'}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge status={match.status} />

            {hasResult && (
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
                {match.home_score} - {match.away_score}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <TeamBadge name={home} flagCode={match.home_flag_code} />

          <div className="flex items-center justify-center">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase text-slate-500">vs</span>
          </div>

          <TeamBadge name={away} flagCode={match.away_flag_code} />
        </div>

        {hasResult && (
          <div className="rounded-2xl bg-slate-950/60 p-3 text-center sm:hidden">
            <div className="text-xs uppercase tracking-wide text-slate-500">Resultado</div>
            <div className="mt-1 text-2xl font-black text-white">
              {match.home_score} - {match.away_score}
            </div>
          </div>
        )}
      </div>

      {children && <div className="mt-4 border-t border-white/10 pt-4">{children}</div>}
    </article>
  );
}

export function TeamBadge({ name, flagCode }: { name: string; flagCode: string | null }) {
  const isPending = name === 'Equipo por definir';

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-slate-950/40 px-3 py-3">
      <span className="flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-slate-800">
        {isPending ? <span className="text-xs text-slate-400">—</span> : <FlagIcon code={flagCode} label={`Bandera de ${name}`} />}
      </span>

      <span className="min-w-0 flex-1 truncate font-black text-white">{name}</span>
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
    <div className={`rounded-3xl border p-4 ${live ? 'border-red-400/50 bg-red-500/10' : 'border-white/10 bg-white/10'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 sm:text-xs">{label}</div>
      <div className={`mt-2 text-2xl font-black ${live ? 'text-red-200' : accent ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
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

function StatusBadge({ status }: { status: Match['status'] }) {
  const config = {
    SCHEDULED: {
      label: 'Programado',
      className: 'bg-emerald-400/15 text-emerald-200'
    },
    LIVE: {
      label: 'En vivo',
      className: 'bg-red-400/15 text-red-200 ring-1 ring-red-400/30'
    },
    FINISHED: {
      label: 'Finalizado',
      className: 'bg-slate-800 text-slate-200'
    }
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${config.className}`}>
      {status === 'LIVE' && <span className="h-2 w-2 rounded-full bg-red-300" />}
      {config.label}
    </span>
  );
}

function matchCardClassName(match: Match) {
  const base = 'rounded-3xl border p-4 shadow-lg shadow-black/10 transition';

  if (match.status === 'LIVE') {
    return `${base} border-red-400/70 bg-red-500/10 ring-1 ring-red-400/30`;
  }

  return `${base} border-white/10 bg-white/10`;
}
