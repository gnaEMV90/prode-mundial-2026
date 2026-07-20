import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DonationCard } from '../components/DonationCard';
import { api, RankingRow } from '../lib/api';
import { useAuth } from '../lib/auth';

const PUBLIC_URL = 'https://prodemundial2026-aci.pages.dev';

const SHARE_TEXT = `Terminó el Prode Mundial 2026

Ya está disponible el ranking definitivo. Gracias a todos los que participaron y felicitaciones al ganador.

Mirá el resultado final acá:`;

export function Home() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [ranking, setRanking] = useState<RankingRow[]>([]);

  useEffect(() => {
    api<{ ranking: RankingRow[] }>('/ranking')
      .then((response) => setRanking(response.ranking))
      .catch(() => setRanking([]));
  }, []);

  async function copyLink() {
    setCopied(false);

    try {
      await navigator.clipboard.writeText(PUBLIC_URL);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setCopied(false);
      window.prompt('Copiá este link para compartir el ranking final:', PUBLIC_URL);
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT}\n${PUBLIC_URL}`)}`;
  const winner = ranking[0] || null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
      <section className="space-y-6">
        <div className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100">
          Prode finalizado · modo consulta
        </div>

        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Gracias por jugar el Prode Mundial 2026.</h1>

        <p className="max-w-2xl text-lg leading-8 text-slate-300">
          El torneo terminó y la competencia también. Gracias a cada participante por sumarse, pronosticar y sostener el ranking partido a partido.
          La carga quedó cerrada y todo el historial permanece disponible para consultar.
        </p>

        {winner && (
          <section className="rounded-3xl border border-emerald-300/40 bg-emerald-400/10 p-6 shadow-2xl shadow-emerald-950/30">
            <div className="text-sm font-black uppercase tracking-[0.2em] text-emerald-200">Ganador del Prode</div>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-4xl font-black text-white">{winner.name}</div>
                <div className="mt-2 text-slate-300">
                  {winner.exact_hits} resultados exactos · {winner.outcome_hits} aciertos · {winner.predicted_count} pronósticos
                </div>
              </div>
              <div className="text-5xl font-black text-emerald-300">{winner.points} pts</div>
            </div>
            <p className="mt-4 border-t border-emerald-300/20 pt-4 font-bold text-emerald-100">
              Felicitaciones por quedarse con el primer puesto del ranking definitivo.
            </p>
          </section>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/ranking"
            className="rounded-2xl bg-emerald-400 px-6 py-4 text-center font-black text-slate-950 hover:bg-emerald-300"
          >
            Ver ranking final
          </Link>

          <Link
            to="/fixture"
            className="rounded-2xl border border-white/10 px-6 py-4 text-center font-bold text-white hover:bg-white/10"
          >
            Ver fixture completo
          </Link>

          {user && (
            <Link
              to="/panel"
              className="rounded-2xl border border-emerald-400/30 px-6 py-4 text-center font-bold text-emerald-200 hover:bg-emerald-400/10"
            >
              Ver mi participación
            </Link>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Compartí el ranking final</h2>
              <p className="mt-1 text-sm text-slate-300">
                Mandá el resultado definitivo al grupo. Ahora sí: sin partidos pendientes y sin VAR emocional.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={copyLink}
                className="rounded-2xl border border-white/10 px-5 py-3 text-center font-bold text-white hover:bg-white/10"
              >
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-green-500 px-5 py-3 text-center font-black text-slate-950 hover:bg-green-400"
              >
                Compartir por WhatsApp
              </a>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            {PUBLIC_URL}
          </div>
        </div>

        <DonationCard />
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl">
        <div className="rounded-2xl bg-slate-900 p-5">
          <div className="mb-5 text-sm font-bold text-emerald-300">Cierre del Prode</div>

          <div className="space-y-4 text-slate-200">
            <p>
              <strong>{ranking.length || 'Todos los'}</strong> participantes formaron parte del ranking general.
            </p>
            <p>Los pronósticos, resultados, fixture, reglas y datos administrativos quedaron bloqueados.</p>
            <p>El ranking definitivo, el fixture y los historiales personales continúan disponibles en modo lectura.</p>
            <p className="font-bold text-emerald-200">Gracias por jugar y por compartir el proyecto.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
