import { describe, expect, it } from 'vitest';
import {
  buildBracket,
  buildRound2,
  evaluateSets,
  expectedRematches,
  generateKnockout,
  groupLabel,
  groupStandings,
  planGroups,
  roundRobin,
  seedOrder,
} from './tournament';
import type { Match, TournamentData } from './types';

const m = (p1: string, p2: string, s1: number, s2: number, extra: Partial<Match> = {}): Match => ({
  id: `${p1}-${p2}`,
  tournament_id: 't',
  stage: 'r1',
  group_id: 'g',
  ko_round: null,
  slot: null,
  order_no: 0,
  player1_id: p1,
  player2_id: p2,
  sets: [],
  p1_sets: s1,
  p2_sets: s2,
  winner_id: s1 > s2 ? p1 : p2,
  walkover: false,
  ...extra,
});

describe('ronda 2', () => {
  it('reproduce el esquema base A+ / B+ / C+', () => {
    const r1 = [
      ['1A', '2A', '3A'],
      ['1B', '2B', '3B'],
      ['1C', '2C', '3C'],
    ];
    const { groups, rematches } = buildRound2(r1);
    expect(groups).toEqual([
      ['1A', '2B', '3C'],
      ['1B', '2C', '3A'],
      ['1C', '2A', '3B'],
    ]);
    expect(rematches).toBe(0);
  });

  it('generaliza a 4 grupos sin cruces repetidos', () => {
    const r1 = ['A', 'B', 'C', 'D'].map((g) => [1, 2, 3].map((p) => `${p}${g}`));
    const { groups, rematches } = buildRound2(r1);
    expect(groups[3]).toEqual(['1D', '2A', '3B']);
    expect(rematches).toBe(0);
  });

  it('balancea grupos desiguales', () => {
    for (let n = 4; n <= 40; n++) {
      let k = 0;
      const r1 = planGroups(n, 3).map((s) => Array.from({ length: s }, () => `p${k++}`));
      const sizes = buildRound2(r1).groups.map((g) => g.length);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it('sin repetidos cuando hay al menos tantos grupos como jugadores por grupo', () => {
    expect(expectedRematches(9, 3)).toBe(0);
    expect(expectedRematches(14, 3)).toBe(0);
    expect(expectedRematches(16, 4)).toBe(0);
    expect(expectedRematches(10, 3)).toBeGreaterThan(0); // 3 grupos, uno de 4
  });
});

describe('grupos', () => {
  it('etiquetas', () => {
    expect([0, 1, 25, 26].map(groupLabel)).toEqual(['A', 'B', 'Z', 'AA']);
  });

  it('todos contra todos', () => {
    expect(roundRobin(['a', 'b', 'c'])).toHaveLength(3);
    expect(roundRobin(['a', 'b', 'c', 'd', 'e'])).toHaveLength(10);
  });

  it('desempate por resultado entre empatados', () => {
    // triple empate a 3 puntos: a>b, b>c, c>a; desempata ratio de sets en la mini-tabla
    // a 5-3 (.625), c 4-5 (.444), b 3-4 (.429)
    const ms = [m('a', 'b', 3, 0), m('b', 'c', 3, 1), m('c', 'a', 3, 2)];
    expect(groupStandings(['a', 'b', 'c'], ms).map((r) => r.playerId)).toEqual(['a', 'c', 'b']);
  });
});

describe('llaves', () => {
  it('siembra estándar', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('6 clasificados: 1 y 2 con BYE', () => {
    const r1 = buildBracket(['s1', 's2', 's3', 's4', 's5', 's6']).filter((s) => s.ko_round === 1);
    expect(r1.map((s) => [s.player1_id, s.player2_id])).toEqual([
      ['s1', null],
      ['s4', 's5'],
      ['s2', null],
      ['s3', 's6'],
    ]);
  });

  it('los BYE avanzan solos a semifinal', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id, tournament_id: 't', name: id }));
    const data: TournamentData = {
      tournament: {
        id: 't', owner_id: 'o', name: 'T', event_date: null, group_size: 3, qualifiers: 6,
        sets_to_win_group: 3, sets_to_win_ko: 3, status: 'round2', created_at: '',
      },
      players,
      groups: [],
      matches: [m('p1', 'p2', 3, 0), m('p3', 'p4', 3, 0), m('p5', 'p6', 3, 0), m('p1', 'p3', 3, 0)],
    };
    const ko = generateKnockout(data);
    const semis = ko.filter((x) => x.ko_round === 2);
    expect(semis.map((s) => s.player1_id)).toEqual(['p1', 'p3']);
  });
});

describe('sets', () => {
  it('valida marcadores', () => {
    expect(evaluateSets([[11, 5], [11, 9], [11, 3]], 3)).toEqual({ p1: 3, p2: 0 });
    expect(evaluateSets([[11, 10]], 1).error).toBeTruthy();
    expect(evaluateSets([[14, 12], [5, 11], [11, 8]], 2)).toEqual({ p1: 2, p2: 1 });
    expect(evaluateSets([[11, 5]], 2).error).toMatch(/Faltan/);
    expect(evaluateSets([[11, 5], [11, 5], [11, 5]], 2).error).toMatch(/Sobra/);
  });
});
