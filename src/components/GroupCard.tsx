import { groupStandings } from '../lib/tournament';
import type { Group, Match } from '../lib/types';

interface Props {
  group: Group;
  matches: Match[];
  names: Map<string, string>;
  /** Etiqueta de origen por jugador (ej. "1A") para la Ronda 2. */
  tags?: Map<string, string>;
  editable: boolean;
  onMatch(m: Match): void;
}

export default function GroupCard({ group, matches, names, tags, editable, onMatch }: Props) {
  const rows = groupStandings(group.player_ids, matches, group.id);
  const done = matches.filter((m) => m.winner_id).length;

  return (
    <div className="group-card">
      <header>
        <h3>
          Grupo {group.label}
          <small>{group.player_ids.length} jugadores</small>
        </h3>
        <span className={done === matches.length ? 'pill done' : 'pill'}>
          {done}/{matches.length}
        </span>
      </header>
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th className="name">Jugador</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Ganados">G</th>
            <th title="Perdidos">P</th>
            <th title="Sets a favor-en contra">Sets</th>
            <th title="Puntos de tabla">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.playerId}>
              <td>
                <span className={i === 0 && r.played > 0 ? 'pos p1' : 'pos'}>{i + 1}</span>
              </td>
              <td className="name">
                {names.get(r.playerId) ?? '—'}
                {tags?.get(r.playerId) && <span className="tag">{tags.get(r.playerId)}</span>}
                {r.drawn && (
                  <span className="tag draw" title="Empate total: posición definida por sorteo">
                    🎲 sorteo
                  </span>
                )}
              </td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.lost}</td>
              <td className="muted">
                {r.setsWon}-{r.setsLost}
              </td>
              <td className="pts">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="match-list">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} names={names} editable={editable} onClick={() => onMatch(m)} />
        ))}
      </div>
    </div>
  );
}

export function MatchRow({
  match: m,
  names,
  editable,
  onClick,
}: {
  match: Match;
  names: Map<string, string>;
  editable: boolean;
  onClick(): void;
}) {
  const w1 = m.winner_id && m.winner_id === m.player1_id;
  const w2 = m.winner_id && m.winner_id === m.player2_id;
  const detail = m.sets.length ? m.sets.map((s) => `${s[0]}-${s[1]}`).join(', ') : undefined;
  return (
    <button
      type="button"
      className={editable ? 'match-row clickable' : 'match-row'}
      onClick={editable ? onClick : undefined}
      disabled={!editable}
      title={detail}
      style={{ cursor: editable ? undefined : 'default' }}
    >
      <span className={w1 ? 'p w' : 'p'}>{names.get(m.player1_id ?? '') ?? '—'}</span>
      {m.winner_id ? (
        <span className={m.walkover ? 'score wo' : 'score'}>
          {m.walkover ? 'W.O.' : `${m.p1_sets ?? 0} - ${m.p2_sets ?? 0}`}
        </span>
      ) : (
        <span className="score pending">vs</span>
      )}
      <span className={w2 ? 'p right w' : 'p right'}>{names.get(m.player2_id ?? '') ?? '—'}</span>
    </button>
  );
}
