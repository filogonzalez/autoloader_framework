# state/ — machine checkpoints (Phase 3, resumable)

Checkpoint intermediate state at **task boundaries** so a run survives interruption and the next
session resumes instead of restarting.

- **Unit of work:** one delivery task (e.g. "onboard source X", "fix schema-evolution bug").
- **Cadence:** write a checkpoint after each completed step / before any risky/destructive op.
- **Format:** one JSON file per task, `state/<task-id>.json`. See `checkpoint.example.json`.
- **Resume:** on start, read the newest non-`done` checkpoint, continue from `next_action`.
- Machine-readable counterpart to the human-readable `progress.md`. Both are gitignored by default.
