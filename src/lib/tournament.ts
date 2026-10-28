// Lógica pura del torneo (sin dependencias de UI ni de base de datos).
//
// Formato:
//  - Ronda 1: grupos por sorteo, todos contra todos.
//  - Ronda 2: grupos rotados. Con G grupos, el grupo i+ recibe al (p+1)° del grupo (i+p) mod G:
//      A+ : 1A, 2B, 3C      B+ : 1B, 2C, 3A      C+ : 1C, 2A, 3B
//    Así nadie repite rival de la Ronda 1 mientras G >= tamaño de grupo.
//  - Ranking general sumando Ronda 1 + Ronda 2; los K mejores pasan a llaves (eliminación directa,
//    sembrados 1 vs K, etc., con BYE para los mejores sembrados si K no es potencia de 2).
//  - Puntaje: victoria 1, derrota 0. Desempate: diferencia de sets, diferencia de tantos y,
//    si persiste el empate total, sorteo (determinista por torneo/grupo: todos ven el mismo resultado).

import type { Group, Match, SetScore, Stage, TournamentData } from './types';

export const uid = (): string => crypto.randomUUID();

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 0 -> A, 25 -> Z, 26 -> AA ... */
export function groupLabel(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const MIN_PLAYERS = 4;

/**
 * Grupos de `size` y, si sobran jugadores, algunos de `size - 1`:
 * con grupos de 3, 11 jugadores -> 3,3,3,2 y 10 jugadores -> 3,3,2,2.
 */
export function groupCount(n: number, size: number): number {
  return Math.max(2, Math.ceil(n / size));
}

/** Tamaños de grupo para n jugadores (los primeros grupos son los más grandes). */
export function planGroups(n: number, size: number): number[] {
  const g = groupCount(n, size);
  const base = Math.floor(n / g);
  const extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0));
}

export function drawGroups(playerIds: readonly string[], size: number, rng?: () => number): string[][] {
  const g = groupCount(playerIds.length, size);
  const groups: string[][] = Array.from({ length: g }, () => []);
  shuffle(playerIds, rng).forEach((id, k) => groups[k % g].push(id));
  return groups;
}

