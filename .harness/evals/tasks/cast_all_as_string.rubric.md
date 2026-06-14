# Rubric: cast_all_as_string_drift

Extends `.harness/RUBRIC.md`. Task: the headline schema-drift scenario.

- [ ] C1 The `op_loyalty_history` operation has `cast_all_as_string = true`.
- [ ] C2 Sample data includes a 2018 file with **numeric** `customer_tier` and a 2024 file with
      **string** `customer_tier` (`00_generate_sample_data.py`).
- [ ] C3 Both files land in the same Bronze table with **no type conflict** (all columns STRING).
- [ ] C4 Typing/cleansing is **not** added in Bronze (deferred to Silver) — F3 holds.
- [ ] C5 `databricks bundle validate -t dev` passes (Gate G1).
