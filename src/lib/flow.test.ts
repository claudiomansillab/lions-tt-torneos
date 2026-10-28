import { describe, expect, it } from 'vitest';
import {
  champion, generateKnockout, generateRound1, generateRound2, groupsOf, isBye, nextSlot, stageComplete,
} from './tournament';
import type { Match, TournamentData } from './types';

// Simula un torneo completo: el jugador con menor índice siempre gana 3-1.
function play(ms: Match[], rank: Map<string, number>) {
  for (const m of ms) {
    if (m.winner_id || !m.player1_id || !m.player2_id) continue;
    const p1wins = rank.get(m.player1_id)! < rank.get(m.player2_id)!;
    Object.assign(m, { p1_sets: p1wins ? 3 : 1, p2_sets: p1wins ? 1 : 3, winner_id: p1wins ? m.player1_id : m.player2_id });
  }
}

function simulate(n: number, qualifiers: number) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, tournament_id: 't', name: `J${i}` }));
  const rank = new Map(players.map((p, i) => [p.id, i]));
  const data: TournamentData = {
    tournament: { id: 't', owner_id: 'o', name: 'T', event_date: null, group_size: 3, qualifiers,
      sets_to_win_group: 3, sets_to_win_ko: 3, status: 'setup', created_at: '' },
    players, groups: [], matches: [],
  };
  const r1 = generateRound1(data);
  data.groups.push(...r1.groups); data.matches.push(...r1.matches);
  play(data.matches, rank);
  expect(stageComplete(data, 'r1')).toBe(true);

  const r2 = generateRound2(data);
  data.groups.push(...r2.groups); data.matches.push(...r2.matches);
  // nadie juega en ronda 2 con alguien de su mismo grupo de ronda 1 (cuando hay suficientes grupos)
  const origin = new Map<string, string>();
  groupsOf(data, 1).forEach((g) => g.player_ids.forEach((p) => origin.set(p, g.id)));
  const r2Rematches = r2.matches.filter((m) => origin.get(m.player1_id!) === origin.get(m.player2_id!)).length;
  play(data.matches, rank);

  const ko = generateKnockout(data);
  data.matches.push(...ko);
  // jugar llaves ronda a ronda propagando ganadores
  for (let r = 1; ; r++) {
    const round = ko.filter((m) => m.ko_round === r);
    if (!round.length) break;
    play(round, rank);
    for (const m of round) {
      const s = nextSlot(m);
      const next = ko.find((x) => x.ko_round === s.ko_round && x.slot === s.slot);
      if (next) next[s.side] = m.winner_id;
    }
  }
  return { data, ko, r2Rematches };
}

describe('torneo completo', () => {
  it.each([
    [9, 6, 0],
    [13, 6, 0],
    [22, 8, 0],
  ])('%i jugadores, top %i', (n, q, expectedRematches) => {
    const { data, ko, r2Rematches } = simulate(n, q);
    expect(r2Rematches).toBe(expectedRematches);
    expect(ko.filter((m) => !isBye(m)).length).toBe(q - 1);
    // el mejor jugador gana todo
    expect(champion(data)).toBe('p0');
  });
});
