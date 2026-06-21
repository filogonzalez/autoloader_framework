// ES/EN translation table for the Autoloader Console shell.
//
// Phase 0 scope: shell chrome (sidebar, breadcrumb, CTAs) + per-view page titles
// and placeholders. Per-view body strings (tables, KPI cards, wizard steps) are
// filled in Phase 1 — the mechanism (LanguageProvider + useT) is fully wired now.
// Default language is Spanish (es), matching the design mockup.

export type Lang = 'es' | 'en';

export const LANGS: Lang[] = ['es', 'en'];

const en = {
  // Brand / sidebar
  'brand.wordmark': 'Scotiabank',
  'brand.subtitle': 'DATA · LATAM',
  'nav.section': 'PLATFORM',
  'nav.overview': 'Overview',
  'nav.operations': 'Operations',
  'nav.detail': 'Detail',
  'nav.onboarding': 'Onboarding',
  'nav.observability': 'Observability',
  'nav.open': 'Open navigation',
  'user.name': 'Diego Morales',
  'user.role': 'Data Engineering',

  // Top bar / chrome
  'chrome.breadcrumbRoot': 'scotia_latam',
  'chrome.frameworkActive': 'Framework active',
  'chrome.newOperation': 'New operation',

  // Common stub copy
  'common.phase0Badge': 'Phase 0 · shell',
  'common.phase0Body': 'This view is a working stub. Full content arrives in a later phase.',

  // Overview
  'overview.title': 'Overview',
  'overview.subtitle': 'Ingestion overview',

  // Operations
  'operations.title': 'Operations',
  'operations.subtitle': 'Ingestion operations',

  // Detail
  'detail.title': 'Operation detail',
  'detail.subtitle': 'Lineage & ingestion specs',
  'detail.runNow': 'Run now',
  'detail.runNowHint': 'Simulated in Phase 0 (no real compute)',
  'detail.runResult': 'Result',

  // Onboarding
  'onboarding.title': 'Onboarding',
  'onboarding.subtitle': 'Source onboarding',

  // Observability
  'observability.title': 'Observability',
  'observability.subtitle': 'Observability & audit log',

  // Lineage tiers (Detail)
  'lineage.title': 'Data lineage · Unity Catalog',
  'lineage.tier.source': 'Source',
  'lineage.tier.bronze': 'Bronze',
  'lineage.tier.silver': 'Silver',
  'lineage.tier.consumer': 'Consumers',
  'lineage.live': 'live',
  'lineage.placeholder': 'not yet wired',
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  // Brand / sidebar
  'brand.wordmark': 'Scotiabank',
  'brand.subtitle': 'DATA · LATAM',
  'nav.section': 'PLATAFORMA',
  'nav.overview': 'Resumen',
  'nav.operations': 'Operaciones',
  'nav.detail': 'Detalle',
  'nav.onboarding': 'Onboarding',
  'nav.observability': 'Observabilidad',
  'nav.open': 'Abrir navegación',
  'user.name': 'Diego Morales',
  'user.role': 'Data Engineering',

  // Top bar / chrome
  'chrome.breadcrumbRoot': 'scotia_latam',
  'chrome.frameworkActive': 'Framework activo',
  'chrome.newOperation': 'Nueva operación',

  // Common stub copy
  'common.phase0Badge': 'Fase 0 · esqueleto',
  'common.phase0Body': 'Esta vista es un stub funcional. El contenido completo llega en una fase posterior.',

  // Overview
  'overview.title': 'Resumen',
  'overview.subtitle': 'Resumen de ingesta',

  // Operations
  'operations.title': 'Operaciones',
  'operations.subtitle': 'Operaciones de ingesta',

  // Detail
  'detail.title': 'Detalle de operación',
  'detail.subtitle': 'Linaje y especificaciones de ingesta',
  'detail.runNow': 'Ejecutar ahora',
  'detail.runNowHint': 'Simulado en la Fase 0 (sin cómputo real)',
  'detail.runResult': 'Resultado',

  // Onboarding
  'onboarding.title': 'Onboarding',
  'onboarding.subtitle': 'Onboarding de fuente',

  // Observability
  'observability.title': 'Observabilidad',
  'observability.subtitle': 'Observabilidad & audit log',

  // Lineage tiers (Detail)
  'lineage.title': 'Linaje de datos · Unity Catalog',
  'lineage.tier.source': 'Fuente',
  'lineage.tier.bronze': 'Bronze',
  'lineage.tier.silver': 'Silver',
  'lineage.tier.consumer': 'Consumidores',
  'lineage.live': 'en vivo',
  'lineage.placeholder': 'no conectado aún',
};

export const translations: Record<Lang, Record<TranslationKey, string>> = { en, es };

/** Look up a key for a language, falling back to English then the raw key. */
export function translate(lang: Lang, key: TranslationKey): string {
  return translations[lang][key] ?? translations.en[key] ?? key;
}
