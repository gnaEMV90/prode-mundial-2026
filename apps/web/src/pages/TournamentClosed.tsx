import { Link } from 'react-router-dom';
import { TOURNAMENT_CLOSED_MESSAGE } from '../lib/tournament';

export function TournamentClosed() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6 text-center sm:p-10">
        <div className="text-sm font-black uppercase tracking-[0.2em] text-amber-200">Prode finalizado</div>
        <h1 className="mt-4 text-3xl font-black text-white sm:text-5xl">La carga quedó cerrada</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          {TOURNAMENT_CLOSED_MESSAGE}
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6">
        <h2 className="text-xl font-black text-white">Todo queda disponible para consultar</h2>
        <p className="mt-2 text-slate-300">
          Podés revisar el ranking definitivo, el fixture completo y, si ya participaste, tus pronósticos históricos.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/ranking"
            className="rounded-2xl bg-emerald-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-emerald-300"
          >
            Ver ranking final
          </Link>
          <Link
            to="/fixture"
            className="rounded-2xl border border-white/10 px-5 py-3 text-center font-bold text-white hover:bg-white/10"
          >
            Ver fixture completo
          </Link>
          <Link
            to="/"
            className="rounded-2xl border border-white/10 px-5 py-3 text-center font-bold text-white hover:bg-white/10"
          >
            Volver al inicio
          </Link>
        </div>
      </section>
    </div>
  );
}
