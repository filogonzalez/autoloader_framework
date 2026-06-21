import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, CardContent } from '@databricks/appkit-ui/react';
import { Plus } from 'lucide-react';
import { SourceWizard } from '../components/SourceWizard';

// The real create flow: folds the existing SourceWizard in here (per the original
// stub's own comment). The Topbar "New operation" CTA routes to /onboarding, so
// the wizard opens immediately. On save we jump to /sources where the new source
// appears in the list.
export function OnboardingPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Onboard a new source</h2>
        <p className="text-sm text-muted-foreground">
          Register a source, its target Bronze table, and the ingestion operation. Saved to Lakebase
          instantly; use <span className="font-medium">Publish to framework</span> on the Sources
          page to sync it into the Delta metadata the framework reads.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Define a new ingestion operation with the guided wizard.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New source
          </Button>
        </CardContent>
      </Card>

      <SourceWizard
        open={open}
        onOpenChange={setOpen}
        initial={null}
        onSaved={() => {
          void navigate('/sources');
        }}
      />
    </div>
  );
}
