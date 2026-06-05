import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, AdminAuditLog, Match, ScoringRules, Team, TournamentResults, User } from '../lib/api';
import { Message } from '../components/Message';
import { FlagIcon } from '../components/FlagIcon';

type StatusFilter = 'ALL' | Match['status'];

export function Admin() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rules, setRules] = useState<ScoringRules | null>(null);
  const [tournamentResults, setTournamentResults] = useState<TournamentResults | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [matchesResponse, usersResponse, teamsResponse, rulesResponse, tournamentResultsResponse, auditLogsResponse] = await Promise.all([
      api<{ matches: Match[] }>('/matches'),
      api<{ users: User[] }>('/admin/users'),
      api<{ teams: Team[] }>('/teams'),
      api<{ rules: ScoringRules }>('/admin/scoring-rules'),
      api<{ results: TournamentResults }>('/admin/tournament-results'),
      api<{ logs: AdminAuditLog[] }>('/admin/audit-logs')
    ]);
    setMatches(matchesResponse.matches);
    setUsers(usersResponse.users);
    setTeams(teamsResponse.teams);
    setRules(rulesResponse.rules);
    setTournamentResults(tournamentResultsResponse.results);
    setAuditLogs(auditLogsResponse.logs);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el panel admin.'));
  }, []);

  async function recalculate() {
    setError('');
    setMessage('');

    if (!window.confirm('Vas a recalcular todos los puntajes del ranking. ¿Continuar?')) return;

    try {
      await api('/admin/recalculate', { method: 'POST' });
      await load();
      setMessage('Puntajes recalculados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recalcular.');
    }
  }

  async function toggleLock(locked: boolean) {
    setError('');
    setMessage('');

    const text = locked
      ? 'Vas a bloquear la carga general de pronósticos. ¿Continuar?'
      : 'Vas a desbloquear la carga general de pronósticos. ¿Continuar?';
    if (!window.confirm(text)) return;

    try {
      await api('/admin/settings/predictions-lock', { method: 'POST', body: { locked } });
      setMessage(locked ? 'Carga bloqueada.' : 'Carga desbloqueada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el bloqueo.');
    }
  }

  async function toggleSpecialLock(locked: boolean) {
    setError('');
    setMessage('');

    const text = locked
      ? 'Vas a bloquear las predicciones especiales. ¿Continuar?'
      : 'Vas a desbloquear las predicciones especiales. ¿Continuar?';
    if (!window.confirm(text)) return;

    try {
      await api('/admin/settings/special-lock', { method: 'POST', body: { locked } });
      setMessage(locked ? 'Predicciones especiales bloqueadas.' : 'Predicciones especiales desbloqueadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el bloqueo de especiales.');
    }
  }

  const stats = useMemo(() => {
    const finished = matches.filter((match) => match.status === 'FINISHED').length;
    const live = matches.filter((match) => match.status === 'LIVE').length;
    const scheduled = matches.filter((match) => match.status === 'SCHEDULED').length;

    return [
      { label: 'Partidos', value: matches.length },
      { label: 'Finalizados', value: finished },
      { label: 'En vivo', value: live },
      { label: 'Pendientes', value: scheduled },
      { label: 'Usuarios', value: users.length }
    ];
  }, [matches, users]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black">Panel administrador</h1>
        <p className="mt-2 text-slate-300">Carga resultados reales, recalcula puntos y administra reglas del Prode.</p>
      </div>

      {message && <Message type="success">{message}</Message>}
      {error && <Message type="error">{error}</Message>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/10 bg-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{item.label}</div>
            <div className="mt-2 text-3xl font-black text-white">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button onClick={recalculate} className="rounded-2xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300">
          Recalcular puntos
        </button>
        <button onClick={() => toggleLock(true)} className="rounded-2xl bg-amber-400 px-4 py-3 font-black text-slate-950 hover:bg-amber-300">
          Bloquear carga
        </button>
        <button onClick={() => toggleLock(false)} className="rounded-2xl border border-white/10 px-4 py-3 font-black hover:bg-white/10">
          Desbloquear carga
        </button>
        <button onClick={() => toggleSpecialLock(true)} className="rounded-2xl bg-amber-400/80 px-4 py-3 font-black text-slate-950 hover:bg-amber-300">
          Bloquear especiales
        </button>
        <button onClick={() => toggleSpecialLock(false)} className="rounded-2xl border border-white/10 px-4 py-3 font-black hover:bg-white/10">
          Desbloquear especiales
        </button>
      </section>

      <ResultsAdmin matches={matches} onSaved={load} onMessage={setMessage} onError={setError} />
      <FixtureAdmin matches={matches} teams={teams} onSaved={load} onMessage={setMessage} onError={setError} />
      {tournamentResults && <TournamentResultsAdmin results={tournamentResults} teams={teams} onSaved={load} onMessage={setMessage} onError={setError} />}
      {rules && <RulesForm rules={rules} onSaved={load} onMessage={setMessage} onError={setError} />}
      <UsersAdmin users={users} onSaved={load} onMessage={setMessage} onError={setError} />
      <AuditLogsAdmin logs={auditLogs} />
    </div>
  );
}

