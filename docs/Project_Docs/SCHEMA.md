# SCHEMA — HOMS

> **Hierarchy rank:** 5 (current — authoritative for table structure / RLS notes).
> Registered by the 2026-05-29 doc audit.

> Canonical table reference. Updated: 2026-03-11.
> All tables have RLS enabled. Tenant-scoped MVP tables have audit triggers. `tenant_access_requests` is the intentional pre-tenant exception because `audit_log` requires a tenant context.

---

## Conventions
- All tenant-scoped tables: `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `tenant_id` is ALWAYS read from JWT `app_metadata`, never from request body
- Email deduplication: `UNIQUE (tenant_id, email)` on `people`
- Audit: every write goes to `audit_log` via trigger
- Signed URLs: never stored in DB — regenerate on demand

---

## tenants

```
id          UUID PK
name        TEXT NOT NULL
slug        TEXT UNIQUE NOT NULL       -- used in WP sub-site URLs (post-MVP)
created_at  TIMESTAMPTZ
```

**RLS:**
- `platform_admin`: read/write all
- `tenant_admin` / `hr_admin`: SELECT own tenant only (`id = JWT app_metadata tenant_id`)

---

## tenant_access_requests

```
id                           UUID PK
organization_name            TEXT NOT NULL
organization_name_normalized TEXT GENERATED (lower(trim(...))) STORED
primary_contact_name         TEXT NOT NULL
work_email                   TEXT NOT NULL
work_email_normalized        TEXT GENERATED (lower(trim(...))) STORED
phone                        TEXT
team_size                    TEXT NOT NULL   -- '1-10' | '11-25' | '26-50' | '51-100' | '100+'
integration_needs            TEXT
notes                        TEXT
status                       TEXT NOT NULL   -- 'submitted' | 'under_review' | 'approved' | 'rejected' | 'provisioned'
notification_status          TEXT NOT NULL   -- 'pending' | 'sent' | 'failed'
notification_error           TEXT
notification_sent_at         TIMESTAMPTZ
requester_confirmation_status TEXT NOT NULL  -- 'pending' | 'sent' | 'failed' | 'skipped'
requester_confirmation_error  TEXT
requester_confirmation_sent_at TIMESTAMPTZ
request_ip                   TEXT
request_origin               TEXT
user_agent                   TEXT
created_at                   TIMESTAMPTZ
updated_at                   TIMESTAMPTZ
```

**Purpose:** Public request-access intake before any tenant exists.
**RLS:** No anonymous table access. `platform_admin` may read/update via policy; the public Edge Function writes with the service role key.
**Indexes:** lookup on normalized organization/email, status+created_at, a partial unique index that allows only one open (`submitted` or `under_review`) request per organization/email pair, and an IP+created_at index for lightweight abuse review.
**Critical:** This table intentionally does **not** include `tenant_id`. The request-access EF stores the row first, then attempts ops notification email. If notification fails, the row is retained with `notification_status = 'failed'` for manual recovery. Applicant-facing confirmation email state is tracked separately so ops can see whether the requester got an acknowledgement even if internal delivery succeeded.

---

## tenant_settings

```
tenant_id                    UUID PK FK tenants(id)
wp_site_url                  TEXT
wp_username_encrypted        TEXT       -- pgp_sym_encrypt
wp_app_password_encrypted    TEXT       -- pgp_sym_encrypt
bamboohr_key_configured      BOOLEAN GENERATED ALWAYS AS (...) STORED
bamboohr_subdomain           TEXT
bamboohr_api_key_encrypted   TEXT       -- pgp_sym_encrypt. NEVER select to frontend.
jazzhr_key_configured        BOOLEAN GENERATED ALWAYS AS (...) STORED
jazzhr_api_key_encrypted     TEXT       -- pgp_sym_encrypt. NEVER select to frontend.
wp_key_configured            BOOLEAN GENERATED ALWAYS AS (...) STORED
brevo_api_key_encrypted      TEXT       -- pgp_sym_encrypt. NEVER select to frontend.
jotform_key_configured       BOOLEAN GENERATED ALWAYS AS (...) STORED
active_connectors            TEXT[]     -- e.g. ARRAY['bamboohr']
ld_group_mappings            JSONB      -- [{job_title, group_id, is_onboarding}]
profile_source               TEXT       -- 'bamboohr' | 'jazzhr' | 'wordpress'. Set once at connector setup.
jotform_form_id_application  TEXT       -- JotForm form IDs per compliance form type
jotform_form_id_emergency    TEXT
jotform_form_id_i9           TEXT
jotform_form_id_vaccination  TEXT
jotform_form_id_licenses     TEXT
jotform_form_id_background   TEXT
logo_light                   TEXT       -- URL to tenant logo (used in emails)
created_at                   TIMESTAMPTZ
updated_at                   TIMESTAMPTZ
```

**RLS:** Own tenant only.
**Audit trigger:** `audit_tenant_settings_trigger`
**Critical:** encrypted columns are NEVER selected to the frontend. Connector status is exposed through the generated `*_key_configured` booleans so UI status cannot drift from the encrypted values.
**Onboarding gate:** `ld_group_mappings[].is_onboarding === true` marks department LearnDash groups that gate onboarding. Absent/unset defaults to false. There is no tenant-wide `onboarding_group_id` after migration `20260613000001`.

---

## people

```
id               UUID PK
tenant_id        UUID NOT NULL FK tenants(id)
email            TEXT NOT NULL
first_name       TEXT
last_name        TEXT
job_title        TEXT
phone            TEXT                                -- Epic 5: added for employee records
department       TEXT                                -- Epic 5: added for employee records
employee_id      TEXT                                -- Epic 5: external employee ID (BambooHR/JazzHR)
employee_status  TEXT CHECK in {Onboarding,Active,Terminated}  -- LIFECYCLE state (Phase 1 Q2); resolver-only writer; no default
compliance_state TEXT CHECK in {compliant,non_compliant,unknown,configuration_error}  -- Phase 1 Q2: SEPARATE from lifecycle; NULL until evaluated
email_normalized TEXT GENERATED (lower(btrim(email))) STORED   -- tenant-scoped dedup key
applicant_id     UUID FK applicants(id)              -- Epic 5: link back to applicant record
type             TEXT NOT NULL DEFAULT 'candidate'   -- 'candidate' | 'employee'
profile_source   TEXT                                -- 'bamboohr' | 'jazzhr' | 'wordpress'
wp_user_id       INTEGER                             -- set after onboard-employee provisioning
hired_at         TIMESTAMPTZ                         -- NFR-3: set once, NEVER overwritten by sync
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
```

**Unique:** `(tenant_id, email_normalized)` — universal deduplication key (normalized = `lower(btrim(email))`). The conversion authority upserts `ON CONFLICT (tenant_id, email_normalized)`.
**RLS:** Own tenant only.
**Audit trigger:** `audit_people_trigger`
**Critical:** `hired_at` is set once (Phase 1 Q1: from accepted `offer.start_date`). Sync/conversion-retry must check: if hired_at IS NOT NULL, skip.
**Phase 1 (Q2):** `employee_status` ∈ {Onboarding, Active, Terminated} is written **only** by the fail-closed employee-status resolver (`_shared/employee-status-resolver.ts`) — never inline-computed at conversion time, never via a column default (the prior `DEFAULT 'Active'` was dropped in `20260601000002`). `compliance_state` is a **separate** axis: an established `Active` employee whose credential later expires becomes `non_compliant` WITHOUT reverting to `Onboarding`. `Terminated` is HR-controlled and never auto-reversed.
**Migration:** `20260601000002_phase1_compliance_state_and_identity_collisions.sql` (adds `compliance_state`, drops the `employee_status` default; no existing-row backfill).

---

## identity_collisions

> Phase 1 (Q5). Durable ledger of **unresolved identity collisions**. When tenant-scoped reconciliation
> (`_shared/identity.ts` `findEmployeeMatch`) finds ambiguous/conflicting evidence it records a row HERE
> and does NOT auto-link, merge, create, or guess. One row per detected collision for manual HR review.

```
id                UUID PK
tenant_id         UUID NOT NULL FK tenants(id)
source            TEXT NOT NULL                       -- 'convert-applicant' | 'sync-wp-users' | ...
applicant_id      UUID                                -- the applicant being reconciled (if any)
normalized_email  TEXT NOT NULL                       -- lower(btrim(email)) at detection time
candidate_ids     UUID[] NOT NULL DEFAULT '{}'        -- implicated people.id values (≥1)
reason_code       TEXT NOT NULL CHECK in {multiple_email_matches, applicant_email_conflict}
resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK in {unresolved, resolved, dismissed}
resolved_by       UUID FK auth.users(id)              -- resolving actor
resolved_at       TIMESTAMPTZ
resolution_note   TEXT
detail            JSONB NOT NULL DEFAULT '{}'
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

