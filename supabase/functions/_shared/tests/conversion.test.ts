import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  convertApplicantToEmployee,
  ConversionError,
  logProvisioningFailure,
} from "../conversion.ts";
import { normalizeEmail } from "../identity.ts";

// ---------------------------------------------------------------------------
// In-memory fake admin client.
//
// Supports the chained surface conversion.ts uses against a service-role client:
//   from(table).select(cols).eq().neq().is().order().limit().maybeSingle()
//   from(table).update(obj).eq().is().neq()         (returns {error})
//   from(table).upsert(rows,{onConflict,ignoreDuplicates}).select().maybeSingle()
//
// It models people uniqueness on (tenant_id, email_normalized) so ON CONFLICT
// DO NOTHING + re-select behaves like Postgres, which is what the idempotency
// and race (ORD-4/ORD-5) assertions depend on.
// ---------------------------------------------------------------------------

interface Tables {
  applicants: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  people: Record<string, unknown>[];
  identity_collisions: Record<string, unknown>[];
  integration_log: Record<string, unknown>[];
}

function emailNorm(row: Record<string, unknown>): string {
  return row.email ? normalizeEmail(String(row.email)) : "";
}

class Query {
  private filters: Array<(r: Record<string, unknown>) => boolean> = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private mode: "select" | "update" | "upsert" = "select";
  private updateObj: Record<string, unknown> | null = null;
  private upsertRows: Record<string, unknown>[] = [];
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(
    private store: Record<string, unknown>[],
    private table: string,
    private failUpdate = false,
  ) {}

  select(_c?: string) { this.mode = this.mode === "select" ? "select" : this.mode; return this; }
  update(obj: Record<string, unknown>) { this.mode = "update"; this.updateObj = obj; return this; }
  upsert(rows: Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.upsertRows = rows;
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => {
      if (col === "email_normalized") return emailNorm(r) === val;
      return r[col] === val;
    });
    return this;
  }
  neq(col: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  is(col: string, val: unknown) {
    if (val === null) this.filters.push((r) => r[col] === null || r[col] === undefined);
    return this;
  }
  order(key: string, opts?: { ascending?: boolean }) { this.orderKey = key; this.orderAsc = opts?.ascending ?? true; return this; }
  limit(n: number) { this.limitN = n; return this; }

  private matches(): Record<string, unknown>[] {
    let rows = this.store.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderKey) {
      const k = this.orderKey;
      rows = [...rows].sort((a, b) => {
        const av = String(a[k] ?? ""); const bv = String(b[k] ?? "");
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private run(): { data: unknown; error: { message: string } | null } {
    if (this.mode === "update") {
      if (this.failUpdate) {
        return { data: null, error: { message: `forced update failure on ${this.table}` } };
      }
      const rows = this.store.filter((r) => this.filters.every((f) => f(r)));
      for (const r of rows) Object.assign(r, this.updateObj);
      return { data: rows, error: null };
    }
    if (this.mode === "upsert") {
      for (const incoming of this.upsertRows) {
        const conflictCols = (this.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        const existing = this.store.find((r) =>
          conflictCols.every((c) =>
            c === "email_normalized" ? emailNorm(r) === emailNorm(incoming) : r[c] === incoming[c]
          )
        );
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, incoming);
          // ignoreDuplicates → DO NOTHING
        } else {
          this.store.push({ id: crypto.randomUUID(), ...incoming });
        }
      }
      return { data: this.matches(), error: null };
    }
    return { data: this.matches(), error: null };
  }

  // thenable terminals
  // deno-lint-ignore require-await
  async maybeSingle() {
    const { data, error } = this.run();
    const arr = (data ?? []) as Record<string, unknown>[];
    return { data: arr[0] ?? null, error };
  }
  then(
    resolve?: (v: { data: unknown; error: { message: string } | null }) => void,
    _reject?: (e: unknown) => void,
  ) {
    const { data, error } = this.run();
    // The query result resolves with {data,error}; it never rejects the promise
    // (PostgREST surfaces failures in `error`, not as a throw). So the onRejected
    // handler is never invoked — matching supabase-js builder semantics.
    if (resolve) resolve({ data, error });
  }
}

function makeAdmin(seed: Partial<Tables> = {}, failUpdateTable?: keyof Tables) {
  const tables: Tables = {
    applicants: seed.applicants ?? [],
    offers: seed.offers ?? [],
    people: seed.people ?? [],
    identity_collisions: seed.identity_collisions ?? [],
    integration_log: seed.integration_log ?? [],
  };
  return {
    tables,
    from(table: keyof Tables) {
      return new Query(tables[table], table, table === failUpdateTable);
    },
  };
}

const TENANT = "tenant-1";

function seedHappyPath() {
  return makeAdmin({
    applicants: [{
      id: "app-1",
      tenant_id: TENANT,
      first_name: "Ada",
      last_name: "Nurse",
      email: "Ada@Example.com",
      phone: "555",
      status: "Offer",
    }],
    offers: [{
      id: "offer-1",
      applicant_id: "app-1",
      status: "Accepted",
      start_date: "2026-06-15",
      position_title: "Registered Nurse (RN)",
      updated_at: "2026-06-01",
    }],
    people: [],
  });
}

// ---------------------------------------------------------------------------
// AC-2 / AC-3: authoritative hired_at + job_title from the accepted offer
// ---------------------------------------------------------------------------

Deno.test("converts: sets hired_at=offer.start_date and job_title=offer.position_title", async () => {
  const admin = seedHappyPath();
  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });
  assertEquals(res.outcome, "converted");
  const person = admin.tables.people[0];
  assertEquals(person.hired_at, "2026-06-15");
  assertEquals(person.job_title, "Registered Nurse (RN)");
  assertEquals(person.email, "ada@example.com"); // normalized
  assertEquals(person.type, "employee");
  assertEquals(person.applicant_id, "app-1");
  // applicant marked Hired
  assertEquals(admin.tables.applicants[0].status, "Hired");
});

