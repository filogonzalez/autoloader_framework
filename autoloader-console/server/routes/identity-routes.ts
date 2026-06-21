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

/** Title-case a dotted/underscored handle into a human name: "diego.morales" → "Diego Morales". */
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
 * Resolve the viewer from request headers, falling back to a clearly-labelled
 * local identity when the platform headers are absent (i.e. `npm run dev`, where
 * no Apps proxy sits in front of the server).
 */
export function resolveCurrentUser(req: Request): CurrentUser {
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

  // Local-dev fallback: no Apps identity headers. Use the OS / CLI user so the
  // sidebar shows a real (local) name, never the old hardcoded 'Diego Morales'.
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
      res.json(resolveCurrentUser(req));
    });
  });
}