/** Fixture todos contra todos (método del círculo). */
export function roundRobin(ids: readonly string[]): [string, string][] {
  const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const pairs: [string, string][] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    list.splice(1, 0, list.pop()!);
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Estadísticas y tablas
// ---------------------------------------------------------------------------

export interface StatRow {
  playerId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  setsWon: number;
  setsLost: number;
  ptsWon: number;
  ptsLost: number;
  /** Su posición respecto de un vecino se definió por sorteo (empate total). */
  drawn?: boolean;
}

export const isDone = (m: Match): boolean => m.winner_id != null;

function emptyRow(playerId: string): StatRow {
  return { playerId, played: 0, won: 0, lost: 0, points: 0, setsWon: 0, setsLost: 0, ptsWon: 0, ptsLost: 0 };
}

/** Puntos de tabla: victoria 1, derrota 0 (también por W.O.). */
export function statsFor(playerIds: readonly string[], matches: readonly Match[]): Map<string, StatRow> {
  const rows = new Map(playerIds.map((id) => [id, emptyRow(id)]));
  for (const m of matches) {
    if (!isDone(m) || !m.player1_id || !m.player2_id) continue;
    const sides: [string, number, number, 0 | 1][] = [
      [m.player1_id, m.p1_sets ?? 0, m.p2_sets ?? 0, 0],
      [m.player2_id, m.p2_sets ?? 0, m.p1_sets ?? 0, 1],
    ];
    for (const [id, sw, sl, idx] of sides) {
      const r = rows.get(id);
      if (!r) continue;
      const won = m.winner_id === id;
      r.played++;
      if (won) {
        r.won++;
        r.points++;
      } else {
        r.lost++;
      }
      r.setsWon += sw;
      r.setsLost += sl;
      for (const s of m.sets) {
        r.ptsWon += s[idx];
        r.ptsLost += s[1 - idx];
      }
    }
  }
  return rows;
}

/** Diferencia de sets y luego diferencia de tantos (mayor primero). */
function cmpDiffs(a: StatRow, b: StatRow): number {
  return b.setsWon - b.setsLost - (a.setsWon - a.setsLost) || b.ptsWon - b.ptsLost - (a.ptsWon - a.ptsLost);
}

/** Hash FNV-1a: "sorteo" estable para que todos vean el mismo desempate. */
function drawKey(seed: string, playerId: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${playerId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Ordena con `cmp` y, en empate total, por sorteo. Si `markDraws`, marca las filas que quedaron
 * ordenadas por sorteo.
 */
function sortWithDraw(rows: StatRow[], cmp: (a: StatRow, b: StatRow) => number, seed: string, markDraws: boolean) {
  rows.sort((a, b) => cmp(a, b) || drawKey(seed, a.playerId) - drawKey(seed, b.playerId));
  if (!markDraws) return;
  for (let i = 0; i + 1 < rows.length; i++) {
    if (cmp(rows[i], rows[i + 1]) === 0) rows[i].drawn = rows[i + 1].drawn = true;
  }
}

/**
 * Tabla de un grupo. Empates en puntos: resultado entre los empatados (en un empate doble, quién le
 * ganó a quién), luego diferencia de sets y de tantos, y por último sorteo.
 */
export function groupStandings(playerIds: readonly string[], matches: readonly Match[], seed = ''): StatRow[] {
  const done = matches.filter(isDone);
  const complete = matches.length > 0 && done.length === matches.length;
  const all = statsFor(playerIds, done);
  const sorted = [...all.values()].sort((a, b) => b.points - a.points);
  const result: StatRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].points === sorted[i].points) j++;
    const cluster = sorted.slice(i, j);
    if (cluster.length > 1) {
      const ids = new Set(cluster.map((r) => r.playerId));
      const mini = statsFor(
        [...ids],
        done.filter((m) => ids.has(m.player1_id!) && ids.has(m.player2_id!)),
      );
      const cmp = (a: StatRow, b: StatRow) => {
        const ma = mini.get(a.playerId)!;
        const mb = mini.get(b.playerId)!;
        return mb.points - ma.points || cmpDiffs(ma, mb) || cmpDiffs(a, b);
      };
      sortWithDraw(cluster, cmp, seed, complete);
    }
    result.push(...cluster);
    i = j;
  }
  return result;
}

/** Ranking general (Ronda 1 + Ronda 2): puntos, diferencia de sets, diferencia de tantos, sorteo. */
export function overallRanking(playerIds: readonly string[], matches: readonly Match[], seed = ''): StatRow[] {
  const rows = [...statsFor(playerIds, matches).values()];
  const complete = matches.length > 0 && matches.every(isDone);
  sortWithDraw(rows, (a, b) => b.points - a.points || cmpDiffs(a, b), seed, complete);
  return rows;
}

// ---------------------------------------------------------------------------
// Ronda 2: rotación de posiciones
// ---------------------------------------------------------------------------

/**
 * @param ordered ordered[j][p] = jugador que terminó (p+1)° en el grupo j de la Ronda 1.
 * @returns grupos de Ronda 2 (cada uno ordenado por posición de origen) y cantidad de cruces repetidos.
 */
export function buildRound2(ordered: readonly (readonly string[])[]): { groups: string[][]; rematches: number } {
  const G = ordered.length;
  const origin = new Map<string, number>();
  const target: string[][] = Array.from({ length: G }, () => []);
  const maxSize = Math.max(0, ...ordered.map((g) => g.length));

  for (let p = 0; p < maxSize; p++) {
    for (let j = 0; j < G; j++) {
      const id = ordered[j][p];
      if (!id) continue;
      origin.set(id, j);
      if (p < G) {
        target[(((j - p) % G) + G) % G].push(id);
      } else {
        // Más posiciones que grupos: inevitable repetir algún cruce; elegimos el grupo con menos choques.
        let best = 0;
        let bestKey: [number, number] = [Infinity, Infinity];
        target.forEach((t, ti) => {
          const key: [number, number] = [t.filter((x) => origin.get(x) === j).length, t.length];
          if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
            best = ti;
            bestKey = key;
          }
        });
        target[best].push(id);
      }
    }
  }

  let rematches = 0;
  for (const t of target) {
    for (let a = 0; a < t.length; a++)
      for (let b = a + 1; b < t.length; b++) if (origin.get(t[a]) === origin.get(t[b])) rematches++;
  }
  return { groups: target, rematches };
}

