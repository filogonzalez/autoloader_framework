import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCurrentUser, type CurrentUser } from '../lib/api';
import { CurrentUserContext } from './context';

/**
 * Fetches the real signed-in user from `/api/me` once on mount and provides it
 * to the tree. The server derives identity from the Databricks Apps headers
 * (x-forwarded-email / -preferred-username / -user); locally it falls back to
 * the OS/CLI user. Replaces the old hardcoded sidebar identity.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load user');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ user, loading, error }), [user, loading, error]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}
