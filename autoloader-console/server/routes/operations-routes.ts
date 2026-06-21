import type { AppKit } from '../lib/types';

/**
 * Operation lifecycle routes for the Console.
 *
 * Phase 0 ships the "Run now" seam as a stub: the route exists and the frontend
 * api client already calls it, but it triggers no real compute. The full feature
 * (map operation -> framework job, jobs.runNow via the Databricks SDK, persist the
 * real run_id, reflect live run state) lands in a focused follow-up session.
 * See docs/autoloader-console/ROADMAP-stubbed-features.md (Feature 1).
 */
export function registerOperationsRoutes(appkit: AppKit): void {
  appkit.server.extend((app) => {
    // POST /api/operations/:operation_id/run — trigger ingestion for one operation.
    app.post('/api/operations/:operation_id/run', (req, res) => {
      const operationId = req.params.operation_id;
      // TODO(run-now): replace this mock with a real job trigger. Map the operation
      // to the framework job, call jobs.runNow with operation_id as a parameter,
      // persist the returned run_id, and surface live run state instead of SIMULATED.
      res.json({
        operation_id: operationId,
        run_id: `sim-${operationId}-${Date.now()}`,
        status: 'SIMULATED',
      });
    });
  });
}