/** Cruces repetidos esperados en Ronda 2 para una configuración (para avisar al crear el torneo). */
export function expectedRematches(n: number, size: number): number {
  let k = 0;
  const groups = planGroups(n, size).map((s) => Array.from({ length: s }, () => `p${k++}`));
  return buildRound2(groups).rematches;
}

// ---------------------------------------------------------------------------
// Llaves
// ---------------------------------------------------------------------------

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Orden de siembra estándar: 8 -> [1,8,4,5,2,7,3,6] (1 y 2 sólo se cruzan en la final). */
export function seedOrder(size: number): number[] {
  let s = [1];
  while (s.length < size) {
    const n = s.length * 2;
    s = s.flatMap((x) => [x, n + 1 - x]);
  }
  return s;
}

export interface BracketSlot {
  ko_round: number;
  slot: number;
  player1_id: string | null;
  player2_id: string | null;
}

export function buildBracket(seeded: readonly string[]): BracketSlot[] {
  const size = nextPow2(Math.max(2, seeded.length));
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const out: BracketSlot[] = [];
  for (let i = 0; i < size / 2; i++) {
    out.push({
      ko_round: 1,
      slot: i,
      player1_id: seeded[order[2 * i] - 1] ?? null,
      player2_id: seeded[order[2 * i + 1] - 1] ?? null,
    });
  }
  for (let r = 2; r <= rounds; r++) {
    for (let i = 0; i < size / 2 ** r; i++) out.push({ ko_round: r, slot: i, player1_id: null, player2_id: null });
  }
  return out;
}

export function nextSlot(m: Pick<Match, 'ko_round' | 'slot'>): {
  ko_round: number;
  slot: number;
  side: 'player1_id' | 'player2_id';
} {
  return { ko_round: m.ko_round! + 1, slot: Math.floor(m.slot! / 2), side: m.slot! % 2 === 0 ? 'player1_id' : 'player2_id' };
}

export function roundName(round: number, totalRounds: number): string {
  const remaining = totalRounds - round;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Cuartos de final';
  if (remaining === 3) return 'Octavos de final';
  return `Ronda de ${2 ** (remaining + 1)}`;
}

export const isBye = (m: Match): boolean => m.stage === 'ko' && m.ko_round === 1 && (!m.player1_id || !m.player2_id);

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/** Valida marcadores de sets (a 11, diferencia de 2) y devuelve sets ganados por lado. */
export function evaluateSets(
  sets: readonly SetScore[],
  setsToWin: number,
): { p1: number; p2: number; error?: string } {
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < sets.length; i++) {
    const [a, b] = sets[i];
    const n = i + 1;
    if (p1 === setsToWin || p2 === setsToWin) return { p1, p2, error: `Sobra el set ${n}: el partido ya terminó.` };
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return { p1, p2, error: `Set ${n}: marcador inválido.` };
    const w = Math.max(a, b);
    const l = Math.min(a, b);
    if (w < 11) return { p1, p2, error: `Set ${n}: el ganador necesita al menos 11 puntos.` };
    if (w - l < 2) return { p1, p2, error: `Set ${n}: debe ganarse por 2 puntos de diferencia.` };
    if (w > 11 && w - l !== 2) return { p1, p2, error: `Set ${n}: sobre 10-10 se gana por exactamente 2.` };
    if (a > b) p1++;
    else p2++;
  }
  if (p1 < setsToWin && p2 < setsToWin) return { p1, p2, error: `Faltan sets: se juega al mejor de ${setsToWin * 2 - 1}.` };
  return { p1, p2 };
}

