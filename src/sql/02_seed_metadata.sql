-- =====================================================================================
-- Metadata-Driven Autoloader Framework — Demo Seed
-- -------------------------------------------------------------------------------------
-- Registers six realistic retail sources that exercise every capability of the
-- framework. Each is a metadata row — no per-source code exists anywhere.
--
-- INSERT OVERWRITE makes this script safely re-runnable (it fully replaces the rows).
-- Paths point at the UC volume autoloader_demo.landing.raw populated by
-- 00_generate_sample_data. To use ADLS instead, set storage_account/container and put
-- the abfss-relative path in file_path.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- SOURCE + TARGET objects
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT OVERWRITE autoloader_demo.metadata.object
  (object_id, object_type, source_format, storage_account, container, file_path, wildcard_pattern,
   file_format, row_tag, object_schema, delimiter, encoding, null_value,
   target_catalog, target_schema, target_table, table_path, partition_cols, merge_keys,
   description, created_at)
VALUES
  -- 1) POS transactions — columnar Parquet, accumulating event data ──────────────────────
  ('src_pos_transactions', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/pos/transactions/', '*.parquet',
   'parquet', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'POS transaction feed from stores (Parquet, append-only events)', current_timestamp()),

  -- 2) Supplier ACME inventory — headerless, pipe-delimited CSV w/ explicit schema ──────
  ('src_supplier_acme', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/suppliers/acme/', '*.csv',
   'csv', NULL,
   '{"type":"struct","fields":[{"name":"supplier_id","type":"string","nullable":true,"metadata":{}},{"name":"sku","type":"string","nullable":true,"metadata":{}},{"name":"product_name","type":"string","nullable":true,"metadata":{}},{"name":"qty_on_hand","type":"integer","nullable":true,"metadata":{}},{"name":"unit_cost","type":"double","nullable":true,"metadata":{}},{"name":"last_updated","type":"string","nullable":true,"metadata":{}}]}',
   '|', 'UTF-8', 'NULL',
   NULL, NULL, NULL, NULL, NULL, NULL,
   'Supplier ACME inventory (headerless pipe-delimited CSV, explicit schema)', current_timestamp()),

  -- 3) CRM customers — JSON, current-state records resent over time (upsert) ─────────────
  ('src_crm_customers', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/crm/customers/', '*.json',
   'json', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'CRM customer master extract (JSON, represents current state -> merge)', current_timestamp()),

  -- 4) Supplier EDI orders — XML with a row tag ─────────────────────────────────────────
  ('src_supplier_edi', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/suppliers/edi/', '*.xml',
   'xml', 'Order', NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'Supplier EDI purchase orders (XML, rowTag=Order)', current_timestamp()),

  -- 5) Clickstream events — JSONL with a top-level array to explode ──────────────────────
  ('src_clickstream', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/clickstream/events/', '*.jsonl',
   'jsonl', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'Web clickstream export (JSONL, records wrapped in an events[] array)', current_timestamp()),

  -- 6) Loyalty history — CSV historical load with multi-year schema drift ───────────────
  ('src_loyalty_history', 'source', 'cloudFiles', NULL, NULL,
   '/Volumes/autoloader_demo/landing/raw/crm/loyalty_history/', '*.csv',
   'csv', NULL, NULL, ',', 'UTF-8', '',
   NULL, NULL, NULL, NULL, NULL, NULL,
   'Five years of loyalty history (CSV). customer_tier drifted numeric->string across years', current_timestamp()),

  -- 7) POS transactions (Delta-table-as-source) — stream the Bronze POS table itself ─────
  --    Demonstrates streaming-TABLE ingestion (source_format='delta') via availableNow.
  --    file_path holds the FQ table name; storage_account/container/file_format are unused.
  ('src_pos_bronze_stream', 'source', 'delta', NULL, NULL,
   'autoloader_demo.bronze.pos_transactions', NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'Delta-table-as-source: streams the Bronze POS table as a stream (availableNow)', current_timestamp()),

  -- 8) abfss / ADLS Gen2 source TEMPLATE (DISABLED) ─────────────────────────────────────
  --    PREREQUISITE: a Unity Catalog EXTERNAL LOCATION + STORAGE CREDENTIAL covering this
  --    abfss path must be provisioned by an admin out-of-band. Credentials are NOT metadata
  --    (see AGENTS.md) — none are stored here. This row is a copy-paste-ready template only;
  --    its operation is disabled because the demo workspace has no such storage account.
  ('src_abfss_template', 'source', 'cloudFiles', 'examplestorageacct', 'raw',
   '/vendor/orders/', 'year=*/month=*/*.parquet',
   'parquet', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'abfss/ADLS Gen2 source template (DISABLED) — requires admin-provisioned UC external location', current_timestamp()),

  -- ── TARGET objects (Bronze tables) ───────────────────────────────────────────────────
  ('tgt_pos_transactions', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'pos_transactions', NULL, 'load_date', NULL,
   'Bronze POS transactions (partitioned by load_date)', current_timestamp()),

  ('tgt_supplier_acme', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'supplier_acme_inventory', NULL, NULL, NULL,
   'Bronze supplier ACME inventory', current_timestamp()),

  ('tgt_crm_customers', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'crm_customers', NULL, NULL, 'customer_id',
   'Bronze CRM customers (upsert keyed on customer_id)', current_timestamp()),

  ('tgt_supplier_edi', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'supplier_edi_orders', NULL, NULL, NULL,
   'Bronze supplier EDI orders', current_timestamp()),

  ('tgt_clickstream', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'clickstream_events', NULL, NULL, NULL,
   'Bronze clickstream events (one row per exploded event)', current_timestamp()),

  ('tgt_loyalty_history', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'loyalty_history', NULL, NULL, NULL,
   'Bronze loyalty history (faithful capture, all columns as STRING)', current_timestamp()),

  -- Target for the Delta-table-as-source stream (new Bronze table, append load) ──────────
  ('tgt_pos_stream_replica', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'pos_transactions_stream_replica', NULL, NULL, NULL,
   'Bronze replica fed by streaming the POS Bronze table (Delta-as-source demo)', current_timestamp()),

  -- Target for the abfss template (DISABLED operation) ──────────────────────────────────
  ('tgt_abfss_template', 'target', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL,
   'autoloader_demo', 'bronze', 'abfss_vendor_orders', NULL, NULL, NULL,
   'Bronze target for the abfss source template (DISABLED)', current_timestamp());


