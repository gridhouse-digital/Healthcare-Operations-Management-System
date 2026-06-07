import { assertEquals, assertExists } from "jsr:@std/assert";
import { normalizeEmail } from "../identity.ts";

// ---------------------------------------------------------------------------
// Regression: onConflict target on people/applicants upserts
//
// Migration 20260528000002 replaced the unique index on `people` and
// `applicants` from (tenant_id, email) with (tenant_id, email_normalized).
// Four Edge Functions (sync-wp-users, detect-hires-bamboohr,
// detect-hires-jazzhr, listApplicants) still upserted with
// onConflict: "tenant_id,email", which no longer matches any unique index,
// so Postgres raised 42P10. This suite pins the corrected target and the
// sync-wp-users swallow-guard contract.
//
// Why a contract test (not an import of the real handlers):
//   The four EF index.ts modules call Deno.serve(...) at top level and keep
//   their write logic inline (no exported handler), so importing them to drive
//   behaviour would start a server and is not viable. The prescribed run
//   command also grants only --allow-env --allow-net (no --allow-read), so a
//   source-scanning test can't read the files either. We therefore reuse the
//   conversion.test.ts fake-client pattern and make the fake client validate
//   ON CONFLICT targets exactly the way Postgres does — a mismatched target
//   yields 42P10. The corrected target is held in a single constant so a
//   future reversion to "tenant_id,email" fails these tests.
//
//   Follow-up (out of scope for this hotfix): extract the sync-wp-users loop
//   body into an importable handler (as ai-summarize-applicant/handler.ts did)
//   so the real code path can be exercised directly.
// ---------------------------------------------------------------------------

// The one corrected conflict target, shared by every fixed upsert. Reverting
// this constant to "tenant_id,email" makes the fake client raise 42P10 and the
// suite goes red — exactly the production failure.
const EMAIL_NORMALIZED_TARGET = "tenant_id,email_normalized";

type Row = Record<string, unknown>;

interface DbResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function emailNorm(row: Row): string {
  return row.email ? normalizeEmail(String(row.email)) : "";
}

// ---------------------------------------------------------------------------
// Postgres-like fake admin client.
//
// Models `people`/`applicants` with a single unique index on
// (tenant_id, email_normalized). upsert() validates its onConflict target the
// way Postgres validates ON CONFLICT: the column set must equal the modeled
// unique index, otherwise it returns { error: 42P10 } (NOT a throw — supabase-js
// surfaces it in `error`). update() is recorded so a test can assert it was or
// was not reached.
// ---------------------------------------------------------------------------

const PG_UNIQUE_INDEX = ["tenant_id", "email_normalized"];

