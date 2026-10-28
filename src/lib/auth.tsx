import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { LOCAL_USER_ID, supabase } from './api';

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  /** Sólo los organizadores (tabla organizers) pueden crear y modificar torneos. */
  isOrganizer: boolean;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const LOCAL_USER: AuthUser = { id: LOCAL_USER_ID, email: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(supabase ? null : LOCAL_USER);
  const [isOrganizer, setIsOrganizer] = useState(!supabase);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let active = true;

    const apply = async (u: { id: string; email?: string | null } | null | undefined) => {
      let organizer = false;
      if (u) {
        const { data, error } = await sb.rpc('is_organizer');
        organizer = !error && data === true;
      }
      if (!active) return;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      setIsOrganizer(organizer);
      setLoading(false);
    };

    sb.auth.getSession().then(({ data }) => apply(data.session?.user));
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      // Diferido: no llamar a Supabase dentro del callback de auth.
      setTimeout(() => apply(session?.user), 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user,
    isOrganizer,
    loading,
    async signIn(email, password) {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
