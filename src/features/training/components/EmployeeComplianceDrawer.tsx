import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close compliance drawer"
        className="fixed inset-0 z-40 bg-background/72"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Employee compliance details"
        className="drawer-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l border-border bg-background shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-inherit px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-section text-foreground">Employee compliance</h2>
            <p className="text-xs text-muted-foreground">Directory stays open behind this panel</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/training/employee/${employeeId}`} target="_blank" rel="noreferrer">
                Open full page
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            </Button>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close drawer"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <EmployeeTrainingDetailPage embedded employeeId={employeeId} onClose={onClose} />
        </div>
      </aside>
    </>,
    document.body,
  );
}
