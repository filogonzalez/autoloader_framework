import {
  LayoutDashboard,
  Database,
  Network,
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

// Console views. Sources (CRUD + publish) and Lineage (tables & lineage graph) are
// the fully-built views; Overview and Observability remain Phase-0 stubs (their real
// content lands in a later phase — see docs/autoloader-console/ROADMAP-stubbed-features.md).
// Detail hosts the run-now + lineage-tier seams.
export const NAV_VIEWS: NavView[] = [
  {
    path: '/',
    navKey: 'nav.overview',
    titleKey: 'overview.title',
    subtitleKey: 'overview.subtitle',
    icon: LayoutDashboard,
  },
  {
    path: '/sources',
    navKey: 'nav.sources',
    titleKey: 'sources.title',
    subtitleKey: 'sources.subtitle',
    icon: Database,
  },
  {
    path: '/lineage',
    navKey: 'nav.lineage',
    titleKey: 'lineage.title',
    subtitleKey: 'lineage.subtitle',
    icon: Network,
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
