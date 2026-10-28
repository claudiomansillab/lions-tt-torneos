import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { repo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MIN_PLAYERS, expectedRematches, groupLabel, nextPow2, planGroups } from '../lib/tournament';
import { bestOf, parseNames } from '../components/ui';
import { Loading } from './Home';

export default function NewTournament() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupSize, setGroupSize] = useState(3);
  const [qualifiers, setQualifiers] = useState(6);
  const [setsGroup, setSetsGroup] = useState(3);
  const [setsKo, setSetsKo] = useState(3);
  const [namesText, setNamesText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const n = names.length;
  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    names.forEach((x) => {
      const k = x.toLowerCase();
      if (seen.has(k)) dup.add(x);
      seen.add(k);
    });
    return [...dup];
  }, [names]);

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  const sizes = n >= MIN_PLAYERS ? planGroups(n, groupSize) : [];
  const rematches = n >= MIN_PLAYERS ? expectedRematches(n, groupSize) : 0;
  const k = Math.min(qualifiers, n);
  const bracket = nextPow2(Math.max(2, k));
  const valid = name.trim() && n >= MIN_PLAYERS && qualifiers >= 2 && qualifiers <= n && duplicates.length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const id = await repo.createTournament(
        {
          name: name.trim(),
          event_date: date || null,
          group_size: groupSize,
          qualifiers,
          sets_to_win_group: setsGroup,
          sets_to_win_ko: setsKo,
        },
        names,
      );
      navigate(`/t/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ marginBottom: 20 }}>Nuevo torneo</h1>

      <div className="card stack">
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="name">Nombre del torneo</label>
            <input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Open Lions Octubre" />
          </div>
          <div className="field">
            <label htmlFor="date">Fecha</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="gs">Jugadores por grupo</label>
            <select id="gs" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))}>
              {[3, 4, 5, 6].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="hint">Si no es divisible, algunos grupos tienen 1 más.</span>
          </div>
          <div className="field">
            <label htmlFor="q">Clasificados a llaves</label>
            <input id="q" type="number" min={2} max={64} value={qualifiers} onChange={(e) => setQualifiers(Number(e.target.value))} />
            <span className="hint">Los mejores del ranking general.</span>
          </div>
          <div className="field">
            <label htmlFor="sg">Partidos de grupo</label>
            <select id="sg" value={setsGroup} onChange={(e) => setSetsGroup(Number(e.target.value))}>
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>Al mejor de {bestOf(s)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sk">Partidos de llaves</label>
            <select id="sk" value={setsKo} onChange={(e) => setSetsKo(Number(e.target.value))}>
              {[1, 2, 3, 4].map((s) => (
                <option key={s} value={s}>Al mejor de {bestOf(s)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="players">Jugadores ({n})</label>
          <textarea
            id="players"
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            placeholder={'Un jugador por línea\nJuan Pérez\nMaría González\n…'}
          />
          <span className="hint">Puedes pegar una lista (se ignora la numeración). También podrás agregar jugadores después.</span>
        </div>

        {duplicates.length > 0 && <div className="banner warn">Nombres repetidos: {duplicates.join(', ')}</div>}

        {n >= MIN_PLAYERS ? (
          <div className="banner">
            <span>
              <b>{sizes.length} grupos</b> en Ronda 1:{' '}
              {sizes.map((s, i) => `${groupLabel(i)} (${s})`).join(' · ')}. Ronda 2 con grupos cruzados{' '}
              {sizes.slice(0, 3).map((_, i) => `${groupLabel(i)}+`).join(', ')}
              {sizes.length > 3 ? ', …' : ''}. Llaves de {bracket}
              {bracket > k ? ` con ${bracket - k} BYE para los mejores sembrados` : ''}.
            </span>
          </div>
        ) : (
          <div className="banner warn">Se necesitan al menos {MIN_PLAYERS} jugadores.</div>
        )}
        {rematches > 0 && (
          <div className="banner warn">
            Con esta configuración hay más jugadores por grupo que grupos, así que en Ronda 2 se repetirán {rematches}{' '}
            cruce(s) de la Ronda 1. Prueba con grupos más chicos si quieres evitarlo.
          </div>
        )}
        {qualifiers > n && n > 0 && <div className="banner warn">Hay más clasificados ({qualifiers}) que jugadores ({n}).</div>}
      </div>

      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!valid || busy}>
          {busy ? 'Creando…' : 'Crear torneo'}
        </button>
      </div>
    </form>
  );
}
