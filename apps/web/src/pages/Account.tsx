import { FormEvent, useEffect, useState } from 'react';
import { Message } from '../components/Message';
import { api, User } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Account() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
  }, [user]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError('');
    setProfileMessage('');
    setPasswordMessage('');

    if (!name.trim() || !email.trim()) {
      setError('Completá nombre y email.');
      return;
    }

    setSavingProfile(true);
    try {
      await api<{ user: User }>('/auth/profile', {
        method: 'PUT',
        body: { name: name.trim(), email: email.trim() }
      });
      await refresh();
      setProfileMessage('Perfil actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    setProfileMessage('');
    setPasswordMessage('');

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== repeatPassword) {
      setError('La repetición de la contraseña no coincide.');
      return;
    }

    setSavingPassword(true);
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: {
          current_password: currentPassword,
          new_password: newPassword
        }
      });
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setPasswordMessage('Contraseña actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Mi cuenta</h1>
        <p className="mt-2 text-slate-300">Actualizá tus datos de acceso y mantené tu usuario listo para jugar.</p>
      </div>

      {error && <Message type="error">{error}</Message>}
      {profileMessage && <Message type="success">{profileMessage}</Message>}
      {passwordMessage && <Message type="success">{passwordMessage}</Message>}

      {user?.role === 'ADMIN' && (
        <Message type="success">
          Estás usando una cuenta administradora. Antes de publicar la app, cambiá la contraseña inicial.
        </Message>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black">Datos del perfil</h2>
          <p className="mt-1 text-sm text-slate-300">Este nombre se muestra en el ranking público.</p>

          <form onSubmit={saveProfile} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-200">Nombre visible</span>
              <input
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
                placeholder="Tu nombre"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
                placeholder="tu@email.com"
              />
            </label>

            <button
              disabled={savingProfile}
              className="w-full rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {savingProfile ? 'Guardando...' : 'Guardar perfil'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/10 p-5">
          <h2 className="text-xl font-black">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-slate-300">
            Usá al menos 8 caracteres. Nada de “12345678”, tampoco hagamos beneficencia a los hackers.
          </p>

          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="hidden"
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Contraseña actual</span>
              <input
                type="password"
                name="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
                autoComplete="current-password"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Nueva contraseña</span>
              <input
                type="password"
                name="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
                autoComplete="new-password"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-200">Repetir nueva contraseña</span>
              <input
                type="password"
                name="repeat-password"
                value={repeatPassword}
                onChange={(event) => setRepeatPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300"
                autoComplete="new-password"
              />
            </label>

            <button
              disabled={savingPassword}
              className="w-full rounded-2xl bg-amber-400 px-5 py-3 font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {savingPassword ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}