Deno.test("AC-2: missing offer.start_date fails conversion with actionable error", async () => {
  const admin = seedHappyPath();
  (admin.tables.offers[0] as Record<string, unknown>).start_date = null;
  try {
    await convertApplicantToEmployee(admin, { applicantId: "app-1" });
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals(e instanceof ConversionError, true);
    assertEquals((e as ConversionError).code, "OFFER_MISSING_START_DATE");
  }
  assertEquals(admin.tables.people.length, 0);
});

Deno.test("AC-3: missing offer.position_title fails conversion (no 'To Be Assigned')", async () => {
  const admin = seedHappyPath();
  (admin.tables.offers[0] as Record<string, unknown>).position_title = null;
  try {
    await convertApplicantToEmployee(admin, { applicantId: "app-1" });
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as ConversionError).code, "OFFER_MISSING_POSITION_TITLE");
  }
  assertEquals(admin.tables.people.length, 0);
});

// ---------------------------------------------------------------------------
// AC-5 / ORD-4: idempotency — second run, no new row, hired_at unchanged
// ---------------------------------------------------------------------------

Deno.test("AC-5/ORD-4: converting twice → one row, byte-identical hired_at", async () => {
  const admin = seedHappyPath();
  const r1 = await convertApplicantToEmployee(admin, { applicantId: "app-1" });
  const r2 = await convertApplicantToEmployee(admin, { applicantId: "app-1" });
  assertEquals(admin.tables.people.length, 1);
  assertEquals(r1.personId, r2.personId);
  assertEquals(admin.tables.people[0].hired_at, "2026-06-15");
  assertEquals(r2.reused, true);
});

// ---------------------------------------------------------------------------
// AC-11 / NFR-3: existing valid hired_at is NEVER overwritten
// ---------------------------------------------------------------------------

