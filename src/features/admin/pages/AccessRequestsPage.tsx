import { useDeferredValue, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Inbox,
  LayoutDashboard,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  type AccessRequestRecord,
  type AccessRequestStatus,
  useAccessRequests,
  useUpdateAccessRequestStatus,
} from '../hooks/useAccessRequests';

const statusOptions: AccessRequestStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'provisioned',
];

type RequestFilter = 'all' | 'review' | 'approved' | 'failures';

const inputCls =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring';

function formatStatusLabel(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function StatusChip({ value, minimal = false }: { value?: string | null, minimal?: boolean }) {
  const variantMap: Record<string, string> = {
    submitted: 'status-chip-amber',
    under_review: 'status-chip-cyan',
    approved: 'status-chip-green',
    provisioned: 'status-chip-green',
    rejected: 'status-chip-red',
    sent: 'status-chip-green',
    pending: 'status-chip-amber',
    failed: 'status-chip-red',
    skipped: 'status-chip-muted',
  };

  const variantClass = variantMap[value ?? ''] ?? 'status-chip-muted';

  if (minimal) {
    const minStyles: Record<string, string> = {
      submitted: 'text-[color:var(--severity-medium)]',
      under_review: 'text-primary',
      approved: 'text-[color:var(--severity-ok)]',
      provisioned: 'text-[color:var(--severity-ok)]',
      rejected: 'text-[color:var(--severity-critical)]',
      sent: 'text-[color:var(--severity-ok)]',
      pending: 'text-[color:var(--severity-medium)]',
      failed: 'text-[color:var(--severity-critical)]',
      skipped: 'text-muted-foreground',
    };
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium tracking-tight', minStyles[value ?? ''] ?? 'text-muted-foreground')}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
        {formatStatusLabel(value)}
      </span>
    );
  }

  return (
    <span className={cn('status-chip', variantClass)}>
      {formatStatusLabel(value)}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  meta,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  meta: string;
  icon: typeof Building2;
  tone?: 'default' | 'success' | 'attention';
}) {
  const iconTon =
    tone === 'success'
      ? 'text-[color:var(--severity-ok)]'
      : tone === 'attention'
        ? 'text-[color:var(--severity-medium)]'
        : 'text-primary';

  return (
    <div className="metric-block py-4">
      <div className="flex justify-between items-start gap-3 mb-2">
        <span className="zone-label">{label}</span>
        <Icon size={14} className={iconTon} />
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="data-value text-3xl">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{meta}</span>
    </div>
  );
}

