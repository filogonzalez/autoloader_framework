import type { SourceBundle } from './api';

export type LineageTier = 'source' | 'bronze' | 'silver' | 'consumer';

export interface LineageNode {
  id: string;
  tier: LineageTier;
  label: string;
  sublabel: string | null;
  /** false = real node resolved from metadata; true = not yet wired (greyed). */
  placeholder: boolean;
}

export interface LineageGraph {
  nodes: LineageNode[];
  // Edges are intentionally omitted in v1; the 4-tier xyflow renderer + real edges
  // land alongside the downstream resolver (TODO(lineage-tiers) below).
}

/**
 * Build the Source → Bronze → Silver → Consumers lineage for one operation.
 *
 * v1 resolves only the real upstream tiers (Source, Bronze) from the operation's
 * own metadata. Silver and Consumers are returned as placeholder nodes flagged
 * `placeholder: true` so the renderer can grey them as "not yet wired".
 */
export function buildLineage(bundle: SourceBundle | null): LineageGraph {
  const source: LineageNode = {
    id: 'source',
    tier: 'source',
    label: bundle?.source.object_id ?? '—',
    sublabel: bundle?.source.file_format ?? null,
    placeholder: false,
  };
  const bronze: LineageNode = {
    id: 'bronze',
    tier: 'bronze',
    label: bundle?.target.target_table ?? '—',
    sublabel: bundle
      ? `${bundle.target.target_catalog ?? ''}.${bundle.target.target_schema ?? ''}`
      : null,
    placeholder: false,
  };
  return { nodes: [source, bronze, ...resolveDownstreamTiers()] };
}

/**
 * Resolve the downstream (Silver, Consumers) tiers for an operation.
 *
 * TODO(lineage-tiers): replace these placeholder nodes with real Silver/Consumer
 * nodes + edges resolved from Unity Catalog lineage (system.access.table_lineage)
 * or a declared mapping in metadata_console. Keep a graceful "no downstream found"
 * state. See docs/autoloader-console/ROADMAP-stubbed-features.md (Feature 2).
 */
function resolveDownstreamTiers(): LineageNode[] {
  return [
    { id: 'silver', tier: 'silver', label: '—', sublabel: null, placeholder: true },
    { id: 'consumer', tier: 'consumer', label: '—', sublabel: null, placeholder: true },
  ];
}