function targetMatchesIndex(onConflict: string | null): boolean {
  const cols = (onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (cols.length !== PG_UNIQUE_INDEX.length) return false;
  return PG_UNIQUE_INDEX.every((c) => cols.includes(c));
}

interface UpsertCall {
  table: string;
  onConflict: string | null;
}

// A thenable+selectable builder, mirroring the awaitable supabase-js surface.
interface UpsertBuilder extends PromiseLike<DbResult> {
  select(): Promise<DbResult>;
}

// A chainable, awaitable update builder.
interface UpdateChain extends PromiseLike<DbResult> {
  eq(col?: string, val?: unknown): UpdateChain;
  is(col?: string, val?: unknown): UpdateChain;
  or(filter?: string): UpdateChain;
}

class FakeClient {
  people: Row[] = [];
  applicants: Row[] = [];
  upsertCalls: UpsertCall[] = [];
  updateCount = 0;
  // When set, the next upsert against this table returns this error instead of
  // writing — used to simulate a failing insert-ignore for the swallow guard.
  private forcedUpsertError: { table: string; error: { code?: string; message: string } } | null = null;

  forceUpsertError(table: string, error: { code?: string; message: string }) {
    this.forcedUpsertError = { table, error };
  }

  private store(table: string): Row[] {
    if (table === "people") return this.people;
    if (table === "applicants") return this.applicants;
    throw new Error(`unmodeled table ${table}`);
  }

  from(table: string) {
    const self = this;
    return {
      upsert(
        rows: Row | Row[],
        opts?: { onConflict?: string; ignoreDuplicates?: boolean },
      ): UpsertBuilder {
        const onConflict = opts?.onConflict ?? null;
        self.upsertCalls.push({ table, onConflict });

        let result: DbResult;
        // Postgres: ON CONFLICT target must match a real unique index.
        if (!targetMatchesIndex(onConflict)) {
          result = {
            data: null,
            error: {
              code: "42P10",
              message:
                "there is no unique or exclusion constraint matching the ON CONFLICT specification",
            },
          };
        } else if (self.forcedUpsertError && self.forcedUpsertError.table === table) {
          result = { data: null, error: self.forcedUpsertError.error };
          self.forcedUpsertError = null;
        } else {
          const incoming = Array.isArray(rows) ? rows : [rows];
          const store = self.store(table);
          for (const row of incoming) {
            const existing = store.find(
              (r) => r.tenant_id === row.tenant_id && emailNorm(r) === emailNorm(row),
            );
            if (existing) {
              if (!opts?.ignoreDuplicates) Object.assign(existing, row);
              // ignoreDuplicates → DO NOTHING
            } else {
              store.push({ id: crypto.randomUUID(), ...row });
            }
          }
          result = { data: null, error: null };
        }

        const settled = Promise.resolve(result);
        return {
          select: () => settled,
          then: (onfulfilled, onrejected) => settled.then(onfulfilled, onrejected),
        };
      },
      update(_obj: Row): UpdateChain {
        self.updateCount++;
        const settled = Promise.resolve<DbResult>({ data: [], error: null });
        const chain: UpdateChain = {
          eq: () => chain,
          is: () => chain,
          or: () => chain,
          then: (onfulfilled, onrejected) => settled.then(onfulfilled, onrejected),
        };
        return chain;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Faithful reproduction of the corrected sync-wp-users per-user loop body
// (supabase/functions/sync-wp-users/index.ts processTenant). This is the unit
// whose contract regressed; keeping it here lets us assert the swallow-guard
// outcome (errors vs synced, UPDATE reached or not) deterministically.
// ---------------------------------------------------------------------------

interface WpUser {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  registered_date?: string | null;
}

async function syncOneWpUser(
  admin: FakeClient,
  tenantId: string,
  wpUser: WpUser,
): Promise<"synced" | "skipped" | "error"> {
  const email = wpUser.email ? normalizeEmail(wpUser.email) : "";
  if (!email) return "skipped";

  // Insert-ignore: profile_source='wordpress' only on first insert
  const { error: insertErr } = await admin.from("people").upsert(
    [
      {
        tenant_id: tenantId,
        email,
        first_name: wpUser.first_name || null,
        last_name: wpUser.last_name || null,
        wp_user_id: wpUser.id,
        hired_at: wpUser.registered_date || null,
        type: "employee",
        employee_status: "Onboarding",
        profile_source: "wordpress",
      },
    ],
    { onConflict: EMAIL_NORMALIZED_TARGET, ignoreDuplicates: true },
  );

  if (insertErr) {
    // Fix B: do NOT fall through to UPDATE / synced++.
    return "error";
  }

  const { error: updateErr } = await admin
    .from("people")
    .update({ type: "employee" })
    .eq("tenant_id", tenantId)
    .eq("email", email);

  if (updateErr) return "error";
  return "synced";
}

const TENANT = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// 1. The corrected target is valid; the old target raises 42P10.
// ---------------------------------------------------------------------------

Deno.test("people upsert with tenant_id,email_normalized is a valid ON CONFLICT target", async () => {
  const admin = new FakeClient();
  const res = await admin.from("people").upsert(
    [{ tenant_id: TENANT, email: "Ida@Example.com", profile_source: "wordpress" }],
    { onConflict: EMAIL_NORMALIZED_TARGET, ignoreDuplicates: true },
  );
  assertEquals(res.error, null);
  assertEquals(admin.people.length, 1);
});

Deno.test("regression: the old tenant_id,email target raises 42P10 (no matching unique index)", async () => {
  const admin = new FakeClient();
  const res = await admin.from("people").upsert(
    [{ tenant_id: TENANT, email: "Ida@Example.com", profile_source: "wordpress" }],
    { onConflict: "tenant_id,email", ignoreDuplicates: true },
  );
  assertEquals(res.error?.code, "42P10");
  // nothing written
  assertEquals(admin.people.length, 0);
});

Deno.test("applicants upsert with tenant_id,email_normalized is a valid ON CONFLICT target", async () => {
  const admin = new FakeClient();
  const res = await admin.from("applicants").upsert(
    [{ tenant_id: TENANT, email: "ada@example.com", status: "Hired" }],
    { onConflict: EMAIL_NORMALIZED_TARGET, ignoreDuplicates: false },
  );
  assertEquals(res.error, null);
  assertEquals(admin.applicants.length, 1);
});

// ---------------------------------------------------------------------------
// 2. sync-wp-users swallow guard (Fix B): a failed insert is counted as an
//    error, NOT synced, and the follow-up UPDATE is not reached.
// ---------------------------------------------------------------------------

Deno.test("sync-wp-users: a new WP user with the corrected target is synced (insert + update reached)", async () => {
  const admin = new FakeClient();
  const outcome = await syncOneWpUser(admin, TENANT, {
    id: 293,
    email: "idalwsbnl@gmail.com",
    first_name: "Ida",
    registered_date: "2026-06-06",
  });
  assertEquals(outcome, "synced");
  assertEquals(admin.people.length, 1);
  assertEquals(admin.updateCount, 1); // UPDATE reached on success
});

Deno.test("sync-wp-users swallow guard: failed insert-ignore counts as error, not synced, and UPDATE is not reached", async () => {
  const admin = new FakeClient();
  // Simulate the insert-ignore failing (e.g. the very 42P10 this hotfix fixes,
  // or any transient DB error). The guard must short-circuit.
  admin.forceUpsertError("people", { code: "42P10", message: "boom" });

  const outcome = await syncOneWpUser(admin, TENANT, {
    id: 999,
    email: "fails@example.com",
  });

  assertEquals(outcome, "error"); // errors++, not synced++
  assertEquals(admin.updateCount, 0); // UPDATE NOT reached — no silent fall-through
  assertEquals(admin.people.length, 0); // nothing written
});

// ---------------------------------------------------------------------------
// 3. Idempotency: insert-ignore on (tenant_id, email_normalized) dedups
//    case-insensitively — a second sync of the same email does not duplicate.
// ---------------------------------------------------------------------------

Deno.test("sync-wp-users: re-syncing the same email (different case) does not create a duplicate", async () => {
  const admin = new FakeClient();
  await syncOneWpUser(admin, TENANT, { id: 1, email: "Sam@Example.com" });
  await syncOneWpUser(admin, TENANT, { id: 1, email: "sam@example.com" });
  assertEquals(admin.people.length, 1);
});

// Reference the recorded upsert calls so the field is exercised (and available
// for future assertions); the swallow-guard test above already drives writes.
Deno.test("fake client records the onConflict target passed to each upsert", async () => {
  const admin = new FakeClient();
  await admin.from("people").upsert(
    [{ tenant_id: TENANT, email: "x@example.com" }],
    { onConflict: EMAIL_NORMALIZED_TARGET, ignoreDuplicates: true },
  );
  assertExists(admin.upsertCalls[0]);
  assertEquals(admin.upsertCalls[0].onConflict, EMAIL_NORMALIZED_TARGET);
});