**Indexes:** `(tenant_id, resolution_status, created_at desc)`; partial UNIQUE `(tenant_id, applicant_id, normalized_email) WHERE resolution_status='unresolved'` (no duplicate open collisions).
**RLS:** SELECT/INSERT/UPDATE own tenant (SELECT also `platform_admin`).
**Audit trigger:** `audit_identity_collisions_trigger`.
**Migration:** `20260601000002_phase1_compliance_state_and_identity_collisions.sql`.

---

## tenant_users

```
id          UUID PK
tenant_id   UUID NOT NULL FK tenants(id)
user_id     UUID NOT NULL FK auth.users(id) ON DELETE CASCADE
role        TEXT NOT NULL   -- 'platform_admin' | 'tenant_admin' | 'hr_admin'
status      TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'pending' | 'deactivated'
invited_by  UUID FK auth.users(id)
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
UNIQUE (tenant_id, user_id)
```

**RLS:** Own tenant only.
**Audit trigger:** `audit_tenant_users_trigger`
**Note:** This is the source of truth for JWT app_metadata claims (via custom_access_token_hook).

---

## integration_log

```
id               UUID PK
tenant_id        UUID NOT NULL FK tenants(id)
source           TEXT NOT NULL     -- 'bamboohr' | 'jazzhr' | 'learndash' | 'jotform'
idempotency_key  TEXT NOT NULL     -- email for hire events; run_id for sync runs
status           TEXT NOT NULL     -- 'hire_detected' | 'processed' | 'failed' | 'skipped'
payload          JSONB
last_received_at TIMESTAMPTZ       -- webhook health
started_at       TIMESTAMPTZ       -- sync run observability
completed_at     TIMESTAMPTZ
rows_processed   INTEGER
error_count      INTEGER
created_at       TIMESTAMPTZ
UNIQUE (tenant_id, source, idempotency_key)
```

