// Unit tests import modules that call loadEnv() at import time. Provide harmless placeholders
// (only when unset) so the suite runs without a real .env, database or secrets.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough";
