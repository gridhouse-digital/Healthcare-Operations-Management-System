import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SlideOverProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    width?: 'md' | 'lg' | 'xl';
    side?: 'left' | 'right';
}

export function SlideOver({ isOpen, onClose, title, children, width = 'lg', side = 'right' }: SlideOverProps) {
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const widthClasses = {
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-background/72 transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`drawer-surface fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full ${widthClasses[width]} w-full z-50 overflow-y-auto`}
                style={{
                    background: 'var(--card)',
                    borderLeft: side === 'right' ? '1px solid var(--border)' : 'none',
                    borderRight: side === 'left' ? '1px solid var(--border)' : 'none',
                    boxShadow: 'var(--shadow-2xl)',
                }}
            >
                {/* Header */}
                <div
                    className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
                    style={{
                        background: 'var(--card)',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <h2
                        className="text-section"
                        style={{ color: 'var(--foreground)' }}
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-secondary"
                        style={{ color: 'var(--muted-foreground)' }}
                    >
                        <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </>,
        document.body,
    );
}
