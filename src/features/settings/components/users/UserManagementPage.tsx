import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { UserCog, UserPlus, ChevronDown } from "lucide-react";
import {
  useTenantUsers,
  useInviteUser,
  useUpdateUserRole,
  useDeactivateUser,
} from "../../hooks/useUserManagement";
import type { TenantUser, TenantRole } from "../../hooks/useUserManagement";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared styles (matches SystemSettingsPage)
// ---------------------------------------------------------------------------

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50";
const labelCls =
  "block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5";

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
    platform_admin: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
    tenant_admin: "bg-primary/15 text-primary border border-primary/30",
    hr_admin: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium font-mono", styles[role])}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TenantUser["status"] }) {
  const styles = {
    active: "text-primary",
    pending: "text-amber-400",
    deactivated: "text-muted-foreground",
  };
  return (
    <span className={cn("text-[11px] font-mono", styles[status])}>
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
          <p className="text-muted-foreground text-[11px] font-mono mt-0.5">
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
            <div className="relative">
              <select
                value={user.role}
                onChange={(e) => void handleRoleChange(e.target.value as TenantRole)}
                disabled={updateRole.isPending}
                className="appearance-none bg-transparent border border-border text-muted-foreground text-[11px] rounded-md px-3 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow cursor-pointer"
              >
                <option value="hr_admin">HR Admin</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

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
  const { register, handleSubmit, formState: { isSubmitting } } =
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
      <div className="border border-border rounded-lg p-5 w-full max-w-md" style={{ background: "var(--background)" }}>
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
            <select
              {...register("role")}
              className={inputCls}
            >
              <option value="hr_admin">HR Admin</option>
              <option value="tenant_admin">Tenant Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || invite.isPending}
              className="flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {invite.isPending ? "Sending\u2026" : "Send Invitation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center h-8 px-3 rounded-md border border-border text-muted-foreground text-[13px] hover:bg-muted/20 transition-colors"
            >
              Cancel
            </button>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="!font-sans !text-xl !font-semibold !normal-case !tracking-normal !text-foreground flex items-center gap-2">
            <UserCog size={20} className="text-primary" />
            Team Members
          </h2>
          <p className="text-muted-foreground text-[13px] mt-1">
            Manage who has access to your tenant's compliance data.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
        >
          <UserPlus size={13} />
          Invite User
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-muted-foreground font-mono text-[13px]">Loading users&hellip;</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground">User</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground">Role</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground">Added</th>
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
