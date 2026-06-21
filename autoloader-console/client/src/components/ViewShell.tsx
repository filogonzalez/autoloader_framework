import type { ReactNode } from 'react';
import { Badge } from '@databricks/appkit-ui/react';
import { useLanguage } from '../i18n/context';
import type { TranslationKey } from '../i18n/translations';

/**
 * Shared page scaffold for the Phase 0 view stubs: heading + subtitle + a
 * "Phase 0 · shell" badge and placeholder line. Pages pass view-specific content
 * as children (e.g. the Detail view's lineage tiers + run-now seam).
 */
export function ViewShell({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: TranslationKey;
  subtitleKey: TranslationKey;
  children?: ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t(titleKey)}</h2>
          <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
        </div>
        <Badge variant="outline">{t('common.phase0Badge')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('common.phase0Body')}</p>
      {children}
    </div>
  );
}