**RLS:** Own tenant + platform_admin.
**Critical:** The UNIQUE constraint is the idempotency guard. ON CONFLICT DO NOTHING = skip duplicate hire events.

---

## audit_log

```
id          UUID PK
tenant_id   UUID NOT NULL FK tenants(id)
actor_id    UUID     -- NULL for system-generated
action      TEXT NOT NULL   -- 'INSERT' | 'UPDATE' | 'DELETE'
table_name  TEXT NOT NULL
record_id   UUID
before      JSONB
after       JSONB
created_at  TIMESTAMPTZ
```

**RLS:** INSERT for own tenant. SELECT for own tenant + platform_admin. NO UPDATE. NO DELETE.
**Critical:** Append-only. Tamper-evident. Grows indefinitely — archiving strategy needed post-MVP.

---

## training_records (Layer A — raw LearnDash sync)

```
id              UUID PK
tenant_id       UUID NOT NULL FK tenants(id)
person_id       UUID NOT NULL FK people(id)
course_id       TEXT NOT NULL     -- LearnDash course ID
course_name     TEXT              -- human-readable, synced from LD
status          TEXT              -- 'not_started' | 'in_progress' | 'completed' (CHECK)
completion_pct  INTEGER
completed_at    TIMESTAMPTZ       -- raw value from LearnDash sync
training_hours  INTEGER           -- duration in minutes, from LearnDash
expires_at      TIMESTAMPTZ       -- certification expiry (nullable, future use)
last_synced_at  TIMESTAMPTZ
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
UNIQUE (tenant_id, person_id, course_id)
```

**RLS:** Own tenant (SELECT, INSERT, UPDATE — sync needs UPDATE).
**Audit trigger:** `audit_training_records_trigger`
**Event trigger:** `training_records_event` — auto-generates `enrolled` (on INSERT) and `completed` (on UPDATE to status='completed') events.
**Sync pattern:** `ON CONFLICT (tenant_id, person_id, course_id) DO UPDATE SET ...`
**Critical:** Sync writes here only. Never touches training_adjustments.

---

## training_adjustments (Layer B — HR overrides, append-only)

```
id              UUID PK
tenant_id       UUID NOT NULL FK tenants(id)
person_id       UUID NOT NULL FK people(id)
course_id       TEXT NOT NULL
field           TEXT NOT NULL     -- CHECK: 'status' | 'completion_pct' | 'completed_at' | 'training_hours'
value           TEXT NOT NULL     -- override value (cast as needed by VIEW)
reason          TEXT NOT NULL     -- required: why HR made this adjustment
actor_id        UUID NOT NULL FK auth.users(id)
created_at      TIMESTAMPTZ       -- append-only, no updates
```

**RLS:** INSERT + SELECT for own tenant. NO UPDATE. NO DELETE.
**Audit trigger:** `audit_training_adjustments_trigger`
**Event trigger:** `training_adjustments_event` — auto-generates `adjusted` event on INSERT.
**Critical:** Effective compliance value = latest adjustment for (person_id, course_id, field) if exists, else training_records value.

