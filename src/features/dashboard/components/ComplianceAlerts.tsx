import { ShieldAlert, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NotTrackedState } from '@/components/shared/NotTrackedState';

export function ComplianceAlerts() {
    return (
        <section className="panel">
            <div className="panel-header">
                <ShieldAlert size={16} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
                <h3 className="text-title text-foreground">Compliance Alerts</h3>
            </div>
            <NotTrackedState
                title="Credential expiry alerts aren't connected yet"
                action={
                    <Link to="/training" className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-accent-hi">
                        Open Compliance <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                    </Link>
                }
            >
                This doesn't mean there are no risks. Training compliance is tracked on the Compliance page.
            </NotTrackedState>
        </section>
    );
}
