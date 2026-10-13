-- Look up missing venue pins with OpenStreetMap Nominatim, inside Supabase.
--
-- Any venue saved without coordinates is queued by a trigger. Every minute,
-- pg_cron calls the geocode-venues Edge Function (through pg_net), which
-- works through the queue one Nominatim request per second and writes the
-- pin back with coordinates_source = 'openstreetmap'. venue.maps_url then
-- switches from an address search to the exact pin by itself.
--
-- Nominatim allows one request per second from us in total, so there must
-- never be two workers at once, however many venues arrive or however the
-- function is called. A single-row lease (venue_geocode_worker) enforces
-- that: a worker must take the lease before it gets any venues, and nobody
-- else can take it until it is released or expires.
--
-- The function's URL and shared secret are not in this migration: they live
-- in Vault (geocode_function_url, geocode_function_secret), as for email.
-- Until both exist, nothing is called.

-- pg_cron schedules the worker; pg_net calls the Edge Function. Also enabled
-- by M5 (reliability, email); "if not exists" keeps both branches happy.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. The queue
-- ---------------------------------------------------------------------------

create table public.venue_geocode_queue (
  queue_id bigint generated always as identity primary key,
  venue_id uuid not null references public.venue (venue_id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- One open job per venue.
create unique index venue_geocode_queue_one_pending_idx
  on public.venue_geocode_queue (venue_id) where status = 'pending';
create index venue_geocode_queue_pending_idx
  on public.venue_geocode_queue (created_at) where status = 'pending';

comment on table public.venue_geocode_queue is
  'Venues waiting for a pin from Nominatim. Filled by a trigger on venue, '
  'worked by the geocode-venues Edge Function. failed means Nominatim found '
  'nothing usable after 3 tries: an admin should set the pin by hand.';

alter table public.venue_geocode_queue enable row level security;

create policy "venue_geocode_queue: admins read"
  on public.venue_geocode_queue for select to authenticated
  using ((select private.is_admin()));

revoke insert, update, delete on public.venue_geocode_queue from anon, authenticated;

-- Queue a venue whenever it has no pin and its name or address changes.
create or replace function private.queue_venue_geocode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.latitude is null and (
       tg_op = 'INSERT'
       or (new.name, new.address, new.suburb_id) is distinct from (old.name, old.address, old.suburb_id)
       or old.latitude is not null
     )
  then
    insert into public.venue_geocode_queue (venue_id)
    values (new.venue_id)
    on conflict (venue_id) where status = 'pending' do nothing;
  end if;
  return new;
end;
$$;

create trigger venue_queue_geocode
  after insert or update of name, address, suburb_id, latitude on public.venue
  for each row execute function private.queue_venue_geocode();

-- ---------------------------------------------------------------------------
-- 2. One worker at a time
-- ---------------------------------------------------------------------------

create table private.venue_geocode_worker (
  id boolean primary key default true check (id),
  lease_until timestamptz not null default '-infinity'
);

insert into private.venue_geocode_worker default values;

-- Take the lease and a batch of venues, or nothing if another worker holds
-- it. The lease covers the whole batch at one request per second, plus room.
create or replace function public.geocode_claim_batch(p_max integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := least(greatest(coalesce(p_max, 25), 1), 50);
begin
  update private.venue_geocode_worker
  set lease_until = now() + make_interval(secs => v_max * 2 + 30)
  where lease_until < now();

  if not found then
    return jsonb_build_object('leased', false, 'venues', '[]'::jsonb);
  end if;

  return jsonb_build_object('leased', true, 'venues', coalesce((
    select jsonb_agg(jsonb_build_object(
             'queueId', q.queue_id,
             'venueId', v.venue_id,
             'name', v.name,
             'address', v.address,
             'suburb', s.name,
             'state', s.state_code,
             'suburbLat', s.latitude,
             'suburbLng', s.longitude)
           order by q.created_at)
    from (
      select * from public.venue_geocode_queue
      where status = 'pending'
      order by created_at
      limit v_max
    ) q
    join public.venue v on v.venue_id = q.venue_id
    join public.suburb s on s.suburb_id = v.suburb_id
  ), '[]'::jsonb));
end;
$$;

-- Record one result. A pin is written to the venue; no pin counts as an
-- attempt, and after 3 attempts the job is marked failed for an admin.
create or replace function public.geocode_complete(
  p_queue_id bigint,
  p_lat numeric default null,
  p_lng numeric default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue from public.venue_geocode_queue
  where queue_id = p_queue_id and status = 'pending';
  if v_venue is null then
    return;
  end if;

  if p_lat is not null and p_lng is not null then
    update public.venue
    set latitude = p_lat, longitude = p_lng, coordinates_source = 'openstreetmap'
    where venue_id = v_venue;

    update public.venue_geocode_queue
    set status = 'done', attempts = attempts + 1, last_error = null, processed_at = now()
    where queue_id = p_queue_id;
  else
    update public.venue_geocode_queue
    set attempts = attempts + 1,
        last_error = coalesce(p_error, 'no match within 10 km of the suburb'),
        status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
        processed_at = now()
    where queue_id = p_queue_id;
  end if;
end;
$$;

create or replace function public.geocode_release()
returns void
language sql
security definer
set search_path = ''
as $$
  -- The WHERE is required: Supabase's pg-safeupdate refuses an UPDATE
  -- without one when called through the API, even on a one-row table.
  update private.venue_geocode_worker set lease_until = '-infinity' where id;
$$;

comment on function public.geocode_claim_batch(integer) is
  'geocode-venues Edge Function only (service_role). Takes the single-worker '
  'lease and up to p_max pending venues; leased = false if another worker '
  'is running.';
comment on function public.geocode_complete(bigint, numeric, numeric, text) is
  'geocode-venues Edge Function only. Writes a pin, or records a miss.';
comment on function public.geocode_release() is
  'geocode-venues Edge Function only. Ends the lease when a batch is done.';

-- Only the Edge Function (service_role) may call these.
revoke all on function public.geocode_claim_batch(integer) from public, anon, authenticated;
revoke all on function public.geocode_complete(bigint, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.geocode_release() from public, anon, authenticated;
grant execute on function public.geocode_claim_batch(integer) to service_role;
grant execute on function public.geocode_complete(bigint, numeric, numeric, text) to service_role;
grant execute on function public.geocode_release() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Every minute, if there is work and the function is configured
-- ---------------------------------------------------------------------------

create or replace function private.invoke_geocoder()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.venue_geocode_queue where status = 'pending') then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'geocode_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'geocode_function_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.invoke_geocoder() from public;

select cron.schedule('geocode-venues', '* * * * *', $$select private.invoke_geocoder()$$);

-- Venues already in the table without a pin.
insert into public.venue_geocode_queue (venue_id)
select venue_id from public.venue where latitude is null
on conflict do nothing;
