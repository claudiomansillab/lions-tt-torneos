import { useState } from 'react';
import { repo } from '../lib/api';
import { MIN_PLAYERS, expectedRematches, groupLabel, planGroups } from '../lib/tournament';
import type { Tournament, TournamentData } from '../lib/types';
import { bestOf, parseNames } from './ui';

interface Props {
  data: TournamentData;
  canEdit: boolean;
  onChanged(): Promise<void>;
}

export default function PlayersPanel({ data, canEdit, onChanged }: Props) {
  const t = data.tournament;
  const setup = t.status === 'setup';
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const existing = new Set(data.players.map((p) => p.name.toLowerCase()));
  const toAdd = parseNames(text);
  const dup = toAdd.filter((n) => existing.has(n.toLowerCase()));

  const addPlayers = () =>
    run(async () => {
      await repo.addPlayers(t.id, toAdd);
      setText('');
    });

  const saveName = (id: string) =>
    run(async () => {
      const name = draft.trim();
      if (name) await repo.renamePlayer(id, name.slice(0, 80));
      setEditingId(null);
    });

  const updateConfig = (patch: Partial<Tournament>) => run(() => repo.updateTournament(t.id, patch));

  const n = data.players.length;
  const sizes = n >= MIN_PLAYERS ? planGroups(n, t.group_size) : [];
  const rematches = n >= MIN_PLAYERS ? expectedRematches(n, t.group_size) : 0;

  return (
    <div className="stack">
      {canEdit && (
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Configuración</h3>
          <div className="form-grid">
            <div className="field">
              <label>Jugadores por grupo</label>
              <select
                value={t.group_size}
                disabled={!setup || busy}
                onChange={(e) => updateConfig({ group_size: Number(e.target.value) })}
              >
                {[3, 4, 5, 6].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Clasificados a llaves</label>
              <input
                type="number"
                min={2}
                max={Math.max(2, n)}
                defaultValue={t.qualifiers}
                key={t.qualifiers}
                disabled={busy || t.status === 'knockout' || t.status === 'finished'}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 2 && v <= 64 && v !== t.qualifiers) updateConfig({ qualifiers: v });
                }}
              />
            </div>
            <div className="field">
              <label>Partidos de grupo</label>
              <select
                value={t.sets_to_win_group}
                disabled={!setup || busy}
                onChange={(e) => updateConfig({ sets_to_win_group: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((s) => (
                  <option key={s} value={s}>Al mejor de {bestOf(s)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Partidos de llaves</label>
              <select
                value={t.sets_to_win_ko}
                disabled={busy || t.status === 'knockout' || t.status === 'finished'}
                onChange={(e) => updateConfig({ sets_to_win_ko: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((s) => (
                  <option key={s} value={s}>Al mejor de {bestOf(s)}</option>
                ))}
              </select>
            </div>
          </div>
          {sizes.length > 0 && (
            <p className="muted small" style={{ marginBottom: 0 }}>
              {sizes.length} grupos: {sizes.map((s, i) => `${groupLabel(i)} (${s})`).join(' · ')}
              {rematches > 0 && ` · ⚠ ${rematches} cruce(s) repetido(s) en Ronda 2`}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h3>Jugadores ({n})</h3>
          {!setup && <span className="muted small">La lista queda fija una vez sorteados los grupos.</span>}
        </div>
        {n === 0 ? (
          <p className="muted">Sin jugadores todavía.</p>
        ) : (
          <div className="player-list">
            {data.players.map((p, i) => (
              <div className="player-item" key={p.id}>
                <span className="num">{i + 1}</span>
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={draft}
                    maxLength={80}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName(p.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => saveName(p.id)}
                  />
                ) : (
                  <span className="nm">{p.name}</span>
                )}
                {canEdit && editingId !== p.id && (
                  <>
                    <button
                      className="icon-btn"
                      title="Renombrar"
                      onClick={() => {
                        setEditingId(p.id);
                        setDraft(p.name);
                      }}
                    >
                      ✎
                    </button>
                    {setup && (
                      <button
                        className="icon-btn del"
                        title="Quitar"
                        disabled={busy}
                        onClick={() => window.confirm(`¿Quitar a ${p.name}?`) && run(() => repo.removePlayer(p.id))}
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && setup && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="add">Agregar jugadores (uno por línea)</label>
            <textarea id="add" style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {dup.length > 0 && <div className="banner warn">Ya inscritos: {dup.join(', ')}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={busy || toAdd.length === 0 || dup.length > 0} onClick={addPlayers}>
              Agregar {toAdd.length || ''}
            </button>
          </div>
        </div>
      )}
      {error && <div className="banner warn">{error}</div>}
    </div>
  );
}
