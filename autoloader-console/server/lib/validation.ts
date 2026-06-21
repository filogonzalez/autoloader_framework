import { z } from 'zod';

export const FILE_FORMATS = ['csv', 'json', 'jsonl', 'parquet', 'avro', 'xml'] as const;
export const LOAD_TYPES = ['append', 'merge', 'overwrite'] as const;
export const EVOLUTION_MODES = ['addNewColumns', 'rescue', 'failOnNewColumns', 'none'] as const;

/** Enum lists surfaced to the UI dropdowns via GET /api/reference. */
export const REFERENCE = {
  file_formats: FILE_FORMATS,
  load_types: LOAD_TYPES,
  schema_evolution_modes: EVOLUTION_MODES,
};

const nullableTrimmed = z
  .string()
  .transform((s) => {
    const t = s.trim();
    return t.length === 0 ? null : t;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const idPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const sourceSchema = z.object({
  object_id: z.string().regex(idPattern, 'Source id must be alphanumeric/underscore, start with a letter'),
  storage_account: nullableTrimmed,
  container: nullableTrimmed,
  file_path: z.string().min(1, 'file_path is required'),
  wildcard_pattern: nullableTrimmed,
  file_format: z.enum(FILE_FORMATS),
  row_tag: nullableTrimmed,
  object_schema: nullableTrimmed,
  delimiter: nullableTrimmed,
  encoding: nullableTrimmed,
  null_value: nullableTrimmed,
  description: nullableTrimmed,
});

const targetSchema = z.object({
  object_id: z.string().regex(idPattern, 'Target id must be alphanumeric/underscore, start with a letter'),
  target_catalog: z.string().min(1, 'target_catalog is required'),
  target_schema: z.string().min(1, 'target_schema is required'),
  target_table: z.string().min(1, 'target_table is required'),
  table_path: nullableTrimmed,
  partition_cols: nullableTrimmed,
  merge_keys: nullableTrimmed,
  description: nullableTrimmed,
});

const operationSchema = z.object({
  operation_id: z.string().regex(idPattern, 'Operation id must be alphanumeric/underscore, start with a letter'),
  enabled: z.boolean(),
  load_type: z.enum(LOAD_TYPES),
  merge_schema: z.boolean(),
  schema_evolution_mode: z.enum(EVOLUTION_MODES),
  cast_all_as_string: z.boolean(),
  multiline: z.boolean(),
  case_sensitive: z.boolean(),
  max_files_per_trigger: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
  explode_key: nullableTrimmed,
  description: nullableTrimmed,
});

/**
 * Cross-field validation mirroring the framework's runtime contract. These are
 * the same invariants enforced in src/notebooks/10_ingestion_framework.py and
 * baked into src/sql/02_seed_metadata.sql.
 */
export const sourceBundleSchema = z
  .object({
    source: sourceSchema,
    target: targetSchema,
    operation: operationSchema,
  })
  .superRefine((val, ctx) => {
    const { source, target, operation } = val;

    // XML requires a row_tag.
    if (source.file_format === 'xml' && !source.row_tag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'row_tag'],
        message: 'row_tag is required for XML sources',
      });
    }

    // merge load_type requires merge_keys on the target.
    if (operation.load_type === 'merge' && !target.merge_keys) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target', 'merge_keys'],
        message: 'merge_keys are required when load_type is "merge"',
      });
    }

    // An explicit schema forces evolution mode "none" (Auto Loader constraint).
    if (source.object_schema && operation.schema_evolution_mode !== 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operation', 'schema_evolution_mode'],
        message: 'schema_evolution_mode must be "none" when an explicit schema is provided',
      });
    }

    // explode_key only applies to JSON / JSONL.
    if (operation.explode_key && source.file_format !== 'json' && source.file_format !== 'jsonl') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operation', 'explode_key'],
        message: 'explode_key is only valid for json/jsonl sources',
      });
    }

    // abfss path resolution: a storage_account requires a container.
    if (source.storage_account && !source.container) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'container'],
        message: 'container is required when storage_account is set (abfss path)',
      });
    }

    // object_schema must be valid JSON if provided.
    if (source.object_schema) {
      try {
        JSON.parse(source.object_schema);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source', 'object_schema'],
          message: 'object_schema must be a valid Spark JSON DDL string',
        });
      }
    }
  });

export type ValidatedSourceBundle = z.infer<typeof sourceBundleSchema>;
