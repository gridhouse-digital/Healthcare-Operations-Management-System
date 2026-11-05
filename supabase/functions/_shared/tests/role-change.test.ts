import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { blockedUserChange, isAssignableRole } from "../role-change.ts";

Deno.test("tenant_admin and hr_admin can be assigned", () => {
  assertEquals(isAssignableRole("tenant_admin"), true);
  assertEquals(isAssignableRole("hr_admin"), true);
});

for (const role of ["platform_admin", "PLATFORM_ADMIN", "owner", "", null, undefined, 1, ["hr_admin"]]) {
  Deno.test(`role ${JSON.stringify(role)} cannot be assigned`, () => {
    assertEquals(isAssignableRole(role), false);
  });
}

const change = { actorUserId: "admin", targetUserId: "staff", targetRole: "hr_admin" };

Deno.test("an admin can change another user in their tenant", () => {
  assertEquals(blockedUserChange(change), null);
});

Deno.test("nobody can change their own account", () => {
  assertNotEquals(blockedUserChange({ ...change, targetUserId: "admin" }), null);
});

Deno.test("a platform admin cannot change themselves", () => {
  assertNotEquals(
    blockedUserChange({ actorUserId: "p", targetUserId: "p", targetRole: "platform_admin" }),
    null,
  );
});

Deno.test("no platform admin can be changed by another user", () => {
  assertNotEquals(blockedUserChange({ ...change, targetRole: "platform_admin" }), null);
});
