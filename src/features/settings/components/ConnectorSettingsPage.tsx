import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Plug, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import {
  useTenantSettings,
  useTestConnector,
  useSaveBambooHR,
  useSaveJazzHR,
  useSaveWordPress,
  useSaveJotForm,
} from "../hooks/useTenantSettings";
import { useLdGroupMappings, useSaveLdMappings } from "../hooks/useLdGroupMappings";
import { ConnectorStatusBadge } from "./ConnectorStatusBadge";
import type { ConnectorStatus, LdGroupMapping } from "../types/tenant-settings";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Shared styles (matches SystemSettingsPage)
// ---------------------------------------------------------------------------

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50";
const labelCls = "form-label";
const helperCls = "mt-1 text-[12px] tracking-[0.01em] text-muted-foreground";
const sectionCls = "saas-card p-5 space-y-4";

// ---------------------------------------------------------------------------
// BambooHR form
// ---------------------------------------------------------------------------

interface BambooHRFormValues {
  subdomain: string;
  apiKey: string;
}

function BambooHRConnector({ configured, savedSubdomain }: { configured: boolean; savedSubdomain: string | null }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } =
    useForm<BambooHRFormValues>({ defaultValues: { subdomain: savedSubdomain ?? "" } });

  const testConnector = useTestConnector();
  const saveBambooHR = useSaveBambooHR();

  const [testPassed, setTestPassed] = useState(false);
  const [status, setStatus] = useState<ConnectorStatus>(
    configured ? "active" : "not_configured",
  );

  const subdomain = watch("subdomain");
  const apiKey = watch("apiKey");

  async function onTest() {
    setTestPassed(false);
    const result = await testConnector.mutateAsync({
      source: "bamboohr",
      subdomain,
      apiKey,
    });
    if (result.ok) {
      setTestPassed(true);
      toast.success("BambooHR connection verified");
    } else {
      setStatus("failed");
      toast.error(result.error ?? "Connection test failed");
    }
  }

  async function onSave(values: BambooHRFormValues) {
    try {
      await saveBambooHR.mutateAsync(values);
      setStatus("active");
      toast.success("BambooHR connector saved");
    } catch (err) {
      setStatus("failed");
      toast.error(err instanceof Error ? err.message : "Failed to save BambooHR connector");
    }
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">BambooHR</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Polls every 15 minutes for new hires
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className={labelCls}>Subdomain</label>
          <input
            {...register("subdomain", { required: true })}
            placeholder="yourcompany"
            className={inputCls}
          />
          <p className={helperCls}>
            yourcompany.bamboohr.com &rarr; enter <span className="text-foreground/70">yourcompany</span>
          </p>
        </div>

        <div>
          <label className={labelCls}>API Key</label>
          <input
            {...register("apiKey", { required: true })}
            type="password"
            placeholder={configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Enter API key"}
            autoComplete="off"
            className={inputCls}
          />
          {configured && (
            <p className={helperCls}>
              A key is already configured. Enter a new key to replace it.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            disabled={!subdomain || !apiKey || testConnector.isPending}
            onClick={onTest}
            variant="outline"
            size="sm"
          >
            {testConnector.isPending ? "Testing\u2026" : "Test Connection"}
          </Button>

          <Button
            type="submit"
            disabled={!testPassed || isSubmitting || saveBambooHR.isPending}
            size="sm"
          >
            {saveBambooHR.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JazzHR form
// ---------------------------------------------------------------------------

interface JazzHRFormValues {
  apiKey: string;
}

function JazzHRConnector({ configured }: { configured: boolean }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } =
    useForm<JazzHRFormValues>();

  const testConnector = useTestConnector();
  const saveJazzHR = useSaveJazzHR();

  const [testPassed, setTestPassed] = useState(false);
  const [status, setStatus] = useState<ConnectorStatus>(
    configured ? "active" : "not_configured",
  );

  const apiKey = watch("apiKey");

  async function onTest() {
    setTestPassed(false);
    const result = await testConnector.mutateAsync({ source: "jazzhr", apiKey });
    if (result.ok) {
      setTestPassed(true);
      toast.success("JazzHR connection verified");
    } else {
      setStatus("failed");
      toast.error(result.error ?? "Connection test failed");
    }
  }

  async function onSave(values: JazzHRFormValues) {
    try {
      await saveJazzHR.mutateAsync(values);
      setStatus("active");
      toast.success("JazzHR connector saved");
    } catch (err) {
      setStatus("failed");
      toast.error(err instanceof Error ? err.message : "Failed to save JazzHR connector");
    }
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">JazzHR</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Polls every 15 minutes for hired applicants
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className={labelCls}>API Key</label>
          <input
            {...register("apiKey", { required: true })}
            type="password"
            placeholder={configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Enter API key"}
            autoComplete="off"
            className={inputCls}
          />
          {configured && (
            <p className={helperCls}>
              A key is already configured. Enter a new key to replace it.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="button"
            disabled={!apiKey || testConnector.isPending}
            onClick={onTest}
            variant="outline"
            size="sm"
          >
            {testConnector.isPending ? "Testing\u2026" : "Test Connection"}
          </Button>

          <Button
            type="submit"
            disabled={!testPassed || isSubmitting || saveJazzHR.isPending}
            size="sm"
          >
            {saveJazzHR.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WordPress form
// ---------------------------------------------------------------------------

interface WordPressFormValues {
  wpSiteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}

function WordPressConnector({ configured, savedSiteUrl, isTenantAdmin }: { configured: boolean; savedSiteUrl: string | null; isTenantAdmin: boolean }) {
  const { register, handleSubmit, formState: { isSubmitting } } =
    useForm<WordPressFormValues>({ defaultValues: { wpSiteUrl: savedSiteUrl ?? "" } });

  const saveWordPress = useSaveWordPress();

  const [status, setStatus] = useState<ConnectorStatus>(
    configured ? "active" : "not_configured",
  );

  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [syncingTraining, setSyncingTraining] = useState(false);
  const [trainingCooldown, setTrainingCooldown] = useState(0);

  async function onSyncUsers() {
    setSyncing(true);
    try {
      const { data, error } = await (await import("@/lib/supabase")).supabase.functions.invoke("sync-wp-users");
      if (error) throw error;
      const result = data as { ok: boolean; summary?: { synced: number; skipped: number; errors: number }[] };
      if (result.ok && result.summary?.[0]) {
        const s = result.summary[0];
        toast.success(`Synced ${s.synced} users, ${s.skipped} skipped, ${s.errors} errors`);
      } else {
        toast.success("WordPress user sync completed");
      }
      // Start 60s cooldown
      setSyncCooldown(60);
      const interval = setInterval(() => {
        setSyncCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function onSyncTraining() {
    setSyncingTraining(true);
    try {
      const { data, error } = await (await import("@/lib/supabase")).supabase.functions.invoke("sync-training", { body: { force: true } });
      if (error) throw error;
      const result = data as { ok: boolean; summary?: { synced: number; skipped: number; errors: number }[] };
      if (result.ok && result.summary?.[0]) {
        const s = result.summary[0];
        toast.success(`Synced ${s.synced} training records, ${s.skipped} skipped, ${s.errors} errors`);
      } else {
        toast.success("LearnDash training sync completed");
      }
      setTrainingCooldown(60);
      const interval = setInterval(() => {
        setTrainingCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Training sync failed");
    } finally {
      setSyncingTraining(false);
    }
  }

  async function onSave(values: WordPressFormValues) {
    try {
      await saveWordPress.mutateAsync(values);
      setStatus("active");
      toast.success("WordPress connector saved");
    } catch (err) {
      setStatus("failed");
      toast.error(err instanceof Error ? err.message : "Failed to save WordPress connector");
    }
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">WordPress / LearnDash</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Creates WP users and enrolls into LearnDash training groups
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className={labelCls}>Site URL</label>
          <input
            {...register("wpSiteUrl", { required: !configured })}
            type="url"
            placeholder="https://training.yourcompany.com"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Username</label>
          <input
            {...register("wpUsername", { required: !configured })}
            placeholder={configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "admin"}
            autoComplete="off"
            className={inputCls}
          />
          {configured && (
            <p className={helperCls}>
              Already configured. Enter a new value to replace it.
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>Application Password</label>
          <input
            {...register("wpAppPassword", { required: !configured })}
            type="password"
            placeholder={configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Enter application password"}
            autoComplete="off"
            className={inputCls}
          />
          <p className={helperCls}>
            Generate in WP Admin &rarr; Users &rarr; Profile &rarr; Application Passwords
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="submit"
            disabled={isSubmitting || saveWordPress.isPending}
            size="sm"
          >
            {saveWordPress.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </form>

      {/* Sync buttons — tenant_admin+ only, after WP configured */}
      {configured && isTenantAdmin && (
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-foreground">Sync WordPress Users</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Import existing WordPress/LearnDash subscribers as employees
              </p>
            </div>
          <Button
              type="button"
              disabled={syncing || syncCooldown > 0}
              onClick={onSyncUsers}
            variant="outline"
            size="sm"
            >
              {syncing
                ? "Syncing\u2026"
                : syncCooldown > 0
                  ? `Available in ${syncCooldown}s`
                  : "Sync Users"}
          </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-foreground">Sync LearnDash Training</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Pull course progress for all employees from LearnDash
              </p>
            </div>
          <Button
              type="button"
              disabled={syncingTraining || trainingCooldown > 0}
              onClick={onSyncTraining}
            variant="outline"
            size="sm"
            >
              {syncingTraining
                ? "Syncing\u2026"
                : trainingCooldown > 0
                  ? `Available in ${trainingCooldown}s`
                  : "Sync Training"}
          </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JotForm form
// ---------------------------------------------------------------------------

interface JotFormFormValues {
  apiKey: string;
}

function JotFormConnector({ configured }: { configured: boolean }) {
  const { register, handleSubmit, formState: { isSubmitting } } =
    useForm<JotFormFormValues>();

  const saveJotForm = useSaveJotForm();

  const [status, setStatus] = useState<ConnectorStatus>(
    configured ? "active" : "not_configured",
  );

  async function onSave(values: JotFormFormValues) {
    try {
      await saveJotForm.mutateAsync(values);
      setStatus("active");
      toast.success("JotForm connector saved");
    } catch (err) {
      setStatus("failed");
      toast.error(err instanceof Error ? err.message : "Failed to save JotForm connector");
    }
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">JotForm</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Ingests applicant credentials and policy documents
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className={labelCls}>API Key</label>
          <input
            {...register("apiKey", { required: true })}
            type="password"
            placeholder={configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Enter API key"}
            autoComplete="off"
            className={inputCls}
          />
          {configured && (
            <p className={helperCls}>
              A key is already configured. Enter a new key to replace it.
            </p>
          )}
          <p className={helperCls}>
            Find your API key at JotForm &rarr; Settings &rarr; API
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            type="submit"
            disabled={isSubmitting || saveJotForm.isPending}
            size="sm"
          >
            {saveJotForm.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LD Group Mapping — row editing
// ---------------------------------------------------------------------------

interface MappingRowProps {
  mapping: LdGroupMapping;
  onEdit: (updated: LdGroupMapping) => void;
  onDelete: () => void;
}

function MappingRow({ mapping, onEdit, onDelete }: MappingRowProps) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset } = useForm<LdGroupMapping>({
    defaultValues: mapping,
  });

  function onSave(values: LdGroupMapping) {
    onEdit(values);
    setEditing(false);
  }

  function onCancel() {
    reset(mapping);
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b border-border">
        <td className="px-4 py-3">
          <input
            {...register("job_title", { required: true })}
            className={cn(inputCls, "h-8")}
          />
        </td>
        <td className="px-4 py-3">
          <input
            {...register("group_id", { required: true })}
            className={cn(inputCls, "h-8 font-mono")}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={handleSubmit(onSave)}
              className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/20 transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border hover:bg-muted/5 transition-colors">
      <td className="px-4 py-3 text-foreground text-[13px]">{mapping.job_title}</td>
      <td className="px-4 py-3 text-muted-foreground text-[13px] font-mono">{mapping.group_id}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// LD Group Mapping — add new row
// ---------------------------------------------------------------------------

interface AddRowProps {
  onAdd: (mapping: LdGroupMapping) => void;
  onCancel: () => void;
}

function AddRow({ onAdd, onCancel }: AddRowProps) {
  const { register, handleSubmit } = useForm<LdGroupMapping>();

  return (
    <tr className="border-b border-border bg-primary/5">
      <td className="px-4 py-3">
        <input
          {...register("job_title", { required: true })}
          placeholder="e.g. Registered Nurse"
          className={cn(inputCls, "h-8")}
          autoFocus
        />
      </td>
      <td className="px-4 py-3">
        <input
          {...register("group_id", { required: true })}
          placeholder="e.g. 42"
          className={cn(inputCls, "h-8 font-mono")}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit(onAdd)}
            className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
            title="Add"
          >
            <Check size={14} />
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/20 transition-colors"
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// LD Group Mappings section
// ---------------------------------------------------------------------------

function LdGroupMappingsSection() {
  const { data: mappings = [], isLoading } = useLdGroupMappings();
  const saveMappings = useSaveLdMappings();
  const [localMappings, setLocalMappings] = useState<LdGroupMapping[] | null>(null);
  const [adding, setAdding] = useState(false);

  const displayed = localMappings ?? mappings;

  async function commitSave(updated: LdGroupMapping[]) {
    await saveMappings.mutateAsync(updated);
    setLocalMappings(null);
    toast.success("Mappings saved");
  }

  function handleEdit(index: number, updated: LdGroupMapping) {
    const next = displayed.map((m, i) => (i === index ? updated : m));
    setLocalMappings(next);
    void commitSave(next);
  }

  function handleDelete(index: number) {
    const next = displayed.filter((_, i) => i !== index);
    setLocalMappings(next);
    void commitSave(next);
  }

  function handleAdd(mapping: LdGroupMapping) {
    const next = [...displayed, mapping];
    setLocalMappings(next);
    setAdding(false);
    void commitSave(next);
  }

  if (isLoading) {
    return (
      <div className={sectionCls}>
        <p className="text-[13px] font-semibold text-foreground">LearnDash Group Mappings</p>
        <div className="flex items-center justify-center h-20">
          <span className="text-[13px] text-muted-foreground">Loading mappings&hellip;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="saas-card overflow-hidden">
      <div className="p-5 pb-0">
        <p className="text-[13px] font-semibold text-foreground">LearnDash Group Mappings</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Map job titles to LearnDash group IDs. New hires are automatically enrolled
          in the matching groups when onboarded.
        </p>
      </div>

      <div className="mt-4">
        <table className="w-full">
          <thead>
            <tr className="border-y border-border">
              <th className="px-4 py-2.5 text-left">
                <span className="zone-label">Job Title</span>
              </th>
              <th className="px-4 py-2.5 text-left">
                <span className="zone-label">LearnDash Group ID</span>
              </th>
              <th className="px-4 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && !adding && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-[13px]">
                  No mappings yet. Add your first job title &rarr; group ID mapping below.
                </td>
              </tr>
            )}
            {displayed.map((mapping, i) => (
              <MappingRow
                key={`${mapping.job_title}-${i}`}
                mapping={mapping}
                onEdit={(updated) => handleEdit(i, updated)}
                onDelete={() => handleDelete(i)}
              />
            ))}
            {adding && (
              <AddRow
                onAdd={handleAdd}
                onCancel={() => setAdding(false)}
              />
            )}
          </tbody>
        </table>

        <div className={cn("px-4 py-3 border-t border-border", adding && "hidden")}>
          <Button
            onClick={() => setAdding(true)}
            variant="ghost"
            size="sm"
            className="px-0"
          >
            <Plus size={14} />
            Add Mapping
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ConnectorSettingsPage() {
  const { data: settings, isLoading, error } = useTenantSettings();
  const { isAdmin } = useUserRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-[13px] text-muted-foreground">Loading settings&hellip;</span>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-lg border border-destructive/15 bg-destructive/8 p-5">
        <p className="text-[13px] text-destructive">Failed to load connector settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pl-1">
        <div className="flex items-center gap-2">
          <Plug size={18} className="text-primary" />
          <h1 className="page-header-title">Connector Settings</h1>
        </div>
        <p className="page-header-meta">
          Configure your ATS integrations. API keys are encrypted at rest and
          never returned to the browser after saving.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <BambooHRConnector configured={settings.bamboohr_key_configured} savedSubdomain={settings.bamboohr_subdomain} />
        <JazzHRConnector configured={settings.jazzhr_key_configured} />
        <WordPressConnector configured={settings.wp_key_configured} savedSiteUrl={settings.wp_site_url} isTenantAdmin={isAdmin} />
        <JotFormConnector configured={settings.jotform_key_configured} />
      </div>

      <LdGroupMappingsSection />
    </div>
  );
}
