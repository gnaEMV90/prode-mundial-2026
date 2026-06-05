import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ScoringRules, SpecialPrediction, Team } from '../lib/api';
import { Message } from '../components/Message';
import { TeamBadge } from './Fixture';

type SpecialForm = {
  champion_team_id: string;
  runner_up_team_id: string;
  third_place_team_id: string;
  fourth_place_team_id: string;
};

type SpecialResponse = {
  prediction: SpecialPrediction | null;
  locked: boolean;
};

const emptyForm: SpecialForm = {
  champion_team_id: '',
  runner_up_team_id: '',
  third_place_team_id: '',
  fourth_place_team_id: ''
};

export function SpecialPredictions() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [rules, setRules] = useState<ScoringRules | null>(null);
  const [prediction, setPrediction] = useState<SpecialPrediction | null>(null);
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState<SpecialForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [teamsResponse, predictionResponse, rulesResponse] = await Promise.all([
      api<{ teams: Team[] }>('/teams'),
      api<SpecialResponse>('/special-predictions/me'),
      api<{ rules: ScoringRules }>('/rules')
    ]);

    setTeams(teamsResponse.teams);
    setPrediction(predictionResponse.prediction);
    setLocked(predictionResponse.locked);
    setRules(rulesResponse.rules);

    if (predictionResponse.prediction) {
      setForm({
        champion_team_id: String(predictionResponse.prediction.champion_team_id),
        runner_up_team_id: String(predictionResponse.prediction.runner_up_team_id),
        third_place_team_id: String(predictionResponse.prediction.third_place_team_id),
        fourth_place_team_id: String(predictionResponse.prediction.fourth_place_team_id)
      });
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las predicciones especiales.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = useMemo(() => Object.values(form).filter(Boolean), [form]);
  const duplicateSelection = new Set(selectedIds).size !== selectedIds.length;
  const complete = selectedIds.length === 4 && !duplicateSelection;

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!complete) {
      setError('Elegí campeón, subcampeón, tercero y cuarto, sin repetir selecciones.');
      return;
    }

    setSaving(true);
    try {
      await api('/special-predictions/me', {
        method: 'PUT',
        body: {
          champion_team_id: Number(form.champion_team_id),
          runner_up_team_id: Number(form.runner_up_team_id),
          third_place_team_id: Number(form.third_place_team_id),
          fourth_place_team_id: Number(form.fourth_place_team_id)
        }
      });
      await load();
      setMessage('Predicciones especiales guardadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las predicciones especiales.');
    } finally {
      setSaving(false);
    }
  }

  function update(key: keyof SpecialForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (loading) return <Message>Cargando predicciones especiales...</Message>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black">Predicciones especiales</h1>
          <p className="mt-2 text-slate-300">
            Elegí campeón, subcampeón, tercero y cuarto. Estos bonus se suman al ranking general.
          </p>
        </div>
        <Link to="/mis-pronosticos" className="rounded-2xl border border-white/10 px-5 py-3 text-center font-black hover:bg-white/10">
          Ir a partidos
        </Link>
      </div>

      {message && <Message type="success">{message}</Message>}
      {error && <Message type="error">{error}</Message>}

      {locked && (
        <Message type="error">
          Las predicciones especiales están bloqueadas. Ya no se pueden editar.
        </Message>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BonusCard label="Campeón" points={rules?.champion_bonus_points ?? 0} />
        <BonusCard label="Subcampeón" points={rules?.runner_up_bonus_points ?? 0} />
        <BonusCard label="Tercero" points={rules?.third_place_bonus_points ?? 0} />
        <BonusCard label="Cuarto" points={rules?.fourth_place_bonus_points ?? 0} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <form onSubmit={save} className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Mi apuesta final</h2>
          <p className="mt-1 text-sm text-slate-300">
            Se bloquea automáticamente cuando empieza el Mundial o cuando el admin lo bloquee manualmente.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SpecialSelect label="Campeón" value={form.champion_team_id} teams={teams} disabled={locked} onChange={(value) => update('champion_team_id', value)} />
            <SpecialSelect label="Subcampeón" value={form.runner_up_team_id} teams={teams} disabled={locked} onChange={(value) => update('runner_up_team_id', value)} />
            <SpecialSelect label="Tercero" value={form.third_place_team_id} teams={teams} disabled={locked} onChange={(value) => update('third_place_team_id', value)} />
            <SpecialSelect label="Cuarto" value={form.fourth_place_team_id} teams={teams} disabled={locked} onChange={(value) => update('fourth_place_team_id', value)} />
          </div>

          {duplicateSelection && (
            <div className="mt-4 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              Hay selecciones repetidas. El podio necesita cuatro distintas; ni FIFA se anima a tanto.
            </div>
          )}

          <button
            disabled={locked || saving}
            className="mt-5 w-full rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {locked ? 'Bloqueado' : saving ? 'Guardando...' : 'Guardar especiales'}
          </button>
        </form>

        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Resumen cargado</h2>
          {prediction ? (
            <div className="mt-4 space-y-3">
              <SpecialSummary label="Campeón" name={prediction.champion_team_name} flagCode={prediction.champion_flag_code} />
              <SpecialSummary label="Subcampeón" name={prediction.runner_up_team_name} flagCode={prediction.runner_up_flag_code} />
              <SpecialSummary label="Tercero" name={prediction.third_place_team_name} flagCode={prediction.third_place_flag_code} />
              <SpecialSummary label="Cuarto" name={prediction.fourth_place_team_name} flagCode={prediction.fourth_place_flag_code} />
              <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-300">
                Puntos especiales actuales:{' '}
                <strong className="text-emerald-300">{prediction.points}</strong>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-900 p-4 text-sm text-slate-300">
              Todavía no cargaste predicciones especiales.
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function BonusCard({ label, points }: { label: string; points: number }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <div className="text-sm text-slate-400">Bonus {label.toLowerCase()}</div>
      <div className="mt-2 text-3xl font-black text-white">{points}</div>
      <div className="mt-1 text-sm text-slate-300">puntos</div>
    </article>
  );
}

function SpecialSelect({
  label,
  value,
  teams,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  teams: Team[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-xs font-bold uppercase text-slate-400">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 outline-none focus:border-emerald-300 disabled:text-slate-500"
      >
        <option value="">Elegir selección</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.group_name ? `Grupo ${team.group_name} · ` : ''}{team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SpecialSummary({ label, name, flagCode }: { label: string; name: string | null; flagCode: string | null }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <TeamBadge name={name || 'Sin definir'} flagCode={flagCode} />
    </div>
  );
}