function ResultsAdmin({
  matches,
  onSaved,
  onMessage,
  onError
}: {
  matches: Match[];
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => Array.from(new Set(matches.map((match) => match.group_name).filter((value): value is string => Boolean(value)))).sort(),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return matches.filter((match) => {
      const matchesStatus = statusFilter === 'ALL' || match.status === statusFilter;
      const matchesGroup = groupFilter === 'ALL' || match.group_name === groupFilter;
      const text = [
        match.stage,
        match.group_name,
        match.venue,
        match.home_team_name,
        match.away_team_name,
        match.home_team_code,
        match.away_team_code
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);

      return matchesStatus && matchesGroup && matchesQuery;
    });
  }, [matches, statusFilter, groupFilter, query]);

  function clearFilters() {
    setStatusFilter('ALL');
    setGroupFilter('ALL');
    setQuery('');
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-emerald-300">Resultados</h2>
        <p className="mt-1 text-sm text-slate-300">Guardá el resultado final de cada partido. Al guardar, el ranking se actualiza solo.</p>
      </div>

      <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 lg:grid-cols-[1fr_180px_180px_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar selección, estadio o etapa"
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-300"
        />

        <select
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-300"
        >
          <option value="ALL">Todos los grupos</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              Grupo {group}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-300"
        >
          <option value="ALL">Todos los estados</option>
          <option value="SCHEDULED">Programados</option>
          <option value="LIVE">En vivo</option>
          <option value="FINISHED">Finalizados</option>
        </select>

        <button onClick={clearFilters} className="rounded-2xl border border-white/10 px-4 py-3 font-black hover:bg-white/10">
          Limpiar
        </button>
      </div>

      <div className="text-sm text-slate-300">
        Mostrando <strong className="text-white">{filteredMatches.length}</strong> de <strong className="text-white">{matches.length}</strong> partidos.
      </div>

      <div className="grid gap-3">
        {filteredMatches.map((match) => (
          <ResultRow key={match.id} match={match} onSaved={onSaved} onMessage={onMessage} onError={onError} />
        ))}
      </div>
    </section>
  );
}

