create table if not exists public.voice_rooms (
  room_code text primary key check (room_code ~ '^[A-Z0-9-]{4,32}$'),
  game_phase text not null default 'lobby'
    check (game_phase in ('lobby', 'role-reveal', 'night', 'morning', 'discussion', 'voting', 'results')),
  post_game_voice boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_room_members (
  room_code text not null references public.voice_rooms (room_code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  participant_name text not null check (char_length(participant_name) between 1 and 40),
  is_alive boolean not null default true,
  is_muted boolean not null default false,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index if not exists voice_room_members_user on public.voice_room_members (user_id, room_code);
alter table public.voice_rooms enable row level security;
alter table public.voice_room_members enable row level security;

revoke all on public.voice_rooms from anon, authenticated;
revoke all on public.voice_room_members from anon, authenticated;
grant all on public.voice_rooms to service_role;
grant all on public.voice_room_members to service_role;
