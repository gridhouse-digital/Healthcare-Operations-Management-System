import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  useTenantUsers,
  useInviteUser,
  useUpdateUserRole,
  useDeactivateUser,
} from "../../hooks/useUserManagement";
import type { TenantUser, TenantRole } from "../../hooks/useUserManagement";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/AppSelect";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort, type SortColumn } from "@/hooks/useTableSort";

// ---------------------------------------------------------------------------
// Shared styles (matches SystemSettingsPage)
// ---------------------------------------------------------------------------

const inputCls = "saas-input";
const labelCls = "form-label";

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<TenantRole, string> = {
  platform_admin: "Platform Admin",
  tenant_admin: "Tenant Admin",
  hr_admin: "HR Admin",
};

const ROLE_TONES: Record<TenantRole, StatusTone> = {
  platform_admin: "active",
  tenant_admin: "active",
  hr_admin: "neutral",
};

function RoleBadge({ role }: { role: TenantRole }) {
  return <StatusBadge status={ROLE_LABELS[role]} tone={ROLE_TONES[role]} />;
}

const USER_TONES: Record<TenantUser["status"], StatusTone> = {
  active: "done",
  pending: "waiting",
  deactivated: "neutral",
};

function UserStatusBadge({ status }: { status: TenantUser["status"] }) {
  return <StatusBadge status={status.charAt(0).toUpperCase() + status.slice(1)} tone={USER_TONES[status]} />;
}

// ---------------------------------------------------------------------------
// User row
// ---------------------------------------------------------------------------

function UserRow({ user, canManage }: { user: TenantUser; canManage: boolean }) {
  const updateRole = useUpdateUserRole();
  const deactivate = useDeactivateUser();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function handleRoleChange(role: TenantRole) {
    if (role === user.role) return;
    try {
      await updateRole.mutateAsync({ userId: user.user_id, tenantUserId: user.id, role });
      toast.success("Role updated — user will need to re-login");
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleDeactivate() {
    try {
      await deactivate.mutateAsync(user.id);
      toast.success("User deactivated");
      setConfirmDeactivate(false);
    } catch {
      toast.error("Failed to deactivate user");
    }
  }

  return (
    <tr className="border-b border-border hover:bg-muted/5 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-foreground text-sm">{user.email ?? "—"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.last_sign_in_at
              ? `Last seen ${new Date(user.last_sign_in_at).toLocaleDateString()}`
              : "Never signed in"}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-3">
        <UserStatusBadge status={user.status} />
      </td>
      <td className="px-4 py-3">
        <p className="text-muted-foreground text-xs">
          {new Date(user.created_at).toLocaleDateString()}
        </p>
      </td>
      <td className="px-4 py-3">
        {canManage && user.status !== "deactivated" && (
          <div className="flex items-center gap-2">
            <AppSelect
              value={user.role}
              onValueChange={(value) => void handleRoleChange(value as TenantRole)}
              disabled={updateRole.isPending}
              options={[
                { value: "hr_admin", label: "HR Admin" },
                { value: "tenant_admin", label: "Tenant Admin" },
              ]}
              className="h-8 min-w-[130px] px-3 text-xs text-muted-foreground"
            />

            {!confirmDeactivate ? (
              <button
                onClick={() => setConfirmDeactivate(true)}
                className="text-xs text-muted-foreground hover:text-error transition-colors px-2 py-1 rounded-md hover:bg-error/20"
              >
                Deactivate
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={handleDeactivate}
                  disabled={deactivate.isPending}
                  className="text-xs text-error border border-error/30 px-2 py-1 rounded-md hover:bg-error/20 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDeactivate(false)}
                  className="text-xs text-muted-foreground px-2 py-1 rounded-md hover:bg-muted/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Invite modal
// ---------------------------------------------------------------------------

interface InviteFormValues {
  email: string;
  role: TenantRole;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { control, register, handleSubmit, formState: { isSubmitting } } =
    useForm<InviteFormValues>({ defaultValues: { role: "hr_admin" } });
  const invite = useInviteUser();

  async function onSubmit(values: InviteFormValues) {
    try {
      await invite.mutateAsync(values);
      toast.success(`Invitation sent to ${values.email}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invitation");
    }
  }

  return (
    <div className="fixed inset-0 bg-shade/60 flex items-center justify-center z-50">
      <div className="saas-card w-full max-w-md p-5">
        <h3 className="text-foreground font-medium text-sm mb-4">Invite Team Member</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Email Address</label>
            <input
              {...register("email", { required: true })}
              type="email"
              placeholder="colleague@example.com"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Role</label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <AppSelect
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: "hr_admin", label: "HR Admin" },
                    { value: "tenant_admin", label: "Tenant Admin" },
                  ]}
                  className={inputCls + " justify-between"}
                />
              )}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="submit"
              disabled={isSubmitting || invite.isPending}
              size="sm"
              className="flex-1"
            >
              {invite.isPending ? "Sending\u2026" : "Send Invitation"}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SORT_COLUMNS = {
  user: { value: (user) => user.email },
  role: { value: (user) => ROLE_LABELS[user.role] },
  status: { value: (user) => user.status },
  added: { value: (user) => user.created_at, kind: "date" },
} satisfies Record<string, SortColumn<TenantUser>>;

export function UserManagementPage() {
  const { data: users = [], isLoading } = useTenantUsers();
  const { sortedRows: sortedUsers, sortProps } = useTableSort(users, SORT_COLUMNS);
  const [showInvite, setShowInvite] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUserId(session?.user.id ?? null));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-header-title">Team Members</h1>
          <p className="page-header-meta">
            Manage who has access to your tenant's compliance data.
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          size="sm"
        >
          <UserPlus size={14} aria-hidden="true" />
          Invite User
        </Button>
      </div>

      <div className="saas-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-sm text-muted-foreground">Loading users&hellip;</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <SortableHeader label="User" {...sortProps("user")} className="px-4 py-2.5 text-left" />
                <SortableHeader label="Role" {...sortProps("role")} className="px-4 py-2.5 text-left" />
                <SortableHeader label="Status" {...sortProps("status")} className="px-4 py-2.5 text-left" />
                <SortableHeader label="Added" {...sortProps("added")} className="px-4 py-2.5 text-left" />
                <th className="px-4 py-2.5 w-48" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No team members yet. Invite your first colleague.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    /* Matches the server: your own account and platform admins aren't editable here */
                    canManage={currentUserId !== null && user.user_id !== currentUserId && user.role !== "platform_admin"}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
