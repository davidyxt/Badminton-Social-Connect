-- BL-087: an email for every notification.
--
-- After each insert into public.notification, the database calls the
-- send-email-notification Edge Function through pg_net (asynchronously, so
-- the insert never waits on email). The function looks up the player's email
-- and sends it through Resend. Everything goes through dispatch_notification
-- (BL-050), so no RPC needed changing.
--
-- The function's URL and a shared secret differ between local and hosted, so
-- they are not in this migration. They live in Supabase Vault:
--
--   select vault.create_secret('<function url>', 'email_webhook_url');
--   select vault.create_secret('<random secret>', 'email_webhook_secret');
--
-- Until both exist, no emails are attempted (local development and tests
-- work without them). See docs/features/M5-trust-and-reliability.md.
--
-- Players can turn emails off (player_profile.email_notifications).

create extension if not exists pg_net with schema extensions;

alter table public.player_profile
  add column email_notifications boolean not null default true;

comment on column public.player_profile.email_notifications is
  'False to stop notification emails. In-app notifications continue.';

grant update (email_notifications) on public.player_profile to authenticated;

create or replace function private.email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'email_webhook_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'email_webhook_secret';

  -- Not configured in this environment: nothing to do.
  if v_url is null or v_secret is null then
    return new;
  end if;

  if not coalesce((
    select pp.email_notifications from public.player_profile pp where pp.player_id = new.player_id
  ), true) then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', 'INSERT', 'table', 'notification', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

comment on function private.email_notification() is
  'BL-087. Posts each new notification to the send-email-notification Edge '
  'Function, unless the player turned emails off or the webhook is not '
  'configured (vault secrets email_webhook_url and email_webhook_secret).';

revoke all on function private.email_notification() from public;

create trigger notification_send_email
  after insert on public.notification
  for each row execute function private.email_notification();
