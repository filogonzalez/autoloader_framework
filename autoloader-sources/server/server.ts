import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { registerMetadataRoutes, setupMetadataSchema } from './routes/metadata-routes';
import { registerPublishRoutes } from './routes/publish-routes';

createApp({
  plugins: [analytics(), lakebase(), server()],
  async onPluginsReady(appkit) {
    try {
      await setupMetadataSchema(appkit);
    } catch (err) {
      console.warn('[metadata] Schema setup failed:', (err as Error).message);
      console.warn('[metadata] Routes will register but may error until the SP owns the schema (deploy first).');
    }
    registerMetadataRoutes(appkit);
    registerPublishRoutes(appkit);
  },
}).catch(console.error);
