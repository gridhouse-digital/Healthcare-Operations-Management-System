import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// FR-19: User management — invite, roles, deactivate

export type TenantRole = "platform_admin" | "tenant_admin" | "hr_admin";
export type UserStatus = "active" | "pending" | "deactivated";

export interface TenantUser {
  id: string;
  user_id: string;
  tenant_id: string;
  role: TenantRole;
  status: UserStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined from auth.users via EF
  email?: string;
  last_sign_in_at?: string | null;
}

const QK = { users: ["tenant-users"] as const };

// ---------------------------------------------------------------------------
// Fetch users
// ---------------------------------------------------------------------------

async function fetchUsers(): Promise<TenantUser[]> {
  const { data, error } = await supabase.functions.invoke("list-tenant-users");
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
  return (data as { users: TenantUser[] }).users;
}

export function useTenantUsers() {
  return useQuery({
    queryKey: QK.users,
    queryFn: fetchUsers,
  });
}

// ---------------------------------------------------------------------------
// Invite user
// ---------------------------------------------------------------------------

interface InviteUserPayload {
  email: string;
  role: TenantRole;
}

async function inviteUser(payload: InviteUserPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke("invite-tenant-user", {
    body: payload,
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inviteUser,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.users }); },
  });
}

// ---------------------------------------------------------------------------
// Update role
// ---------------------------------------------------------------------------

interface UpdateRolePayload {
  userId: string;
  tenantUserId: string;
  role: TenantRole;
}

async function updateRole(payload: UpdateRolePayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke("update-tenant-user-role", {
    body: payload,
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRole,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.users }); },
  });
}

// ---------------------------------------------------------------------------
// Deactivate user
// ---------------------------------------------------------------------------

async function deactivateUser(tenantUserId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("deactivate-tenant-user", {
    body: { tenantUserId },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.users }); },
  });
}
