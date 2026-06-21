import { createContext, useContext } from 'react';
import type { CurrentUser } from '../lib/api';

export interface CurrentUserContextValue {
  /** The signed-in user, or null while loading / on error. */
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
}

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/** Access the current signed-in user. Must be used under a CurrentUserProvider. */
export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  return ctx;
}

/** Avatar initials: first letters of the first two words, uppercased (one word → its first two letters; empty → "?"). */
export function initials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