---

## training_events (immutable training audit trail)

```
id          UUID PK
tenant_id   UUID NOT NULL FK tenants(id)
person_id   UUID NOT NULL FK people(id)
course_id   TEXT
event_type  TEXT NOT NULL   -- CHECK: 'enrolled' | 'completed' | 'expired' | 'adjusted'
payload     JSONB
created_at  TIMESTAMPTZ
```

**RLS:** INSERT + SELECT for own tenant. NO UPDATE. NO DELETE.
**Audit trigger:** `audit_training_events_trigger`
**Auto-generated by:** DB triggers on training_records and training_adjustments. `expired` event type schema-ready but detection deferred.

---

## v_training_compliance (Layer C — computed VIEW)

Joins `training_records` with latest `training_adjustments` per (person_id, course_id, field). Returns one row per (tenant_id, person_id, course_id).

**Key columns:** `effective_status`, `effective_completion_pct`, `effective_completed_at`, `effective_training_hours` (Layer B wins over Layer A), plus `raw_*` counterparts, `has_overrides` boolean, and metadata (`expires_at`, `last_synced_at`, `last_adjusted_at`).

**RLS:** Inherited from underlying tables. No additional policy needed.
**Critical:** Query this view for all compliance reporting. Never query training_records directly for compliance values.

---

## v_onboarding_gate

Requirement-driven per-department onboarding gate. Unnests `tenant_settings.ld_group_mappings` entries where `is_onboarding=true`, joins active `employee_group_enrollments`, active `learndash_group_courses`, and active `training_courses`, and returns one row per required onboarding course whether or not a `training_records` row exists.

**Key columns:** `tenant_id`, `person_id`, `course_id`, `course_name`, `effective_status`, `effective_completed_at`, `has_record`.
**Status source:** `effective_status`/`effective_completed_at` come from `v_onboarding_training_compliance` when a record exists; missing records surface as `effective_status='not_started'` and `has_record=false`.
**Recurring exclusion:** Active `training_compliance_rules` rows with `compliance_track='recurring'` for the same `(tenant_id, group_id, course_id)` are excluded. Recurring compliance remains owned by the recurring-compliance subsystem.
**RLS:** `security_invoker = on`; access is inherited from the underlying tenant-scoped tables.
**Migration:** `20260613000001_onboarding_gate_per_department.sql`.

---

## training_courses (recurring compliance catalog)

```
id            UUID PK
tenant_id     UUID NOT NULL FK tenants(id)
course_id     TEXT NOT NULL
course_name   TEXT
active        BOOLEAN NOT NULL DEFAULT true
wp_meta       JSONB NOT NULL DEFAULT '{}'
first_seen_at TIMESTAMPTZ
last_seen_at  TIMESTAMPTZ
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
UNIQUE (tenant_id, course_id)
```

**RLS:** Own tenant only.
**Purpose:** Stable tenant-scoped LearnDash course catalog for recurring compliance settings and rebuild logic.

---

## training_compliance_rules

```
id                          UUID PK
tenant_id                   UUID NOT NULL FK tenants(id)
rule_name                   TEXT NOT NULL
rule_type                   TEXT NOT NULL
rule_template               TEXT
compliance_track            TEXT NOT NULL
applies_to_type             TEXT NOT NULL
course_id                   TEXT NOT NULL
group_id                    TEXT NOT NULL
anchor_type                 TEXT NOT NULL
initial_due_offset_months   INTEGER NOT NULL DEFAULT 12
recurrence_interval_months  INTEGER NOT NULL DEFAULT 12
reminder_days               INTEGER[] NOT NULL DEFAULT '{60,30}'
notify_employee             BOOLEAN NOT NULL DEFAULT true
notify_admin                BOOLEAN NOT NULL DEFAULT true
accept_learndash_completion BOOLEAN NOT NULL DEFAULT true
allow_manual_completion     BOOLEAN NOT NULL DEFAULT true
allow_early_completion      BOOLEAN NOT NULL DEFAULT true
active                      BOOLEAN NOT NULL DEFAULT true
created_at                  TIMESTAMPTZ
updated_at                  TIMESTAMPTZ
UNIQUE (tenant_id, course_id, group_id)
```

**RLS:** SELECT / INSERT / UPDATE for own tenant.
**Purpose:** Tenant-defined recurring compliance policy keyed to LearnDash course and group context.

---

## employee_group_enrollments

