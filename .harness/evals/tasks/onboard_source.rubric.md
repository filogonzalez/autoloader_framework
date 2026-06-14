# Rubric: onboard_source

Extends `.harness/RUBRIC.md`. Task: onboard a new source (e.g. `returns` JSON feed).

- [ ] O1 A new **source** object row added to `src/sql/02_seed_metadata.sql`
      (`object_type='source'`, file_path, wildcard_pattern, file_format).
- [ ] O2 A new **target** object row added (`object_type='target'`, target_catalog/schema/table).
- [ ] O3 A new **operation** row binding source→target with load behavior (`load_type`,
      `schema_evolution_mode`, etc.).
- [ ] O4 **No new notebook** and **no edit** to `10_ingestion_framework.py` (config-only change).
- [ ] O5 `databricks bundle validate -t dev` passes (Gate G1).
