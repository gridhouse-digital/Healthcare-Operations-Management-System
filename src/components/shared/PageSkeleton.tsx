/* The shape of a working page, shown while its data loads */
export function PageSkeleton({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
    return (
        <div className="space-y-6" aria-busy="true">
            <p role="status" className="visually-hidden">{label}</p>
            <div className="space-y-2">
                <div className="h-8 w-56 rounded-md ai-shimmer" />
                <div className="h-3 w-80 max-w-full rounded ai-shimmer" />
            </div>
            <div className="divide-y divide-border border-y border-border">
                {Array.from({ length: rows }).map((_, row) => (
                    <div key={row} className="flex items-center gap-3 py-3">
                        <div className="h-9 w-9 flex-shrink-0 rounded-full ai-shimmer" />
                        <div className="h-3 w-1/4 rounded ai-shimmer" />
                        <div className="ml-auto h-3 w-1/5 rounded ai-shimmer" />
                    </div>
                ))}
            </div>
        </div>
    );
}
