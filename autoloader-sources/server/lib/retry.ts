import type { AppKit } from './types';

/**
 * Postgres SQLSTATE codes that indicate a transient connection / wake condition
 * (not a genuine query error). Lakebase scale-to-zero parks the endpoint, so the
 * first request after it sleeps can fail while the endpoint wakes up. These are
 * the codes worth retrying.
 */
const TRANSIENT_PG_CODES = new Set([
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now — server starting up (scale-to-zero wake)
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
]);

/** Node/socket-level error codes that indicate a transient connection failure. */
const TRANSIENT_NODE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** Last-resort message match for transports that don't surface a structured code. */
const TRANSIENT_MESSAGE_RE =
  /connection terminated|connection refused|connection reset|server closed the connection|the database system is (starting up|not yet accepting)|terminating connection|connect ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|timeout expired/i;

/**
 * Decide whether an error is a transient connection/wake failure worth retrying.
 * Genuine query errors (SQL syntax, constraint violations, validation) carry a
 * real SQLSTATE and must NOT be retried — retrying them just delays the failure.
 */
function isTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  if (code) {
    if (TRANSIENT_NODE_CODES.has(code)) return true;
    if (TRANSIENT_PG_CODES.has(code)) return true;
    // Any other genuine SQLSTATE (e.g. 42601 syntax_error, 23505 unique_violation)
    // is a real query error — fail fast, don't retry.
    if (/^[0-9A-Z]{5}$/.test(code)) return false;
  }
  const message = typeof e.message === 'string' ? e.message : '';
  return TRANSIENT_MESSAGE_RE.test(message);
}

export interface RetryOptions {
  /** Max total attempts (including the first). Default 4. */
  attempts?: number;
  /** Base delay in ms; backoff is exponential (base * 2^(attempt-1)). Default 250. */
  baseDelayMs?: number;
  /** Hook invoked before each retry sleep. */
  onRetry?: (err: unknown, attempt: number) => void;
}

/**
 * Run `fn`, retrying with bounded exponential backoff on transient
 * connection/wake errors only. Re-throws genuine errors immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isTransient(err)) throw err;
      opts.onRetry?.(err, attempt);
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * Lakebase query that retries the first request after a scale-to-zero wake.
 * Single reusable wrapper for every `appkit.lakebase.query(...)` call site.
 */
export function lakebaseQuery(
  appkit: AppKit,
  text: string,
  params?: unknown[],
): Promise<{ rows: Record<string, unknown>[] }> {
  return withRetry(() => appkit.lakebase.query(text, params), {
    onRetry: (err, attempt) =>
      console.warn(
        `[lakebase] transient error (attempt ${attempt}), retrying:`,
        (err as { message?: string })?.message ?? err,
      ),
  });
}
