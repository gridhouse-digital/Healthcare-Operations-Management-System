import { useDeferredValue, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Inbox,
  MessagesSquare,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  'w-full h-9 rounded-lg border border-border/70 bg-background px-3 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/35';

function formatStatusLabel(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function StatusChip({ value }: { value?: string | null }) {
  const styles: Record<string, string> = {
    submitted: 'status-chip status-chip-amber',
    under_review: 'status-chip status-chip-cyan',
    approved: 'status-chip status-chip-green',
    provisioned: 'status-chip status-chip-green',
    rejected: 'status-chip status-chip-red',
    sent: 'status-chip status-chip-green',
    pending: 'status-chip status-chip-amber',
    failed: 'status-chip status-chip-red',
    skipped: 'status-chip status-chip-muted',
  };

  return (
    <span className={styles[value ?? ''] ?? 'status-chip status-chip-muted'}>
      {formatStatusLabel(value)}
    </span>
  );
}

function DeliveryTone({
  status,
  label,
}: {
  status?: string | null;
  label: string;
}) {
  const tone =
    status === 'sent'
      ? 'text-[color:var(--severity-low)]'
      : status === 'failed'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={cn('h-1.5 w-1.5 rounded-full', tone)} style={{ background: 'currentColor' }} />
      <span className={tone}>{label}</span>
    </div>
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
  const iconTone =
    tone === 'success'
      ? 'text-[color:var(--severity-low)]'
      : tone === 'attention'
        ? 'text-[color:var(--severity-medium)]'
        : 'text-primary';

  return (
    <div className="saas-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="zone-label">{label}</p>
          <p className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-foreground">{value}</p>
        </div>
        <Icon size={15} className={iconTone} strokeWidth={2} />
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">{meta}</p>
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
  const hasFailure =
    request.notification_status === 'failed' ||
    request.requester_confirmation_status === 'failed';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl px-4 py-3 text-left transition-colors',
        selected ? 'bg-primary/[0.075]' : 'hover:bg-muted/[0.35]',
      )}
      style={{
        border: selected
          ? '1px solid color-mix(in srgb, var(--primary) 20%, transparent)'
          : '1px solid transparent',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-foreground">
            {request.organization_name}
          </p>
          <p className="mt-1 truncate text-[12px] text-muted-foreground">
            {request.primary_contact_name} / {request.work_email}
          </p>
        </div>
        <StatusChip value={request.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DeliveryTone
          status={request.notification_status}
          label={`Ops ${formatStatusLabel(request.notification_status).toLowerCase()}`}
        />
        <DeliveryTone
          status={request.requester_confirmation_status}
          label={`Requester ${formatStatusLabel(request.requester_confirmation_status).toLowerCase()}`}
        />
        {hasFailure && <StatusChip value="failed" />}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{request.team_size} team</span>
        <span>{new Date(request.created_at).toLocaleDateString()}</span>
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
    <div className="space-y-1.5">
      <p className="form-label mb-0">{label}</p>
      <p className={cn('text-[13px] text-foreground', mono && 'font-mono text-[12px] break-all')}>
        {value}
      </p>
    </div>
  );
}

function DeliveryCard({
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
  const good = status === 'sent';
  const failed = status === 'failed';

  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: good
          ? 'color-mix(in srgb, var(--severity-low) 7%, var(--card))'
          : failed
            ? 'color-mix(in srgb, var(--destructive) 6%, var(--card))'
            : 'color-mix(in srgb, var(--background) 45%, var(--card))',
        border: failed
          ? '1px solid color-mix(in srgb, var(--destructive) 12%, var(--border))'
          : '1px solid color-mix(in srgb, var(--border) 75%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {sentAt ? new Date(sentAt).toLocaleString() : 'No successful delivery logged.'}
          </p>
        </div>
        <StatusChip value={status} />
      </div>
      {error && (
        <p className="mt-3 text-[12px] leading-5 text-destructive whitespace-pre-wrap">{error}</p>
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
  const filters: Array<{ key: RequestFilter; label: string; icon: typeof Inbox }> = [
    { key: 'all', label: 'All Requests', icon: Inbox },
    { key: 'review', label: 'Needs Review', icon: Clock3 },
    { key: 'approved', label: 'Approved', icon: BadgeCheck },
    { key: 'failures', label: 'Delivery Issues', icon: AlertTriangle },
  ];

  return (
    <div className="tab-bar">
      {filters.map(({ key, label, icon: Icon }) => {
        const active = key === activeFilter;

        return (
          <button
            key={key}
            type="button"
            className={cn('tab-item', active && 'active')}
            onClick={() => onSelect(key)}
          >
            <Icon size={13} strokeWidth={2} />
            <span>{label}</span>
            <span className={cn('tab-count', active ? 'tab-count-active' : 'tab-count-inactive')}>
              {counts[key]}
            </span>
          </button>
        );
      })}
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
    <section className="saas-card overflow-hidden">
      <div className="border-b border-border/70 px-6 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-primary" />
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Selected Request
              </span>
            </div>
            <div>
              <h2 className="text-[2rem] font-semibold tracking-[-0.06em] text-foreground">
                {request.organization_name}
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                Review the request details, confirm delivery state, and move the request through the
                onboarding workflow when it is ready for manual provisioning.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span>{request.primary_contact_name}</span>
              <span>/</span>
              <span>{request.work_email}</span>
              <span>/</span>
              <span>{new Date(request.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex min-w-[250px] flex-col gap-2 xl:items-end">
            <StatusChip value={request.status} />
            <select
              value={request.status}
              onChange={(event) => void onStatusChange(request, event.target.value as AccessRequestStatus)}
              disabled={updateStatus.isPending}
              className={cn(inputCls, 'min-w-[220px]')}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {formatStatusLabel(option)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">Status changes are saved immediately.</p>
          </div>
        </div>

        {hasFailure && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/12 bg-destructive/6 px-4 py-3">
            <AlertTriangle size={15} className="mt-0.5 text-destructive" />
            <div>
              <p className="text-[12px] font-semibold text-destructive">Delivery follow-up required</p>
              <p className="mt-1 text-[12px] leading-5 text-destructive/85">
                At least one message failed. The request is still retained, but it should be checked
                before moving forward.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="divide-y divide-border/60">
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            <DetailField label="Primary Contact" value={request.primary_contact_name} />
            <DetailField label="Work Email" value={request.work_email} />
            <DetailField label="Phone" value={request.phone || 'Not provided'} />
            <DetailField label="Team Size" value={request.team_size} />
            <DetailField label="Submitted" value={new Date(request.created_at).toLocaleString()} />
            <DetailField label="Last Updated" value={new Date(request.updated_at).toLocaleString()} />
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl bg-background/55 px-5 py-4">
              <p className="form-label mb-2">Integration Needs</p>
              <p className="text-[13px] leading-6 text-foreground whitespace-pre-wrap">
                {request.integration_needs || 'Not provided'}
              </p>
            </div>
            <div className="rounded-2xl bg-background/55 px-5 py-4">
              <p className="form-label mb-2">Notes</p>
              <p className="text-[13px] leading-6 text-foreground whitespace-pre-wrap">
                {request.notes || 'Not provided'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Delivery Tracking</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Current message state for the internal ops notification and requester confirmation.
              </p>
            </div>
            <div className="hidden items-center gap-2 text-[11px] text-muted-foreground lg:flex">
              <CheckCircle2 size={12} className="text-[color:var(--severity-low)]" />
              <span>Operational status</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DeliveryCard
              label="Ops Notification"
              status={request.notification_status}
              sentAt={request.notification_sent_at}
              error={request.notification_error}
            />
            <DeliveryCard
              label="Requester Confirmation"
              status={request.requester_confirmation_status}
              sentAt={request.requester_confirmation_sent_at}
              error={request.requester_confirmation_error}
            />
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Operational Metadata</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Request telemetry captured from the public intake surface for lightweight review.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                <DetailField label="Request IP" value={request.request_ip || 'Unavailable'} mono />
                <DetailField label="Origin" value={request.request_origin || 'Unavailable'} mono />
                <DetailField label="User Agent" value={request.user_agent || 'Unavailable'} mono />
              </div>
            </div>

            <div className="rounded-2xl bg-primary/[0.045] px-5 py-4">
              <p className="text-[13px] font-semibold text-foreground">Manual Provisioning</p>
              <p className="mt-2 text-[12px] leading-6 text-muted-foreground">
                Approval here only advances review state.
              </p>
              <div className="mt-4 space-y-3 text-[12px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <ArrowRight size={12} className="mt-1 text-primary" />
                  <span>Create the `tenants` row and initialize `tenant_settings`.</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight size={12} className="mt-1 text-primary" />
                  <span>Create or invite the first auth user for that tenant.</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight size={12} className="mt-1 text-primary" />
                  <span>Insert the first `tenant_users` row so claims are minted on sign-in.</span>
                </div>
              </div>
              <div className="mt-5">
                <Button type="button" variant="outline" size="sm" disabled>
                  Runbook Step
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
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
      toast.success(`Request marked ${formatStatusLabel(status).toLowerCase()}`);
    } catch (statusError) {
      console.error('Failed to update access request status', statusError);
      toast.error('Failed to update request status');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-[13px] tracking-[0.02em] text-muted-foreground">
            Loading access requests...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="pl-1">
          <div className="flex items-center gap-2">
            <MessagesSquare size={18} className="text-primary" />
            <h1 className="page-header-title">Access Requests</h1>
          </div>
          <p className="page-header-meta max-w-[720px]">
            Review onboarding demand, identify requests that need action, and move approved tenants
            into the internal provisioning workflow.
          </p>
        </div>

        <div className="max-w-[440px] rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-primary" />
            <span className="text-[12px] font-medium tracking-[-0.01em] text-foreground">
              Platform Admin Workflow
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
            Review happens here. Tenant creation, first-user invitation, and final onboarding still
            follow the manual runbook.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/12 bg-destructive/6 px-4 py-3">
          <p className="text-[13px] text-destructive">Failed to load tenant access requests.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryTile
          label="Total Requests"
          value={requests.length.toString()}
          meta="All captured submissions"
          icon={Building2}
        />
        <SummaryTile
          label="Needs Review"
          value={(submittedCount + reviewCount).toString()}
          meta="Awaiting review action"
          icon={Clock3}
          tone="attention"
        />
        <SummaryTile
          label="Approved / Provisioned"
          value={approvedCount.toString()}
          meta="Ready for manual setup"
          icon={BadgeCheck}
          tone="success"
        />
        <SummaryTile
          label="Delivery Issues"
          value={failureCount.toString()}
          meta="Message follow-up required"
          icon={AlertTriangle}
          tone="attention"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="saas-card overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Review Queue</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Search and open a request to inspect details.
                </p>
              </div>
              <span className="status-chip status-chip-muted">{filteredRequests.length} visible</span>
            </div>
          </div>

          <div className="border-b border-border/60 px-5 py-4">
            <div className="input-with-icon">
              <Search size={14} className="input-icon" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search organization, contact, or email"
                className={cn(inputCls, 'pl-9')}
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

          <div className="max-h-[920px] space-y-1 overflow-y-auto px-3 py-3">
            {filteredRequests.length === 0 ? (
              <div className="empty-state">
                <Inbox size={28} className="empty-state-icon" strokeWidth={1.5} />
                <p className="empty-state-title">No requests in this view</p>
                <p className="empty-state-hint">Change the filter or clear the search query.</p>
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
        </section>

        {selectedRequest ? (
          <RequestDetails
            request={selectedRequest}
            updateStatus={updateStatus}
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="saas-card flex min-h-[420px] items-center justify-center px-6 py-10 text-center">
            <div>
              <Inbox size={28} className="mx-auto text-muted-foreground/20" strokeWidth={1.5} />
              <p className="mt-3 text-[13px] font-medium text-muted-foreground">No request selected</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Pick an item from the queue to open the review workspace.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
