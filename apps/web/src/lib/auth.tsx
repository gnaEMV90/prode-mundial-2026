import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, User } from './api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const response = await api<{ user: User | null }>('/auth/me');
    setUser(response.user);
  }

  async function login(email: string, password: string) {
    const response = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    setUser(response.user);
  }

  async function register(name: string, email: string, password: string) {
    const response = await api<{ user: User }>('/auth/register', {
      method: 'POST',
      body: { name, email, password }
    });
    setUser(response.user);
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }

  useEffect(() => {
    refresh().catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
