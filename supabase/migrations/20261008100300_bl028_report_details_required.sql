-- BL-028: every report needs details, not only "other" (items-to-confirm 12).
-- The categories and rate limits stay as they were.

create or replace function private.file_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_reason text,
  p_evidence jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_reason text := nullif(trim(p_reason), '');
  v_id uuid;
begin
  if not (select private.is_registered()) then
    raise exception 'Complete registration first.' using errcode = '42501';
  end if;

  if p_evidence is null then
    raise exception 'That item was not found.' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Tell us what happened.' using errcode = '23514';
  end if;

  if (select count(*) from public.report
      where reported_by_player_id = v_me and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.report
      where reported_by_player_id = v_me and created_at > now() - interval '1 day') >= 20
  then
    raise exception 'You have sent a lot of reports recently. Please try again later, or contact Badminton Victoria if someone is in danger.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.report
    where reported_by_player_id = v_me
      and target_type = p_target_type and target_id = p_target_id
      and status in ('open', 'under_review')
  ) then
    raise exception 'You have already reported this. An administrator will review it.'
      using errcode = '23505';
  end if;

  insert into public.report (reported_by_player_id, target_type, target_id, category, reason, evidence)
  values (v_me, p_target_type, p_target_id, p_category, v_reason,
          p_evidence || jsonb_build_object('captured_at', now()))
  returning report_id into v_id;

  return v_id;
end;
$$;
