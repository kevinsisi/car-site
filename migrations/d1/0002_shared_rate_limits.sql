CREATE TABLE shared_rate_limits (
  limiter TEXT NOT NULL CHECK (limiter IN ('login', 'sell')),
  limiter_key TEXT NOT NULL CHECK (length(CAST(limiter_key AS BLOB)) BETWEEN 1 AND 256),
  count INTEGER NOT NULL CHECK (count > 0),
  window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
  locked_until INTEGER NOT NULL DEFAULT 0 CHECK (locked_until >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
  PRIMARY KEY (limiter, limiter_key)
);

CREATE INDEX shared_rate_limits_expiry_idx ON shared_rate_limits(expires_at);
