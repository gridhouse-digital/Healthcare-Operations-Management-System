import { assertEquals } from "jsr:@std/assert";
import { TenantGuardError } from "../tenant-guard.ts";
import {
  handlePlatformOverview,
  type OverviewCaller,
  type PlatformOverviewDeps,
} from "../../platform-overview/handler.ts";

const request = () =>
  new Request("http://local/platform-overview", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
  });

const admin: OverviewCaller = { role: "platform_admin", userId: "user-1", tenantId: "tenant-1" };

function deps(over: Partial<PlatformOverviewDeps<OverviewCaller>> = {}) {
  const calls: string[] = [];
  const stub: PlatformOverviewDeps<OverviewCaller> = {
    guard: () => admin,
    verifyUserId: () => {
      calls.push("verify");
      return Promise.resolve("user-1");
    },
    countActiveAdminRows: () => {
      calls.push("adminRows");
      return Promise.resolve(1);
    },
    loadOverview: () => {
      calls.push("load");
      return Promise.resolve({
        totals: {
          agencies: 1, needingAttention: 0, suspended: 0, employees: 3, employeesOnboarding: 0,
          recurringOverdue: null, failedSyncs: 0, openAccessRequests: 0,
        },
        agencies: [],
      });
    },
    writeAudit: () => {
      calls.push("audit");
      return Promise.resolve();
    },
    ...over,
  };
  return { stub, calls };
}

Deno.test("allowed caller is verified, then data loads, then the read is audited", async () => {
  const { stub, calls } = deps();
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 200);
  assertEquals(calls, ["verify", "adminRows", "load", "audit"]);
  assertEquals((await res.json()).totals.employees, 3);
});

Deno.test("failed token verification returns 401 and reads nothing", async () => {
  const { stub, calls } = deps({ verifyUserId: () => Promise.resolve(null) });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 401);
  assertEquals(calls, []);
});

Deno.test("token for a different user returns 401 and loads nothing", async () => {
  const { stub, calls } = deps({ verifyUserId: () => Promise.resolve("user-2") });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 401);
  assertEquals(calls.includes("load"), false);
});

Deno.test("no active platform_admin row returns 403 and loads nothing", async () => {
  const { stub, calls } = deps({ countActiveAdminRows: () => Promise.resolve(0) });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 403);
  assertEquals(calls.includes("load"), false);
  assertEquals(calls.includes("audit"), false);
});

for (const role of ["tenant_admin", "hr_admin"]) {
  Deno.test(`${role} is refused before any check or read`, async () => {
    const { stub, calls } = deps({ guard: () => ({ ...admin, role }) });
    const res = await handlePlatformOverview(request(), stub);
    assertEquals(res.status, 403);
    assertEquals(calls, []);
  });
}

Deno.test("guard rejection returns its status and reads nothing", async () => {
  const { stub, calls } = deps({
    guard: () => {
      throw new TenantGuardError("MISSING_AUTH", "Authorization header required");
    },
  });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 401);
  assertEquals(calls, []);
});

Deno.test("audit failure withholds the data", async () => {
  const { stub } = deps({ writeAudit: () => Promise.reject(new Error("insert failed")) });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error.code, "AUDIT_FAILED");
  assertEquals(body.totals, undefined);
  assertEquals(body.agencies, undefined);
});

Deno.test("load failure returns an opaque 500 and writes no audit row", async () => {
  const { stub, calls } = deps({ loadOverview: () => Promise.reject(new Error("secret detail")) });
  const res = await handlePlatformOverview(request(), stub);
  assertEquals(res.status, 500);
  assertEquals(calls.includes("audit"), false);
  assertEquals((await res.text()).includes("secret detail"), false);
});
