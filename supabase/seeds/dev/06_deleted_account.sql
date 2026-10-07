-- Dev seed: a deleted account (items-to-confirm 5).
--
-- Deleting Henry's login runs on_auth_user_deleted, which keeps his player row
-- as "Deleted User": his past result against Alice stays in her history and
-- rankings, his upcoming Richmond doubles is cancelled (Carol is told), his
-- Northside Shuttlers membership and private details are removed.

delete from auth.users where email = 'henry@example.com';
