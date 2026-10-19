\set ON_ERROR_STOP off
begin;
-- free up c106 (alice v dan) so a fresh result can be recorded in it
update public.match_result set status='expired' where match_id='00000000-0000-0000-0000-00000000d106';
-- d106 counted, so taking it away flags a replay for the nightly run; do it now
select needs_rebuild as rebuild_flagged_by_removing_d106 from private.rating_batch;
select private.rebuild_ratings() \g /dev/null
select count(*) as history_before from public.rating_history \gset
select mean as alice_before from private.rating_state where player_id='00000000-0000-0000-0000-00000000a001' \gset

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true) \g /dev/null
select public.submit_result('00000000-0000-0000-0000-00000000c106', array['00000000-0000-0000-0000-00000000a004']::uuid[], null, '[[21,10],[21,12]]'::jsonb) ->> 'resultId' as rid \gset

\echo '--- 1. players cannot write matches/results/disputes directly'
savepoint s1; insert into public.match_result (match_id, score, status, submitted_by) values ('00000000-0000-0000-0000-00000000d106','21-0 21-0','pending','00000000-0000-0000-0000-00000000a001'); rollback to s1;
savepoint s2; delete from public.match where match_id='00000000-0000-0000-0000-00000000d101'; select 'delete matched rows: ' || count(*) from public.match where match_id='00000000-0000-0000-0000-00000000d101'; rollback to s2;
savepoint s3; insert into public.dispute (match_id, reason) values ('00000000-0000-0000-0000-00000000d101','x'); rollback to s3;

\echo '--- 2. dan disputes: result held, rating unchanged, alice told'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}', true) \g /dev/null
savepoint s4; select public.raise_dispute(:'rid'::uuid, '   '); rollback to s4;
select public.raise_dispute(:'rid'::uuid, 'I won game two') -> 'result' ->> 'status' as status_after_dispute;
savepoint s5; select public.confirm_result(:'rid'::uuid); rollback to s5;
reset role;
select (select count(*) from public.rating_history) = :history_before as rating_held;
select type, message from public.notification where match_id = (select match_id from public.match_result where result_id=:'rid'::uuid) order by created_at;

\echo '--- 3. a disputed result blocks the same pairing'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true) \g /dev/null
savepoint s6; select public.submit_result('00000000-0000-0000-0000-00000000c106', array['00000000-0000-0000-0000-00000000a004']::uuid[], null, '[[21,10],[21,12]]'::jsonb); rollback to s6;
reset role;

\echo '--- 4. expiry: pending older than 7 days is voided, and the pairing can be recorded again'
update public.match_result set status='pending', created_at = now() - interval '8 days' where result_id=:'rid'::uuid;
delete from public.dispute where result_id=:'rid'::uuid;
select private.expire_pending_results() as expired_count;
select status from public.match_result where result_id=:'rid'::uuid;
select type, message from public.notification where type='result_expired' order by created_at desc limit 1;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true) \g /dev/null
select public.submit_result('00000000-0000-0000-0000-00000000c106', array['00000000-0000-0000-0000-00000000a004']::uuid[], null, '[[21,0],[21,1]]'::jsonb) ->> 'resultId' as rid2 \gset
reset role;

\echo '--- 5. flags: lopsided games logged for review, never blocking'
select kind, detail from public.result_flag where result_id=:'rid2'::uuid;

\echo '--- 6. dan confirms: confirmed straight away, rated by the nightly run'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}', true) \g /dev/null
select r -> 'ratingPending' as pending_after_confirm, r -> 'ratingChange' as change_after_confirm
from (select public.confirm_result(:'rid2'::uuid) -> 'result' as r) x;
reset role;
select count(*) - :history_before as history_rows_before_run from public.rating_history;
-- what the nightly run does (run_rating_batch commits, so it cannot run in here)
select private.rate_new_results() as rated_by_run;
select count(*) - :history_before as history_rows_after_run from public.rating_history;
select kind from public.result_flag where result_id=:'rid2'::uuid order by kind;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}', true) \g /dev/null
select r -> 'ratingPending' as pending_after_run, r -> 'ratingChange' as rating_change_for_dan
from (select public.get_match((select match_id from public.match_result where result_id=:'rid2'::uuid)) -> 'result' as r) x;
select public.get_rating_summary() ? 'ratingsUpdatedAt' as summary_has_updated_at;
reset role;
select set_config('request.jwt.claims', '', true) \g /dev/null
select public.get_match((select match_id from public.match_result where result_id=:'rid2'::uuid)) is null as get_match_null_without_a_user;

\echo '--- 7. an admin throwing the result out: the next nightly run replays ratings back to where they were'
update public.match_result set status='rejected' where result_id=:'rid2'::uuid;
select needs_rebuild as rebuild_flagged from private.rating_batch;
select abs((select mean from private.rating_state where player_id='00000000-0000-0000-0000-00000000a001') - :alice_before) > 1e-9 as unchanged_until_the_run;
-- what the nightly run does when the flag is set
select private.reset_ratings() \g /dev/null
select private.rate_new_results() \g /dev/null
select not needs_rebuild as rebuild_flag_cleared from private.rating_batch;
select abs((select mean from private.rating_state where player_id='00000000-0000-0000-0000-00000000a001') - :alice_before) < 1e-9 as alice_restored_exactly;

\echo '--- 8. quick messages'
update public.match_result set status='confirmed' where result_id=:'rid2'::uuid;
select match_id as mid from public.match_result where result_id=:'rid2'::uuid \gset
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a004","role":"authenticated"}', true) \g /dev/null
insert into public.match_message (match_id, sender_id, template_code) values (:'mid'::uuid, '00000000-0000-0000-0000-00000000a004', 'good_game');
savepoint s7; insert into public.match_message (match_id, sender_id, template_code) values (:'mid'::uuid, '00000000-0000-0000-0000-00000000a004', 'free text here'); rollback to s7;
savepoint s8; insert into public.match_message (match_id, sender_id, template_code) values (:'mid'::uuid, '00000000-0000-0000-0000-00000000a001', 'good_game'); rollback to s8;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}', true) \g /dev/null
savepoint s9; insert into public.match_message (match_id, sender_id, template_code) values (:'mid'::uuid, '00000000-0000-0000-0000-00000000a002', 'good_game'); rollback to s9;
select jsonb_array_length(public.get_match_messages(:'mid'::uuid)) as bob_sees;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', true) \g /dev/null
select public.get_match_messages(:'mid'::uuid) -> 0 ->> 'label' as alice_sees;
rollback;
