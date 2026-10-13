-- Find Games: one search bar for location, time and level (requested 2026-10-08).
--
-- p_query used to match only title, suburb, venue and level. Now the search
-- bar takes one thing at a time, a location, a time or a level, and finds the
-- games it matches. (Combinations such as "msac saturday 6pm" are not needed.)
--
--   location  suburb, venue name, venue address, postcode ("carlton", "msac", "3206")
--   time      today, tonight, tomorrow, weekend, weekday; day names ("sat",
--             "saturday"); month names ("oct"); morning (before 12),
--             afternoon (12-5 pm), evening / night (from 5 pm); a start time
--             ("6pm", "6:30pm", "18:00"); a date ("10/10", "10/10/2026") or a
--             day of the month ("10")
--   level     beginner, intermediate, advanced, "lower", "upper", "any"; like
--             the level filter, games open to any level match every level word
--   format    singles, doubles, mixed
--   style     social (also "friendly"), competitive
--   title     any word of it
--
-- Times are Melbourne time, as on the game cards. The level and format
-- dropdowns stay separate filters (p_level, p_format) and combine with the
-- search words.

create or replace function private.game_matches_search_word(
  p_word text,
  p_starts_at timestamptz,
  p_title text,
  p_suburb text,
  p_venue_name text,
  p_venue_address text,
  p_postcode text,
  p_ability_level text,
  p_format text,
  p_style text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  w text := lower(trim(both ' ,.;!?' from p_word));
  -- Times and dates are matched without spaces, so "6 pm" works like "6pm".
  c text := replace(w, ' ', '');
  t timestamp := p_starts_at at time zone 'Australia/Melbourne';
  today date := (now() at time zone 'Australia/Melbourne')::date;
  m text[];
  h integer;
begin
  if w = '' then
    return true;
  end if;

  -- Words about the game itself.
  if position(w in lower(coalesce(p_title, ''))) > 0
     or position(w in lower(coalesce(p_suburb, ''))) > 0
     or position(w in lower(coalesce(p_venue_name, ''))) > 0
     or position(w in lower(coalesce(p_venue_address, ''))) > 0
     or w = p_postcode
     or position(w in replace(p_ability_level, '_', ' ')) > 0
     -- Like the level filter, a level word also finds games open to any level.
     or (p_ability_level = 'any' and w in ('beginner', 'intermediate', 'advanced', 'lower', 'upper'))
     or position(w in replace(p_format, '_', ' ')) > 0
     or position(w in p_style) > 0
     or (w = 'friendly' and p_style = 'social')
  then
    return true;
  end if;

  -- Relative days and parts of the day.
  case w
    when 'today' then return t::date = today;
    when 'tonight' then return t::date = today and extract(hour from t) >= 17;
    when 'tomorrow' then return t::date = today + 1;
    when 'weekend' then return extract(isodow from t) in (6, 7);
    when 'weekday' then return extract(isodow from t) between 1 and 5;
    when 'morning' then return extract(hour from t) < 12;
    when 'afternoon' then return extract(hour from t) between 12 and 16;
    when 'evening', 'night' then return extract(hour from t) >= 17;
    else null;
  end case;

  -- Day and month names, from three letters ("sat", "saturday", "oct").
  if length(w) >= 3 and w ~ '^[a-z]+$' then
    return to_char(t, 'fmday') like w || '%' or to_char(t, 'fmmonth') like w || '%';
  end if;

  -- A start time: 6pm, 6:30pm, 6 pm, 18:00.
  m := regexp_match(c, '^(\d{1,2})(?::(\d{2}))?(am|pm)$');
  if m is not null then
    h := m[1]::int % 12 + case when m[3] = 'pm' then 12 else 0 end;
    return extract(hour from t) = h
       and (m[2] is null or extract(minute from t) = m[2]::int);
  end if;
  m := regexp_match(c, '^(\d{1,2}):(\d{2})$');
  if m is not null then
    return extract(hour from t) = m[1]::int and extract(minute from t) = m[2]::int;
  end if;

  -- A date, day/month or day/month/year.
  m := regexp_match(c, '^(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?$');
  if m is not null then
    return extract(day from t) = m[1]::int and extract(month from t) = m[2]::int
       and (m[3] is null or extract(year from t) = case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end);
  end if;

  -- A bare number: a day of the month (a postcode was checked above).
  if w ~ '^\d{1,2}$' then
    return extract(day from t) = w::int;
  end if;

  return false;
end;
$$;

comment on function private.game_matches_search_word(text, timestamptz, text, text, text, text, text, text, text, text) is
  'The Find Games search bar: true when it matches the game''s location, '
  'time, level, format, style or title. See search_games.';

revoke all on function private.game_matches_search_word(text, timestamptz, text, text, text, text, text, text, text, text) from public;

create or replace function public.search_games(
  p_query text default null,
  p_level text default null,
  p_format text default null,
  p_suburb text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(regexp_replace(p_query, '\s+', ' ', 'g')), '');
  v_bands text[] := private.bands_for_level(p_level);
begin
  if not (select private.is_registered()) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(private.game_card(g.post_id) order by g.proposed_time, g.post_id)
    from (
      select gp.post_id, gp.proposed_time
      from public.game_post gp
      left join public.venue v on v.venue_id = gp.venue_id
      left join public.suburb s on s.suburb_id = v.suburb_id
      where gp.deleted_at is null
        and gp.status in ('open', 'full')
        and gp.proposed_time > now()
        and gp.proposed_time >= coalesce(p_from, now())
        and (p_to is null or gp.proposed_time <= p_to)
        and (p_suburb is null or lower(gp.suburb) = lower(trim(p_suburb)))
        and (
          p_format is null
          or gp.format = lower(p_format)
          -- The screens offer singles and doubles; mixed doubles is doubles.
          or (lower(p_format) = 'doubles' and gp.format = 'mixed_doubles')
        )
        and (v_bands is null or gp.ability_level = 'any' or gp.ability_level = any (v_bands))
        -- The search bar: a location, a time or a level.
        and (
          v_query is null
          or private.game_matches_search_word(
               v_query, gp.proposed_time, gp.title, gp.suburb, v.name, v.address, s.postcode,
               gp.ability_level, gp.format, gp.style)
        )
        -- BL-027: no games organised or joined by someone who blocked the caller.
        and not private.game_hidden_from_me(gp.post_id)
      order by gp.proposed_time, gp.post_id
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
      offset greatest(coalesce(p_offset, 0), 0)
    ) g
  ), '[]'::jsonb);
end;
$$;

comment on function public.search_games(text, text, text, text, timestamptz, timestamptz, integer, integer) is
  'BL-015. Upcoming open or full games, soonest first, as Find Games cards: '
  'supabase.rpc(''search_games'', { p_query, p_level, p_format, p_suburb, p_from, p_to, '
  'p_limit, p_offset }). Every filter is optional. p_query is the search bar, one thing '
  'at a time: a location (suburb, venue, address, postcode), a time (today, tonight, '
  'tomorrow, weekend, sat, oct, morning, evening, 6pm, 18:00, 10/10), a level, a format, '
  'a style or words of the title. p_level: beginner | intermediate | '
  'advanced (games open to any level always match). p_format: singles | doubles. Pages '
  'of up to 50.';
