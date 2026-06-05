import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api, ScoringRules } from '../lib/api';
import { Message } from '../components/Message';

export function Rules() {
  const [rules, setRules] = useState<ScoringRules | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ rules: ScoringRules }>('/rules')
      .then((response) => setRules(response.rules))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las reglas.'));
  }, []);

  const examples = useMemo(() => {
    if (!rules) return [];

    return [
      {
        title: 'Resultado exacto',
        prediction: 'Pronóstico: Argentina 2 - 0 Marruecos',
        result: 'Resultado real: Argentina 2 - 0 Marruecos',
        points: rules.exact_score_points,
        description: 'Acertaste ganador y marcador completo. Es el acierto perfecto.'
      },
      {
        title: 'Ganador correcto',
        prediction: 'Pronóstico: Argentina 1 - 0 Marruecos',
        result: 'Resultado real: Argentina 2 - 0 Marruecos',
        points: rules.correct_winner_points,
        description: 'No acertaste el marcador exacto, pero sí quién ganó.'
      },
      {
        title: 'Empate correcto',
        prediction: 'Pronóstico: Portugal 1 - 1 Países Bajos',
        result: 'Resultado real: Portugal 0 - 0 Países Bajos',
        points: rules.correct_draw_points,
        description: 'No pegaste los goles exactos, pero sí que terminaba empatado.'
      },
      {
        title: 'Diferencia correcta',
        prediction: 'Pronóstico: Brasil 3 - 1 Japón',
        result: 'Resultado real: Brasil 2 - 0 Japón',
        points: rules.goal_difference_points,
        description: 'La diferencia fue de 2 goles en ambos casos. Suma bonus si no fue exacto.'
      }
    ];
  }, [rules]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
        <div className="inline-flex rounded-full bg-slate-950/50 px-3 py-1 text-sm font-bold text-emerald-200">
          Reglas públicas del Prode
        </div>
        <h1 className="mt-4 text-3xl font-black sm:text-5xl">Jugá simple: cargá antes del partido y sumá por aciertos.</h1>
        <p className="mt-4 max-w-3xl text-slate-300">
          Cada participante pronostica el resultado de los partidos y también puede cargar campeón, subcampeón, tercero y cuarto.
          Cuando el partido o el torneo empiezan, la carga correspondiente queda bloqueada. Después el administrador carga los resultados reales y el ranking se recalcula automáticamente.
        </p>
      </section>

      {error && <Message type="error">{error}</Message>}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RuleCard title="1. Registrate">Creás tu cuenta gratis con nombre, email y contraseña.</RuleCard>
        <RuleCard title="2. Partidos">Cargás goles local y visitante en cada partido disponible.</RuleCard>
        <RuleCard title="3. Especiales">Elegís campeón, subcampeón, tercero y cuarto.</RuleCard>
        <RuleCard title="4. Ranking">Con resultados reales cargados, se calculan puntos y posiciones.</RuleCard>
      </section>

      {rules ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-emerald-300">Puntajes actuales</h2>
            <p className="mt-1 text-sm text-slate-300">Estos valores se pueden modificar desde el panel administrador.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard label="Resultado exacto" value={rules.exact_score_points} />
            <ScoreCard label="Ganador correcto" value={rules.correct_winner_points} />
            <ScoreCard label="Empate correcto" value={rules.correct_draw_points} />
            <ScoreCard label="Diferencia de goles" value={rules.goal_difference_points} />
          </div>
        </section>
      ) : (
        !error && <Message>Cargando reglas...</Message>
      )}

      {rules && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-emerald-300">Ejemplos rápidos</h2>
            <p className="mt-1 text-sm text-slate-300">Para que nadie tenga que sacar la calculadora con la camiseta puesta.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {examples.map((example) => (
              <article key={example.title} className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-black text-white">{example.title}</h3>
                  <div className="rounded-2xl bg-emerald-400 px-3 py-1 font-black text-slate-950">+{example.points}</div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <p>{example.prediction}</p>
                  <p>{example.result}</p>
                </div>
                <p className="mt-4 text-sm text-slate-400">{example.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Hasta cuándo se puede cargar</h2>
          <div className="mt-4 space-y-3 text-slate-300">
            <p>Podés crear o editar un pronóstico mientras el partido esté programado y todavía no haya llegado su horario de inicio.</p>
            <p>El bloqueo se valida en backend, no solo visualmente. Si alguien intenta mandar un cambio tarde, el sistema lo rechaza.</p>
            <p>Las predicciones especiales se pueden cargar hasta el inicio del torneo o hasta que el administrador las bloquee manualmente.</p>
            <p>El administrador también puede bloquear toda la carga temporalmente desde el panel admin.</p>
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Criterios de desempate</h2>
          <ol className="mt-4 space-y-2 text-slate-300">
            <li><strong className="text-white">1.</strong> Mayor puntaje total.</li>
            <li><strong className="text-white">2.</strong> Mayor cantidad de resultados exactos.</li>
            <li><strong className="text-white">3.</strong> Mayor cantidad de aciertos de ganador o empate.</li>
            <li><strong className="text-white">4.</strong> Mayor cantidad de pronósticos cargados.</li>
            <li><strong className="text-white">5.</strong> Fecha de registro más antigua.</li>
          </ol>
        </article>
      </section>

      {rules && (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="text-xl font-black text-amber-200">Bonus especiales</h2>
          <p className="mt-2 text-slate-300">
            Además de los partidos, cada usuario puede cargar campeón, subcampeón, tercero y cuarto.
            Cuando el administrador define las posiciones finales, estos puntos se suman al ranking general.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard label="Campeón" value={rules.champion_bonus_points} tone="amber" />
            <ScoreCard label="Subcampeón" value={rules.runner_up_bonus_points} tone="amber" />
            <ScoreCard label="Tercero" value={rules.third_place_bonus_points} tone="amber" />
            <ScoreCard label="Cuarto" value={rules.fourth_place_bonus_points} tone="amber" />
          </div>
        </section>
      )}
    </div>
  );
}

function RuleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
      <h2 className="font-black text-emerald-300">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">{children}</p>
    </article>
  );
}

function ScoreCard({ label, value, tone = 'emerald' }: { label: string; value: number; tone?: 'emerald' | 'amber' }) {
  const valueClass = tone === 'amber' ? 'text-amber-200' : 'text-emerald-300';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-center">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`mt-2 text-4xl font-black ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">puntos</div>
    </div>
  );
}
