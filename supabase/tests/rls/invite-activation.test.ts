/**
 * Invite-to-active path, against real Supabase Auth and Postgres. The invite is
 * verified through Auth exactly as the emailed link is, so the trigger fires the
 * way it does in production.
 *
 * The JWT assertion needs custom_access_token_hook enabled, which the shared
 * local config leaves off: set INVITE_TEST_HOOK_ENABLED=1 on a stack that has it.
 *
 * Requires a local or disposable project, never production. Skips without env.
 */

import { assert, assertEquals } from "jsr:@std/assert";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { loadEnv, type RlsEnv, setupHarness, SKIP_MESSAGE } from "./_harness.ts";

const env = loadEnv();
const hookEnabled = Deno.env.get("INVITE_TEST_HOOK_ENABLED") === "1";

function anonClient(e: RlsEnv): SupabaseClient {
  return createClient(e.url, e.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function claims(accessToken: string) {
  const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(payload)) as { app_metadata?: { tenant_id?: string; role?: string } };
}

if (!env) {
  Deno.test({ name: SKIP_MESSAGE, ignore: true, fn: () => {} });
} else {
  const e = env;

  Deno.test({
    name: "invite activation",
    // GoTrue clients keep timers open between steps.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async (t) => {
      const h = await setupHarness(e);
      const { admin } = h;
      const created: string[] = [];

      const invite = async (label: string, tenantId: string, status = "pending") => {
        const email = `invite-${label}-${h.runId}@example.test`;
        const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
        if (error || !data.user) throw new Error(`invite ${label}: ${error?.message}`);
        created.push(data.user.id);
        const { data: row, error: rowError } = await admin
          .from("tenant_users")
          .insert({
            tenant_id: tenantId,
            user_id: data.user.id,
            role: "hr_admin",
            status,
            invited_by: h.tenantA.userId,
          })
          .select("id")
          .single();
        if (rowError) throw new Error(`row ${label}: ${rowError.message}`);
        return {
          email,
          userId: data.user.id,
          rowId: row.id as string,
          tokenHash: data.properties.hashed_token,
        };
      };

      const statusOf = async (rowId: string) => {
        const { data } = await admin.from("tenant_users").select("status").eq("id", rowId).single();
        return data?.status;
      };

      try {
        await t.step("the invited user's row starts pending", async () => {
          const i = await invite("pending", h.tenantA.tenantId);
          assertEquals(await statusOf(i.rowId), "pending");
        });

        await t.step("accepting the invite activates the row, audited, in a token with claims", async () => {
          const i = await invite("accept", h.tenantA.tenantId);
          const { data, error } = await anonClient(e).auth.verifyOtp({
            token_hash: i.tokenHash,
            type: "invite",
          });
          assertEquals(error, null);
          assertEquals(await statusOf(i.rowId), "active");

          const { data: audit } = await admin
            .from("audit_log")
            .select("tenant_id, actor_id, after")
            .eq("record_id", i.rowId)
            .eq("action", "user.activated");
          assertEquals(audit?.length, 1);
          assertEquals(audit?.[0].tenant_id, h.tenantA.tenantId);
          assertEquals(audit?.[0].actor_id, i.userId);
          assertEquals(audit?.[0].after.status, "active");

          if (hookEnabled) {
            const token = claims(data.session!.access_token);
            assertEquals(token.app_metadata?.tenant_id, h.tenantA.tenantId);
            assertEquals(token.app_metadata?.role, "hr_admin");
          }
        });

        await t.step("an invitee who uses Forgot password instead is activated", async () => {
          const i = await invite("recovery", h.tenantA.tenantId);
          const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: i.email });
          assertEquals(error, null);
          const { error: verifyError } = await anonClient(e).auth.verifyOtp({
            token_hash: data.properties!.hashed_token,
            type: "recovery",
          });
          assertEquals(verifyError, null);
          assertEquals(await statusOf(i.rowId), "active");
        });

        // The stack in CI runs with autoconfirm on, so this signUp really does
        // confirm the user and return a session: only the trigger's condition
        // keeps the row pending. With autoconfirm off it holds trivially.
        await t.step("a stranger's signUp on an invited email does not activate it", async () => {
          const i = await invite("signup", h.tenantA.tenantId);
          await anonClient(e).auth.signUp({ email: i.email, password: `Stranger-${h.runId}-9!` });
          assertEquals(await statusOf(i.rowId), "pending");
        });

        await t.step("requesting a recovery email first does not help a stranger", async () => {
          const i = await invite("signup-recovery", h.tenantA.tenantId);
          const { error } = await anonClient(e).auth.resetPasswordForEmail(i.email);
          assertEquals(error, null);
          await anonClient(e).auth.signUp({ email: i.email, password: `Stranger-${h.runId}-9!` });
          assertEquals(await statusOf(i.rowId), "pending");
        });

        await t.step("a deactivated invite stays deactivated when its link is used", async () => {
          const i = await invite("deactivated", h.tenantA.tenantId, "deactivated");
          await anonClient(e).auth.verifyOtp({ token_hash: i.tokenHash, type: "invite" });
          assertEquals(await statusOf(i.rowId), "deactivated");
        });

        await t.step("a user who was never invited is not activated by confirming", async () => {
          const email = `never-invited-${h.runId}@example.test`;
          const { data } = await admin.auth.admin.createUser({ email, password: `Pw-${h.runId}-9!` });
          created.push(data.user!.id);
          const { data: row } = await admin
            .from("tenant_users")
            .insert({ tenant_id: h.tenantB.tenantId, user_id: data.user!.id, role: "hr_admin", status: "pending" })
            .select("id")
            .single();
          await admin.auth.admin.updateUserById(data.user!.id, { email_confirm: true });
          assertEquals(await statusOf(row!.id), "pending");
        });

        await t.step("a browser session cannot write tenant_users", async () => {
          const target = await invite("browser", h.tenantA.tenantId);
          // tenantA's own session: its stored claims match the row's tenant, so
          // the RLS policy matches and only the missing grant stops the write.
          const client = h.tenantA.client;
          const { error: update } = await client
            .from("tenant_users")
            .update({ status: "active" })
            .eq("id", target.rowId);
          assert(update, "update must be refused");
          assertEquals(update.code, "42501");

          const { error: promote } = await client
            .from("tenant_users")
            .update({ role: "tenant_admin" })
            .eq("user_id", h.tenantA.userId);
          assertEquals(promote?.code, "42501");

          const { error: insert } = await client.from("tenant_users").insert({
            tenant_id: h.tenantA.tenantId,
            user_id: h.tenantA.userId,
            role: "platform_admin",
          });
          assertEquals(insert?.code, "42501");

          const { error: remove } = await client.from("tenant_users").delete().eq("id", target.rowId);
          assertEquals(remove?.code, "42501");

          assertEquals(await statusOf(target.rowId), "pending");
        });

        await t.step("a browser session cannot run the service-only lookup", async () => {
          const { error } = await h.tenantA.client.rpc("tenant_memberships_for_email", {
            p_email: h.tenantB.email,
          });
          assertEquals(error?.code, "42501");

          const { data, error: serviceError } = await admin.rpc("tenant_memberships_for_email", {
            p_email: `INVITE-ACCEPT-${h.runId}@EXAMPLE.TEST`,
          });
          assertEquals(serviceError, null);
          assertEquals(data, [{ tenant_id: h.tenantA.tenantId, status: "active" }]);
        });
      } finally {
        await admin.from("tenant_users").delete().in("user_id", created);
        await admin.from("tenant_users").delete().in("tenant_id", [h.tenantA.tenantId, h.tenantB.tenantId]);
        for (const id of created) await admin.auth.admin.deleteUser(id);
        await h.teardown();
      }
    },
  });
}
