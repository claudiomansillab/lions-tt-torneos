// Capa de datos. Usa Supabase si están las variables VITE_SUPABASE_*; si no, "modo local"
// con localStorage (útil para probar sin configurar nada).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Group, Match, NewTournamentInput, Player, Tournament, TournamentData } from './types';
import { uid } from './tournament';

export interface Repo {
  mode: 'supabase' | 'local';
  listTournaments(): Promise<Tournament[]>;
  getTournament(id: string): Promise<TournamentData>;
  createTournament(input: NewTournamentInput, names: string[]): Promise<string>;
  updateTournament(id: string, patch: Partial<Tournament>): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  addPlayers(tournamentId: string, names: string[]): Promise<void>;
  renamePlayer(id: string, name: string): Promise<void>;
  removePlayer(id: string): Promise<void>;
  insertStage(groups: Group[], matches: Match[]): Promise<void>;
  /** Borra grupos de la ronda y partidos de la fase. */
  deleteStage(tournamentId: string, stage: 'r1' | 'r2' | 'ko'): Promise<void>;
  updateMatches(updates: (Partial<Match> & { id: string })[]): Promise<void>;
  subscribe(tournamentId: string, onChange: () => void): () => void;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

const roundOf = (stage: 'r1' | 'r2' | 'ko') => (stage === 'r1' ? 1 : stage === 'r2' ? 2 : null);

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function supabaseRepo(sb: SupabaseClient): Repo {
  return {
    mode: 'supabase',

    async listTournaments() {
      return check(await sb.from('tournaments').select('*').order('created_at', { ascending: false })) as Tournament[];
    },

    async getTournament(id) {
      const [t, p, g, m] = await Promise.all([
        sb.from('tournaments').select('*').eq('id', id).single(),
        sb.from('players').select('*').eq('tournament_id', id).order('created_at'),
        sb.from('groups').select('*').eq('tournament_id', id).order('round').order('position'),
        sb.from('matches').select('*').eq('tournament_id', id).order('order_no'),
      ]);
      return {
        tournament: check(t) as Tournament,
        players: check(p) as Player[],
        groups: check(g) as Group[],
        matches: check(m) as Match[],
      };
    },

    async createTournament(input, names) {
      const t = check(await sb.from('tournaments').insert(input).select('id').single()) as { id: string };
      if (names.length) {
        check(await sb.from('players').insert(names.map((name) => ({ tournament_id: t.id, name }))));
      }
      return t.id;
    },

    async updateTournament(id, patch) {
      check(await sb.from('tournaments').update(patch).eq('id', id));
    },

    async deleteTournament(id) {
      check(await sb.from('tournaments').delete().eq('id', id));
    },

    async addPlayers(tournamentId, names) {
      check(await sb.from('players').insert(names.map((name) => ({ tournament_id: tournamentId, name }))));
    },

    async renamePlayer(id, name) {
      check(await sb.from('players').update({ name }).eq('id', id));
    },

    async removePlayer(id) {
      check(await sb.from('players').delete().eq('id', id));
    },

    async insertStage(groups, matches) {
      if (groups.length) check(await sb.from('groups').insert(groups));
      if (matches.length) {
        const res = await sb.from('matches').insert(matches);
        if (res.error && groups.length) {
          await sb.from('groups').delete().in('id', groups.map((g) => g.id));
        }
        check(res);
      }
    },

    async deleteStage(tournamentId, stage) {
      check(await sb.from('matches').delete().eq('tournament_id', tournamentId).eq('stage', stage));
      const round = roundOf(stage);
      if (round) check(await sb.from('groups').delete().eq('tournament_id', tournamentId).eq('round', round));
    },

    async updateMatches(updates) {
      // Secuencial para que el avance en llaves quede en orden.
      for (const { id, ...patch } of updates) {
        check(await sb.from('matches').update(patch).eq('id', id));
      }
    },

    subscribe(tournamentId, onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fire = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 250);
      };
      const filter = `tournament_id=eq.${tournamentId}`;
      const channel = sb
        .channel(`tournament-${tournamentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` }, fire)
        .subscribe();
      return () => {
        clearTimeout(timer);
        sb.removeChannel(channel);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Local (localStorage)
// ---------------------------------------------------------------------------

interface LocalDb {
  tournaments: Tournament[];
  players: Player[];
  groups: Group[];
  matches: Match[];
}

const LS_KEY = 'lions-tt-db-v1';
export const LOCAL_USER_ID = 'local-user';

function localRepo(): Repo {
  const load = (): LocalDb => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw) as LocalDb;
    } catch {
      /* almacenamiento no disponible */
    }
    return { tournaments: [], players: [], groups: [], matches: [] };
  };
  const save = (db: LocalDb) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch {
      /* almacenamiento no disponible */
    }
    listeners.forEach((fn) => fn());
  };
  const listeners = new Set<() => void>();
  const mutate = async (fn: (db: LocalDb) => void) => {
    const db = load();
    fn(db);
    save(db);
  };
  const now = () => new Date().toISOString();

  return {
    mode: 'local',

    async listTournaments() {
      return [...load().tournaments].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async getTournament(id) {
      const db = load();
      const tournament = db.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error('Torneo no encontrado');
      return {
        tournament,
        players: db.players.filter((p) => p.tournament_id === id),
        groups: db.groups.filter((g) => g.tournament_id === id),
        matches: db.matches.filter((m) => m.tournament_id === id),
      };
    },

    async createTournament(input, names) {
      const id = uid();
      await mutate((db) => {
        db.tournaments.push({ ...input, id, owner_id: LOCAL_USER_ID, status: 'setup', created_at: now() });
        names.forEach((name, i) =>
          db.players.push({ id: uid(), tournament_id: id, name, created_at: new Date(Date.now() + i).toISOString() }),
        );
      });
      return id;
    },

    async updateTournament(id, patch) {
      await mutate((db) => {
        db.tournaments = db.tournaments.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },

    async deleteTournament(id) {
      await mutate((db) => {
        db.tournaments = db.tournaments.filter((t) => t.id !== id);
        db.players = db.players.filter((x) => x.tournament_id !== id);
        db.groups = db.groups.filter((x) => x.tournament_id !== id);
        db.matches = db.matches.filter((x) => x.tournament_id !== id);
      });
    },

    async addPlayers(tournamentId, names) {
      await mutate((db) => {
        names.forEach((name, i) =>
          db.players.push({ id: uid(), tournament_id: tournamentId, name, created_at: new Date(Date.now() + i).toISOString() }),
        );
      });
    },

    async renamePlayer(id, name) {
      await mutate((db) => {
        db.players = db.players.map((p) => (p.id === id ? { ...p, name } : p));
      });
    },

    async removePlayer(id) {
      await mutate((db) => {
        db.players = db.players.filter((p) => p.id !== id);
      });
    },

    async insertStage(groups, matches) {
      await mutate((db) => {
        db.groups.push(...groups);
        db.matches.push(...matches);
      });
    },

    async deleteStage(tournamentId, stage) {
      const round = roundOf(stage);
      await mutate((db) => {
        db.matches = db.matches.filter((m) => !(m.tournament_id === tournamentId && m.stage === stage));
        db.groups = db.groups.filter((g) => !(g.tournament_id === tournamentId && g.round === round));
      });
    },

    async updateMatches(updates) {
      await mutate((db) => {
        for (const { id, ...patch } of updates) {
          db.matches = db.matches.map((m) => (m.id === id ? { ...m, ...patch } : m));
        }
      });
    },

    subscribe(_tournamentId, onChange) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY) onChange();
      };
      window.addEventListener('storage', onStorage);
      listeners.add(onChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        listeners.delete(onChange);
      };
    },
  };
}

export const repo: Repo = supabase ? supabaseRepo(supabase) : localRepo();
