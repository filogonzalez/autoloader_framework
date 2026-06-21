import {
  LayoutDashboard,
  Database,
  FileSearch,
  PlusCircle,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import type { TranslationKey } from './i18n/translations';

/** One entry per Console view. Drives the sidebar, the router, and the breadcrumb. */
export interface NavView {
  path: string;
  navKey: TranslationKey; // sidebar label
  titleKey: TranslationKey; // page heading + breadcrumb leaf
  subtitleKey: TranslationKey;
  icon: LucideIcon;
}

// The five Phase 0 views. Detail is a sidebar entry here; in a later phase it also
// becomes an operation drill-down (e.g. /operations/:id) per the design.
export const NAV_VIEWS: NavView[] = [
  {
    path: '/',
    navKey: 'nav.overview',
    titleKey: 'overview.title',
    subtitleKey: 'overview.subtitle',
    icon: LayoutDashboard,
  },
  {
    path: '/operations',
    navKey: 'nav.operations',
    titleKey: 'operations.title',
    subtitleKey: 'operations.subtitle',
    icon: Database,
  },
  {
    path: '/detail',
    navKey: 'nav.detail',
    titleKey: 'detail.title',
    subtitleKey: 'detail.subtitle',
    icon: FileSearch,
  },
  {
    path: '/onboarding',
    navKey: 'nav.onboarding',
    titleKey: 'onboarding.title',
    subtitleKey: 'onboarding.subtitle',
    icon: PlusCircle,
  },
  {
    path: '/observability',
    navKey: 'nav.observability',
    titleKey: 'observability.title',
    subtitleKey: 'observability.subtitle',
    icon: Activity,
  },
];
