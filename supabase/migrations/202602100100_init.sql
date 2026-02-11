-- Retro Pixel Guandan MVP schema
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(6) not null unique,
  status text not null check (status in ('waiting', 'ready', 'playing', 'finished')),
  owner_seat_index int not null default 0,
  level_rank int not null default 2,
  game_id uuid null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_index int not null check (seat_index between 0 and 3),
  player_id text null,
  nickname text not null default '玩家',
  is_ai boolean not null default false,
  ready boolean not null default false,
  connected boolean not null default false,
  seat_token_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, seat_index)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  phase text not null check (phase in ('dealing', 'turns', 'hand-finish', 'game-finish')),
  level_rank int not null default 2,
  current_turn_index int not null default 0,
  winner_team int null,
  state_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_actions (
  id bigserial primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  seq int not null,
  player_id text not null,
  action_type text not null check (action_type in ('play', 'pass', 'toggle_auto')),
  card_ids jsonb not null,
  reason_code text not null,
  score_delta int not null default 0,
  created_at timestamptz not null default now(),
  unique(game_id, seq)
);

create table if not exists public.game_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seq int not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(game_id, seq)
);

create table if not exists public.game_reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade unique,
  language text not null default 'zh-CN',
  summary text not null,
  key_moments jsonb not null,
  alternatives jsonb not null,
  suggestions jsonb not null,
  model text not null,
  token_usage jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_status on public.rooms(status);
create index if not exists idx_rooms_room_code on public.rooms(room_code);
create index if not exists idx_room_seats_room_id on public.room_seats(room_id);
create index if not exists idx_games_room_id on public.games(room_id);
create index if not exists idx_game_actions_game_id_seq on public.game_actions(game_id, seq desc);
create index if not exists idx_game_snapshots_game_id_seq on public.game_snapshots(game_id, seq desc);

alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.games enable row level security;
alter table public.game_actions enable row level security;
alter table public.game_snapshots enable row level security;
alter table public.game_reviews enable row level security;

-- 首版策略：匿名可读，写入由服务端 service role 执行。
create policy if not exists rooms_read_all on public.rooms for select using (true);
create policy if not exists room_seats_read_all on public.room_seats for select using (true);
create policy if not exists games_read_all on public.games for select using (true);
create policy if not exists actions_read_all on public.game_actions for select using (true);
create policy if not exists snapshots_read_all on public.game_snapshots for select using (true);
create policy if not exists reviews_read_all on public.game_reviews for select using (true);
