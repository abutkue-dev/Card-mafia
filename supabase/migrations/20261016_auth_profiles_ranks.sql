create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_key text not null default 'rose' check (avatar_key in ('rose', 'violet', 'gold', 'teal', 'blue', 'plum')),
  registration_method text not null check (registration_method in ('email', 'phone')),
  created_at timestamptz not null default now(),
  is_verified boolean not null default false,
  rank_name text not null default 'Rookie',
  rank_points integer not null default 0 check (rank_points >= 0),
  player_level integer not null default 1 check (player_level >= 1),
  total_matches integer not null default 0 check (total_matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  win_rate numeric(5, 2) not null default 0 check (win_rate between 0 and 100),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0)
);

create table if not exists public.match_records (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  rp_change integer not null,
  rank_points_before integer not null check (rank_points_before >= 0),
  rank_points_after integer not null check (rank_points_after >= 0),
  match_status text not null default 'completed' check (match_status = 'completed'),
  processed_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create table if not exists public.rating_changes (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  rp_change integer not null,
  rank_points_before integer not null check (rank_points_before >= 0),
  rank_points_after integer not null check (rank_points_after >= 0),
  previous_rank text not null,
  new_rank text not null,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create index if not exists profiles_leaderboard_order on public.profiles (rank_points desc, wins desc, display_name asc);
create index if not exists rating_changes_user_history on public.rating_changes (user_id, created_at desc);
create index if not exists match_records_user_history on public.match_records (user_id, processed_at desc);

create or replace function public.rank_for_points(points integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when greatest(points, 0) >= 2200 then 'Master'
    when greatest(points, 0) >= 1500 then 'Diamond'
    when greatest(points, 0) >= 1000 then 'Platinum'
    when greatest(points, 0) >= 600 then 'Gold'
    when greatest(points, 0) >= 300 then 'Silver'
    when greatest(points, 0) >= 100 then 'Bronze'
    else 'Rookie'
  end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_name text;
  safe_avatar text;
  method text;
begin
  safe_name := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', 'Player')), 24);
  if char_length(safe_name) < 2 then safe_name := 'Player'; end if;
  safe_avatar := coalesce(new.raw_user_meta_data ->> 'avatar_key', 'rose');
  if safe_avatar not in ('rose', 'violet', 'gold', 'teal', 'blue', 'plum') then safe_avatar := 'rose'; end if;
  method := case when new.phone is not null and new.email is null then 'phone' else 'email' end;

  insert into public.profiles (id, display_name, avatar_key, registration_method, is_verified)
  values (
    new.id,
    safe_name,
    safe_avatar,
    method,
    new.email_confirmed_at is not null or new.phone_confirmed_at is not null
  )
  on conflict (id) do update set
    is_verified = excluded.is_verified,
    registration_method = excluded.registration_method;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified
after update of email_confirmed_at, phone_confirmed_at on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.process_verified_competitive_match(
  p_match_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_match_completed boolean,
  p_match_valid boolean
)
returns table (
  processed boolean,
  previous_points integer,
  new_points integer,
  previous_rank text,
  new_rank text,
  rp_change integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  old_points integer;
  old_rank text;
  next_points integer;
  next_rank text;
  delta integer;
  inserted_count integer;
  next_total integer;
  next_wins integer;
  next_losses integer;
  next_draws integer;
  next_streak integer;
  best_streak integer;
begin
  if not p_match_completed or not p_match_valid then
    return query select false, null::integer, null::integer, null::text, null::text, 0;
    return;
  end if;
  if p_outcome not in ('win', 'loss', 'draw') then
    raise exception 'Unsupported competitive outcome';
  end if;

  select profile.rank_points, public.rank_for_points(profile.rank_points)
    into old_points, old_rank
    from public.profiles as profile
    where profile.id = p_user_id
    for update;
  if not found then raise exception 'Profile does not exist'; end if;

  delta := case p_outcome when 'win' then 25 when 'loss' then -15 else 0 end;
  next_points := greatest(0, old_points + delta);
  next_rank := public.rank_for_points(next_points);

  insert into public.match_records (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after)
  values (p_match_id, p_user_id, p_outcome, next_points - old_points, old_points, next_points)
  on conflict (match_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return query select false, old_points, old_points, old_rank, old_rank, 0;
    return;
  end if;

  next_total := (select profile.total_matches + 1 from public.profiles as profile where profile.id = p_user_id);
  next_wins := (select profile.wins + case when p_outcome = 'win' then 1 else 0 end from public.profiles as profile where profile.id = p_user_id);
  next_losses := (select profile.losses + case when p_outcome = 'loss' then 1 else 0 end from public.profiles as profile where profile.id = p_user_id);
  next_draws := (select profile.draws + case when p_outcome = 'draw' then 1 else 0 end from public.profiles as profile where profile.id = p_user_id);
  next_streak := case when p_outcome = 'win' then (select profile.current_win_streak + 1 from public.profiles as profile where profile.id = p_user_id) else 0 end;
  best_streak := greatest(next_streak, (select profile.best_win_streak from public.profiles as profile where profile.id = p_user_id));

  insert into public.rating_changes (match_id, user_id, outcome, rp_change, rank_points_before, rank_points_after, previous_rank, new_rank)
  values (p_match_id, p_user_id, p_outcome, next_points - old_points, old_points, next_points, old_rank, next_rank);

  update public.profiles
  set rank_points = next_points,
      rank_name = next_rank,
      total_matches = next_total,
      wins = next_wins,
      losses = next_losses,
      draws = next_draws,
      win_rate = round((next_wins::numeric / greatest(next_total, 1)) * 100, 2),
      player_level = greatest(1, ceil(next_total::numeric / 5)::integer),
      current_win_streak = next_streak,
      best_win_streak = best_streak
  where id = p_user_id;

  return query select true, old_points, next_points, old_rank, next_rank, next_points - old_points;
end;
$$;

alter table public.profiles enable row level security;
alter table public.match_records enable row level security;
alter table public.rating_changes enable row level security;

drop policy if exists "Public profile fields are readable" on public.profiles;
create policy "Public profile fields are readable" on public.profiles
for select to anon, authenticated using (true);

drop policy if exists "Owners can edit their display profile" on public.profiles;
create policy "Owners can edit their display profile" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Owners can read their match records" on public.match_records;
create policy "Owners can read their match records" on public.match_records
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owners can read their rating history" on public.rating_changes;
create policy "Owners can read their rating history" on public.rating_changes
for select to authenticated using (auth.uid() = user_id);

revoke all on public.profiles, public.match_records, public.rating_changes from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;
grant select on public.match_records, public.rating_changes to authenticated;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.rank_for_points(integer) from public, anon, authenticated;
revoke all on function public.process_verified_competitive_match(uuid, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.process_verified_competitive_match(uuid, uuid, text, boolean, boolean) to service_role;