// ---------------------------------------------------------------------------
// Generación de filas para cada fase
// ---------------------------------------------------------------------------

function blankMatch(tournamentId: string, stage: Stage): Match {
  return {
    id: uid(),
    tournament_id: tournamentId,
    stage,
    group_id: null,
    ko_round: null,
    slot: null,
    order_no: 0,
    player1_id: null,
    player2_id: null,
    sets: [],
    p1_sets: null,
    p2_sets: null,
    winner_id: null,
    walkover: false,
  };
}

function groupRows(tournamentId: string, round: 1 | 2, lists: string[][], suffix: string) {
  const groups: Group[] = [];
  const matches: Match[] = [];
  let order = 0;
  lists.forEach((ids, i) => {
    const g: Group = { id: uid(), tournament_id: tournamentId, round, label: groupLabel(i) + suffix, position: i, player_ids: ids };
    groups.push(g);
    for (const [a, b] of roundRobin(ids)) {
      matches.push({ ...blankMatch(tournamentId, round === 1 ? 'r1' : 'r2'), group_id: g.id, order_no: order++, player1_id: a, player2_id: b });
    }
  });
  return { groups, matches };
}

export function generateRound1(data: TournamentData, rng?: () => number) {
  const t = data.tournament;
  return groupRows(t.id, 1, drawGroups(data.players.map((p) => p.id), t.group_size, rng), '');
}

export function groupsOf(data: TournamentData, round: 1 | 2): Group[] {
  return data.groups.filter((g) => g.round === round).sort((a, b) => a.position - b.position);
}

export function stageMatches(data: TournamentData, stage: Stage): Match[] {
  return data.matches.filter((m) => m.stage === stage).sort((a, b) => a.order_no - b.order_no);
}

export function stageComplete(data: TournamentData, stage: Stage): boolean {
  const ms = stageMatches(data, stage);
  return ms.length > 0 && ms.every(isDone);
}

export function generateRound2(data: TournamentData) {
  const ordered = groupsOf(data, 1).map((g) =>
    groupStandings(g.player_ids, data.matches.filter((m) => m.group_id === g.id), g.id).map((r) => r.playerId),
  );
  const { groups, rematches } = buildRound2(ordered);
  return { ...groupRows(data.tournament.id, 2, groups, '+'), rematches };
}

export function rankingAfterGroups(data: TournamentData): StatRow[] {
  return overallRanking(
    data.players.map((p) => p.id),
    data.matches.filter((m) => m.stage === 'r1' || m.stage === 'r2'),
    data.tournament.id,
  );
}

export function generateKnockout(data: TournamentData): Match[] {
  const t = data.tournament;
  const seeded = rankingAfterGroups(data)
    .slice(0, Math.min(t.qualifiers, data.players.length))
    .map((r) => r.playerId);
  const matches = buildBracket(seeded).map((s) => ({
    ...blankMatch(t.id, 'ko'),
    ...s,
    order_no: s.ko_round * 1000 + s.slot,
  }));
  // Resolver BYEs: el sembrado sin rival pasa directo a la ronda siguiente.
  for (const m of matches) {
    if (m.ko_round !== 1 || (m.player1_id && m.player2_id)) continue;
    const winner = m.player1_id ?? m.player2_id;
    if (!winner) continue;
    m.winner_id = winner;
    const n = nextSlot(m);
    const next = matches.find((x) => x.ko_round === n.ko_round && x.slot === n.slot);
    if (next) next[n.side] = winner;
  }
  return matches;
}

export function koRounds(matches: readonly Match[]): number {
  return Math.max(0, ...matches.filter((m) => m.stage === 'ko').map((m) => m.ko_round!));
}

export function champion(data: TournamentData): string | null {
  const total = koRounds(data.matches);
  const final = data.matches.find((m) => m.stage === 'ko' && m.ko_round === total);
  return final?.winner_id ?? null;
}