Deno.test("AC-11/NFR-3: existing hired_at on a matched row is preserved", async () => {
  const admin = seedHappyPath();
  // pre-existing employee row, linked by email, with an earlier hired_at
  admin.tables.people.push({
    id: "emp-existing",
    tenant_id: TENANT,
    email: "ada@example.com",
    type: "employee",
    applicant_id: null,
    hired_at: "2026-01-01", // legal start already recorded
    employee_id: "EMP-000001",
  });
  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });
  assertEquals(res.outcome, "converted");
  assertEquals(admin.tables.people.length, 1);
  // hired_at must NOT be overwritten by the offer start_date
  assertEquals(admin.tables.people[0].hired_at, "2026-01-01");
  // but job_title is updated to the authoritative offer title
  assertEquals(admin.tables.people[0].job_title, "Registered Nurse (RN)");
});

// ---------------------------------------------------------------------------
// AC-9: ambiguous identity → records collision, does NOT create/link
// ---------------------------------------------------------------------------

Deno.test("AC-9: two email matches → unresolved collision, no people mutation", async () => {
  const admin = seedHappyPath();
  admin.tables.people.push(
    { id: "dup-A", tenant_id: TENANT, email: "ada@example.com", type: "employee", applicant_id: null, hired_at: "2025-01-01" },
    { id: "dup-B", tenant_id: TENANT, email: "Ada@Example.com", type: "employee", applicant_id: null, hired_at: "2025-02-02" },
  );
  const before = JSON.stringify(admin.tables.people);
  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });

  assertEquals(res.outcome, "collision");
  assertEquals(res.reasonCode, "multiple_email_matches");
  assertExists(res.collisionId);
  // no people row created or mutated
  assertEquals(JSON.stringify(admin.tables.people), before);
  // collision recorded with the required fields
  const col = admin.tables.identity_collisions[0];
  assertEquals(col.tenant_id, TENANT);
  assertEquals(col.applicant_id, "app-1");
  assertEquals(col.normalized_email, "ada@example.com");
  assertEquals(col.reason_code, "multiple_email_matches");
  assertEquals(col.resolution_status, "unresolved");
  assertEquals(col.source, "convert-applicant");
});

Deno.test("AC-9: applicant_id/email conflict → applicant_email_conflict collision, no mutation", async () => {
  const admin = seedHappyPath();
  admin.tables.people.push(
    { id: "linked", tenant_id: TENANT, email: "old@example.com", type: "employee", applicant_id: "app-1", hired_at: "2025-01-01" },
    { id: "byemail", tenant_id: TENANT, email: "ada@example.com", type: "employee", applicant_id: null, hired_at: "2025-02-02" },
  );
  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });
  assertEquals(res.outcome, "collision");
  assertEquals(res.reasonCode, "applicant_email_conflict");
});

// ---------------------------------------------------------------------------
// Latent CV-1 defensive guard: a pre-existing NON-employee row on the same
// (tenant_id, email_normalized) suppresses the ON CONFLICT DO NOTHING insert
// and is missed by the type='employee' re-select. Conversion must ADOPT it
// (flip type→employee) rather than throw CONVERSION_ROW_MISSING — one row, no
// duplicate. (No current code path creates such a row; this is future-proofing.)
// ---------------------------------------------------------------------------

Deno.test("CV-1 guard: pre-existing candidate row on the email → convert adopts it (type flips, one row)", async () => {
  const admin = seedHappyPath();
  admin.tables.people.push({
    id: "cand-existing",
    tenant_id: TENANT,
    email: "ada@example.com",
    type: "candidate", // NOT an employee — would be missed by the type='employee' re-select
    applicant_id: null,
    hired_at: null,
  });

  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });

  assertEquals(res.outcome, "converted");
  // exactly one row (no duplicate created)
  assertEquals(admin.tables.people.length, 1);
  const row = admin.tables.people[0];
  assertEquals(row.id, "cand-existing"); // adopted the existing row
  assertEquals(row.type, "employee"); // flipped
  assertEquals(row.applicant_id, "app-1"); // linked
  assertEquals(row.hired_at, "2026-06-15"); // set from offer (was null)
  assertEquals(row.job_title, "Registered Nurse (RN)");
});

