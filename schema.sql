-- Smart Salary App database schema
-- Safe to run repeatedly. Does not delete existing employee/account data.

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  employee_code VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email VARCHAR(254),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill legacy email values when available; leave unknown emails NULL.
UPDATE app_users
SET email = LOWER(BTRIM(profile->>'email'))
WHERE email IS NULL AND profile ? 'email'
  AND BTRIM(COALESCE(profile->>'email', '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique_idx
  ON app_users (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_users_created_at_idx ON app_users (created_at DESC);

CREATE TABLE IF NOT EXISTS user_data (
  user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure older versions have the expected backup columns.
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Additive tables for Web Push and daily Islamic content. Existing salary/account rows remain untouched.
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 subscription JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS daily_notifications (
 id BIGSERIAL PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('quran','hadith')),
 content_date DATE NOT NULL,
 content_key TEXT NOT NULL,
 title TEXT NOT NULL,
 arabic TEXT NOT NULL,
 translation TEXT NOT NULL,
 reference TEXT NOT NULL,
 source_url TEXT NOT NULL,
 source_name TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(kind,content_date),
 UNIQUE(kind,content_key)
);
CREATE TABLE IF NOT EXISTS push_delivery_log (
 daily_id BIGINT NOT NULL REFERENCES daily_notifications(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL,
 sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(daily_id,endpoint)
);


-- Separate administrator identities; additive migration only.
CREATE TABLE IF NOT EXISTS admin_accounts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_accounts_created_idx ON admin_accounts(created_at DESC);
