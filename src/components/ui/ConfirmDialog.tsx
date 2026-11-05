import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger';
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    const confirmButtonClass = variant === 'danger'
        ? 'border border-destructive/15 bg-destructive/12 text-destructive hover:bg-destructive/18'
        : 'bg-primary text-primary-foreground hover:bg-accent-hi';

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-background/70"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
                <div className="rounded-xl bg-card p-6 shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-section text-foreground">
                            {title}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                         aria-label="Close">
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Description */}
                    <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 rounded-full border border-border px-4 min-h-10 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`flex-1 rounded-full px-4 min-h-10 text-sm font-medium transition-colors ${confirmButtonClass}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    );
}
