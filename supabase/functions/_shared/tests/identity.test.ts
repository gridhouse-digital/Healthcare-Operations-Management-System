import { assertEquals } from "jsr:@std/assert";
import {
  findEmployeeMatch,
  type IdentityQueryClient,
  type MatchableEmployee,
  normalizeEmail,
} from "../identity.ts";

// ---------------------------------------------------------------------------
// Fake query client
//
// Mirrors the chained PostgREST builder surface findEmployeeMatch uses:
//   from(table).select(cols).eq(col,val)...maybeSingle()/limit(n)
// Each builder records its .eq() filters, then resolves against the seeded
// rows for that table by applying those filters in-memory. This lets us drive
// every Q5 precedence branch deterministically with zero network.
// ---------------------------------------------------------------------------

type Row = MatchableEmployee;

class FakeBuilder {
  private filters: Array<[string, unknown]> = [];
  constructor(private rows: Row[]) {}

  select(_cols?: string): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }
  private apply(): Row[] {
    return this.rows.filter((r) =>
      this.filters.every(([col, val]) => {
        if (col === "email_normalized") return normalizeEmail(r.email) === val;
        // deno-lint-ignore no-explicit-any
        return (r as any)[col] === val;
      })
    );
  }
  // deno-lint-ignore require-await
  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const m = this.apply();
    return { data: m[0] ?? null, error: null };
  }
  // deno-lint-ignore require-await
  async limit(_n: number): Promise<{ data: Row[]; error: null }> {
    return { data: this.apply(), error: null };
  }
}

function fakeClient(peopleRows: Row[]): IdentityQueryClient {
  return {
    from(table: string) {
      if (table !== "people") throw new Error(`unexpected table ${table}`);
      // each call gets a fresh builder with the full row set
      return new FakeBuilder(peopleRows.map((r) => ({ ...r }))) as unknown as
        ReturnType<IdentityQueryClient["from"]>;
    },
  };
}

const TENANT_A = "tenant-aaaa";
const TENANT_B = "tenant-bbbb";

