import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Plus, Trash2, Save } from "lucide-react";
import { settingsService } from "@/services/settingsService";
import { toast } from "@/hooks/useToast";
import { useConfirm } from "@/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  useOfferLetterSettings,
  useSaveOfferLetterSettings,
  type SaveOfferLetterSettingsPayload,
} from "./hooks/useTenantSettings";
import {
  DEFAULT_OFFER_LETTER_TEMPLATE,
  OFFER_MERGE_FIELDS,
  getOfferLetterSettings,
} from "@/features/offers/renderOfferLetter";

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50";
const textareaCls =
  "w-full min-h-72 px-3 py-2 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50 font-mono leading-relaxed resize-y";
const labelCls = "form-label";
const sectionCls = "saas-card p-5 space-y-4";

const emptyOfferForm: SaveOfferLetterSettingsPayload = {
  offer_company_name: "",
  offer_signatory_name: "",
  offer_signatory_title: "",
  offer_letter_template: DEFAULT_OFFER_LETTER_TEMPLATE,
};

export function SystemSettingsPage() {
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [jobRoles, setJobRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [offerForm, setOfferForm] = useState<SaveOfferLetterSettingsPayload>(emptyOfferForm);
  const {
    data: offerLetterSettings,
    isLoading: offerLetterSettingsLoading,
    error: offerLetterSettingsError,
  } = useOfferLetterSettings();
  const saveOfferLetterSettings = useSaveOfferLetterSettings();
  const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!offerLetterSettings || offerLetterSettings.migrationRequired) return;
    const normalized = getOfferLetterSettings(offerLetterSettings);
    setOfferForm({
      offer_company_name: offerLetterSettings.offer_company_name ?? "",
      offer_signatory_name: offerLetterSettings.offer_signatory_name ?? "",
      offer_signatory_title: offerLetterSettings.offer_signatory_title ?? "",
      offer_letter_template: offerLetterSettings.offer_letter_template ?? normalized.template,
    });
  }, [offerLetterSettings]);

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

  function updateOfferSetting(key: keyof SaveOfferLetterSettingsPayload, value: string) {
    setOfferForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await settingsService.updateSettings(settingsMap);

      if (offerLetterSettingsLoading) {
        toast.warning("General settings saved. Offer Letter settings are still loading and were not saved.");
        return;
      }

      if (offerLetterSettingsError) {
        toast.warning("General settings saved. Offer Letter settings were not saved because they failed to load.");
        return;
      }

      if (offerLetterSettings?.migrationRequired === true) {
        toast.warning("General settings saved. Apply the Phase 2 migration before saving Offer Letter settings.");
        return;
      }

      if (offerLetterSettings?.migrationRequired === false) {
        await saveOfferLetterSettings.mutateAsync(offerForm);
      }

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

  const offerSettingsDisabled =
    Boolean(offerLetterSettingsError) ||
    offerLetterSettings?.migrationRequired === true ||
    offerLetterSettingsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm tracking-[0.02em] text-muted-foreground">
          Loading settings...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pl-1">
        <div className="flex items-center gap-2">
          <SettingsIcon size={18} className="text-primary" />
          <h1 className="page-header-title">System Settings</h1>
        </div>
        <p className="page-header-meta">
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
            placeholder="Your Organization"
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
          <p className="mt-1 text-[12px] tracking-[0.01em] text-muted-foreground">
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
          <p className="mt-1 text-[12px] tracking-[0.01em] text-muted-foreground">
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
          <p className="mt-1 text-[12px] tracking-[0.01em] text-muted-foreground">
            System will alert when documents are within this many days of
            expiring
          </p>
        </div>
      </div>
      </div>

      {/* Offer Letter */}
      <div className={sectionCls}>
        <div>
          <p className="text-[13px] font-semibold text-foreground">Offer Letter</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Configure the tenant-specific offer identity and default letter template.
          </p>
        </div>

        {offerLetterSettingsLoading && (
          <div className="rounded-md border border-border bg-muted/15 p-3">
            <p className="text-[12px] text-muted-foreground">Loading offer letter settings...</p>
          </div>
        )}

        {offerLetterSettings?.migrationRequired && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[13px] font-medium text-amber-800 dark:text-amber-200">
              Offer Letter settings require the Phase 2 database migration.
            </p>
            <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-200/80">
              Apply `20260620000001_offer_letter_template_settings.sql` before editing tenant offer templates.
            </p>
          </div>
        )}

        {offerLetterSettingsError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/8 p-3">
            <p className="text-[13px] font-medium text-destructive">
              Failed to load Offer Letter settings.
            </p>
            <p className="mt-1 text-[12px] text-destructive/80">
              {offerLetterSettingsError instanceof Error ? offerLetterSettingsError.message : "Check authentication, permissions, and network connectivity."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Offer Company Name</label>
            <input
              type="text"
              value={offerForm.offer_company_name}
              onChange={(e) => updateOfferSetting("offer_company_name", e.target.value)}
              placeholder="Your Organization"
              disabled={offerSettingsDisabled}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Signatory Name</label>
            <input
              type="text"
              value={offerForm.offer_signatory_name}
              onChange={(e) => updateOfferSetting("offer_signatory_name", e.target.value)}
              placeholder="Hiring Team"
              disabled={offerSettingsDisabled}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Signatory Title</label>
            <input
              type="text"
              value={offerForm.offer_signatory_title}
              onChange={(e) => updateOfferSetting("offer_signatory_title", e.target.value)}
              placeholder="Hiring Representative"
              disabled={offerSettingsDisabled}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Template Body</label>
          <textarea
            value={offerForm.offer_letter_template}
            onChange={(e) => updateOfferSetting("offer_letter_template", e.target.value)}
            placeholder={DEFAULT_OFFER_LETTER_TEMPLATE}
            disabled={offerSettingsDisabled}
            className={textareaCls}
          />
        </div>

        <div className="rounded-md border border-border bg-muted/15 p-3">
          <p className="zone-label mb-2">Merge Fields</p>
          <div className="flex flex-wrap gap-2">
            {OFFER_MERGE_FIELDS.map((field) => (
              <code
                key={field}
                className="rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
              >
                {field}
              </code>
            ))}
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
          <Button
            onClick={() => void handleAddRole()}
            disabled={!newRole.trim()}
            className="whitespace-nowrap"
          >
            <Plus size={13} />
            Add
          </Button>
        </div>
        <div className="space-y-1.5">
          {jobRoles.map((role, index) => (
            <div
              key={index}
              className="flex items-center justify-between px-3 py-2 rounded-md border border-border group transition-colors"
              style={{ background: "color-mix(in srgb, var(--card) 85%, var(--secondary) 15%)" }}
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
            <p className="text-[12px] tracking-[0.01em] text-muted-foreground">
              No active job roles configured.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => void handleSave()}
          disabled={saveOfferLetterSettings.isPending}
          size="sm"
        >
          <Save size={13} />
          {saveOfferLetterSettings.isPending ? "Saving..." : "Save Changes"}
        </Button>
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
