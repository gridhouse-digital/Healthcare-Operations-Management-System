import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { UserPlus, ChevronDown } from "lucide-react";
import {
  useTenantUsers,
  useInviteUser,
  useUpdateUserRole,
  useDeactivateUser,
} from "../../hooks/useUserManagement";
import type { TenantUser, TenantRole } from "../../hooks/useUserManagement";
import { cn } from "@/lib/utils";

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
    tenant_admin: "bg-[#00C9B1]/15 text-[#00C9B1] border border-[#00C9B1]/30",
    hr_admin: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium font-mono", styles[role])}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TenantUser["status"] }) {
  const styles = {
    active: "text-[#00C9B1]",
    pending: "text-amber-400",
    deactivated: "text-[#6B7280]",
  };
  return (
    <span className={cn("text-xs font-mono", styles[status])}>
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
      toast.success(`Role updated — user will need to re-login`);
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
    <tr className="border-b border-[#1F2433] hover:bg-[#1F2433]/40 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-white text-sm">{user.email ?? "—"}</p>
          <p className="text-[#6B7280] text-xs font-mono mt-0.5">
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
        <p className="text-[#6B7280] text-xs">
          {new Date(user.created_at).toLocaleDateString()}
        </p>
      </td>
      <td className="px-4 py-3">
        {user.status !== "deactivated" && (
          <div className="flex items-center gap-2">
            {/* Role selector */}
            <div className="relative">
              <select
                value={user.role}
                onChange={(e) => void handleRoleChange(e.target.value as TenantRole)}
                disabled={updateRole.isPending}
                className="appearance-none bg-[#0D0F14] border border-[#1F2433] text-[#9CA3AF] text-xs rounded-[8px] px-3 py-1.5 pr-6 focus:outline-none focus:border-[#00C9B1] transition-colors cursor-pointer"
              >
                <option value="hr_admin">HR Admin</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none" />
            </div>

            {/* Deactivate */}
            {!confirmDeactivate ? (
              <button
                onClick={() => setConfirmDeactivate(true)}
                className="text-xs text-[#6B7280] hover:text-red-400 transition-colors px-2 py-1 rounded-[8px] hover:bg-red-500/10"
              >
                Deactivate
              </button>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={handleDeactivate}
                  disabled={deactivate.isPending}
                  className="text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded-[8px] hover:bg-red-500/10 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDeactivate(false)}
                  className="text-xs text-[#6B7280] px-2 py-1 rounded-[8px] hover:bg-[#1F2433] transition-colors"
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
      <div className="bg-[#1A1D26] border border-[#1F2433] rounded-[20px] p-6 w-full max-w-md">
        <h3 className="text-white font-semibold text-base mb-4">Invite Team Member</h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-[#6B7280] mb-1.5">
              Email Address
            </label>
            <input
              {...register("email", { required: true })}
              type="email"
              placeholder="colleague@example.com"
              className="w-full rounded-[10px] bg-[#0D0F14] border border-[#1F2433] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#00C9B1] transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-[#6B7280] mb-1.5">
              Role
            </label>
            <select
              {...register("role")}
              className="w-full rounded-[10px] bg-[#0D0F14] border border-[#1F2433] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#00C9B1] transition-colors"
            >
              <option value="hr_admin">HR Admin</option>
              <option value="tenant_admin">Tenant Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || invite.isPending}
              className="flex-1 rounded-[10px] bg-[#00C9B1] text-[#0D0F14] py-2 text-sm font-semibold hover:bg-[#00C9B1]/90 disabled:opacity-40 transition-colors"
            >
              {invite.isPending ? "Sending…" : "Send Invitation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-[#1F2433] text-[#9CA3AF] px-4 py-2 text-sm hover:bg-[#1F2433] transition-colors"
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-xl font-semibold">Team Members</h2>
          <p className="text-[#6B7280] text-sm mt-1">
            Manage who has access to your tenant's compliance data.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 rounded-[10px] bg-[#00C9B1] text-[#0D0F14] px-4 py-2 text-sm font-semibold hover:bg-[#00C9B1]/90 transition-colors"
        >
          <UserPlus size={14} />
          Invite User
        </button>
      </div>

      <div className="rounded-[20px] bg-[#1A1D26] border border-[#1F2433] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-[#6B7280] font-mono text-sm">Loading users…</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1F2433]">
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">User</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">Role</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">Status</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-widest text-[#6B7280]">Added</th>
                <th className="px-4 py-3 w-48" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[#6B7280] text-sm">
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
