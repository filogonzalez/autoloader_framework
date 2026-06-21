import type { Request } from 'express';
import type { AppKit } from '../lib/types';

/**
 * The current viewer, derived from the Databricks Apps identity headers the
 * platform injects on EVERY request (see Apps "execution context" docs):
 *   - x-forwarded-email              → the user's email
 *   - x-forwarded-preferred-username → the user's preferred username (often the email)
 *   - x-forwarded-user               → the SCIM user id (stable identifier)
 *
 * This is NOT a translatable string — it is the real signed-in user. The client
 * `useCurrentUser` hook fetches `/api/me` and renders it in the sidebar.
 */
export interface CurrentUser {
  email: string | null;
  username: string;
  displayName: string;
}

/** Title-case a dotted/underscored handle into a human name (e.g. "first.last" → "First Last"). */
function humanize(handle: string): string {
  const localPart = handle.includes('@') ? handle.slice(0, handle.indexOf('@')) : handle;
  const words = localPart
    .split(/[._\-+\s]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ') || handle;
}

function firstHeader(req: Request, name: string): string | null {
  // req.headers is IncomingHttpHeaders (string | string[] | undefined), already
  // lowercased by Node — typed, unlike the `any`-returning req.header() overload.
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the viewer from the Apps identity headers, or `null` when no identity
 * can be established — so the caller signals that honestly instead of fabricating
 * a user.
 *
 * Fallback posture mirrors the OBO publish path: OUTSIDE production, when the
 * platform headers are absent (e.g. `npm run dev`, no Apps proxy in front), fall
 * back to the OS/CLI user for local ergonomics. IN production we NEVER fabricate
 * an identity — absent headers return `null` so a real header/identity failure
 * surfaces (the client renders "Unknown user") instead of being masked behind a
 * fake user.
 */
export function resolveCurrentUser(req: Request): CurrentUser | null {
  const email = firstHeader(req, 'x-forwarded-email');
  const preferred = firstHeader(req, 'x-forwarded-preferred-username');
  const forwardedUser = firstHeader(req, 'x-forwarded-user');

  if (email || preferred || forwardedUser) {
    // Prefer a human handle for the username/display name; fall back across the
    // three headers so we always render *something* tied to the real user.
    const username = preferred ?? email ?? forwardedUser ?? 'user';
    const nameSeed = preferred ?? (email ? email : forwardedUser) ?? username;
    return {
      email: email ?? (username.includes('@') ? username : null),
      username,
      displayName: humanize(nameSeed),
    };
  }

  // Production: do NOT fabricate an identity when the headers are missing — return
  // null so a genuine header/identity failure surfaces rather than being masked.
  if (process.env.NODE_ENV === 'production') return null;

  // Local-dev convenience ONLY: no Apps proxy injects identity headers locally, so
  // use the OS / CLI user to show a real (local) name instead of a placeholder.
  const local = process.env.DATABRICKS_USERNAME || process.env.USER || 'local-dev';
  return {
    email: local.includes('@') ? local : null,
    username: local,
    displayName: humanize(local),
  };
}

/** Register `GET /api/me` — the real signed-in user from the Apps identity headers. */
export function registerIdentityRoutes(appkit: AppKit): void {
  appkit.server.extend((app) => {
    app.get('/api/me', (req, res) => {
      const user = resolveCurrentUser(req);
      if (!user) {
        // Production with no identity headers: don't fabricate a user. 401 lets the
        // client render "Unknown user" so a real header/identity failure is visible.
        res
          .status(401)
          .json({ error: 'Identity unavailable: no Databricks Apps identity headers on the request.' });
        return;
      }
      res.json(user);
    });
  });
}
