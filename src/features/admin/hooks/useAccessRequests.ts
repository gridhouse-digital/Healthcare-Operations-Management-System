import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AccessRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'provisioned';

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface AccessRequestRecord {
  id: string;
  organization_name: string;
  primary_contact_name: string;
  work_email: string;
  phone: string | null;
  team_size: string;
  integration_needs: string | null;
  notes: string | null;
  status: AccessRequestStatus;
  notification_status: DeliveryStatus;
  notification_error: string | null;
  notification_sent_at: string | null;
  requester_confirmation_status: DeliveryStatus;
  requester_confirmation_error: string | null;
  requester_confirmation_sent_at: string | null;
  request_ip: string | null;
  request_origin: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

type AccessRequestRow = Partial<AccessRequestRecord> & Pick<
  AccessRequestRecord,
  | 'id'
  | 'organization_name'
  | 'primary_contact_name'
  | 'work_email'
  | 'team_size'
  | 'created_at'
 >;

const QK = {
  accessRequests: ['tenant-access-requests'] as const,
};

async function fetchAccessRequests(): Promise<AccessRequestRecord[]> {
  const { data, error } = await supabase
    .from('tenant_access_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as AccessRequestRow[]).map((row) => ({
    id: row.id,
    organization_name: row.organization_name,
    primary_contact_name: row.primary_contact_name,
    work_email: row.work_email,
    phone: row.phone ?? null,
    team_size: row.team_size,
    integration_needs: row.integration_needs ?? null,
    notes: row.notes ?? null,
    status: row.status ?? 'submitted',
    notification_status: row.notification_status ?? 'pending',
    notification_error: row.notification_error ?? null,
    notification_sent_at: row.notification_sent_at ?? null,
    requester_confirmation_status: row.requester_confirmation_status ?? 'pending',
    requester_confirmation_error: row.requester_confirmation_error ?? null,
    requester_confirmation_sent_at: row.requester_confirmation_sent_at ?? null,
    request_ip: row.request_ip ?? null,
    request_origin: row.request_origin ?? null,
    user_agent: row.user_agent ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  }));
}

export function useAccessRequests() {
  return useQuery({
    queryKey: QK.accessRequests,
    queryFn: fetchAccessRequests,
  });
}

interface UpdateAccessRequestStatusPayload {
  id: string;
  status: AccessRequestStatus;
}

async function updateAccessRequestStatus({
  id,
  status,
}: UpdateAccessRequestStatusPayload): Promise<void> {
  const { error } = await supabase
    .from('tenant_access_requests')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
}

export function useUpdateAccessRequestStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAccessRequestStatus,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.accessRequests });
    },
  });
}