```
id            UUID PK
tenant_id     UUID NOT NULL FK tenants(id)
person_id     UUID NOT NULL FK people(id)
group_id      TEXT NOT NULL
enrolled_at   TIMESTAMPTZ NOT NULL         -- source evidence timestamp when available
anchor_date   DATE NOT NULL                -- business calendar date for recurring compliance
anchor_source TEXT NOT NULL
active        BOOLEAN NOT NULL DEFAULT true
ended_at      TIMESTAMPTZ
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
UNIQUE (tenant_id, person_id, group_id)
```

**RLS:** SELECT / INSERT / UPDATE for own tenant.
**Critical:** `anchor_date` is intentionally `DATE`. It must be treated as a business calendar value, not rendered as a timezone-shifted instant.
**Anchor sources:** includes `group_reentry` when a user returns to a previously removed LearnDash group and a fresh active series must start without deleting the old history.

---

## employee_compliance_instances

```
id                   UUID PK
tenant_id            UUID NOT NULL FK tenants(id)
person_id            UUID NOT NULL FK people(id)
rule_id              UUID NOT NULL FK training_compliance_rules(id)
group_enrollment_id  UUID FK employee_group_enrollments(id)
cycle_number         INTEGER NOT NULL
cycle_start_at       DATE NOT NULL
due_at               DATE NOT NULL
completed_at         TIMESTAMPTZ
completion_source    TEXT
completion_course_id TEXT
completion_note      TEXT
reminder_suppressed  BOOLEAN NOT NULL DEFAULT false
status_override      TEXT
policy_snapshot      JSONB NOT NULL
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ
UNIQUE (tenant_id, person_id, rule_id, cycle_number)
```

**RLS:** SELECT for own tenant.
**Critical:** `cycle_start_at` and `due_at` are `DATE` fields because recurring compliance deadlines are calendar dates.
**Status overrides:** includes `superseded` for rows kept only for audit/history after a group change or re-entry resets the active series.

---

## v_recurring_compliance_status

Derived recurring compliance view over `employee_compliance_instances`, `training_compliance_rules`, and active group-enrollment context.

**Key columns:** `rule_name`, `group_id`, `cycle_number`, `cycle_start_at`, `due_at`, `completed_at`, `completion_source`, `reminder_suppressed`, `compliance_status`.

**Status logic:** compares `due_at` to `current_date` rather than `now()` so due/overdue behavior is timezone-safe.
**Visibility logic:** excludes rows when the linked group enrollment is inactive, when the row is explicitly `superseded`, when it belongs to a pre-reentry series (`cycle_start_at < current anchor_date`), or when it falls outside the active `primary_compliance_group_id` context.

---

## v_recurring_compliance_audit

Audit-oriented recurring compliance view that retains all cycle rows, including rows hidden from active dashboards after group changes or re-entry.

**Key columns:** all recurring compliance identifiers plus `visibility_state`, `enrollment_active`, and `current_anchor_date`.

**Visibility states:**
- `active`
- `superseded`
- `inactive_group`
- `historical_series`
- `primary_group_filtered`

---

## applicants (Epic 5: now multi-tenant)

```
id              UUID PK
tenant_id       UUID NOT NULL FK tenants(id)       -- Epic 5: added
source          TEXT                                -- 'jotform' | 'bamboohr' | 'jazzhr' (CHECK)
email           TEXT
full_name       TEXT
phone           TEXT
status          TEXT                                -- 'New' | 'Screening' | 'Hired' | 'Rejected' etc
position_applied TEXT
submission_date  TIMESTAMPTZ
... (additional JotForm-specific columns)
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
UNIQUE (tenant_id, email)
```

**RLS:** SELECT, INSERT, UPDATE for own tenant. No DELETE.
**Note:** Migrated from legacy (no tenant_id) in Epic 5 Story 5.2. Backfilled with source='jotform'.

---

## Legacy tables (pre-multitenant, Epic 0)

> **Dropped in Epic 5:**
> - Migration `20260309000001`: `employees`, `applicants_archive`, `offers_archive`, `profile_change_requests`, `settings`
> - Migration `20260310000002`: `profiles`

**Completed in Epic 5 closeout (verified 2026-03-10):**
- `offers` — now tenant-scoped with `tenant_id UUID NOT NULL`, tenant FK, and RLS (migration `20260310000001`)
- `ai_cache` — now tenant-scoped with `tenant_id UUID NOT NULL`, tenant FK, and RLS (migration `20260310000001`)
- `profiles` — removed; use `tenant_users` plus Supabase Auth/app_metadata instead
- `ai_logs` — retained for AI/JotForm call logging
