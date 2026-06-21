import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Switch,
  Skeleton,
  Alert,
  Separator,
} from '@databricks/appkit-ui/react';
import { Plus, Pencil, UploadCloud, CheckCircle2 } from 'lucide-react';
import { SourceWizard } from '../components/SourceWizard';
import {
  fetchSources,
  publish,
  setEnabled,
  type PublishResult,
  type SourceBundle,
} from '../lib/api';

export function SourcesPage() {
  const [sources, setSources] = useState<SourceBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<SourceBundle | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  const load = () => {
    setLoading(true);
    fetchSources()
      .then(setSources)
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load sources'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditing(null);
    setWizardOpen(true);
  };
  const openEdit = (b: SourceBundle) => {
    setEditing(b);
    setWizardOpen(true);
  };

  const toggle = async (b: SourceBundle, enabled: boolean) => {
    setSources((prev) =>
      prev.map((s) =>
        s.operation.operation_id === b.operation.operation_id
          ? { ...s, operation: { ...s.operation, enabled } }
          : s,
      ),
    );
    try {
      await setEnabled(b.operation.operation_id, enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
      load();
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setPublishResult(null);
    setError(null);
    try {
      const result = await publish();
      setPublishResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const enabledCount = sources.filter((s) => s.operation.enabled).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Ingestion sources</h2>
          <p className="text-sm text-muted-foreground">
            {sources.length} sources · {enabledCount} enabled. Edits live in Lakebase; Publish syncs
            them into the Delta metadata the framework reads.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add data source
          </Button>
          <Button variant="secondary" onClick={doPublish} disabled={publishing}>
            <UploadCloud className="h-4 w-4 mr-1" />
            {publishing ? 'Publishing…' : 'Publish to framework'}
          </Button>
        </div>
      </div>

      {publishResult && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" /> Published {publishResult.published_objects} objects and{' '}
          {publishResult.published_operations} operations into {publishResult.target}.
        </Alert>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={`sk-${i}`} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!loading && sources.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sources yet. Click <span className="font-medium">Add data source</span> to register one.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {sources.map((b) => (
          <Card key={b.operation.operation_id} className={b.operation.enabled ? '' : 'opacity-60'}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-mono">{b.operation.operation_id}</CardTitle>
                <Badge variant="outline">{b.source.file_format}</Badge>
                <Badge variant="secondary">{b.operation.load_type}</Badge>
                <Badge variant="outline">{b.operation.schema_evolution_mode}</Badge>
                {b.operation.cast_all_as_string && <Badge>cast→string</Badge>}
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={b.operation.enabled}
                      onCheckedChange={(v) => toggle(b, v)}
                      aria-label="Enable operation"
                    />
                    <span className="text-xs text-muted-foreground">
                      {b.operation.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-2">
                {b.operation.description ?? b.source.description ?? '—'}
              </p>
              <Separator className="my-2" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <Detail label="Source path" value={b.source.file_path} mono />
                <Detail
                  label="Target table"
                  value={`${b.target.target_catalog}.${b.target.target_schema}.${b.target.target_table}`}
                  mono
                />
                {b.source.wildcard_pattern && <Detail label="Pattern" value={b.source.wildcard_pattern} mono />}
                {b.target.partition_cols && <Detail label="Partition by" value={b.target.partition_cols} mono />}
                {b.target.merge_keys && <Detail label="Merge keys" value={b.target.merge_keys} mono />}
                {b.source.row_tag && <Detail label="Row tag" value={b.source.row_tag} mono />}
                {b.operation.explode_key && <Detail label="Explode key" value={b.operation.explode_key} mono />}
                {b.source.object_schema && <Detail label="Explicit schema" value="yes" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SourceWizard open={wizardOpen} onOpenChange={setWizardOpen} initial={editing} onSaved={load} />
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={mono ? 'font-mono break-all' : ''}>{value ?? '—'}</span>
    </div>
  );
}
