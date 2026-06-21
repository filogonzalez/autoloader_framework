import { ViewShell } from '../components/ViewShell';

// Phase 1 may fold the existing SourceWizard (components/SourceWizard.tsx) in here.
export function OnboardingPage() {
  return <ViewShell titleKey="onboarding.title" subtitleKey="onboarding.subtitle" />;
}