function QueueItem({
  request,
  selected,
  onSelect,
}: {
  request: AccessRequestRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 border-b border-border/50 transition-colors last:border-b-0 hover:bg-muted/10',
        selected ? 'bg-primary/5' : ''
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className={cn("truncate text-[14px] font-medium", selected ? "text-foreground" : "text-foreground/90")}>
          {request.organization_name}
        </p>
        <StatusChip value={request.status} minimal />
      </div>
      
      <p className="truncate text-[13px] text-muted-foreground mb-3">
        {request.primary_contact_name}
      </p>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground/80">
        <span className="font-mono">{new Date(request.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>{request.team_size} members</span>
      </div>
    </button>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="meta-label">{label}</span>
      <span className={cn('text-[14px] text-foreground leading-relaxed', mono && 'font-mono text-[13px] break-all')}>
        {value}
      </span>
    </div>
  );
}

function DeliveryRow({
  label,
  status,
  sentAt,
  error,
}: {
  label: string;
  status?: string | null;
  sentAt?: string | null;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusChip value={status} />
          <span className="text-[13px] font-medium text-foreground">{label}</span>
        </div>
        <span className="text-[12px] text-muted-foreground font-mono">
          {sentAt ? new Date(sentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      </div>
      {error && (
        <div className="mt-2 ml-[84px] rounded-md bg-destructive/5 px-3 py-2 border border-destructive/10">
          <p className="text-[12px] leading-relaxed text-destructive whitespace-pre-wrap font-mono">{error}</p>
        </div>
      )}
    </div>
  );
}

function QueueFilters({
  activeFilter,
  onSelect,
  counts,
}: {
  activeFilter: RequestFilter;
  onSelect: (filter: RequestFilter) => void;
  counts: Record<RequestFilter, number>;
}) {
  const filters: Array<{ key: RequestFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'review', label: 'Review', count: counts.review },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'failures', label: 'Issues', count: counts.failures },
  ];

  return (
    <div className="tab-bar">
      {filters.map(({ key, label, count }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={cn('tab-item', activeFilter === key && 'active')}
        >
          {label}
          <span className={cn('tab-count', activeFilter === key ? 'tab-count-active' : 'tab-count-inactive')}>
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

function RequestDetails({
  request,
  updateStatus,
  onStatusChange,
}: {
  request: AccessRequestRecord;
  updateStatus: ReturnType<typeof useUpdateAccessRequestStatus>;
  onStatusChange: (request: AccessRequestRecord, status: AccessRequestStatus) => Promise<void>;
}) {
  const hasFailure =
    request.notification_status === 'failed' ||
    request.requester_confirmation_status === 'failed';

  return (
    <div className="saas-card flex flex-col h-full overflow-hidden shadow-sm">
      {/* Header Area */}
      <div className="px-6 py-6 border-b border-border/60 bg-muted/20">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <StatusChip value={request.status} />
              <span className="text-[12px] text-muted-foreground font-mono">ID: {request.id.slice(0,8)}</span>
            </div>
            <div>
              <h2 className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                {request.organization_name}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
                Review request payload and proceed with active tenant provisioning if approved.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-[200px]">
            <span className="meta-label">Review State</span>
            <div className="relative">
              <select
                value={request.status}
                onChange={(event) => void onStatusChange(request, event.target.value as AccessRequestStatus)}
                disabled={updateStatus.isPending}
                className={cn(inputCls, 'py-1.5 pr-10 appearance-none cursor-pointer w-full')}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatStatusLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {hasFailure && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 text-destructive" />
            <div>
              <p className="text-[13px] font-medium text-destructive">Delivery Failure Detected</p>
              <p className="mt-0.5 text-[12px] text-destructive/80">
                System notifications could not be sent. Check delivery tracking below for details.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-8 max-w-4xl grid gap-10">
          {/* Data Section */}
          <section>
            <h3 className="zone-label mb-5 border-b border-border/40 pb-2">Contact Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
              <DetailField label="Primary Contact" value={request.primary_contact_name} />
              <DetailField label="Work Email" value={request.work_email} />
              <DetailField label="Phone" value={request.phone || '—'} />
              <DetailField label="Team Size" value={`${request.team_size} members`} />
              <DetailField label="Submitted" value={new Date(request.created_at).toLocaleString()} />
              <DetailField label="Last Updated" value={new Date(request.updated_at).toLocaleString()} />
            </div>
          </section>

          {/* Context Section */}
          <section>
            <h3 className="zone-label mb-5 border-b border-border/40 pb-2">Business Context</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-2">
                <span className="meta-label">Integration Needs</span>
                <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {request.integration_needs || <span className="text-muted-foreground italic">No integrations specified.</span>}
                </p>
              </div>
              <div className="space-y-2">
                <span className="meta-label">Additional Notes</span>
                <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {request.notes || <span className="text-muted-foreground italic">No additional notes provided.</span>}
                </p>
              </div>
            </div>
          </section>

          {/* Infrastructure Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="zone-label mb-5 border-b border-border/40 pb-2">Delivery Log</h3>
              <div className="divide-y divide-border/40">
                <DeliveryRow
                  label="Internal Ops Notification"
                  status={request.notification_status}
                  sentAt={request.notification_sent_at}
                  error={request.notification_error}
                />
                <DeliveryRow
                  label="Requester Confirmation"
                  status={request.requester_confirmation_status}
                  sentAt={request.requester_confirmation_sent_at}
                  error={request.requester_confirmation_error}
                />
              </div>
            </div>

            <div>
              <h3 className="zone-label mb-5 border-b border-border/40 pb-2">Telemetry</h3>
              <div className="grid grid-cols-1 gap-6">
                <DetailField label="Request IP" value={request.request_ip || '—'} mono />
                <DetailField label="Origin Host" value={request.request_origin || '—'} mono />
                <DetailField label="User Agent" value={request.user_agent || '—'} mono />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function AccessRequestsPage() {
  const { data: requests = [], isLoading, error } = useAccessRequests();
  const updateStatus = useUpdateAccessRequestStatus();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RequestFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    if (!selectedRequestId && requests.length > 0) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredRequests = requests.filter((request) => {
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      request.organization_name.toLowerCase().includes(normalizedSearchQuery) ||
      request.primary_contact_name.toLowerCase().includes(normalizedSearchQuery) ||
      request.work_email.toLowerCase().includes(normalizedSearchQuery);

    if (!matchesSearch) return false;

    if (activeFilter === 'review') {
      return request.status === 'submitted' || request.status === 'under_review';
    }

    if (activeFilter === 'approved') {
      return request.status === 'approved' || request.status === 'provisioned';
    }

    if (activeFilter === 'failures') {
      return (
        request.notification_status === 'failed' ||
        request.requester_confirmation_status === 'failed'
      );
    }

    return true;
  });

  useEffect(() => {
    if (filteredRequests.length === 0) {
      setSelectedRequestId(null);
      return;
    }

    if (!selectedRequestId || !filteredRequests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(filteredRequests[0].id);
    }
  }, [filteredRequests, selectedRequestId]);

  const selectedRequest = filteredRequests.find((request) => request.id === selectedRequestId) ?? null;

  const submittedCount = requests.filter((request) => request.status === 'submitted').length;
  const reviewCount = requests.filter((request) => request.status === 'under_review').length;
  const approvedCount = requests.filter(
    (request) => request.status === 'approved' || request.status === 'provisioned',
  ).length;
  const failureCount = requests.filter(
    (request) =>
      request.notification_status === 'failed' ||
      request.requester_confirmation_status === 'failed',
  ).length;

  async function handleStatusChange(request: AccessRequestRecord, status: AccessRequestStatus) {
    if (request.status === status) return;

    try {
      await updateStatus.mutateAsync({ id: request.id, status });
      toast.success(`Request marked as ${formatStatusLabel(status).toLowerCase()}`);
    } catch (statusError) {
      console.error('Failed to update access request status', statusError);
      toast.error('Failed to update request status');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground/60">
          <div className="w-4 h-4 border-2 border-primary border-r-transparent rounded-full animate-spin" />
          <span className="text-[13px] font-medium tracking-wide">Loading workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-12">
      {/* Page Header matching design system specs */}
      <div className="pl-1 max-w-2xl">
        <h1 className="page-header-title">Access Requests</h1>
        <p className="page-header-meta">
          Review organization registration requests, handle platform approvals, and monitor initial provisioning workflow health.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-3 text-destructive">
          <ShieldAlert size={16} className="mt-0.5" />
          <p className="text-[13px] font-medium">System failed to retrieve tenant request pipeline.</p>
        </div>
      )}

      {/* Metric Blocks Layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryTile
          label="Total Intake"
          value={requests.length.toString()}
          meta="All submissions"
          icon={Inbox}
        />
        <SummaryTile
          label="Pending Review"
          value={(submittedCount + reviewCount).toString()}
          meta="Awaiting attention"
          icon={Clock3}
          tone="attention"
        />
        <SummaryTile
          label="Cleared for Setup"
          value={approvedCount.toString()}
          meta="Ready to provision"
          icon={CheckCircle2}
          tone="success"
        />
        <SummaryTile
          label="Workflow Errors"
          value={failureCount.toString()}
          meta="Failed delivery logs"
          icon={AlertTriangle}
          tone={failureCount > 0 ? "attention" : "default"}
        />
      </div>

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start h-[700px]">
        
        {/* Sleek List sidebar */}
        <div className="saas-card flex flex-col h-full overflow-hidden">
          <div className="border-b border-border bg-card z-10">
            <div className="p-3 border-b border-border/50">
              <div className="input-with-icon">
                <Search size={14} className="input-icon" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search requests..."
                  className={inputCls}
                />
              </div>
            </div>
            <QueueFilters
              activeFilter={activeFilter}
              onSelect={setActiveFilter}
              counts={{
                all: requests.length,
                review: submittedCount + reviewCount,
                approved: approvedCount,
                failures: failureCount,
              }}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <div className="empty-state">
                <Inbox size={28} className="empty-state-icon" strokeWidth={1.5} />
                <p className="empty-state-title">No matching requests</p>
                <p className="empty-state-hint">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              filteredRequests.map((request) => (
                <QueueItem
                  key={request.id}
                  request={request}
                  selected={request.id === selectedRequestId}
                  onSelect={() => setSelectedRequestId(request.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Selected Workspace */}
        {selectedRequest ? (
          <RequestDetails
            request={selectedRequest}
            updateStatus={updateStatus}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="saas-card flex flex-col items-center justify-center h-full text-center">
            <div className="empty-state">
              <LayoutDashboard size={28} className="empty-state-icon" strokeWidth={1.5} />
              <p className="empty-state-title">No Request Selected</p>
              <p className="empty-state-hint mt-1">Pick an item from the queue to view details.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
