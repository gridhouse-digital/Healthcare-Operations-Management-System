import React, { useEffect, useRef } from 'react';
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SlideOver({ isOpen, onClose, title, children, width = 'lg', side = 'right' }: SlideOverProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    /* Focus moves in on open and returns to the opener on close */
    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        return () => opener?.focus?.();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            /* A nested menu that closed on this Escape marks it handled */
            if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    /* Keep Tab inside the drawer. Menus portalled out of it handle their own keys. */
    const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const panel = panelRef.current;
        if (event.key !== 'Tab' || event.defaultPrevented || !panel) return;
        if (!panel.contains(document.activeElement)) return;

        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panel)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

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
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onKeyDown={handlePanelKeyDown}
                className={`drawer-surface focus:outline-none fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full ${widthClasses[width]} w-full z-50 overflow-y-auto`}
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
