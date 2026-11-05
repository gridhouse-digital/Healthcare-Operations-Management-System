import { assertEquals, assertRejects } from "jsr:@std/assert";
import { TenantGuardError } from "../tenant-guard.ts";
import { suspendedTenantIds, withoutSuspended } from "../tenant-status.ts";
import {
  handleManageTenant,
  type ManageTenantDeps,
  type StatusResult,
  type TenantCaller,
} from "../../manage-tenant/handler.ts";

const TARGET = "11111111-1111-1111-1111-111111111111";
const OWN = "22222222-2222-2222-2222-222222222222";

const admin: TenantCaller = { role: "platform_admin", userId: "user-1", tenantId: OWN };

const request = (body: unknown) =>
  new Request("http://local/manage-tenant", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const suspend = { tenantId: TARGET, action: "suspend", reason: "Unpaid invoices" };

function deps(over: Partial<ManageTenantDeps<TenantCaller>> = {}, result: StatusResult = "changed") {
  const calls: Array<Record<string, unknown>> = [];
  const stub: ManageTenantDeps<TenantCaller> = {
    guard: () => admin,
    verifyUserId: () => Promise.resolve("user-1"),
    countActiveAdminRows: () => Promise.resolve(1),
    setStatus: (input) => {
      calls.push(input);
      return Promise.resolve(result);
    },
    ...over,
  };
  return { stub, calls };
}

Deno.test("suspend sets the status with its reason and the verified actor", async () => {
  const { stub, calls } = deps();
  const res = await handleManageTenant(request(suspend), stub);
  assertEquals(res.status, 200);
  assertEquals(calls, [{ tenantId: TARGET, status: "suspended", reason: "Unpaid invoices", actorId: "user-1" }]);
});

Deno.test("reactivate needs no reason", async () => {
  const { stub, calls } = deps();
  const res = await handleManageTenant(request({ tenantId: TARGET, action: "reactivate" }), stub);
  assertEquals(res.status, 200);
  assertEquals(calls[0].status, "active");
  assertEquals(calls[0].reason, null);
});

for (const role of ["tenant_admin", "hr_admin"]) {
  Deno.test(`${role} is refused and changes nothing`, async () => {
    const { stub, calls } = deps({ guard: () => ({ ...admin, role }) });
    assertEquals((await handleManageTenant(request(suspend), stub)).status, 403);
    assertEquals(calls, []);
  });
}

Deno.test("failed token verification returns 401 and changes nothing", async () => {
  const { stub, calls } = deps({ verifyUserId: () => Promise.resolve(null) });
  assertEquals((await handleManageTenant(request(suspend), stub)).status, 401);
  assertEquals(calls, []);
});

Deno.test("no active platform_admin row returns 403 and changes nothing", async () => {
  const { stub, calls } = deps({ countActiveAdminRows: () => Promise.resolve(0) });
  assertEquals((await handleManageTenant(request(suspend), stub)).status, 403);
  assertEquals(calls, []);
});

Deno.test("guard rejection returns its status", async () => {
  const { stub, calls } = deps({
    guard: () => {
      throw new TenantGuardError("MISSING_AUTH", "Authorization header required");
    },
  });
  assertEquals((await handleManageTenant(request(suspend), stub)).status, 401);
  assertEquals(calls, []);
});

Deno.test("an admin cannot change their own agency", async () => {
  const { stub, calls } = deps();
  const res = await handleManageTenant(request({ ...suspend, tenantId: OWN }), stub);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error.code, "OWN_AGENCY");
  assertEquals(calls, []);
});

for (const [name, body, code] of [
  ["missing reason", { tenantId: TARGET, action: "suspend" }, "REASON_REQUIRED"],
  ["blank reason", { ...suspend, reason: "     " }, "REASON_REQUIRED"],
  ["bad tenant id", { ...suspend, tenantId: "not-a-uuid" }, "INVALID_TENANT"],
  ["unknown action", { ...suspend, action: "delete" }, "INVALID_ACTION"],
  ["invalid JSON", "{", "INVALID_TENANT"],
] as const) {
  Deno.test(`${name} returns 400 and changes nothing`, async () => {
    const { stub, calls } = deps();
    const res = await handleManageTenant(request(body), stub);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error.code, code);
    assertEquals(calls, []);
  });
}

Deno.test("unknown agency returns 404", async () => {
  const { stub } = deps({}, "not_found");
  assertEquals((await handleManageTenant(request(suspend), stub)).status, 404);
});

Deno.test("already suspended returns 409", async () => {
  const { stub } = deps({}, "unchanged");
  assertEquals((await handleManageTenant(request(suspend), stub)).status, 409);
});

Deno.test("a failed status change returns an opaque 500", async () => {
  const { stub } = deps({ setStatus: () => Promise.reject(new Error("secret detail")) });
  const res = await handleManageTenant(request(suspend), stub);
  assertEquals(res.status, 500);
  assertEquals((await res.text()).includes("secret detail"), false);
});

function tenantsClient(total: number, failAt?: number) {
  const pages: number[] = [];
  const all = Array.from({ length: total }, (_, index) => ({ id: `tenant-${index}` }));
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: (from: number, to: number) => {
      pages.push(from);
      return Promise.resolve(
        from === failAt
          ? { data: null, error: new Error("boom") }
          : { data: all.slice(from, to + 1), error: null },
      );
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: { from: () => query } as any, pages };
}

Deno.test("suspended lookup reads past the 1,000-row cap", async () => {
  const { client, pages } = tenantsClient(1001);
  assertEquals((await suspendedTenantIds(client)).size, 1001);
  assertEquals(pages, [0, 1000]);
});

Deno.test("suspended lookup stops on an exact last page", async () => {
  const { client, pages } = tenantsClient(1000);
  assertEquals((await suspendedTenantIds(client)).size, 1000);
  assertEquals(pages, [0, 1000]);
});

Deno.test("a failed suspended lookup throws, so jobs do not run agencies blind", async () => {
  const { client } = tenantsClient(1001, 1000);
  await assertRejects(() => suspendedTenantIds(client));
});

Deno.test("scheduled work leaves out suspended agencies", () => {
  const rows = [{ tenant_id: "a" }, { tenant_id: "b" }];
  assertEquals(withoutSuspended(rows, new Set(["a"])), [{ tenant_id: "b" }]);
  assertEquals(withoutSuspended(null, new Set(["a"])), null);
});
