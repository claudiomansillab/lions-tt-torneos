-- =====================================================================
-- Lions TT · Esquema de base de datos para Supabase
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

-- ---------- Tablas ----------

create table if not exists public.tournaments (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  event_date        date,
  group_size        smallint not null default 3 check (group_size between 3 and 6),
  qualifiers        smallint not null default 6 check (qualifiers between 2 and 64),
  sets_to_win_group smallint not null default 3 check (sets_to_win_group between 1 and 4),
  sets_to_win_ko    smallint not null default 3 check (sets_to_win_ko between 1 and 4),
  status            text not null default 'setup'
                    check (status in ('setup', 'round1', 'round2', 'knockout', 'finished')),
  created_at        timestamptz not null default now()
);

create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  created_at    timestamptz not null default now()
);

-- Grupos de Ronda 1 (sorteo) y Ronda 2 (rotación). player_ids guarda el orden:
-- en ronda 2 el índice 0 es el 1° de su grupo de origen, el 1 el 2°, etc.
create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round         smallint not null check (round in (1, 2)),
  label         text not null,
  position      smallint not null,
  player_ids    uuid[] not null default '{}',
  unique (tournament_id, round, position)
);

create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage         text not null check (stage in ('r1', 'r2', 'ko')),
  group_id      uuid references public.groups (id) on delete cascade,
  ko_round      smallint,          -- 1 = primera ronda de llaves
  slot          smallint,          -- posición dentro de la ronda de llaves
  order_no      smallint not null default 0,
  player1_id    uuid references public.players (id) on delete set null,
  player2_id    uuid references public.players (id) on delete set null,
  sets          jsonb not null default '[]'::jsonb,   -- [[11,7],[9,11],...]
  p1_sets       smallint,
  p2_sets       smallint,
  winner_id     uuid references public.players (id) on delete set null,
  walkover      boolean not null default false,
  updated_at    timestamptz not null default now(),
  check ((stage = 'ko') = (ko_round is not null and slot is not null)),
  check ((stage = 'ko') or group_id is not null)
);

-- ---------- Índices (FK + columnas usadas en RLS / filtros) ----------

create index if not exists tournaments_owner_id_idx on public.tournaments (owner_id);
create index if not exists players_tournament_id_idx on public.players (tournament_id);
create index if not exists groups_tournament_id_idx on public.groups (tournament_id);
create index if not exists matches_tournament_id_idx on public.matches (tournament_id);
create index if not exists matches_group_id_idx on public.matches (group_id);
create index if not exists matches_player1_id_idx on public.matches (player1_id);
create index if not exists matches_player2_id_idx on public.matches (player2_id);
create index if not exists matches_winner_id_idx on public.matches (winner_id);
create unique index if not exists matches_ko_slot_uidx
  on public.matches (tournament_id, ko_round, slot) where stage = 'ko';

-- ---------- updated_at automático ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------- Privilegios (mínimos) ----------

revoke all on public.tournaments, public.players, public.groups, public.matches from anon, authenticated;
grant select on public.tournaments, public.players, public.groups, public.matches to anon, authenticated;
grant insert, update, delete on public.tournaments, public.players, public.groups, public.matches to authenticated;

-- ---------- Row Level Security ----------
-- Lectura pública (para compartir el link del torneo con los jugadores).
-- Escritura sólo para el organizador dueño del torneo.

alter table public.tournaments enable row level security;
alter table public.players     enable row level security;
alter table public.groups      enable row level security;
alter table public.matches     enable row level security;

drop policy if exists tournaments_read on public.tournaments;
create policy tournaments_read on public.tournaments
  for select to anon, authenticated using (true);

drop policy if exists tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Tablas hijas: el usuario debe ser dueño del torneo al que pertenece la fila.
do $$
declare
  t text;
begin
  foreach t in array array['players', 'groups', 'matches'] loop
    execute format('drop policy if exists %1$s_read on public.%1$I', t);
    execute format(
      'create policy %1$s_read on public.%1$I for select to anon, authenticated using (true)', t);

    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (exists (select 1 from public.tournaments tr
                        where tr.id = tournament_id and tr.owner_id = (select auth.uid())))
         with check (exists (select 1 from public.tournaments tr
                             where tr.id = tournament_id and tr.owner_id = (select auth.uid())))', t);
  end loop;
end;
$$;

-- ---------- Realtime (resultados en vivo) ----------

do $$
declare
  t text;
begin
  foreach t in array array['tournaments', 'players', 'groups', 'matches'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
