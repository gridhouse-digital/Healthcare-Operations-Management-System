import { useDeferredValue, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { AlertCircle, Inbox, Search, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge';
import { AppSelect } from '@/components/ui/AppSelect';
import { SlideOver } from '@/components/ui/SlideOver';
import { useTableSort, type SortColumn } from '@/hooks/useTableSort';
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

const toneMap: Record<string, StatusTone> = {
  submitted: 'waiting',
  under_review: 'active',
  approved: 'done',
  provisioned: 'done',
  rejected: 'critical',
  sent: 'done',
  pending: 'waiting',
  failed: 'critical',
  skipped: 'neutral',
};

function formatStatusLabel(value?: string | null) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value: string) {
  return format(new Date(value), 'MMM d, yyyy, h:mm a');
}

function hasDeliveryFailure(request: AccessRequestRecord) {
  return request.notification_status === 'failed' || request.requester_confirmation_status === 'failed';
}

function isInReview(request: AccessRequestRecord) {
  return request.status === 'submitted' || request.status === 'under_review';
}

function isApproved(request: AccessRequestRecord) {
  return request.status === 'approved' || request.status === 'provisioned';
}

const SORT_COLUMNS = {
  organization: { value: (row) => row.organization_name },
  contact: { value: (row) => row.primary_contact_name },
  teamSize: { value: (row) => row.team_size },
  status: { value: (row) => formatStatusLabel(row.status) },
  submitted: { value: (row) => row.created_at, kind: 'date' },
} satisfies Record<string, SortColumn<AccessRequestRecord>>;

const DEFAULT_SORT = { key: 'submitted', direction: 'desc' } as const;

function StatusChip({ value }: { value?: string | null }) {
  return <StatusBadge status={formatStatusLabel(value)} tone={toneMap[value ?? ''] ?? 'neutral'} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h3 className="text-title text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="zone-label">{label}</dt>
      <dd className={`text-sm text-foreground break-words ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function LongText({ label, value, empty }: { label: string; value: string | null; empty: string }) {
  return (
    <div className="space-y-1">
      <p className="zone-label">{label}</p>
      <p className={`whitespace-pre-wrap text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value || empty}
      </p>
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
    <div className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <StatusChip value={status} />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {sentAt ? `Sent ${formatDateTime(sentAt)}` : 'No send recorded'}
      </p>
      {error && (
        <p className="severity-critical whitespace-pre-wrap rounded-md border border-destructive/15 bg-destructive/8 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function RequestDetails({
  request,
  saving,
  onStatusChange,
}: {
  request: AccessRequestRecord;
  saving: boolean;
  onStatusChange: (request: AccessRequestRecord, status: AccessRequestStatus) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-section text-foreground">{request.organization_name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Request {request.id.slice(0, 8)}</p>
        </div>
        <StatusChip value={request.status} />
      </div>

      {hasDeliveryFailure(request) && (
        <div className="severity-critical flex items-start gap-3 rounded-md border border-destructive/15 bg-destructive/8 p-4">
          <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-destructive">An email failed to send</p>
            <p className="mt-0.5 text-xs text-destructive">The delivery section below has the error.</p>
          </div>
        </div>
      )}

      <label className="block">
        <span className="form-label">Review state</span>
        <AppSelect
          value={request.status}
          onValueChange={(value) => void onStatusChange(request, value as AccessRequestStatus)}
          disabled={saving}
          options={statusOptions.map((option) => ({ value: option, label: formatStatusLabel(option) }))}
          className="min-h-10"
        />
      </label>

      <Section title="Contact">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Primary contact" value={request.primary_contact_name} />
          <DetailField label="Work email" value={request.work_email} />
          <DetailField label="Phone" value={request.phone || '—'} />
          <DetailField label="Team size" value={`${request.team_size} members`} />
          <DetailField label="Submitted" value={formatDateTime(request.created_at)} />
          <DetailField label="Last updated" value={formatDateTime(request.updated_at)} />
        </dl>
      </Section>

      <Section title="What they need">
        <LongText label="Integration needs" value={request.integration_needs} empty="No integrations specified." />
        <LongText label="Additional notes" value={request.notes} empty="No additional notes provided." />
      </Section>

      <Section title="Email delivery">
        <div className="divide-y divide-border">
          <DeliveryRow
            label="Internal ops notification"
            status={request.notification_status}
            sentAt={request.notification_sent_at}
            error={request.notification_error}
          />
          <DeliveryRow
            label="Requester confirmation"
            status={request.requester_confirmation_status}
            sentAt={request.requester_confirmation_sent_at}
            error={request.requester_confirmation_error}
          />
        </div>
      </Section>

      <Section title="Where it came from">
        <dl className="grid gap-4">
          <DetailField label="Request IP" value={request.request_ip || '—'} mono />
          <DetailField label="Origin host" value={request.request_origin || '—'} mono />
          <DetailField label="User agent" value={request.user_agent || '—'} mono />
        </dl>
      </Section>
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

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredRequests = requests.filter((request) => {
    const matchesSearch =
      normalizedSearchQuery.length === 0 ||
      request.organization_name.toLowerCase().includes(normalizedSearchQuery) ||
      request.primary_contact_name.toLowerCase().includes(normalizedSearchQuery) ||
      request.work_email.toLowerCase().includes(normalizedSearchQuery);

    if (!matchesSearch) return false;
    if (activeFilter === 'review') return isInReview(request);
    if (activeFilter === 'approved') return isApproved(request);
    if (activeFilter === 'failures') return hasDeliveryFailure(request);
    return true;
  });
  const { sortedRows: sortedRequests, sortProps } = useTableSort(filteredRequests, SORT_COLUMNS, DEFAULT_SORT);

  /* Looked up from every request, so a status change that leaves the current tab keeps the drawer open */
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null;
  const reviewCount = requests.filter(isInReview).length;

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
    return <PageSkeleton label="Loading access requests" />;
  }

  /* A failed load must never read as an empty queue */
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="page-header-title">Access Requests</h1>
        <div className="severity-critical flex items-start gap-3 rounded-md border border-destructive/15 bg-destructive/8 p-4">
          <ShieldAlert size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm font-semibold text-destructive">Access requests could not be loaded. Reload to try again.</p>
        </div>
      </div>
    );
  }

  const tabs: Array<{ value: RequestFilter; label: string; count: number }> = [
    { value: 'all', label: 'All requests', count: requests.length },
    { value: 'review', label: 'Review', count: reviewCount },
    { value: 'approved', label: 'Approved', count: requests.filter(isApproved).length },
    { value: 'failures', label: 'Issues', count: requests.filter(hasDeliveryFailure).length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header-title">Access Requests</h1>
        <p className="page-header-meta tabular-nums">
          {requests.length} requests, {reviewCount} waiting for review
        </p>
      </div>

      <div>
        <div className="tab-bar" aria-label="Filter requests">
          {tabs.map((tab) => {
            const active = activeFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilter(tab.value)}
                className={`tab-item${active ? ' active' : ''}`}
              >
                {tab.label}
                <span className={`tab-count ${active ? 'tab-count-active' : 'tab-count-inactive'}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        <div className="py-3">
          <div className="relative min-w-0 sm:max-w-sm">
            <Search size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search requests by organization, contact or email"
              placeholder="Search organization, contact or email…"
              className="saas-input pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto border-t border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader label="Organization" {...sortProps('organization')} className="py-3 pr-4 text-left" />
                <SortableHeader label="Contact" {...sortProps('contact')} className="hidden py-3 pr-4 text-left md:table-cell" />
                <SortableHeader label="Team Size" {...sortProps('teamSize')} className="hidden py-3 pr-4 text-left lg:table-cell" />
                <SortableHeader label="Status" {...sortProps('status')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                <SortableHeader label="Submitted" {...sortProps('submitted')} className="hidden py-3 pr-4 text-right md:table-cell" />
                <th scope="col" className="w-16 py-3 text-right zone-label"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedRequests.map((request) => (
                <tr
                  key={request.id}
                  className="table-row-interactive group"
                  onClick={() => setSelectedRequestId(request.id)}
                >
                  <td className="max-w-0 py-3 pr-4 sm:max-w-none">
                    <p className="truncate text-sm font-medium text-foreground">{request.organization_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{request.work_email}</p>
                    <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                      <StatusChip value={request.status} />
                      {hasDeliveryFailure(request) && <StatusBadge status="Email failed" tone="critical" />}
                    </div>
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    <span className="text-sm text-secondary-foreground">{request.primary_contact_name}</span>
                  </td>
                  <td className="hidden py-3 pr-4 lg:table-cell">
                    <span className="text-sm tabular-nums text-muted-foreground">{request.team_size}</span>
                  </td>
                  <td className="hidden py-3 pr-4 sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <StatusChip value={request.status} />
                      {hasDeliveryFailure(request) && <StatusBadge status="Email failed" tone="critical" />}
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap py-3 pr-4 text-right md:table-cell">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {format(new Date(request.created_at), 'MMM d, yyyy')}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Open request from ${request.organization_name}`}
                      onClick={(event) => { event.stopPropagation(); setSelectedRequestId(request.id); }}
                      className="min-h-8 text-sm font-medium text-primary transition-opacity hover:text-accent-hi focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {sortedRequests.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Inbox size={28} className="empty-state-icon" strokeWidth={1.75} aria-hidden="true" />
                      <p className="empty-state-title">
                        {requests.length === 0 ? 'No access requests yet' : 'No requests match your filters'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOver
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequestId(null)}
        title="Access Request"
        width="lg"
      >
        {selectedRequest && (
          <RequestDetails
            request={selectedRequest}
            saving={updateStatus.isPending}
            onStatusChange={handleStatusChange}
          />
        )}
      </SlideOver>
    </div>
  );
}