function ResultRow({
  match,
  onSaved,
  onMessage,
  onError
}: {
  match: Match;
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [homeScore, setHomeScore] = useState(match.home_score !== null ? String(match.home_score) : '');
  const [awayScore, setAwayScore] = useState(match.away_score !== null ? String(match.away_score) : '');
  const [saving, setSaving] = useState(false);
  const home = match.home_team_name || 'Equipo por definir';
  const away = match.away_team_name || 'Equipo por definir';
  const date = new Date(match.starts_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  useEffect(() => {
    setHomeScore(match.home_score !== null ? String(match.home_score) : '');
    setAwayScore(match.away_score !== null ? String(match.away_score) : '');
  }, [match.home_score, match.away_score]);

  async function save(event: FormEvent) {
    event.preventDefault();
    onMessage('');
    onError('');

    const homeNumber = Number(homeScore);
    const awayNumber = Number(awayScore);

    if (!Number.isInteger(homeNumber) || !Number.isInteger(awayNumber) || homeNumber < 0 || awayNumber < 0) {
      onError('Resultado inválido. Usá números enteros mayores o iguales a cero.');
      return;
    }

    if (!window.confirm(`Vas a guardar el resultado ${home} ${homeNumber} - ${awayNumber} ${away} y recalcular el ranking. ¿Continuar?`)) {
      return;
    }

    setSaving(true);
    try {
      await api(`/admin/matches/${match.id}/result`, {
        method: 'POST',
        body: { home_score: homeNumber, away_score: awayNumber, status: 'FINISHED' }
      });
      await onSaved();
      onMessage(`Resultado guardado: ${home} ${homeNumber} - ${awayNumber} ${away}. Ranking actualizado.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar el resultado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
            <span>#{match.match_order}</span>
            <span>·</span>
            <span>{match.stage}</span>
            {match.group_name && (
              <>
                <span>·</span>
                <span>Grupo {match.group_name}</span>
              </>
            )}
            <span>·</span>
            <span>{date}</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <TeamResultLabel name={home} flagCode={match.home_flag_code} isDefined={Boolean(match.home_team_name)} />
            <span className="hidden text-center text-sm font-black uppercase text-slate-500 sm:block">vs</span>
            <TeamResultLabel name={away} flagCode={match.away_flag_code} isDefined={Boolean(match.away_team_name)} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>{match.venue || 'Sede por definir'}</span>
            <span className="text-slate-600">·</span>
            <StatusBadge status={match.status} />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[76px_76px_auto]">
          <input
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-center text-lg font-black outline-none focus:border-emerald-300"
            type="number"
            min="0"
            max="99"
            value={homeScore}
            aria-label={`Goles de ${home}`}
            onChange={(event) => setHomeScore(event.target.value)}
          />
          <input
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-center text-lg font-black outline-none focus:border-emerald-300"
            type="number"
            min="0"
            max="99"
            value={awayScore}
            aria-label={`Goles de ${away}`}
            onChange={(event) => setAwayScore(event.target.value)}
          />
          <button
            disabled={saving}
            className="col-span-2 rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-wait disabled:bg-slate-600 disabled:text-slate-300 sm:col-span-1"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </form>
  );
}

function TeamResultLabel({ name, flagCode, isDefined }: { name: string; flagCode: string | null; isDefined: boolean }) {
  return (
    <span className="flex items-center gap-3 rounded-2xl bg-slate-950/40 px-3 py-2 font-black text-white">
      <span className="flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-slate-800">
        {isDefined ? <FlagIcon code={flagCode} label={`Bandera de ${name}`} /> : <span className="text-xs text-slate-400">—</span>}
      </span>
      <span>{name}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: Match['status'] }) {
  const classes: Record<Match['status'], string> = {
    SCHEDULED: 'bg-slate-900 text-slate-300',
    LIVE: 'bg-amber-400 text-slate-950',
    FINISHED: 'bg-emerald-400 text-slate-950'
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{statusText(status)}</span>;
}


function FixtureAdmin({
  matches,
  teams,
  onSaved,
  onMessage,
  onError
}: {
  matches: Match[];
  teams: Team[];
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => Array.from(new Set(matches.map((match) => match.group_name).filter((value): value is string => Boolean(value)))).sort(),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return matches.filter((match) => {
      const matchesGroup = groupFilter === 'ALL' || match.group_name === groupFilter;
      const text = [
        match.stage,
        match.group_name,
        match.venue,
        match.home_team_name,
        match.away_team_name,
        match.home_team_code,
        match.away_team_code,
        match.match_order
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);
      return matchesGroup && matchesQuery;
    });
  }, [matches, groupFilter, query]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-emerald-300">Fixture editable</h2>
        <p className="mt-1 text-sm text-slate-300">
          Editá equipos, etapa, grupo, horario y sede sin tocar la base de datos. Esto es clave para completar cruces de eliminatorias.
        </p>
      </div>

      <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 lg:grid-cols-[1fr_180px_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar partido, equipo, sede o número"
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-300"
        />

        <select
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-300"
        >
          <option value="ALL">Todos los grupos</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              Grupo {group}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setQuery('');
            setGroupFilter('ALL');
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 font-black hover:bg-white/10"
        >
          Limpiar
        </button>
      </div>

      <div className="text-sm text-slate-300">
        Mostrando <strong className="text-white">{filteredMatches.length}</strong> partidos para edición.
      </div>

      <div className="grid gap-3">
        {filteredMatches.map((match) => (
          <FixtureRow key={match.id} match={match} teams={teams} onSaved={onSaved} onMessage={onMessage} onError={onError} />
        ))}
      </div>
    </section>
  );
}

function FixtureRow({
  match,
  teams,
  onSaved,
  onMessage,
  onError
}: {
  match: Match;
  teams: Team[];
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [stage, setStage] = useState(match.stage);
  const [groupName, setGroupName] = useState(match.group_name || '');
  const [homeTeamId, setHomeTeamId] = useState(match.home_team_id ? String(match.home_team_id) : '');
  const [awayTeamId, setAwayTeamId] = useState(match.away_team_id ? String(match.away_team_id) : '');
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(match.starts_at));
  const [venue, setVenue] = useState(match.venue || '');
  const [status, setStatus] = useState<Match['status']>(match.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStage(match.stage);
    setGroupName(match.group_name || '');
    setHomeTeamId(match.home_team_id ? String(match.home_team_id) : '');
    setAwayTeamId(match.away_team_id ? String(match.away_team_id) : '');
    setStartsAt(toDateTimeLocal(match.starts_at));
    setVenue(match.venue || '');
    setStatus(match.status);
  }, [match]);

  async function save(event: FormEvent) {
    event.preventDefault();
    onMessage('');
    onError('');

    if (!stage.trim()) {
      onError('La etapa del partido es obligatoria.');
      return;
    }

    if (!startsAt) {
      onError('La fecha y hora del partido son obligatorias.');
      return;
    }

    if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
      onError('Local y visitante no pueden ser la misma selección.');
      return;
    }

    if (!window.confirm(`Vas a modificar el fixture del partido #${match.match_order}. ¿Continuar?`)) {
      return;
    }

    setSaving(true);
    try {
      await api(`/admin/matches/${match.id}`, {
        method: 'PUT',
        body: {
          stage: stage.trim(),
          group_name: groupName.trim() || null,
          home_team_id: homeTeamId ? Number(homeTeamId) : null,
          away_team_id: awayTeamId ? Number(awayTeamId) : null,
          starts_at: new Date(startsAt).toISOString(),
          venue: venue.trim() || null,
          status
        }
      });

      await onSaved();
      onMessage(`Fixture actualizado para el partido #${match.match_order}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo actualizar el fixture.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Partido #{match.match_order}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <TeamMiniLabel name={match.home_team_name || 'Equipo por definir'} flagCode={match.home_flag_code} />
            <span className="text-slate-500">vs</span>
            <TeamMiniLabel name={match.away_team_name || 'Equipo por definir'} flagCode={match.away_flag_code} />
          </div>
        </div>
        <StatusBadge status={match.status} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Local</span>
          <TeamSelect value={homeTeamId} teams={teams} onChange={setHomeTeamId} />
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Visitante</span>
          <TeamSelect value={awayTeamId} teams={teams} onChange={setAwayTeamId} />
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Etapa</span>
          <input
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Grupo</span>
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value.toUpperCase())}
            placeholder="A, B, C... o vacío"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Fecha y hora</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
          />
        </label>

        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Estado</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as Match['status'])}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
          >
            <option value="SCHEDULED">Programado</option>
            <option value="LIVE">En vivo</option>
            <option value="FINISHED">Finalizado</option>
          </select>
        </label>

        <label className="space-y-2 lg:col-span-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Sede / estadio</span>
          <input
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            placeholder="Sede por definir"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
          />
        </label>
      </div>

      <button
        disabled={saving}
        className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-wait disabled:bg-slate-600 disabled:text-slate-300"
      >
        {saving ? 'Guardando fixture...' : 'Guardar fixture'}
      </button>
    </form>
  );
}

function TeamSelect({ value, teams, onChange }: { value: string; teams: Team[]; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
    >
      <option value="">Equipo por definir</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.group_name ? `Grupo ${team.group_name} · ` : ''}{team.name}
        </option>
      ))}
    </select>
  );
}

function TeamMiniLabel({ name, flagCode }: { name: string; flagCode: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/40 px-3 py-1 font-bold text-white">
      {flagCode && (
        <span className="h-4 w-6 overflow-hidden rounded-sm bg-slate-800">
          <FlagIcon code={flagCode} label={`Bandera de ${name}`} />
        </span>
      )}
      <span>{name}</span>
    </span>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function TournamentResultsAdmin({
  results,
  teams,
  onSaved,
  onMessage,
  onError
}: {
  results: TournamentResults;
  teams: Team[];
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [championTeamId, setChampionTeamId] = useState(results.champion_team_id ? String(results.champion_team_id) : '');
  const [runnerUpTeamId, setRunnerUpTeamId] = useState(results.runner_up_team_id ? String(results.runner_up_team_id) : '');
  const [thirdPlaceTeamId, setThirdPlaceTeamId] = useState(results.third_place_team_id ? String(results.third_place_team_id) : '');
  const [fourthPlaceTeamId, setFourthPlaceTeamId] = useState(results.fourth_place_team_id ? String(results.fourth_place_team_id) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChampionTeamId(results.champion_team_id ? String(results.champion_team_id) : '');
    setRunnerUpTeamId(results.runner_up_team_id ? String(results.runner_up_team_id) : '');
    setThirdPlaceTeamId(results.third_place_team_id ? String(results.third_place_team_id) : '');
    setFourthPlaceTeamId(results.fourth_place_team_id ? String(results.fourth_place_team_id) : '');
  }, [results]);

  async function save(event: FormEvent) {
    event.preventDefault();
    onMessage('');
    onError('');

    const selected = [championTeamId, runnerUpTeamId, thirdPlaceTeamId, fourthPlaceTeamId].filter(Boolean);
    if (new Set(selected).size !== selected.length) {
      onError('Las posiciones finales no pueden repetir selección.');
      return;
    }

    if (!window.confirm('Vas a guardar las posiciones finales del torneo y recalcular bonus especiales. ¿Continuar?')) {
      return;
    }

    setSaving(true);
    try {
      await api('/admin/tournament-results', {
        method: 'PUT',
        body: {
          champion_team_id: championTeamId ? Number(championTeamId) : null,
          runner_up_team_id: runnerUpTeamId ? Number(runnerUpTeamId) : null,
          third_place_team_id: thirdPlaceTeamId ? Number(thirdPlaceTeamId) : null,
          fourth_place_team_id: fourthPlaceTeamId ? Number(fourthPlaceTeamId) : null
        }
      });
      await onSaved();
      onMessage('Posiciones finales guardadas. Bonus especiales recalculados.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudieron guardar las posiciones finales.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <h2 className="text-2xl font-black text-emerald-300">Resultados finales del torneo</h2>
      <p className="mt-1 text-sm text-slate-300">
        Cuando termine el Mundial, cargá campeón, subcampeón, tercero y cuarto. Al guardar, se recalculan los bonus especiales del ranking.
      </p>

      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Campeón</span>
          <TeamSelect value={championTeamId} teams={teams} onChange={setChampionTeamId} />
        </label>
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Subcampeón</span>
          <TeamSelect value={runnerUpTeamId} teams={teams} onChange={setRunnerUpTeamId} />
        </label>
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Tercero</span>
          <TeamSelect value={thirdPlaceTeamId} teams={teams} onChange={setThirdPlaceTeamId} />
        </label>
        <label className="space-y-2">
          <span className="block text-xs font-bold uppercase text-slate-400">Cuarto</span>
          <TeamSelect value={fourthPlaceTeamId} teams={teams} onChange={setFourthPlaceTeamId} />
        </label>

        <button
          disabled={saving}
          className="rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-wait disabled:bg-slate-600 disabled:text-slate-300 sm:col-span-2 lg:col-span-4"
        >
          {saving ? 'Guardando finales...' : 'Guardar finales y recalcular bonus'}
        </button>
      </form>
    </section>
  );
}

function RulesForm({
  rules,
  onSaved,
  onMessage,
  onError
}: {
  rules: ScoringRules;
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [values, setValues] = useState<ScoringRules>(rules);

  useEffect(() => {
    setValues(rules);
  }, [rules]);

  async function save(event: FormEvent) {
    event.preventDefault();
    onMessage('');
    onError('');

    if (!window.confirm('Vas a guardar reglas de puntuación y recalcular puntos. ¿Continuar?')) return;

    try {
      await api('/admin/scoring-rules', { method: 'PUT', body: values as unknown as Record<string, unknown> });
      await onSaved();
      onMessage('Reglas guardadas y puntos recalculados.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudieron guardar las reglas.');
    }
  }

  function setNumber(key: keyof ScoringRules, value: string) {
    setValues((current) => ({ ...current, [key]: Number(value) }));
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <h2 className="text-2xl font-black text-emerald-300">Reglas de puntuación</h2>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(values) as Array<keyof ScoringRules>).map((key) => (
          <label key={key} className="space-y-2">
            <span className="block text-xs font-bold uppercase text-slate-400">{labelForRule(key)}</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 outline-none focus:border-emerald-300"
              type="number"
              min="0"
              value={values[key]}
              onChange={(event) => setNumber(key, event.target.value)}
            />
          </label>
        ))}
        <button className="rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300 sm:col-span-2 lg:col-span-4">
          Guardar reglas
        </button>
      </form>
    </section>
  );
}

function UsersAdmin({
  users,
  onSaved,
  onMessage,
  onError
}: {
  users: User[];
  onSaved: () => Promise<void>;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);

  function updatePassword(userId: number, value: string) {
    setPasswords((current) => ({ ...current, [userId]: value }));
  }

  async function resetPassword(user: User) {
    onMessage('');
    onError('');

    const newPassword = (passwords[user.id] || '').trim();

    if (newPassword.length < 8) {
      onError('La contraseña temporal debe tener al menos 8 caracteres.');
      return;
    }

    const confirmed = window.confirm(
      `Vas a resetear la contraseña de ${user.name}. El usuario deberá entrar con esta clave temporal y luego podrá cambiarla desde Mi cuenta. ¿Continuar?`
    );

    if (!confirmed) return;

    setResettingUserId(user.id);
    try {
      await api(`/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: { new_password: newPassword }
      });

      setPasswords((current) => ({ ...current, [user.id]: '' }));
      await onSaved();
      onMessage(`Contraseña reseteada para ${user.name}. Sus sesiones activas fueron cerradas.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo resetear la contraseña.');
    } finally {
      setResettingUserId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-emerald-300">Usuarios</h2>
        <p className="mt-1 text-sm text-slate-300">
          Desde acá podés resetear la contraseña de usuarios comunes. Las sesiones activas del usuario se cierran automáticamente.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/10 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Reset de clave</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3 font-bold">{user.name}</td>
                <td className="px-4 py-3 text-slate-300">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">
                  {user.role === 'ADMIN' ? (
                    <span className="text-xs text-slate-400">No disponible para administradores.</span>
                  ) : (
                    <div className="flex min-w-[260px] flex-col gap-2 sm:flex-row">
                      <input
                        type="password"
                        minLength={8}
                        value={passwords[user.id] || ''}
                        onChange={(event) => updatePassword(user.id, event.target.value)}
                        placeholder="Clave temporal"
                        autoComplete="new-password"
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        disabled={resettingUserId === user.id}
                        onClick={() => resetPassword(user)}
                        className="rounded-xl bg-amber-400 px-4 py-2 font-black text-slate-950 hover:bg-amber-300 disabled:cursor-wait disabled:bg-slate-600 disabled:text-slate-300"
                      >
                        {resettingUserId === user.id ? 'Reseteando...' : 'Resetear'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function AuditLogsAdmin({ logs }: { logs: AdminAuditLog[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-emerald-300">Auditoría admin</h2>
        <p className="mt-1 text-sm text-slate-300">
          Últimas acciones sensibles realizadas desde el panel administrador.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/10 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Entidad</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={4}>
                  Todavía no hay acciones registradas.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{log.admin_name || 'Admin eliminado'}</div>
                    <div className="text-xs text-slate-400">{log.admin_email || 'Sin email'}</div>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-300">{labelForAuditAction(log.action)}</td>
                  <td className="px-4 py-3 text-slate-300">
                    <div>{log.entity_type}</div>
                    {log.entity_id && <div className="text-xs text-slate-500">ID: {log.entity_id}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function labelForAuditAction(action: string) {
  const labels: Record<string, string> = {
    RESET_USER_PASSWORD: 'Reseteo de clave',
    UPDATE_FIXTURE: 'Fixture editado',
    SAVE_MATCH_RESULT: 'Resultado cargado',
    UPDATE_TOURNAMENT_RESULTS: 'Finales del torneo',
    LOCK_SPECIAL_PREDICTIONS: 'Especiales bloqueadas',
    UNLOCK_SPECIAL_PREDICTIONS: 'Especiales desbloqueadas',
    UPDATE_SCORING_RULES: 'Reglas actualizadas',
    RECALCULATE_POINTS: 'Puntos recalculados',
    LOCK_PREDICTIONS: 'Carga bloqueada',
    UNLOCK_PREDICTIONS: 'Carga desbloqueada'
  };

  return labels[action] || action;
}

function labelForRule(key: keyof ScoringRules) {
  const labels: Record<keyof ScoringRules, string> = {
    exact_score_points: 'Exacto',
    correct_winner_points: 'Ganador',
    correct_draw_points: 'Empate',
    goal_difference_points: 'Diferencia',
    champion_bonus_points: 'Campeón',
    runner_up_bonus_points: 'Subcampeón',
    third_place_bonus_points: 'Tercero',
    fourth_place_bonus_points: 'Cuarto'
  };
  return labels[key];
}

function statusText(status: Match['status']) {
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'LIVE') return 'En vivo';
  return 'Programado';
}
