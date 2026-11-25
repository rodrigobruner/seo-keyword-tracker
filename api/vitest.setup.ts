// Safe defaults so env validation passes in unit tests (no real services needed).
// Integration tests that touch a real database are gated by RUN_DB_TESTS.
process.env.NODE_ENV ??= 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0123';
process.env.DATABASE_URL ??= 'postgres://app:app@127.0.0.1:5432/seo_tracker_test';
process.env.APP_TIMEZONE ??= 'America/Toronto';
