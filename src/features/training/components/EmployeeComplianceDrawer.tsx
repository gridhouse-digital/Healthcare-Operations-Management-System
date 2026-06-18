import { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmployeeTrainingDetailPage } from '../EmployeeTrainingDetailPage';
import { Button } from '@/components/ui/button';

interface EmployeeComplianceDrawerProps {
  employeeId: string;
  onClose: () => void;
}

export function EmployeeComplianceDrawer({ employeeId, onClose }: EmployeeComplianceDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close compliance drawer"
        className="fixed inset-0 z-40 bg-background/72 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Employee compliance details"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[92vw] flex-col border-l border-border bg-card shadow-2xl xl:max-w-6xl 2xl:max-w-7xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Employee compliance</p>
            <p className="text-[11px] text-muted-foreground">Directory stays open behind this panel</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/training/employee/${employeeId}`} target="_blank" rel="noreferrer">
                Open full page
                <ExternalLink size={14} />
              </Link>
            </Button>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close drawer"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <EmployeeTrainingDetailPage embedded employeeId={employeeId} onClose={onClose} />
        </div>
      </aside>
    </>
  );
}
