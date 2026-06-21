import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Badge,
  Card,
  CardContent,
  Skeleton,
  Alert,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import { fetchSources, fetchTableDetail, type SourceBundle, type TableDetail } from '../lib/api';

interface AuditRow {
  operation_id: string;
  run_ts: string;
  status: string;
  rows_written: number;
  duration_ms: number;
}
interface ColumnRow {
  table_name: string;
  column_name: string;
  full_data_type: string;
  is_nullable: string;
  ordinal_position: number;
}
interface TableRowT {
  table_name: string;
  table_type: string;
  data_source_format: string;
}

const FRAMEWORK_ID = 'framework';

export function LineagePage() {
  const [sources, setSources] = useState<SourceBundle[]>([]);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SourceBundle | null>(null);

  useEffect(() => {
    fetchSources()
      .then(setSources)
      .catch((e) => setSourcesError(e instanceof Error ? e.message : 'Failed to load sources'));
  }, []);

  const tablesQ = useAnalyticsQuery('bronze_tables', {});
  const auditQ = useAnalyticsQuery('audit_latest', {});
  const columnsQ = useAnalyticsQuery('bronze_columns', {});

  const existingTables = useMemo(
    () => new Set(((tablesQ.data as TableRowT[] | undefined) ?? []).map((t) => t.table_name)),
    [tablesQ.data],
  );
  const auditByOp = useMemo(() => {
    const m = new Map<string, AuditRow>();
    for (const r of (auditQ.data as AuditRow[] | undefined) ?? []) m.set(r.operation_id, r);
    return m;
  }, [auditQ.data]);

  const { nodes, edges } = useMemo(
    () => buildGraph(sources, existingTables),
    [sources, existingTables],
  );

  const onNodeClick = (_e: React.MouseEvent, node: Node) => {
    const opId = node.data?.operationId as string | undefined;
    if (opId) {
      const bundle = sources.find((s) => s.operation.operation_id === opId);
      if (bundle) setSelected(bundle);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Tables &amp; Lineage</h2>
        <p className="text-sm text-muted-foreground">
          Every source fans out through the metadata-driven framework into its Bronze table. Click a
          Bronze node for live schema, physical specs, and last-run status.
        </p>
      </div>

      {sourcesError && <Alert variant="destructive">{sourcesError}</Alert>}
      {tablesQ.error && (
        <Alert variant="destructive">
          Bronze tables query failed (check warehouse + SP grants): {tablesQ.error}
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <div style={{ height: 560 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              fitView
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <LegendDot className="bg-primary" label="Source / landing" />
        <LegendDot className="bg-[#4462c9]" label="Ingestion framework" />
        <LegendDot className="bg-emerald-600" label="Bronze table (ingested)" />
        <LegendDot className="bg-muted-foreground/40" label="Not yet ingested" />
      </div>

      <DetailPanel
        bundle={selected}
        onClose={() => setSelected(null)}
        exists={selected ? existingTables.has(selected.target.target_table ?? '') : false}
        audit={selected ? auditByOp.get(selected.operation.operation_id) ?? null : null}
        columns={(columnsQ.data as ColumnRow[] | undefined) ?? []}
        columnsLoading={columnsQ.loading}
      />
    </div>
  );
}

function buildGraph(
  sources: SourceBundle[],
  existingTables: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const n = Math.max(sources.length, 1);
  const rowGap = 96;
  const height = n * rowGap;
  const centerY = height / 2 - 20;

  nodes.push({
    id: FRAMEWORK_ID,
    position: { x: 430, y: centerY },
    data: { label: 'Ingestion framework\n(10_ingestion_framework.py)' },
    style: {
      background: '#4462c9',
      color: 'white',
      border: 'none',
      borderRadius: 8,
      fontSize: 12,
      width: 200,
      whiteSpace: 'pre-line',
      textAlign: 'center',
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });

  sources.forEach((b, i) => {
    const y = i * rowGap;
    const srcId = `src:${b.operation.operation_id}`;
    const tgtId = `tgt:${b.operation.operation_id}`;
    const table = b.target.target_table ?? '';
    const ingested = existingTables.has(table);

    nodes.push({
      id: srcId,
      position: { x: 0, y },
      data: { label: `${b.source.object_id}\n${b.source.file_format} · ${b.source.wildcard_pattern ?? ''}` },
      style: {
        background: '#40d1f5',
        color: '#0B2026',
        border: 'none',
        borderRadius: 8,
        fontSize: 11,
        width: 220,
        whiteSpace: 'pre-line',
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    nodes.push({
      id: tgtId,
      position: { x: 860, y },
      data: {
        label: `${table}\n${ingested ? 'bronze table' : 'not yet ingested'}`,
        operationId: b.operation.operation_id,
      },
      style: {
        background: ingested ? '#059669' : '#e5e7eb',
        color: ingested ? 'white' : '#6b7280',
        border: 'none',
        borderRadius: 8,
        fontSize: 11,
        width: 200,
        whiteSpace: 'pre-line',
        cursor: 'pointer',
        opacity: b.operation.enabled ? 1 : 0.5,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    edges.push({
      id: `e-src-fw-${b.operation.operation_id}`,
      source: srcId,
      target: FRAMEWORK_ID,
      label: b.source.file_format,
      animated: b.operation.enabled,
      style: { stroke: '#94a3b8' },
      labelStyle: { fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    edges.push({
      id: `e-fw-tgt-${b.operation.operation_id}`,
      source: FRAMEWORK_ID,
      target: tgtId,
      label: `${b.operation.load_type} · ${b.operation.schema_evolution_mode}${
        b.operation.cast_all_as_string ? ' · cast→str' : ''
      }`,
      animated: b.operation.enabled && existingTables.has(table),
      style: { stroke: ingested ? '#059669' : '#cbd5e1' },
      labelStyle: { fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  return { nodes, edges };
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function DetailPanel({
  bundle,
  onClose,
  exists,
  audit,
  columns,
  columnsLoading,
}: {
  bundle: SourceBundle | null;
  onClose: () => void;
  exists: boolean;
  audit: AuditRow | null;
  columns: ColumnRow[];
  columnsLoading: boolean;
}) {
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const table = bundle?.target.target_table ?? '';

  useEffect(() => {
    if (!bundle || !exists || !table) {
      // Intentional reset-on-dependency-change: clear stale physical specs when the
      // selected table becomes invalid/changes. Guarded by deps, so no render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    fetchTableDetail(table)
      .then(setDetail)
      .catch((e) => setDetailError(e instanceof Error ? e.message : 'Failed to load detail'))
      .finally(() => setDetailLoading(false));
  }, [bundle, exists, table]);

  const tableColumns = useMemo(
    () => columns.filter((c) => c.table_name === table).sort((a, b) => a.ordinal_position - b.ordinal_position),
    [columns, table],
  );

  return (
    <Sheet open={bundle !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {bundle && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{table}</SheetTitle>
              <SheetDescription>
                {bundle.target.target_catalog}.{bundle.target.target_schema}.{table}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 mt-4">
              {!exists && (
                <Alert>
                  Not yet ingested. This operation is published but its Bronze table does not exist
                  yet — run the framework job to materialize it.
                </Alert>
              )}

              {/* Last run */}
              <section>
                <h4 className="text-sm font-semibold mb-2">Last run</h4>
                {audit ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={audit.status === 'SUCCESS' ? 'default' : 'destructive'}>
                      {audit.status}
                    </Badge>
                    <span className="text-muted-foreground">{audit.run_ts}</span>
                    <span>· {Number(audit.rows_written).toLocaleString()} rows</span>
                    <span>· {Number(audit.duration_ms).toLocaleString()} ms</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No audit record yet.</p>
                )}
              </section>

              <Separator />

              {/* Declared specs */}
              <section>
                <h4 className="text-sm font-semibold mb-2">Declared ingestion specs</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Spec label="Format" value={bundle.source.file_format} />
                  <Spec label="Load type" value={bundle.operation.load_type} />
                  <Spec label="Evolution" value={bundle.operation.schema_evolution_mode} />
                  <Spec label="Cast all as string" value={String(bundle.operation.cast_all_as_string)} />
                  <Spec label="Merge keys" value={bundle.target.merge_keys} />
                  <Spec label="Partition cols" value={bundle.target.partition_cols} />
                  <Spec label="Source path" value={bundle.source.file_path} />
                  <Spec label="Explode key" value={bundle.operation.explode_key} />
                </div>
              </section>

              <Separator />

              {/* Physical specs */}
              <section>
                <h4 className="text-sm font-semibold mb-2">Physical specs (DESCRIBE DETAIL)</h4>
                {detailLoading && <Skeleton className="h-20 w-full" />}
                {detailError && <p className="text-xs text-destructive">{detailError}</p>}
                {!detailLoading && !detail && exists && (
                  <p className="text-sm text-muted-foreground">No detail available.</p>
                )}
                {!exists && <p className="text-sm text-muted-foreground">—</p>}
                {detail && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <Spec label="Format" value={detail.format} />
                    <Spec label="Partition columns" value={detail.partitionColumns} />
                    <Spec label="Num files" value={detail.numFiles} />
                    <Spec label="Size (bytes)" value={detail.sizeInBytes} />
                    <Spec label="Location" value={detail.location} mono />
                  </div>
                )}
              </section>

              <Separator />

              {/* Live schema */}
              <section>
                <h4 className="text-sm font-semibold mb-2">
                  Live schema {tableColumns.length > 0 && `(${tableColumns.length} columns)`}
                </h4>
                {columnsLoading && <Skeleton className="h-24 w-full" />}
                {!columnsLoading && tableColumns.length === 0 && (
                  <p className="text-sm text-muted-foreground">No columns (table not ingested).</p>
                )}
                {tableColumns.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Column</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Nullable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableColumns.map((c) => {
                        const isAudit = c.column_name.startsWith('_');
                        return (
                          <TableRow key={c.column_name}>
                            <TableCell className="font-mono text-xs">
                              {c.column_name}
                              {isAudit && (
                                <Badge variant="outline" className="ml-2">
                                  audit
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{c.full_data_type}</TableCell>
                            <TableCell className="text-xs">{c.is_nullable}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Spec({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono break-all' : 'break-all'}>{value ?? '—'}</span>
    </div>
  );
}
