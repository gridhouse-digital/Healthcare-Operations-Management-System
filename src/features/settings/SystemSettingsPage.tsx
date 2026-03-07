import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Plus, Trash2, Save } from "lucide-react";
import { settingsService } from "@/services/settingsService";
import { toast } from "@/hooks/useToast";
import { useConfirm } from "@/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50";
const labelCls =
  "block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5";
const sectionCls = "p-5 border border-border rounded-lg space-y-4";

export function SystemSettingsPage() {
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [jobRoles, setJobRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    try {
      const [settings, roles] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getJobRoles(),
      ]);
      setSettingsMap(settings);
      setJobRoles(roles);
    } catch (err) {
      console.error("Failed to load system settings", err);
    } finally {
      setLoading(false);
    }
  }

  function updateSetting(key: string, value: string) {
    setSettingsMap((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await settingsService.updateSettings(settingsMap);
      toast.success("Settings saved");
    } catch (err) {
      console.error("Save failed", err);
      toast.error("Failed to save settings");
    }
  }

  async function handleAddRole() {
    if (!newRole.trim()) return;
    if (jobRoles.includes(newRole.trim())) {
      toast.error("Role already exists");
      return;
    }
    const updated = [...jobRoles, newRole.trim()];
    setJobRoles(updated);
    setNewRole("");
    try {
      await settingsService.updateJobRoles(updated);
      toast.success("Role added");
    } catch (err) {
      console.error("Failed to save role", err);
      toast.error("Failed to save role");
    }
  }

  async function handleDeleteRole(roleToDelete: string) {
    const ok = await confirm({
      title: "Delete Role",
      description:
        "Remove this role from the filter list? Existing applicants are not affected.",
      confirmText: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    const updated = jobRoles.filter((r) => r !== roleToDelete);
    setJobRoles(updated);
    try {
      await settingsService.updateJobRoles(updated);
      toast.success("Role removed");
    } catch (err) {
      console.error("Failed to remove role", err);
      toast.error("Failed to remove role");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-[#6B7280] font-mono text-sm">
          Loading settings...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="!font-sans !text-xl !font-semibold !normal-case !tracking-normal !text-foreground flex items-center gap-2">
          <SettingsIcon size={20} className="text-primary" />
          System Settings
        </h2>
        <p className="text-muted-foreground text-[13px] mt-1">
          Configure company branding and system defaults
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Company Branding */}
      <div className={sectionCls}>
        <p className="text-[13px] font-semibold text-foreground">
          Company Branding
        </p>
        <div>
          <label className={labelCls}>Company Name</label>
          <input
            type="text"
            value={settingsMap["company_name"] ?? ""}
            onChange={(e) => updateSetting("company_name", e.target.value)}
            placeholder="Prolific Homecare LLC"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Light Mode Logo URL</label>
          <input
            value={settingsMap["logo_light"] ?? ""}
            onChange={(e) => updateSetting("logo_light", e.target.value)}
            placeholder="https://.../logo-light.png"
            className={inputCls}
          />
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            Used in light mode and emails
          </p>
        </div>
        <div>
          <label className={labelCls}>Dark Mode Logo URL</label>
          <input
            value={settingsMap["logo_dark"] ?? ""}
            onChange={(e) => updateSetting("logo_dark", e.target.value)}
            placeholder="https://.../logo-dark.png"
            className={inputCls}
          />
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            Used in dark mode
          </p>
        </div>
      </div>

      {/* Compliance Rules */}
      <div className={sectionCls}>
        <p className="text-[13px] font-semibold text-foreground">
          Compliance Rules
        </p>
        <div>
          <label className={labelCls}>
            Alert Days Before Document Expiration
          </label>
          <input
            type="number"
            value={settingsMap["compliance_alert_days"] ?? ""}
            onChange={(e) =>
              updateSetting("compliance_alert_days", e.target.value)
            }
            placeholder="30"
            className={inputCls}
          />
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            System will alert when documents are within this many days of
            expiring
          </p>
        </div>
      </div>
      </div>

      {/* Job Roles */}
      <div className={sectionCls}>
        <div>
          <p className="text-[13px] font-semibold text-foreground">Job Roles</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Manage the list of job roles available for applicants and filtering
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddRole();
            }}
            placeholder="Enter new job role..."
            className={inputCls + " flex-1"}
          />
          <button
            onClick={() => void handleAddRole()}
            disabled={!newRole.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Plus size={13} />
            Add
          </button>
        </div>
        <div className="space-y-1.5">
          {jobRoles.map((role, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-3 py-2 rounded-md border border-border group transition-colors"
              style={{ background: "hsl(0 0% 100% / 0.03)" }}
            >
              <span className="text-[13px] text-foreground">{role}</span>
              <button
                onClick={() => void handleDeleteRole(role)}
                className="opacity-0 group-hover:opacity-100 p-0.5 transition-all text-muted-foreground hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {jobRoles.length === 0 && (
            <p className="text-[12px] text-muted-foreground font-mono italic">
              No active job roles configured.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
        >
          <Save size={13} />
          Save Changes
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
      />
    </div>
  );
}
