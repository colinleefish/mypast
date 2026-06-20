-- One-off: rename production database mem9_db -> rmb_db (and optionally the role).
-- Run while the app is stopped.
--
--   sudo -u postgres psql -f scripts/rename_db_mem9_to_rmb.sql
--
-- Then update RMB_DB_URL in .env:
--   .../rmb_db?sslmode=disable
-- and if the role was renamed:
--   postgres://rmb_user:...@127.0.0.1:5432/rmb_db?sslmode=disable

SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'mem9_db'
  AND pid <> pg_backend_pid();

ALTER DATABASE mem9_db RENAME TO rmb_db;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mem9_user') THEN
    ALTER ROLE mem9_user RENAME TO rmb_user;
  END IF;
END $$;
