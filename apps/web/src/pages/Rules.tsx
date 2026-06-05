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
        badge: 'Acierto perfecto',
        prediction: 'Pronóstico: Argentina 2 - 0 Marruecos',
        result: 'Resultado real: Argentina 2 - 0 Marruecos',
        points: rules.exact_score_points,
        description: 'Acertaste ganador y marcador completo. Es el mejor acierto posible por partido.'
      },
      {
        title: 'Ganador correcto',
        badge: 'Buen pronóstico',
        prediction: 'Pronóstico: Argentina 1 - 0 Marruecos',
        result: 'Resultado real: Argentina 2 - 0 Marruecos',
        points: rules.correct_winner_points,
        description: 'No acertaste el marcador exacto, pero sí que ganaba Argentina.'
      },
      {
        title: 'Empate correcto',
        badge: 'Empate bien leído',
        prediction: 'Pronóstico: Portugal 1 - 1 Países Bajos',
        result: 'Resultado real: Portugal 0 - 0 Países Bajos',
        points: rules.correct_draw_points,
        description: 'No acertaste los goles exactos, pero sí que el partido terminaba empatado.'
      },
      {
        title: 'Diferencia de goles correcta',
        badge: 'Bonus',
        prediction: 'Pronóstico: Brasil 3 - 1 Japón',
        result: 'Resultado real: Brasil 2 - 0 Japón',
        points: rules.goal_difference_points,
        description: 'En ambos casos la diferencia fue de 2 goles. Puede sumar como bonus cuando corresponde.'
      }
    ];
  }, [rules]);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-6">
        <div className="inline-flex rounded-full bg-slate-950/50 px-3 py-1 text-sm font-bold text-emerald-200">
          Reglas del Prode
        </div>

        <h1 className="mt-4 text-3xl font-black sm:text-5xl">
          Cargá tus pronósticos antes de cada partido y sumá por tus aciertos.
        </h1>

        <p className="mt-4 max-w-3xl text-slate-300">
          El Prode Mundial 2026 es simple: pronosticás resultados, elegís posiciones finales del torneo y competís en el
          ranking general. Cuando empiezan los partidos, los pronósticos quedan bloqueados automáticamente.
        </p>
      </section>

      {error && <Message type="error">{error}</Message>}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RuleCard title="1. Registrate">
          Creá tu cuenta gratis con nombre, email y contraseña. Ese nombre se muestra en el ranking.
        </RuleCard>

        <RuleCard title="2. Pronosticá partidos">
          Cargá los goles de cada selección antes del horario de inicio del partido.
        </RuleCard>

        <RuleCard title="3. Elegí especiales">
          También podés elegir campeón, subcampeón, tercero y cuarto.
        </RuleCard>

        <RuleCard title="4. Mirá el ranking">
          Cuando se cargan resultados reales, el sistema calcula puntos y actualiza posiciones.
        </RuleCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <InfoCard title="Carga por partido">
          Podés crear o editar tu pronóstico mientras el partido esté programado y todavía no haya comenzado.
        </InfoCard>

        <InfoCard title="Bloqueo automático">
          El bloqueo no depende solo de la pantalla. También se valida en backend, así que un cambio tarde será rechazado.
        </InfoCard>

        <InfoCard title="Resultados reales">
          El administrador carga los marcadores finales. Después se recalculan los puntos y el ranking.
        </InfoCard>
      </section>

      {rules ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-emerald-300">Puntajes por partido</h2>
            <p className="mt-1 text-sm text-slate-300">
              Estos son los valores actuales. El administrador puede modificarlos si se decide cambiar las reglas.
            </p>
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
            <p className="mt-1 text-sm text-slate-300">
              Para entender los puntos sin hacer cuentas raras. Bastante fútbol hay ya.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {examples.map((example) => (
              <article key={example.title} className="rounded-3xl border border-white/10 bg-white/10 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
                      {example.badge}
                    </div>
                    <h3 className="mt-3 font-black text-white">{example.title}</h3>
                  </div>

                  <div className="w-fit rounded-2xl bg-emerald-400 px-3 py-1 font-black text-slate-950">
                    +{example.points} pts
                  </div>
                </div>

                <div className="mt-4 space-y-2 rounded-2xl bg-slate-950 p-4 text-sm text-slate-300">
                  <p>{example.prediction}</p>
                  <p>{example.result}</p>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-400">{example.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Hasta cuándo se puede cargar</h2>

          <div className="mt-4 space-y-3 text-slate-300">
            <p>
              Cada partido se puede pronosticar hasta antes de su horario de inicio. Una vez iniciado, queda bloqueado.
            </p>

            <p>
              Si un partido ya está en vivo o finalizado, no se puede modificar el pronóstico aunque la pantalla haya
              quedado abierta.
            </p>

            <p>
              Las predicciones especiales se pueden cargar mientras estén habilitadas. El administrador puede bloquearlas
              cuando corresponda.
            </p>
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black text-emerald-300">Criterios de desempate</h2>

          <ol className="mt-4 space-y-2 text-slate-300">
            <li>
              <strong className="text-white">1.</strong> Mayor puntaje total.
            </li>
            <li>
              <strong className="text-white">2.</strong> Mayor cantidad de resultados exactos.
            </li>
            <li>
              <strong className="text-white">3.</strong> Mayor cantidad de aciertos de ganador o empate.
            </li>
            <li>
              <strong className="text-white">4.</strong> Mayor cantidad de pronósticos cargados.
            </li>
            <li>
              <strong className="text-white">5.</strong> Fecha de registro más antigua.
            </li>
          </ol>
        </article>
      </section>

      {rules && (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-amber-200">Bonus especiales</h2>
              <p className="mt-2 max-w-3xl text-slate-300">
                Además de los partidos, cada usuario puede elegir campeón, subcampeón, tercero y cuarto. Cuando el
                administrador carga las posiciones finales del torneo, estos puntos se suman al ranking general.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard label="Campeón" value={rules.champion_bonus_points} tone="amber" />
            <ScoreCard label="Subcampeón" value={rules.runner_up_bonus_points} tone="amber" />
            <ScoreCard label="Tercero" value={rules.third_place_bonus_points} tone="amber" />
            <ScoreCard label="Cuarto" value={rules.fourth_place_bonus_points} tone="amber" />
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-xl font-black text-white">Aclaraciones importantes</h2>

        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <p>
            Los puntos se calculan automáticamente según las reglas configuradas. No se cargan a mano para cada usuario.
          </p>

          <p>
            Si el administrador corrige un resultado, puede recalcular el ranking para actualizar los puntos.
          </p>

          <p>
            Los horarios de los partidos se toman como referencia para bloquear la carga. Revisá tus pronósticos con
            tiempo.
          </p>

          <p>
            El ranking general combina puntos por partidos y puntos especiales del torneo.
          </p>
        </div>
      </section>
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

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-900 p-5">
      <h2 className="font-black text-white">{title}</h2>
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