function emp(over: Partial<Row>): Row {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT_A,
    type: "employee",
    email: "person@example.com",
    applicant_id: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// normalizeEmail — trim(lowercase), nothing else
// ---------------------------------------------------------------------------

Deno.test("normalizeEmail trims and lowercases", () => {
  assertEquals(normalizeEmail("  Foo.Bar@Example.COM  "), "foo.bar@example.com");
});

Deno.test("normalizeEmail does NOT strip Gmail dots (no provider transforms)", () => {
  assertEquals(normalizeEmail("a.b.c@gmail.com"), "a.b.c@gmail.com");
});

// ---------------------------------------------------------------------------
// ID-1: exact applicant_id linkage wins
// ---------------------------------------------------------------------------

Deno.test("ID-1: applicant_id match links to that employee", async () => {
  const target = emp({ applicant_id: "app-1", email: "x@example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([target]),
    tenantId: TENANT_A,
    applicantId: "app-1",
    email: "x@example.com",
  });
  assertEquals(res.outcome, "matched");
  if (res.outcome === "matched") assertEquals(res.employee.id, target.id);
});

Deno.test("ID-1: applicant_id wins even when email matches a DIFFERENT row is a conflict, not a guess", async () => {
  // applicant_id points to A; email matches a different row B → conflict (ID-3)
  const a = emp({ id: "A", applicant_id: "app-1", email: "old@example.com" });
  const b = emp({ id: "B", applicant_id: null, email: "new@example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([a, b]),
    tenantId: TENANT_A,
    applicantId: "app-1",
    email: "new@example.com", // matches B, but applicant_id links A
  });
  assertEquals(res.outcome, "collision");
  if (res.outcome === "collision") {
    assertEquals(res.reason, "applicant_email_conflict");
    assertEquals(res.candidateIds.sort(), ["A", "B"]);
  }
});

Deno.test("ID-1: applicant_id match whose email ALSO matches the SAME row links cleanly", async () => {
  const a = emp({ id: "A", applicant_id: "app-1", email: "same@example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([a]),
    tenantId: TENANT_A,
    applicantId: "app-1",
    email: "Same@Example.com",
  });
  assertEquals(res.outcome, "matched");
  if (res.outcome === "matched") assertEquals(res.employee.id, "A");
});

// ---------------------------------------------------------------------------
// ID-2 / ID-4: exactly one normalized-email match auto-links
// ---------------------------------------------------------------------------

Deno.test("ID-2: exactly one normalized-email match auto-links", async () => {
  const a = emp({ id: "A", applicant_id: null, email: "Match@Example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([a]),
    tenantId: TENANT_A,
    applicantId: "app-99",
    email: "  match@example.COM ",
  });
  assertEquals(res.outcome, "matched");
  if (res.outcome === "matched") assertEquals(res.employee.id, "A");
});

Deno.test("ID-4: WP-first employee, applicant arrives later, single match converges", async () => {
  // WP-imported employee with no applicant_id yet, same email
  const wpFirst = emp({ id: "WP", applicant_id: null, email: "late@example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([wpFirst]),
    tenantId: TENANT_A,
    applicantId: "app-late",
    email: "late@example.com",
  });
  assertEquals(res.outcome, "matched");
  if (res.outcome === "matched") assertEquals(res.employee.id, "WP");
});

// ---------------------------------------------------------------------------
// zero matches → none (caller may create)
// ---------------------------------------------------------------------------

Deno.test("zero matches → none", async () => {
  const res = await findEmployeeMatch({
    client: fakeClient([emp({ email: "other@example.com" })]),
    tenantId: TENANT_A,
    applicantId: "app-new",
    email: "brand-new@example.com",
  });
  assertEquals(res.outcome, "none");
});

// ---------------------------------------------------------------------------
// ID-3: ambiguous ≥2 email matches → collision, NEVER a tie-break
// ---------------------------------------------------------------------------

Deno.test("ID-3: two normalized-email matches → collision, no guess", async () => {
  const a = emp({ id: "A", applicant_id: null, email: "dup@example.com" });
  const b = emp({ id: "B", applicant_id: null, email: "DUP@example.com" });
  const res = await findEmployeeMatch({
    client: fakeClient([a, b]),
    tenantId: TENANT_A,
    applicantId: "app-x",
    email: "dup@example.com",
  });
  assertEquals(res.outcome, "collision");
  if (res.outcome === "collision") {
    assertEquals(res.reason, "multiple_email_matches");
    assertEquals(res.candidateIds.sort(), ["A", "B"]);
    assertEquals(res.normalizedEmail, "dup@example.com");
    // explicitly: no employee was chosen
    // (the union has no `employee` field on the collision branch)
  }
});

// ---------------------------------------------------------------------------
// ID-5: cross-tenant — same email in tenant A and B must NOT match across.
// (Also re-asserted as an integration test inside the Phase 0 RLS suite.)
// ---------------------------------------------------------------------------

Deno.test("ID-5: same normalized email in another tenant does NOT match", async () => {
  const otherTenantRow = emp({
    id: "OTHER",
    tenant_id: TENANT_B,
    applicant_id: null,
    email: "shared@example.com",
  });
  const res = await findEmployeeMatch({
    client: fakeClient([otherTenantRow]),
    tenantId: TENANT_A, // querying as tenant A
    applicantId: "app-a",
    email: "shared@example.com",
  });
  // tenant_id filter excludes the tenant-B row → no match → create allowed
  assertEquals(res.outcome, "none");
});

Deno.test("ID-5: applicant_id present in another tenant does NOT match across tenants", async () => {
  const otherTenantRow = emp({
    id: "OTHER",
    tenant_id: TENANT_B,
    applicant_id: "app-shared",
    email: "shared@example.com",
  });
  const res = await findEmployeeMatch({
    client: fakeClient([otherTenantRow]),
    tenantId: TENANT_A,
    applicantId: "app-shared",
    email: "shared@example.com",
  });
  assertEquals(res.outcome, "none");
});