-- ─────────────────────────────────────────────────────────────────────────────────────
-- OPERATIONS — bind source -> target and declare run behavior
-- ─────────────────────────────────────────────────────────────────────────────────────
INSERT OVERWRITE autoloader_demo.metadata.operation
  (operation_id, enabled, source_object_id, target_object_id, load_type, merge_schema,
   schema_evolution_mode, cast_all_as_string, multiline, case_sensitive,
   max_files_per_trigger, explode_key, description, created_at)
VALUES
  -- POS: append events, absorb new columns automatically, partition by load_date
  ('op_pos_transactions', TRUE, 'src_pos_transactions', 'tgt_pos_transactions',
   'append', TRUE, 'addNewColumns', FALSE, FALSE, FALSE, 1000, NULL,
   'Append POS Parquet; evolve schema additively', current_timestamp()),

  -- Supplier ACME: headerless CSV with explicit schema, append.
  -- Explicit schema => evolution mode must be 'none' (Auto Loader constraint);
  -- off-schema data is still preserved in _rescued_data.
  ('op_supplier_acme', TRUE, 'src_supplier_acme', 'tgt_supplier_acme',
   'append', TRUE, 'none', FALSE, FALSE, FALSE, 1000, NULL,
   'Append supplier ACME headerless pipe CSV using explicit schema', current_timestamp()),

  -- CRM customers: upsert current-state records keyed on customer_id
  ('op_crm_customers', TRUE, 'src_crm_customers', 'tgt_crm_customers',
   'merge', TRUE, 'addNewColumns', FALSE, TRUE, FALSE, 1000, NULL,
   'Merge CRM customers on customer_id (multiline JSON)', current_timestamp()),

  -- Supplier EDI: append parsed XML orders
  ('op_supplier_edi', TRUE, 'src_supplier_edi', 'tgt_supplier_edi',
   'append', TRUE, 'addNewColumns', FALSE, FALSE, FALSE, 1000, NULL,
   'Append supplier EDI XML orders (rowTag=Order)', current_timestamp()),

  -- Clickstream: explode events[] array then append one row per event
  ('op_clickstream', TRUE, 'src_clickstream', 'tgt_clickstream',
   'append', TRUE, 'addNewColumns', FALSE, FALSE, FALSE, 1000, 'events',
   'Append clickstream JSONL; explode top-level events[] array', current_timestamp()),

  -- Loyalty history: faithful historical capture — land everything as STRING
  ('op_loyalty_history', TRUE, 'src_loyalty_history', 'tgt_loyalty_history',
   'append', TRUE, 'rescue', TRUE, FALSE, FALSE, 1000, NULL,
   'Historical loyalty load; cast_all_as_string survives multi-year type drift', current_timestamp()),

  -- Delta-table-as-source: stream the Bronze POS table into a new Bronze replica (append).
  -- source_format='delta' => no cloudFiles options; trigger(availableNow=True) preserves the
  -- one-row-per-run audit lifecycle. schema_evolution_mode is ignored for delta sources.
  ('op_pos_bronze_stream', TRUE, 'src_pos_bronze_stream', 'tgt_pos_stream_replica',
   'append', TRUE, 'none', FALSE, FALSE, FALSE, NULL, NULL,
   'Stream the Bronze POS Delta table (availableNow) into a Bronze replica', current_timestamp()),

  -- abfss template operation — DISABLED (no storage account provisioned in the demo).
  ('op_abfss_template', FALSE, 'src_abfss_template', 'tgt_abfss_template',
   'append', TRUE, 'addNewColumns', FALSE, FALSE, FALSE, 1000, NULL,
   'DISABLED template: append abfss Parquet (requires UC external location)', current_timestamp());
