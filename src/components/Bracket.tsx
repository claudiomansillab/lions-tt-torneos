import { isBye, koRounds, roundName } from '../lib/tournament';
import type { Match } from '../lib/types';

interface Props {
  matches: Match[];
  names: Map<string, string>;
  seeds: Map<string, number>;
  editable: boolean;
  onMatch(m: Match): void;
}

export default function Bracket({ matches, names, seeds, editable, onMatch }: Props) {
  const total = koRounds(matches);
  const rounds = Array.from({ length: total }, (_, i) =>
    matches.filter((m) => m.ko_round === i + 1).sort((a, b) => a.slot! - b.slot!),
  );

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        {rounds.map((list, ri) => (
          <div className="b-round" key={ri}>
            <h4>{roundName(ri + 1, total)}</h4>
            <div className="b-matches">
              {list.map((m) => {
                const bye = isBye(m);
                const playable = editable && !bye && !!m.player1_id && !!m.player2_id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={`b-match${playable ? ' clickable' : ''}${ri + 1 === total ? ' final' : ''}`}
                    onClick={playable ? () => onMatch(m) : undefined}
                    disabled={!playable}
                    style={{ cursor: playable ? undefined : 'default' }}
                    title={m.sets.length ? m.sets.map((s) => `${s[0]}-${s[1]}`).join(', ') : undefined}
                  >
                    <Side m={m} side={1} bye={bye} names={names} seeds={seeds} />
                    <Side m={m} side={2} bye={bye} names={names} seeds={seeds} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Side({
  m,
  side,
  bye,
  names,
  seeds,
}: {
  m: Match;
  side: 1 | 2;
  bye: boolean;
  names: Map<string, string>;
  seeds: Map<string, number>;
}) {
  const id = side === 1 ? m.player1_id : m.player2_id;
  const sets = side === 1 ? m.p1_sets : m.p2_sets;
  const won = !!id && m.winner_id === id;
  const label = id ? names.get(id) ?? '—' : bye ? 'BYE' : 'Por definir';
  return (
    <div className={`b-side${won ? ' w' : ''}${id ? '' : ' tbd'}`}>
      <span className="seed">{id ? seeds.get(id) : ''}</span>
      <span className="nm">{label}</span>
      <span className="st">{m.winner_id && !bye ? (m.walkover ? (won ? 'WO' : '') : sets ?? '') : ''}</span>
    </div>
  );
}
