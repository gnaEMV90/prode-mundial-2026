import type { ReactNode } from 'react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Message } from '../components/Message';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    try {
      await login(email, password);
      navigate('/mis-pronosticos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  }

  return (
    <AuthCard title="Entrar" subtitle="Accedé para cargar tus pronósticos.">
      {error && <Message type="error">{error}</Message>}

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
        />

        <Input
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />

        <button className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300">
          Entrar
        </button>
      </form>

      <p className="text-sm text-slate-300">
        ¿No tenés cuenta?{' '}
        <Link className="text-emerald-300" to="/registro">
          Registrate
        </Link>
      </p>
    </AuthCard>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    try {
      await register(name, email, password);
      navigate('/mis-pronosticos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    }
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Nombre visible, email y contraseña. Nada raro.">
      {error && <Message type="error">{error}</Message>}

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Nombre visible"
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
        />

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
        />

        <Input
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />

        <button className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300">
          Registrarme
        </button>
      </form>

      <p className="text-sm text-slate-300">
        ¿Ya tenés cuenta?{' '}
        <Link className="text-emerald-300" to="/login">
          Entrar
        </Link>
      </p>
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6">
      <div>
        <h1 className="text-3xl font-black">{title}</h1>
        <p className="mt-2 text-slate-300">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}

function Input({
  label,
  type = 'text',
  name,
  autoComplete,
  value,
  onChange
}: {
  label: string;
  type?: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-slate-200">{label}</span>

      <input
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
        type={type}
        name={name}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}