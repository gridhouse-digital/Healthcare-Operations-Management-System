import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { UserCog, UserPlus } from "lucide-react";
import {
  useTenantUsers,
  useInviteUser,
  useUpdateUserRole,
  useDeactivateUser,
} from "../../hooks/useUserManagement";
import type { TenantUser, TenantRole } from "../../hooks/useUserManagement";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/AppSelect";

// ---------------------------------------------------------------------------
// Shared styles (matches SystemSettingsPage)
// ---------------------------------------------------------------------------

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50 [&_option]:bg-card [&_option]:text-foreground";
const labelCls = "form-label";

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<TenantRole, string> = {
  platform_admin: "Platform Admin",
  tenant_admin: "Tenant Admin",
  hr_admin: "HR Admin",
};

function RoleBadge({ role }: { role: TenantRole }) {
  const styles: Record<TenantRole, string> = {
    platform_admin: "status-chip status-chip-cyan",
    tenant_admin: "status-chip status-chip-green",
    hr_admin: "status-chip status-chip-muted",
  };
  return (
    <span className={styles[role]}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TenantUser["status"] }) {
  const styles = {
    active: "status-chip status-chip-green",
    pending: "status-chip status-chip-amber",
    deactivated: "status-chip status-chip-muted",
  };
  return (
    <span className={styles[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// User row
// ---------------------------------------------------------------------------

function UserRow({ user }: { user: TenantUser }) {
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
          <p className="text-foreground text-[13px]">{user.email ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
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
        <StatusBadge status={user.status} />
      </td>
      <td className="px-4 py-3">
        <p className="text-muted-foreground text-[11px]">
          {new Date(user.created_at).toLocaleDateString()}
        </p>
      </td>
      <td className="px-4 py-3">
        {user.status !== "deactivated" && (
          <div className="flex items-center gap-2">
            <AppSelect
              value={user.role}
              onValueChange={(value) => void handleRoleChange(value as TenantRole)}
              disabled={updateRole.isPending}
              options={[
                { value: "hr_admin", label: "HR Admin" },
                { value: "tenant_admin", label: "Tenant Admin" },
              ]}
              className="h-8 min-w-[130px] px-3 text-[11px] text-muted-foreground"
            />

            {!confirmDeactivate ? (
              <button
                onClick={() => setConfirmDeactivate(true)}
                className="text-[11px] text-muted-foreground hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-red-500/10"
              >
                Deactivate
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={handleDeactivate}
                  disabled={deactivate.isPending}
                  className="text-[11px] text-red-400 border border-red-500/30 px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDeactivate(false)}
                  className="text-[11px] text-muted-foreground px-2 py-1 rounded-md hover:bg-muted/20 transition-colors"
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
    } catch {
      toast.error("Failed to send invitation");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="saas-card w-full max-w-md p-5">
        <h3 className="text-foreground font-semibold text-[13px] mb-4">Invite Team Member</h3>

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

export function UserManagementPage() {
  const { data: users = [], isLoading } = useTenantUsers();
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4">
        <div className="pl-1">
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-primary" />
            <h1 className="page-header-title">Team Members</h1>
          </div>
          <p className="page-header-meta">
            Manage who has access to your tenant's compliance data.
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          size="sm"
        >
          <UserPlus size={13} />
          Invite User
        </Button>
      </div>

      <div className="saas-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-[13px] text-muted-foreground">Loading users&hellip;</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left"><span className="zone-label">User</span></th>
                <th className="px-4 py-2.5 text-left"><span className="zone-label">Role</span></th>
                <th className="px-4 py-2.5 text-left"><span className="zone-label">Status</span></th>
                <th className="px-4 py-2.5 text-left"><span className="zone-label">Added</span></th>
                <th className="px-4 py-2.5 w-48" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-[13px]">
                    No team members yet. Invite your first colleague.
                  </td>
                </tr>
              ) : (
                users.map((user) => <UserRow key={user.id} user={user} />)
              )}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
