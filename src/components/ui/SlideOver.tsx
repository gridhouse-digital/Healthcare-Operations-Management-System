import React from 'react';
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
    if (!isOpen) return null;

    const widthClasses = {
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-background/72 transition-opacity backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full ${widthClasses[width]} w-full z-50 overflow-y-auto`}
                style={{
                    background: 'var(--card)',
                    borderLeft: side === 'right' ? '1px solid var(--border)' : 'none',
                    borderRight: side === 'left' ? '1px solid var(--border)' : 'none',
                    boxShadow: 'var(--shadow-2xl, 0 20px 60px hsl(0 0% 0% / 0.6))',
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
                        className="text-[15px] font-semibold tracking-[-0.015em]"
                        style={{ color: 'var(--foreground)' }}
                    >
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition-colors"
                        style={{ color: 'var(--muted-foreground)' }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'var(--secondary)';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)';
                        }}
                    >
                        <X size={16} strokeWidth={1.75} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </>
    );
}
