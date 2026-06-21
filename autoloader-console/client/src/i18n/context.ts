import { createContext, useContext } from 'react';
import type { Lang, TranslationKey } from './translations';

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key into the current language. */
  t: (key: TranslationKey) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Access the current language + translator. Must be used under a LanguageProvider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
