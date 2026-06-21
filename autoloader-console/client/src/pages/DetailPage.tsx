import { useState } from 'react';
import { Alert, Badge, Button } from '@databricks/appkit-ui/react';
import { ViewShell } from '../components/ViewShell';
import { useLanguage } from '../i18n/context';
import type { TranslationKey } from '../i18n/translations';
import { buildLineage, type LineageNode } from '../lib/lineage';
import { runOperation, type RunResult } from '../lib/api';

// Placeholder operation id for the Phase 0 run-now demo. Phase 1 drives this from
// the selected operation (e.g. a /operations/:id route).
const DEMO_OPERATION_ID = 'demo_operation';

function tierLabelKey(tier: LineageNode['tier']): TranslationKey {
  switch (tier) {
    case 'source':
      return 'lineage.tier.source';
    case 'bronze':
      return 'lineage.tier.bronze';
    case 'silver':
      return 'lineage.tier.silver';
    case 'consumer':
      return 'lineage.tier.consumer';
  }
}

export function DetailPage() {
  const { t } = useLanguage();
  const { nodes } = buildLineage(null);

  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRun = () => {
    setRunning(true);
    setError(null);
    runOperation(DEMO_OPERATION_ID)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Run failed'))
      .finally(() => setRunning(false));
  };

  return (
    <ViewShell titleKey="detail.title" subtitleKey="detail.subtitle">
      {/* Run-now seam — calls the stubbed POST /api/operations/:id/run (TODO(run-now)). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onRun}
          disabled={running}
          className="bg-[#ec111a] text-white hover:bg-[#c20f17]"
        >
          {t('detail.runNow')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('detail.runNowHint')}</span>
        {result && (
          <Badge variant="outline" className="font-mono">
            {t('detail.runResult')}: {result.status} · {result.run_id}
          </Badge>
        )}
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Lineage tiers — Source/Bronze real; Silver/Consumers placeholder (TODO(lineage-tiers)). */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t('lineage.title')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`rounded-lg border p-3 ${node.placeholder ? 'opacity-50' : ''}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(tierLabelKey(node.tier))}
              </div>
              <div className="mt-1 truncate font-mono text-sm text-foreground">{node.label}</div>
              {node.sublabel && (
                <div className="truncate text-[11px] text-muted-foreground">{node.sublabel}</div>
              )}
              <div className="mt-2 text-[10px] text-muted-foreground">
                {node.placeholder ? t('lineage.placeholder') : t('lineage.live')}
              </div>
            </div>
          ))}
        </div>
      </section>
    </ViewShell>
  );
}
