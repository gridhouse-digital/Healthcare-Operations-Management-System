import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  useTenantSettings,
  useTestConnector,
  useSaveBambooHR,
  useSaveJazzHR,
} from "../hooks/useTenantSettings";
import { ConnectorStatusBadge } from "./ConnectorStatusBadge";
import type { ConnectorStatus } from "../types/tenant-settings";

// ---------------------------------------------------------------------------
// BambooHR form
// ---------------------------------------------------------------------------

interface BambooHRFormValues {
  subdomain: string;
  apiKey: string;
}

function BambooHRConnector({ configured }: { configured: boolean }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } =
    useForm<BambooHRFormValues>();

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
    await saveBambooHR.mutateAsync(values);
    setStatus("active");
    toast.success("BambooHR connector saved");
  }

  return (
    <div className="rounded-[20px] bg-[#1A1D26] border border-[#1F2433] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-white font-semibold text-base">BambooHR</h3>
          <p className="text-[#6B7280] text-sm mt-0.5">
            Polls every 15 minutes for new hires
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6B7280] mb-1.5">
            Subdomain
          </label>
          <input
            {...register("subdomain", { required: true })}
            placeholder="yourcompany"
            className="w-full rounded-[10px] bg-[#0D0F14] border border-[#1F2433] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#00C9B1] transition-colors"
          />
          <p className="text-[#6B7280] text-xs mt-1">
            yourcompany.bamboohr.com → enter <span className="font-mono text-[#9CA3AF]">yourcompany</span>
          </p>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6B7280] mb-1.5">
            API Key
          </label>
          <input
            {...register("apiKey", { required: true })}
            type="password"
            placeholder={configured ? "••••••••••••••••" : "Enter API key"}
            autoComplete="off"
            className="w-full rounded-[10px] bg-[#0D0F14] border border-[#1F2433] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#00C9B1] transition-colors"
          />
          {configured && (
            <p className="text-[#6B7280] text-xs mt-1">
              A key is already configured. Enter a new key to replace it.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={!subdomain || !apiKey || testConnector.isPending}
            onClick={onTest}
            className="rounded-[10px] border border-[#00C9B1] text-[#00C9B1] px-4 py-2 text-sm font-medium hover:bg-[#00C9B1]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testConnector.isPending ? "Testing…" : "Test Connection"}
          </button>

          <button
            type="submit"
            disabled={!testPassed || isSubmitting || saveBambooHR.isPending}
            className="rounded-[10px] bg-[#00C9B1] text-[#0D0F14] px-4 py-2 text-sm font-semibold hover:bg-[#00C9B1]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saveBambooHR.isPending ? "Saving…" : "Save"}
          </button>
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
    await saveJazzHR.mutateAsync(values);
    setStatus("active");
    toast.success("JazzHR connector saved");
  }

  return (
    <div className="rounded-[20px] bg-[#1A1D26] border border-[#1F2433] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-white font-semibold text-base">JazzHR</h3>
          <p className="text-[#6B7280] text-sm mt-0.5">
            Polls every 15 minutes for hired applicants
          </p>
        </div>
        <ConnectorStatusBadge status={status} />
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-[#6B7280] mb-1.5">
            API Key
          </label>
          <input
            {...register("apiKey", { required: true })}
            type="password"
            placeholder={configured ? "••••••••••••••••" : "Enter API key"}
            autoComplete="off"
            className="w-full rounded-[10px] bg-[#0D0F14] border border-[#1F2433] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#00C9B1] transition-colors"
          />
          {configured && (
            <p className="text-[#6B7280] text-xs mt-1">
              A key is already configured. Enter a new key to replace it.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={!apiKey || testConnector.isPending}
            onClick={onTest}
            className="rounded-[10px] border border-[#00C9B1] text-[#00C9B1] px-4 py-2 text-sm font-medium hover:bg-[#00C9B1]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testConnector.isPending ? "Testing…" : "Test Connection"}
          </button>

          <button
            type="submit"
            disabled={!testPassed || isSubmitting || saveJazzHR.isPending}
            className="rounded-[10px] bg-[#00C9B1] text-[#0D0F14] px-4 py-2 text-sm font-semibold hover:bg-[#00C9B1]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saveJazzHR.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ConnectorSettingsPage() {
  const { data: settings, isLoading, error } = useTenantSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-[#6B7280] font-mono text-sm">Loading settings…</span>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-[20px] bg-red-500/10 border border-red-500/20 p-6">
        <p className="text-red-400 text-sm">Failed to load connector settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-white text-xl font-semibold">Connector Settings</h2>
        <p className="text-[#6B7280] text-sm mt-1">
          Configure your ATS integrations. API keys are encrypted at rest and
          never returned to the browser after saving.
        </p>
      </div>

      <BambooHRConnector configured={settings.bamboohr_key_configured} />
      <JazzHRConnector configured={settings.jazzhr_key_configured} />
    </div>
  );
}
