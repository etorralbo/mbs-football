-- Creates the test database if it does not already exist.
-- This script runs automatically when the pgdata volume is first initialised
-- (docker-entrypoint-initdb.d). It does NOT run on subsequent container starts.
--
-- If you need to re-run it (e.g. after wiping the volume):
--   docker compose down -v
--   docker compose up -d db

SELECT 'CREATE DATABASE app_test OWNER app'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'app_test'
) \gexec
