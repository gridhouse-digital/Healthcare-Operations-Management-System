# SCHEMA — HOMS

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
ld_group_mappings            JSONB      -- [{job_title, group_id}]
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
employee_status  TEXT                                -- Epic 5: 'active' | 'inactive' | 'terminated'
applicant_id     UUID FK applicants(id)              -- Epic 5: link back to applicant record
type             TEXT NOT NULL DEFAULT 'candidate'   -- 'candidate' | 'employee'
profile_source   TEXT                                -- 'bamboohr' | 'jazzhr' | 'wordpress'
wp_user_id       INTEGER                             -- set after process-hire
hired_at         TIMESTAMPTZ                         -- NFR-3: set once, NEVER overwritten by sync
created_at       TIMESTAMPTZ
updated_at       TIMESTAMPTZ
```

**Unique:** `(tenant_id, email)` — universal deduplication key.
**RLS:** Own tenant only.
**Audit trigger:** `audit_people_trigger`
**Critical:** `hired_at` is set once when hire is first detected. Sync must check: if hired_at IS NOT NULL, skip.

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