// ---------------------------------------------------------------------------
// CV-2 / no-silent-failure: a failed applicant Hired-mark is LOUD — it writes a
// durable `failed` integration_log row, while conversion still succeeds (the
// people row is the source of truth; the Hired flag is a downstream effect).
// ---------------------------------------------------------------------------

Deno.test("CV-2: applicant Hired-mark failure writes a durable integration_log row (no silent failure)", async () => {
  const admin = makeAdmin({
    applicants: [{
      id: "app-1", tenant_id: TENANT, first_name: "Ada", last_name: "Nurse",
      email: "ada@example.com", phone: "555", status: "Offer",
    }],
    offers: [{
      id: "offer-1", applicant_id: "app-1", status: "Accepted",
      start_date: "2026-06-15", position_title: "Registered Nurse (RN)", updated_at: "2026-06-01",
    }],
  }, "applicants"); // force the applicants UPDATE (Hired-mark) to fail

  const res = await convertApplicantToEmployee(admin, { applicantId: "app-1" });

  // conversion still succeeds — the people row is the source of truth
  assertEquals(res.outcome, "converted");
  assertEquals(admin.tables.people.length, 1);

  // ...but the failure is recorded durably (loud), not swallowed
  const failed = admin.tables.integration_log.find(
    (r) => r.source === "convert-applicant" && r.status === "failed",
  );
  assertExists(failed);
  assertEquals(failed!.tenant_id, TENANT);
  assertEquals(failed!.idempotency_key, "applicant-hired:app-1");
});

// ---------------------------------------------------------------------------
// CV-2 (the brief's finding): a FAILED onboard-employee provisioning call must
// write a durable `failed` integration_log row — NOT just console.error. The
// internal conversion has already succeeded; provisioning is a separate
// retryable step (Q4). logProvisioningFailure is the shared writer the
// convert-applicant authority calls on the non-ok / invocation-error paths.
// ---------------------------------------------------------------------------

Deno.test("CV-2: provisioning failure writes a durable failed integration_log row", async () => {
  const admin = makeAdmin({});
  await logProvisioningFailure(
    admin,
    TENANT,
    "app-1",
    "person-1",
    { status: 502, body: { error: "WP unreachable" } },
  );

  assertEquals(admin.tables.integration_log.length, 1);
  const row = admin.tables.integration_log[0];
  assertEquals(row.tenant_id, TENANT);
  assertEquals(row.source, "convert-applicant");
  assertEquals(row.status, "failed");
  // idempotency: keyed on the applicant so repeated failures update one row
  assertEquals(row.idempotency_key, "provisioning:app-1");
  const payload = row.payload as Record<string, unknown>;
  assertEquals(payload.person_id, "person-1");
  assertEquals(payload.step, "onboard_employee_provisioning");
});

Deno.test("CV-2: provisioning failure is idempotent on (tenant,source,key) — one open row", async () => {
  const admin = makeAdmin({});
  await logProvisioningFailure(admin, TENANT, "app-1", "person-1", { attempt: 1 });
  await logProvisioningFailure(admin, TENANT, "app-1", "person-1", { attempt: 2 });
  // same idempotency key → upsert updates the single row, never piles up
  assertEquals(admin.tables.integration_log.length, 1);
});

Deno.test("CV-2: no tenant_id → no-op (cannot write a tenant-scoped row)", async () => {
  const admin = makeAdmin({});
  await logProvisioningFailure(admin, undefined, "app-1", "person-1", { error: "x" });
  assertEquals(admin.tables.integration_log.length, 0);
});

// ---------------------------------------------------------------------------
// applicant-not-found / no-tenant guardrails
// ---------------------------------------------------------------------------

Deno.test("missing applicant → APPLICANT_NOT_FOUND", async () => {
  const admin = makeAdmin({});
  try {
    await convertApplicantToEmployee(admin, { applicantId: "nope" });
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as ConversionError).code, "APPLICANT_NOT_FOUND");
  }
});
