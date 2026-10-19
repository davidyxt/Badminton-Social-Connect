-- get_my_home also returns lastName, so the Home page can show
-- "{firstName} {lastName}" itself (requested 2026-10-08). Only the signed-in
-- player's own name; other players never see it.

CREATE OR REPLACE FUNCTION public.get_my_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'id', p.player_id,
      'username', p.username,
      'firstName', pv.first_name,
      'lastName', pv.last_name,
      'greetingName', coalesce(
        nullif(trim(concat_ws(' ', pv.first_name, pv.last_name)), ''), p.username),
      'initials', private.my_initials(pv.first_name, pv.last_name, p.username),
      'profileImageUrl', null,
      'registered', pv.registered_at is not null,
      'level', private.band_label(p.self_rating_band),
      'ratingCard', private.rating_card(p.player_id),
      'unreadNotifications', (
        select count(*) from public.notification n
        where n.player_id = p.player_id and not n.is_read
      ),
      -- The soonest upcoming game the player is in, as host or player.
      'nextGame', (
        select jsonb_build_object(
          'id', gp.post_id,
          'title', coalesce(gp.title, 'Badminton game'),
          'format', private.band_label(gp.format),
          'startsAt', gp.proposed_time,
          'date', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'Dy, FMDD Mon'),
          'time', to_char(gp.proposed_time at time zone 'Australia/Melbourne', 'FMHH12:MI AM'),
          'suburb', gp.suburb,
          'location', coalesce(v.name || ', ' || gp.suburb, gp.suburb),
          'mapsUrl', v.maps_url,
          'isHost', gp.organiser_id = p.player_id,
          'playerCount', (
            select count(*) from public.game_participant x
            where x.post_id = gp.post_id and x.status = 'accepted'
          ),
          'maxPlayers', gp.player_limit
        )
        from public.game_participant me
        join public.game_post gp on gp.post_id = me.post_id
        left join public.venue v on v.venue_id = gp.venue_id
        where me.player_id = p.player_id
          and me.status = 'accepted'
          and gp.deleted_at is null
          and gp.status in ('open', 'full')
          and gp.proposed_time > now()
        order by gp.proposed_time
        limit 1
      )
    )
    from public.player p
    join public.player_private pv on pv.player_id = p.player_id
    where p.player_id = v_me
  );
end;
$function$;
