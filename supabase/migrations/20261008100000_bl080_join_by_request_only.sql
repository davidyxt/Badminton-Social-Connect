-- BL-080: players join a club only by asking (items-to-confirm 4).
--
-- Club admins could add any player to their club directly, at any role. That
-- listed people in clubs they never agreed to join. Now the only way in is a
-- pending request the player makes themselves, which a club admin approves.
-- The club's creator still becomes its first admin: on_club_created runs as
-- security definer, so it does not go through this policy.

drop policy "club_representative: request to join, or added by a club admin"
  on public.club_representative;

create policy "club_representative: players ask to join"
  on public.club_representative for insert to authenticated
  with check (
    player_id = (select auth.uid())
    and status = 'pending'
    and role = 'member'
  );
