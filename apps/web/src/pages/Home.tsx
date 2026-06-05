import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Home() {
  const { user } = useAuth();

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
      <section className="space-y-6">
        <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
          Prode gratuito para el Mundial 2026
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
          Jugá, pronosticá y peleá el ranking hasta la final.
        </h1>
        <p className="max-w-2xl text-lg text-slate-300">
          Cargá tus resultados antes de que empiece cada partido y sumá bonus con campeón, subcampeón, tercero y cuarto. Cuando el admin sube los marcadores reales, el ranking se actualiza solo.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          {user ? (
            <Link to="/panel" className="rounded-2xl bg-emerald-400 px-6 py-4 text-center font-black text-slate-950 hover:bg-emerald-300">
              Ir a mi panel
            </Link>
          ) : (
            <Link to="/registro" className="rounded-2xl bg-emerald-400 px-6 py-4 text-center font-black text-slate-950 hover:bg-emerald-300">
              Crear cuenta gratis
            </Link>
          )}
          <Link to="/ranking" className="rounded-2xl border border-white/10 px-6 py-4 text-center font-bold text-white hover:bg-white/10">
            Ver ranking
          </Link>
          <Link to="/reglas" className="rounded-2xl border border-emerald-400/30 px-6 py-4 text-center font-bold text-emerald-200 hover:bg-emerald-400/10">
            Ver reglas
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl">
        <div className="rounded-2xl bg-slate-900 p-5">
          <div className="mb-5 text-sm font-bold text-emerald-300">Cómo funciona</div>
          <ol className="space-y-4 text-slate-200">
            <li><strong>1.</strong> Te registrás con nombre, email y contraseña.</li>
            <li><strong>2.</strong> Cargás resultado por partido.</li>
            <li><strong>3.</strong> Elegís campeón, subcampeón, tercero y cuarto.</li>
            <li><strong>4.</strong> Los pronósticos se bloquean al iniciar el partido o el torneo.</li>
            <li><strong>5.</strong> Se cargan resultados reales y se calculan puntos.</li>
            <li><strong>6.</strong> El ranking manda. Sin VAR emocional.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}
