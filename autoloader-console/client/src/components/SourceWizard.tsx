import { useMemo, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Textarea,
  Switch,
  Separator,
  Badge,
  Alert,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@databricks/appkit-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import {
  EVOLUTION_MODES,
  FILE_FORMATS,
  LOAD_TYPES,
  UC_CATALOG,
  DEFAULT_VOLUME_ROOT,
  createSource,
  updateSource,
  type SourceBundle,
  type ValidationIssue,
} from '../lib/api';

const SCHEMA_COL_TYPES = ['string', 'integer', 'long', 'double', 'boolean', 'date', 'timestamp'];

interface SchemaCol {
  name: string;
  type: string;
  nullable: boolean;
}

interface FormState {
  // source
  source_object_id: string;
  file_path: string;
  wildcard_pattern: string;
  file_format: string;
  storage_account: string;
  container: string;
  row_tag: string;
  delimiter: string;
  encoding: string;
  null_value: string;
  source_description: string;
  use_schema: boolean;
  schema_cols: SchemaCol[];
  // target
  target_object_id: string;
  target_catalog: string;
  target_schema: string;
  target_table: string;
  table_path: string;
  partition_cols: string;
  merge_keys: string;
  target_description: string;
  // operation
  operation_id: string;
  enabled: boolean;
  load_type: string;
  merge_schema: boolean;
  schema_evolution_mode: string;
  cast_all_as_string: boolean;
  multiline: boolean;
  case_sensitive: boolean;
  max_files_per_trigger: string;
  explode_key: string;
  operation_description: string;
}

function emptyForm(): FormState {
  return {
    source_object_id: '',
    file_path: '',
    wildcard_pattern: '',
    file_format: 'csv',
    storage_account: '',
    container: '',
    row_tag: '',
    delimiter: '',
    encoding: '',
    null_value: '',
    source_description: '',
    use_schema: false,
    schema_cols: [{ name: '', type: 'string', nullable: true }],
    target_object_id: '',
    target_catalog: UC_CATALOG,
    target_schema: 'bronze',
    target_table: '',
    table_path: '',
    partition_cols: '',
    merge_keys: '',
    target_description: '',
    operation_id: '',
    enabled: true,
    load_type: 'append',
    merge_schema: true,
    schema_evolution_mode: 'addNewColumns',
    cast_all_as_string: false,
    multiline: false,
    case_sensitive: false,
    max_files_per_trigger: '1000',
    explode_key: '',
    operation_description: '',
  };
}

function buildSchemaJson(cols: SchemaCol[]): string {
  const fields = cols
    .filter((c) => c.name.trim().length > 0)
    .map((c) => ({ name: c.name.trim(), type: c.type, nullable: c.nullable, metadata: {} }));
  return JSON.stringify({ type: 'struct', fields });
}

function parseSchemaCols(raw: string | null): SchemaCol[] {
  if (!raw) return [{ name: '', type: 'string', nullable: true }];
  try {
    const parsed = JSON.parse(raw) as { fields?: { name: string; type: string; nullable?: boolean }[] };
    const cols = (parsed.fields ?? []).map((f) => ({
      name: f.name,
      type: typeof f.type === 'string' ? f.type : 'string',
      nullable: f.nullable ?? true,
    }));
    return cols.length > 0 ? cols : [{ name: '', type: 'string', nullable: true }];
  } catch {
    return [{ name: '', type: 'string', nullable: true }];
  }
}

function fromBundle(b: SourceBundle): FormState {
  const f = emptyForm();
  return {
    ...f,
    source_object_id: b.source.object_id,
    file_path: b.source.file_path ?? '',
    wildcard_pattern: b.source.wildcard_pattern ?? '',
    file_format: b.source.file_format ?? 'csv',
    storage_account: b.source.storage_account ?? '',
    container: b.source.container ?? '',
    row_tag: b.source.row_tag ?? '',
    delimiter: b.source.delimiter ?? '',
    encoding: b.source.encoding ?? '',
    null_value: b.source.null_value ?? '',
    source_description: b.source.description ?? '',
    use_schema: Boolean(b.source.object_schema),
    schema_cols: parseSchemaCols(b.source.object_schema),
    target_object_id: b.target.object_id,
    target_catalog: b.target.target_catalog ?? UC_CATALOG,
    target_schema: b.target.target_schema ?? 'bronze',
    target_table: b.target.target_table ?? '',
    table_path: b.target.table_path ?? '',
    partition_cols: b.target.partition_cols ?? '',
    merge_keys: b.target.merge_keys ?? '',
    target_description: b.target.description ?? '',
    operation_id: b.operation.operation_id,
    enabled: b.operation.enabled,
    load_type: b.operation.load_type,
    merge_schema: b.operation.merge_schema,
    schema_evolution_mode: b.operation.schema_evolution_mode,
    cast_all_as_string: b.operation.cast_all_as_string,
    multiline: b.operation.multiline,
    case_sensitive: b.operation.case_sensitive,
    max_files_per_trigger:
      b.operation.max_files_per_trigger == null ? '' : String(b.operation.max_files_per_trigger),
    explode_key: b.operation.explode_key ?? '',
    operation_description: b.operation.description ?? '',
  };
}

const nz = (s: string): string | null => (s.trim().length === 0 ? null : s.trim());

function toBundle(f: FormState): SourceBundle {
  const objectSchema = f.use_schema ? buildSchemaJson(f.schema_cols) : null;
  const isCsv = f.file_format === 'csv';
  const isXml = f.file_format === 'xml';
  const isJsonish = f.file_format === 'json' || f.file_format === 'jsonl';
  return {
    source: {
      object_id: f.source_object_id.trim(),
      storage_account: nz(f.storage_account),
      container: nz(f.container),
      file_path: f.file_path.trim(),
      wildcard_pattern: nz(f.wildcard_pattern),
      file_format: f.file_format,
      row_tag: isXml ? nz(f.row_tag) : null,
      object_schema: objectSchema,
      delimiter: isCsv ? nz(f.delimiter) : null,
      encoding: isCsv ? nz(f.encoding) : null,
      null_value: isCsv ? nz(f.null_value) : null,
      description: nz(f.source_description),
    },
    target: {
      object_id: f.target_object_id.trim(),
      target_catalog: f.target_catalog.trim(),
      target_schema: f.target_schema.trim(),
      target_table: f.target_table.trim(),
      table_path: nz(f.table_path),
      partition_cols: nz(f.partition_cols),
      merge_keys: nz(f.merge_keys),
      description: nz(f.target_description),
    },
    operation: {
      operation_id: f.operation_id.trim(),
      enabled: f.enabled,
      source_object_id: f.source_object_id.trim(),
      target_object_id: f.target_object_id.trim(),
      load_type: f.load_type,
      merge_schema: f.merge_schema,
      schema_evolution_mode: f.use_schema ? 'none' : f.schema_evolution_mode,
      cast_all_as_string: f.cast_all_as_string,
      multiline: f.multiline,
      case_sensitive: f.case_sensitive,
      max_files_per_trigger: f.max_files_per_trigger.trim() === '' ? null : Number(f.max_files_per_trigger),
      explode_key: isJsonish ? nz(f.explode_key) : null,
      description: nz(f.operation_description),
    },
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SourceBundle | null;
  onSaved: () => void;
}

export function SourceWizard({ open, onOpenChange, initial, onSaved }: Props) {
  const isEdit = initial !== null;
  const [form, setForm] = useState<FormState>(() => (initial ? fromBundle(initial) : emptyForm()));
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the dialog opens for a different record.
  const key = `${open}-${initial?.operation.operation_id ?? 'new'}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm(initial ? fromBundle(initial) : emptyForm());
    setIssues([]);
    setError(null);
  }

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isCsv = form.file_format === 'csv';
  const isXml = form.file_format === 'xml';
  const isJsonish = form.file_format === 'json' || form.file_format === 'jsonl';
  const isMerge = form.load_type === 'merge';

  const preview = useMemo(() => toBundle(form), [form]);

  const issueFor = (path: string): string | undefined =>
    issues.find((i) => i.path.join('.').endsWith(path))?.message;

  const submit = async () => {
    setSubmitting(true);
    setIssues([]);
    setError(null);
    try {
      const bundle = toBundle(form);
      if (isEdit) {
        await updateSource(bundle);
      } else {
        await createSource(bundle);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const err = e as Error & { issues?: ValidationIssue[] };
      if (err.issues && err.issues.length > 0) {
        setIssues(err.issues);
        setError('Please fix the highlighted fields.');
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const addSchemaCol = () =>
    set('schema_cols', [...form.schema_cols, { name: '', type: 'string', nullable: true }]);
  const removeSchemaCol = (idx: number) =>
    set(
      'schema_cols',
      form.schema_cols.filter((_, i) => i !== idx),
    );
  const updateSchemaCol = (idx: number, patch: Partial<SchemaCol>) =>
    set(
      'schema_cols',
      form.schema_cols.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit data source' : 'Add data source'}</DialogTitle>
          <DialogDescription>
            Define the source, target Bronze table, and ingestion behaviour. Saved to Lakebase
            instantly; use <span className="font-medium">Publish to framework</span> to sync into Delta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Source ─────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              1. Source
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Source id" error={issueFor('source.object_id')}>
                <Input
                  value={form.source_object_id}
                  disabled={isEdit}
                  placeholder="src_returns_feed"
                  onChange={(e) => set('source_object_id', e.target.value)}
                />
              </Field>
              <Field label="File format">
                <Select value={form.file_format} onValueChange={(v) => set('file_format', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="File path" error={issueFor('source.file_path')}>
              <Input
                value={form.file_path}
                placeholder={`${DEFAULT_VOLUME_ROOT}/returns/`}
                onChange={(e) => set('file_path', e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Wildcard pattern">
                <Input
                  value={form.wildcard_pattern}
                  placeholder="*.json"
                  onChange={(e) => set('wildcard_pattern', e.target.value)}
                />
              </Field>
              <Field label="Storage account (abfss only)">
                <Input
                  value={form.storage_account}
                  placeholder="(blank for UC Volume paths)"
                  onChange={(e) => set('storage_account', e.target.value)}
                />
              </Field>
            </div>
            {form.storage_account.trim() !== '' && (
              <Field label="Container" error={issueFor('source.container')}>
                <Input value={form.container} onChange={(e) => set('container', e.target.value)} />
              </Field>
            )}

            {isCsv && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Delimiter">
                  <Input value={form.delimiter} placeholder="," onChange={(e) => set('delimiter', e.target.value)} />
                </Field>
                <Field label="Encoding">
                  <Input value={form.encoding} placeholder="UTF-8" onChange={(e) => set('encoding', e.target.value)} />
                </Field>
                <Field label="Null token">
                  <Input value={form.null_value} placeholder="NULL" onChange={(e) => set('null_value', e.target.value)} />
                </Field>
              </div>
            )}

            {isXml && (
              <Field label="Row tag (required for XML)" error={issueFor('source.row_tag')}>
                <Input value={form.row_tag} placeholder="Order" onChange={(e) => set('row_tag', e.target.value)} />
              </Field>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={form.use_schema} onCheckedChange={(v) => set('use_schema', v)} id="use-schema" />
              <Label htmlFor="use-schema">Provide an explicit schema (forces evolution mode = none)</Label>
            </div>

            {form.use_schema && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Schema columns (Spark JSON DDL)</div>
                {form.schema_cols.map((col, idx) => (
                  <div key={`col-${idx}`} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="column_name"
                      value={col.name}
                      onChange={(e) => updateSchemaCol(idx, { name: e.target.value })}
                    />
                    <Select value={col.type} onValueChange={(v) => updateSchemaCol(idx, { type: v })}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEMA_COL_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSchemaCol(idx)}
                      aria-label="Remove column"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSchemaCol}>
                  <Plus className="h-4 w-4 mr-1" /> Add column
                </Button>
                {issueFor('source.object_schema') && (
                  <p className="text-xs text-destructive">{issueFor('source.object_schema')}</p>
                )}
              </div>
            )}

            <Field label="Description">
              <Input
                value={form.source_description}
                onChange={(e) => set('source_description', e.target.value)}
              />
            </Field>
          </section>

          <Separator />

          {/* ── Target ─────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              2. Target Bronze table
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Target id" error={issueFor('target.object_id')}>
                <Input
                  value={form.target_object_id}
                  disabled={isEdit}
                  placeholder="tgt_returns_feed"
                  onChange={(e) => set('target_object_id', e.target.value)}
                />
              </Field>
              <Field label="Table" error={issueFor('target.target_table')}>
                <Input
                  value={form.target_table}
                  placeholder="returns_feed"
                  onChange={(e) => set('target_table', e.target.value)}
                />
              </Field>
              <Field label="Catalog" error={issueFor('target.target_catalog')}>
                <Input value={form.target_catalog} onChange={(e) => set('target_catalog', e.target.value)} />
              </Field>
              <Field label="Schema" error={issueFor('target.target_schema')}>
                <Input value={form.target_schema} onChange={(e) => set('target_schema', e.target.value)} />
              </Field>
              <Field label="Partition columns (comma-separated)">
                <Input
                  value={form.partition_cols}
                  placeholder="load_date"
                  onChange={(e) => set('partition_cols', e.target.value)}
                />
              </Field>
              <Field
                label={isMerge ? 'Merge keys (required for merge)' : 'Merge keys'}
                error={issueFor('target.merge_keys')}
              >
                <Input
                  value={form.merge_keys}
                  placeholder="customer_id"
                  onChange={(e) => set('merge_keys', e.target.value)}
                />
              </Field>
            </div>
          </section>

          <Separator />

          {/* ── Operation ──────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              3. Operation behaviour
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Operation id" error={issueFor('operation.operation_id')}>
                <Input
                  value={form.operation_id}
                  disabled={isEdit}
                  placeholder="op_returns_feed"
                  onChange={(e) => set('operation_id', e.target.value)}
                />
              </Field>
              <Field label="Load type">
                <Select value={form.load_type} onValueChange={(v) => set('load_type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Schema evolution mode" error={issueFor('operation.schema_evolution_mode')}>
                <Select
                  value={form.use_schema ? 'none' : form.schema_evolution_mode}
                  onValueChange={(v) => set('schema_evolution_mode', v)}
                >
                  <SelectTrigger disabled={form.use_schema}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVOLUTION_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Max files per trigger">
                <Input
                  type="number"
                  value={form.max_files_per_trigger}
                  onChange={(e) => set('max_files_per_trigger', e.target.value)}
                />
              </Field>
              {isJsonish && (
                <Field label="Explode key (json/jsonl)" error={issueFor('operation.explode_key')}>
                  <Input
                    value={form.explode_key}
                    placeholder="events"
                    onChange={(e) => set('explode_key', e.target.value)}
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              <Toggle label="Enabled" checked={form.enabled} onChange={(v) => set('enabled', v)} />
              <Toggle label="Merge schema" checked={form.merge_schema} onChange={(v) => set('merge_schema', v)} />
              <Toggle
                label="Cast all as string"
                checked={form.cast_all_as_string}
                onChange={(v) => set('cast_all_as_string', v)}
              />
              <Toggle label="Multiline" checked={form.multiline} onChange={(v) => set('multiline', v)} />
              <Toggle label="Case sensitive" checked={form.case_sensitive} onChange={(v) => set('case_sensitive', v)} />
            </div>
            <Field label="Description">
              <Input
                value={form.operation_description}
                onChange={(e) => set('operation_description', e.target.value)}
              />
            </Field>
          </section>

          {/* ── Preview ────────────────────────────────────────── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview</h3>
              <Badge variant="secondary">{preview.operation.load_type}</Badge>
              <Badge variant="outline">{preview.source.file_format}</Badge>
              <Badge variant="outline">{preview.operation.schema_evolution_mode}</Badge>
              {preview.operation.cast_all_as_string && <Badge>cast→string</Badge>}
            </div>
            <Textarea
              readOnly
              className="font-mono text-xs h-40"
              value={JSON.stringify(preview, null, 2)}
            />
          </section>

          {error && <Alert variant="destructive">{error}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}
