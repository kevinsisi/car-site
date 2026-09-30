/** Minimal Cloudflare D1 API surface needed by this request-scoped limiter. */
export interface D1RateLimitBinding {
  prepare(query: string): D1RateLimitStatement;
  batch<T = unknown>(statements: D1RateLimitStatement[]): Promise<D1RateLimitResult<T>[]>;
}

interface D1RateLimitStatement {
  bind(...values: (string | number)[]): D1RateLimitStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1RateLimitResult<T>>;
  run<T = unknown>(): Promise<D1RateLimitResult<T>>;
}

interface D1RateLimitResult<T> {
  success?: boolean;
  meta?: { changes?: number };
  results?: T[];
}

export interface SharedRateLimiter {
  isLocked(key: string, now: number): Promise<boolean>;
  recordFailure(key: string, now: number): Promise<void>;
  clear(key: string): Promise<void>;
  consumeAttempt(key: string, now: number): Promise<boolean>;
}

const MAX_KEY_BYTES = 256;
const MAX_ROWS = 10_000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const SELL_WINDOW_MS = 60 * 60 * 1000;

function normalizeKey(key: string): string {
  if (typeof key !== 'string' || !Number.isSafeInteger(key.length)) throw new Error('Invalid limiter key');
  const normalized = key.trim().normalize('NFKC');
  if (!normalized || new TextEncoder().encode(normalized).byteLength > MAX_KEY_BYTES) throw new Error('Invalid limiter key');
  return normalized;
}

function validNow(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid limiter timestamp');
  return now;
}

/**
 * D1 batch() executes its statements sequentially as one transaction. This
 * prevents another batch from interleaving between pruning and the conditional
 * write. The quota decision is atomic at D1 transaction scope; it is not a
 * promise of globally strict serialization across independently replicated DBs.
 */
export function createD1RateLimiter(db: D1RateLimitBinding): SharedRateLimiter {
  async function prune(now: number): Promise<void> {
    await db.prepare('DELETE FROM shared_rate_limits WHERE expires_at <= ?').bind(now).run();
  }

  async function isLocked(key: string, now: number): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const timestamp = validNow(now);
    await prune(timestamp);
    const row = await db.prepare(
      "SELECT locked_until FROM shared_rate_limits WHERE limiter = 'login' AND limiter_key = ?",
    ).bind(normalizedKey).first<{ locked_until: number }>();
    return row !== null && row.locked_until > timestamp;
  }

  async function recordFailure(key: string, now: number): Promise<void> {
    const normalizedKey = normalizeKey(key);
    const timestamp = validNow(now);
    const write = db.prepare(`
      INSERT INTO shared_rate_limits (limiter, limiter_key, count, window_started_at, locked_until, expires_at)
      SELECT 'login', ?, 1, ?, 0, ?
      WHERE EXISTS (SELECT 1 FROM shared_rate_limits WHERE limiter = 'login' AND limiter_key = ?)
         OR (SELECT COUNT(*) FROM shared_rate_limits) < ${MAX_ROWS}
      ON CONFLICT (limiter, limiter_key) DO UPDATE SET
        count = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at > ${LOGIN_WINDOW_MS} THEN 1 ELSE shared_rate_limits.count + 1 END,
        window_started_at = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at > ${LOGIN_WINDOW_MS} THEN excluded.window_started_at ELSE shared_rate_limits.window_started_at END,
        locked_until = CASE WHEN (CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at > ${LOGIN_WINDOW_MS} THEN 1 ELSE shared_rate_limits.count + 1 END) >= ${LOGIN_MAX_FAILURES} THEN excluded.window_started_at + ${LOGIN_LOCKOUT_MS} ELSE shared_rate_limits.locked_until END,
        expires_at = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at > ${LOGIN_WINDOW_MS} THEN excluded.window_started_at + ${LOGIN_WINDOW_MS} + ${LOGIN_LOCKOUT_MS} ELSE MAX(shared_rate_limits.expires_at, excluded.window_started_at + ${LOGIN_WINDOW_MS} + ${LOGIN_LOCKOUT_MS}) END
      RETURNING limiter_key
    `).bind(normalizedKey, timestamp, timestamp + LOGIN_WINDOW_MS + LOGIN_LOCKOUT_MS, normalizedKey);
    const results = await db.batch([db.prepare('DELETE FROM shared_rate_limits WHERE expires_at <= ?').bind(timestamp), write]);
    if (results[1]?.results?.length !== 1) throw new Error('Limiter unavailable or full');
  }

  async function clear(key: string): Promise<void> {
    const normalizedKey = normalizeKey(key);
    await db.prepare("DELETE FROM shared_rate_limits WHERE limiter = 'login' AND limiter_key = ?").bind(normalizedKey).run();
  }

  async function consumeAttempt(key: string, now: number): Promise<boolean> {
    const normalizedKey = normalizeKey(key);
    const timestamp = validNow(now);
    const insert = db.prepare(`
      INSERT INTO shared_rate_limits (limiter, limiter_key, count, window_started_at, locked_until, expires_at)
      SELECT 'sell', ?, 1, ?, 0, ?
      WHERE EXISTS (SELECT 1 FROM shared_rate_limits WHERE limiter = 'sell' AND limiter_key = ?)
         OR (SELECT COUNT(*) FROM shared_rate_limits) < ${MAX_ROWS}
      ON CONFLICT (limiter, limiter_key) DO UPDATE SET
        count = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at >= ${SELL_WINDOW_MS} THEN 1 ELSE shared_rate_limits.count + 1 END,
        window_started_at = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at >= ${SELL_WINDOW_MS} THEN excluded.window_started_at ELSE shared_rate_limits.window_started_at END,
        expires_at = CASE WHEN excluded.window_started_at - shared_rate_limits.window_started_at >= ${SELL_WINDOW_MS} THEN excluded.window_started_at + ${SELL_WINDOW_MS} ELSE shared_rate_limits.expires_at END
      WHERE shared_rate_limits.count < 5 OR excluded.window_started_at - shared_rate_limits.window_started_at >= ${SELL_WINDOW_MS}
      RETURNING limiter_key
    `).bind(normalizedKey, timestamp, timestamp + SELL_WINDOW_MS, normalizedKey);
    const results = await db.batch([db.prepare('DELETE FROM shared_rate_limits WHERE expires_at <= ?').bind(timestamp), insert]);
    return results[1]?.results?.length === 1;
  }

  return { isLocked, recordFailure, clear, consumeAttempt };
}

/** Fail closed on malformed input, unavailable D1, or exhausted capacity. */
export async function checkSharedLimit(limiter: SharedRateLimiter | undefined, key: string, now: number): Promise<boolean> {
  if (!limiter) return true;
  try { return await limiter.isLocked(key, now); } catch { return true; }
}

export async function recordSharedFailure(limiter: SharedRateLimiter | undefined, key: string, now: number): Promise<boolean> {
  if (!limiter) return false;
  try { await limiter.recordFailure(key, now); return true; } catch { return false; }
}

export async function clearSharedLimit(limiter: SharedRateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  try { await limiter.clear(key); return true; } catch { return false; }
}

export async function consumeSharedAttempt(limiter: SharedRateLimiter | undefined, key: string, now: number): Promise<boolean> {
  if (!limiter) return false;
  try { return await limiter.consumeAttempt(key, now); } catch { return false; }
}
