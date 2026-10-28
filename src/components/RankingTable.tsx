import type { StatRow } from '../lib/tournament';

interface Props {
  rows: StatRow[];
  names: Map<string, string>;
  qualifiers: number;
}

export default function RankingTable({ rows, names, qualifiers }: Props) {
  return (
    <div className="rank-table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th className="name">Jugador</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Ganados">G</th>
            <th title="Perdidos">P</th>
            <th title="Sets a favor-en contra">Sets</th>
            <th title="Diferencia de sets">±S</th>
            <th title="Diferencia de tantos">±T</th>
            <th title="Puntos de tabla">Pts</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const q = i < qualifiers;
            const sd = r.setsWon - r.setsLost;
            const pd = r.ptsWon - r.ptsLost;
            return (
              <tr key={r.playerId} className={`${q ? 'q' : ''}${i === qualifiers ? ' cut' : ''}`}>
                <td>
                  <span className={i === 0 && r.played > 0 ? 'pos p1' : 'pos'}>{i + 1}</span>
                </td>
                <td className="name">
                  {names.get(r.playerId)}
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
                <td>{sd > 0 ? `+${sd}` : sd}</td>
                <td className="muted">{pd > 0 ? `+${pd}` : pd}</td>
                <td className="pts">{r.points}</td>
                <td>{q && <span className="q-badge">Clasifica</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
