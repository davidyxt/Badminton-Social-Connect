-- Function descriptions brought up to date with today's decisions. The API
-- spec (docs/badminton-social-connect-api_v1.2.yaml) is built from these by
-- supabase/scripts/build_openapi.py, so they are the one place to describe
-- each function.

comment on function public.report_player(uuid, text, text) is
  'BL-028. supabase.rpc(''report_player'', { p_player_id, p_category, p_reason }) returns the '
  'report id. p_category: harassment, inappropriate_content, fake_account, spam, '
  'safety_concern, underage, other. p_reason is required for every category. At most 5 '
  'reports an hour and 20 a day, and one open report per item.';

comment on function public.withdraw_request(uuid) is
  'A player withdraws their request or their accepted place: supabase.rpc(''withdraw_request'', '
  '{ p_post_id }). Allowed until the start. Giving up an accepted place within 24 hours of '
  'the start is a late withdrawal and lowers reliability (BL-054).';

comment on function public.get_my_profile() is
  'Profile page and its edit screens: supabase.rpc(''get_my_profile''). The signed-in '
  'player''s own name, username, level, bio, suburb, state, visibility, preferred format, '
  'email opt-out, every reliability figure with its band, ratingCard and unread count. '
  'Only ever returns the caller''s own data.';

comment on function public.get_player_profile(uuid) is
  'BL-019. supabase.rpc(''get_player_profile'', { p_player_id }) returns the Player Profile '
  'screen''s object, or null when the profile is private to the caller, the player blocked '
  'the caller, or the account was deleted. isBlocked is true when the caller blocked them. '
  'Never includes real names, email or date of birth.';

comment on function public.search_players(text, text, integer, integer) is
  'Find Games Players tab: discoverable, registered players other than the caller, by '
  'username, suburb or level: supabase.rpc(''search_players'', { p_query, p_level, p_limit, '
  'p_offset }). Players the caller blocked appear with isBlocked: true; players who blocked '
  'the caller do not appear. Never real names.';

comment on function public.get_game_details(uuid) is
  'Game Details screen: the card plus duration, venue, address, Maps link, notes, host '
  '(rating, verified matches, reliability and band), accepted players, the caller''s request '
  'status and whether they manage the game. Null if the game is removed (admins excepted), '
  'hidden by a block, or the caller is not registered.';

comment on function public.get_join_requests(uuid) is
  'Play Request screen: every request for a game the caller organises, with the requester''s '
  'level, preferred format, rating, verified matches, reliability, band, no-shows, late '
  'withdrawals and message. Status uses the screen''s words: pending, accepted, declined, '
  'withdrawn. Respond with accept_request / decline_request.';

comment on function public.get_my_home() is
  'Home page: supabase.rpc(''get_my_home''). greetingName ("John Doe", or the username), '
  'initials for the top bar, registered (false = send to /complete-registration), level, '
  'ratingCard (rating, band, matches, winRate, stateRank, status), nextGame (null = "No '
  'game planned") and unreadNotifications.';

comment on function public.get_blocked_players() is
  'The Blocked Users list on the Profile page: players the caller has blocked, newest first, '
  'with the category and reason the caller gave.';
