export function TrainingComplianceSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-muted/50" />
        <div className="h-4 w-72 rounded-md bg-muted/40" />
        <div className="h-3 w-96 max-w-full rounded-md bg-muted/30" />
      </div>

      <div className="flex gap-2">
        <div className="h-9 w-40 rounded-md bg-muted/40" />
        <div className="h-9 w-44 rounded-md bg-muted/30" />
      </div>

      <div className="tally tally-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="tally-cell"><div className="h-16 rounded bg-muted/40" /></div>
        ))}
      </div>

      <div className="h-10 rounded-md bg-muted/40" />

      <div className="border-t border-border">
        <div className="border-b border-border py-3">
          <div className="h-3 w-full rounded bg-muted/30" />
        </div>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border py-4 last:border-b-0">
            <div className="h-9 w-9 rounded-full bg-muted/40" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 rounded bg-muted/40" />
              <div className="h-3 w-56 rounded bg-muted/25" />
            </div>
            <div className="h-6 w-24 rounded-full bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
