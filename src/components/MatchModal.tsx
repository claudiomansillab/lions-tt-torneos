import { useEffect, useState } from 'react';
import { evaluateSets } from '../lib/tournament';
import type { Match, MatchResult, SetScore } from '../lib/types';
import { bestOf } from './ui';

interface Props {
  match: Match;
  names: Map<string, string>;
  setsToWin: number;
  title: string;
  busy: boolean;
  error: string | null;
  onSave(result: MatchResult): void;
  onClear(): void;
  onClose(): void;
}

type Cell = [string, string];

export default function MatchModal({ match, names, setsToWin, title, busy, error, onSave, onClear, onClose }: Props) {
  const maxSets = bestOf(setsToWin);
  const [mode, setMode] = useState<'detail' | 'quick'>(match.winner_id && match.sets.length === 0 ? 'quick' : 'detail');
  const [cells, setCells] = useState<Cell[]>(() =>
    Array.from({ length: maxSets }, (_, i) => {
      const s = match.sets[i];
      return s ? [String(s[0]), String(s[1])] : ['', ''];
    }),
  );
  const [quick, setQuick] = useState<[number, number] | null>(
    match.winner_id && !match.walkover ? [match.p1_sets ?? 0, match.p2_sets ?? 0] : null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p1 = names.get(match.player1_id ?? '') ?? '—';
  const p2 = names.get(match.player2_id ?? '') ?? '—';

  const filled: SetScore[] = cells
    .filter(([a, b]) => a !== '' || b !== '')
    .map(([a, b]) => [Number(a || 0), Number(b || 0)]);
  const evaluation = evaluateSets(filled, setsToWin);

  const setCell = (i: number, side: 0 | 1, v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setCells((prev) => prev.map((c, j) => (j === i ? ((side === 0 ? [clean, c[1]] : [c[0], clean]) as Cell) : c)));
  };

  function save() {
    if (mode === 'detail') {
      if (evaluation.error) return;
      onSave({
        sets: filled,
        p1_sets: evaluation.p1,
        p2_sets: evaluation.p2,
        winner_id: evaluation.p1 > evaluation.p2 ? match.player1_id : match.player2_id,
        walkover: false,
      });
    } else if (quick) {
      onSave({
        sets: [],
        p1_sets: quick[0],
        p2_sets: quick[1],
        winner_id: quick[0] > quick[1] ? match.player1_id : match.player2_id,
        walkover: false,
      });
    }
  }

  function walkover(winner: 1 | 2) {
    onSave({
      sets: [],
      p1_sets: winner === 1 ? setsToWin : 0,
      p2_sets: winner === 2 ? setsToWin : 0,
      winner_id: winner === 1 ? match.player1_id : match.player2_id,
      walkover: true,
    });
  }

  const losing = Array.from({ length: setsToWin }, (_, k) => k);
  const canSave = mode === 'detail' ? !evaluation.error : quick !== null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Resultado del partido">
        <header>
          <span className="muted small">
            {title} · al mejor de {maxSets}
          </span>
          <div className="versus">
            <span className="nm">{p1}</span>
            <span className="vs">VS</span>
            <span className="nm right">{p2}</span>
          </div>
        </header>
        <div className="body">
          <div className="seg">
            <button type="button" className={mode === 'detail' ? 'on' : ''} onClick={() => setMode('detail')}>
              Por sets
            </button>
            <button type="button" className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')}>
              Sólo resultado
            </button>
          </div>

          {mode === 'detail' ? (
            <>
              <div className="set-rows">
                {cells.map((c, i) => (
                  <div className="set-row" key={i}>
                    <span>Set {i + 1}</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Set ${i + 1} ${p1}`}
                      value={c[0]}
                      onChange={(e) => setCell(i, 0, e.target.value)}
                      autoFocus={i === 0}
                    />
                    <span className="dash">–</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Set ${i + 1} ${p2}`}
                      value={c[1]}
                      onChange={(e) => setCell(i, 1, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="live-score">
                {evaluation.p1} – {evaluation.p2}
              </div>
              {filled.length > 0 && evaluation.error && <div className="error" style={{ textAlign: 'center' }}>{evaluation.error}</div>}
            </>
          ) : (
            <div className="quick">
              <div className="col">
                <span>Gana {p1}</span>
                {losing.map((k) => {
                  const on = quick?.[0] === setsToWin && quick?.[1] === k;
                  return (
                    <button type="button" key={k} className={on ? 'btn on' : 'btn'} onClick={() => setQuick([setsToWin, k])}>
                      {setsToWin} - {k}
                    </button>
                  );
                })}
              </div>
              <div className="col">
                <span>Gana {p2}</span>
                {losing.map((k) => {
                  const on = quick?.[1] === setsToWin && quick?.[0] === k;
                  return (
                    <button type="button" key={k} className={on ? 'btn on' : 'btn'} onClick={() => setQuick([k, setsToWin])}>
                      {k} - {setsToWin}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <span className="muted small">Walkover:</span>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => walkover(1)}>
              W.O. gana {p1}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => walkover(2)}>
              W.O. gana {p2}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
        <footer>
          {match.winner_id && (
            <button type="button" className="btn btn-danger left" disabled={busy} onClick={onClear}>
              Borrar resultado
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave || busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
