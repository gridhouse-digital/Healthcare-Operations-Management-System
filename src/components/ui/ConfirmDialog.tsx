import { X } from 'lucide-react';

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
        : 'bg-primary text-primary-foreground hover:bg-primary/90';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
                <div className="rounded-[22px] border border-border/80 bg-card/95 p-6 shadow-2xl backdrop-blur-sm">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-foreground">
                            {title}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Description */}
                    <p className="mb-6 text-sm leading-relaxed tracking-[0.005em] text-muted-foreground">
                        {description}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-[13px] font-semibold tracking-[0.01em] text-foreground transition-colors hover:bg-muted/60"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`flex-1 rounded-xl px-4 py-2 text-[13px] font-semibold tracking-[0.01em] transition-colors ${confirmButtonClass}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
