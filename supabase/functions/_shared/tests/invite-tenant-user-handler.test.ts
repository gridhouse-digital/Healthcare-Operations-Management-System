import { assertEquals } from "jsr:@std/assert";
import { TenantGuardError } from "../tenant-guard.ts";
import {
  decideInvite,
  handleInviteTenantUser,
  type InviteCaller,
  type InviteTenantUserDeps,
  type Membership,
} from "../../invite-tenant-user/handler.ts";

const OWN = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const admin: InviteCaller = { role: "tenant_admin", userId: "admin-1", tenantId: OWN };

const request = (body: unknown) =>
  new Request("http://local/invite-tenant-user", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const invite = { email: "New.Person@Example.com", role: "hr_admin" };

function deps(over: Partial<InviteTenantUserDeps<InviteCaller>> = {}, memberships: Membership[] = []) {
  const sent: Array<{ email: string; redirectTo: string | undefined }> = [];
  const created: Array<Record<string, unknown>> = [];
  const audited: Array<Record<string, unknown>> = [];
  const stub: InviteTenantUserDeps<InviteCaller> = {
    guard: () => admin,
    findMemberships: () => Promise.resolve(memberships),
    sendInvite: (email, redirectTo) => {
      sent.push({ email, redirectTo });
      return Promise.resolve("invited-1");
    },
    createPendingMembership: (input) => {
      created.push(input);
      return Promise.resolve("row-1");
    },
    audit: (input) => {
      audited.push(input);
      return Promise.resolve();
    },
    appOrigin: () => "https://app.example.com",
    ...over,
  };
  return { stub, sent, created, audited };
}

const errorCode = async (res: Response) => (await res.json()).error.code;

Deno.test("decideInvite: an unknown email is invited", () => {
  assertEquals(decideInvite([], OWN), "invite");
});

Deno.test("decideInvite: a pending invite in this agency can be resent", () => {
  assertEquals(decideInvite([{ tenant_id: OWN, status: "pending" }], OWN), "resend");
});

Deno.test("decideInvite: an active member is refused", () => {
  assertEquals(decideInvite([{ tenant_id: OWN, status: "active" }], OWN), "already_member");
});

Deno.test("decideInvite: a deactivated row cannot be revived by inviting again", () => {
  assertEquals(decideInvite([{ tenant_id: OWN, status: "deactivated" }], OWN), "deactivated");
});

Deno.test("decideInvite: a pending invite from another agency makes the email unavailable", () => {
  assertEquals(decideInvite([{ tenant_id: OTHER, status: "pending" }], OWN), "unavailable");
});

Deno.test("decideInvite: rows in two agencies are never resent", () => {
  const rows = [{ tenant_id: OWN, status: "pending" }, { tenant_id: OTHER, status: "pending" }];
  assertEquals(decideInvite(rows, OWN), "unavailable");
});

Deno.test("invite creates a pending row for the caller's tenant and audits it", async () => {
  const { stub, created, audited } = deps();
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, resent: false });
  assertEquals(created, [{ tenantId: OWN, userId: "invited-1", role: "hr_admin", invitedBy: "admin-1" }]);
  assertEquals(audited, [{
    tenantId: OWN,
    actorId: "admin-1",
    action: "user.invited",
    recordId: "row-1",
    after: { email: "new.person@example.com", role: "hr_admin", status: "pending" },
  }]);
});

Deno.test("a tenant_id in the body is ignored", async () => {
  const { stub, created } = deps();
  await handleInviteTenantUser(request({ ...invite, tenant_id: OTHER, tenantId: OTHER }), stub);
  assertEquals(created[0].tenantId, OWN);
});

Deno.test("the invite link lands on the set-password page of the deployed app", async () => {
  const { stub, sent } = deps();
  await handleInviteTenantUser(request(invite), stub);
  assertEquals(sent, [{
    email: "new.person@example.com",
    redirectTo: "https://app.example.com/update-password",
  }]);
});

Deno.test("a redirect in the body is ignored", async () => {
  const { stub, sent } = deps();
  await handleInviteTenantUser(request({ ...invite, redirectTo: "https://evil.example" }), stub);
  assertEquals(sent[0].redirectTo, "https://app.example.com/update-password");
});

Deno.test("without a configured origin the redirect is left to Auth's Site URL", async () => {
  const { stub, sent } = deps({ appOrigin: () => undefined });
  await handleInviteTenantUser(request(invite), stub);
  assertEquals(sent[0].redirectTo, undefined);
});

Deno.test("resending a pending invite sends the email and creates no row", async () => {
  const { stub, sent, created, audited } = deps({}, [{ tenant_id: OWN, status: "pending" }]);
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, resent: true });
  assertEquals(sent.length, 1);
  assertEquals(created, []);
  assertEquals(audited, []);
});

for (
  const [status, tenant, code] of [
    ["active", OWN, "ALREADY_MEMBER"],
    ["deactivated", OWN, "USER_DEACTIVATED"],
    ["active", OTHER, "EMAIL_UNAVAILABLE"],
  ] as const
) {
  Deno.test(`${code}: refused before any email is sent`, async () => {
    const { stub, sent, created } = deps({}, [{ tenant_id: tenant, status }]);
    const res = await handleInviteTenantUser(request(invite), stub);
    assertEquals(res.status, 409);
    assertEquals(await errorCode(res), code);
    assertEquals(sent, []);
    assertEquals(created, []);
  });
}

Deno.test("an email with an existing account and no membership is refused", async () => {
  const { stub, created } = deps({ sendInvite: () => Promise.resolve(null) });
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 409);
  assertEquals(await errorCode(res), "EMAIL_UNAVAILABLE");
  assertEquals(created, []);
});

Deno.test("hr_admin cannot invite", async () => {
  const { stub, sent } = deps({ guard: () => ({ ...admin, role: "hr_admin" }) });
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 403);
  assertEquals(sent, []);
});

Deno.test("the guard runs before anything else", async () => {
  const { stub, sent } = deps({
    guard: () => {
      throw new TenantGuardError("INVALID_JWT", "bad", 401);
    },
    findMemberships: () => {
      throw new Error("must not run");
    },
  });
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 401);
  assertEquals(sent, []);
});

for (
  const [name, body, code] of [
    ["missing email", { role: "hr_admin" }, "MISSING_FIELDS"],
    ["missing role", { email: "a@example.com" }, "MISSING_FIELDS"],
    ["non-string email", { email: 5, role: "hr_admin" }, "MISSING_FIELDS"],
    ["malformed JSON", "{", "MISSING_FIELDS"],
    ["platform_admin role", { email: "a@example.com", role: "platform_admin" }, "INVALID_ROLE"],
  ] as const
) {
  Deno.test(`${name} is rejected`, async () => {
    const { stub, sent } = deps();
    const res = await handleInviteTenantUser(request(body), stub);
    assertEquals(res.status, 400);
    assertEquals(await errorCode(res), code);
    assertEquals(sent, []);
  });
}

Deno.test("a failed row insert returns an opaque 500", async () => {
  const { stub } = deps({
    createPendingMembership: () => Promise.reject(new Error("database detail")),
  });
  const res = await handleInviteTenantUser(request(invite), stub);
  assertEquals(res.status, 500);
  assertEquals(await errorCode(res), "INTERNAL_ERROR");
});
