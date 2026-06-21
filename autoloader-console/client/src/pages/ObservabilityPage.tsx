import { ViewShell } from '../components/ViewShell';

// Phase 1 wires the audit_history_30d / audit_daily_14d / audit_log queries here (TODO(observability)).
export function ObservabilityPage() {
  return <ViewShell titleKey="observability.title" subtitleKey="observability.subtitle" />;
}
