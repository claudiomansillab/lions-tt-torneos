import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { repo } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (repo.mode === 'local' || user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'in') {
        await signIn(email, password);
        navigate('/');
      } else {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) setInfo('Te enviamos un correo para confirmar la cuenta. Luego vuelve e ingresa.');
        else navigate('/');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>{mode === 'in' ? 'Ingresar' : 'Crear cuenta'}</h2>
      <p className="muted small" style={{ marginTop: 6 }}>
        Sólo los organizadores necesitan cuenta. Los jugadores ven el torneo con el link.
      </p>
      <form className="stack" onSubmit={submit} style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Contraseña</label>
          <input
            id="pw"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="error">{error}</div>}
        {info && <div className="banner">{info}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Procesando…' : mode === 'in' ? 'Ingresar' : 'Registrarme'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Ingresa'}
        </button>
      </form>
    </div>
  );
}
