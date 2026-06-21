import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { registerMetadataRoutes, setupMetadataSchema } from './routes/metadata-routes';
import { registerPublishRoutes } from './routes/publish-routes';
import { registerOperationsRoutes } from './routes/operations-routes';
import { registerIdentityRoutes } from './routes/identity-routes';

createApp({
  plugins: [analytics(), lakebase(), server()],
  async onPluginsReady(appkit) {
    try {
      await setupMetadataSchema(appkit);
    } catch (err) {
      console.warn('[metadata] Schema setup failed:', (err as Error).message);
      console.warn('[metadata] Routes will register but may error until the SP owns the schema (deploy first).');
    }
    registerIdentityRoutes(appkit);
    registerMetadataRoutes(appkit);
    registerPublishRoutes(appkit);
    registerOperationsRoutes(appkit);
  },
}).catch(console.error);
