# INTEGRATIONS — HOMS

> Per-integration reference: auth method, endpoints, sync cadence, idempotency, retry rules.
> Updated: 2026-03-06

---

## BambooHR

| Property | Value |
|---|---|
| Auth method | API key (Basic Auth: `{apiKey}:x` base64-encoded) |
| API key storage | `tenant_settings.bamboohr_api_key_encrypted` (pgp_sym_encrypt) |
| Subdomain storage | `tenant_settings.bamboohr_subdomain` (plaintext) |
| Base URL | `https://{subdomain}.bamboohr.com/api/gateway.php/{subdomain}/v1` |
| Hire detection endpoint | `GET /employees/directory` or `GET /reports/custom` |
| Hire signal | Employee status = "Active" AND not in integration_log |
| Sync cadence | Every 15 minutes via pg_cron |
| Idempotency key | `email` → `integration_log(tenant_id, 'bamboohr', email)` UNIQUE |
| Retry rules | Max 3 attempts, exponential backoff (1s, 2s, 4s) |
| Failure handling | integration_log status='failed', error in payload, no silent failures |
| Edge Function | `detect-hires-bamboohr` (Epic 2, not yet built) |
| Test EF | `test-connector` (deployed) |
| Save credentials EF | `save-connector` (deployed) |

**Notes:**
- API key is decrypted inside EF only. Never transmitted to frontend.
- BambooHR webhooks deferred post-MVP (requires enterprise plan).
- `profile_source='bamboohr'` means BambooHR is authoritative for profile fields for this person.

---

## JazzHR

| Property | Value |
|---|---|
| Auth method | API key (query param: `?apikey={key}`) |
| API key storage | `tenant_settings.jazzhr_api_key_encrypted` (pgp_sym_encrypt) |
| Base URL | `https://api.jazz.co/v1` |
| Hire detection endpoint | `GET /applicants` |
| Hire signal | Applicant stage name contains "hired" (case-insensitive) |
| Sync cadence | Every 15 minutes via pg_cron |
| Idempotency key | `email` → `integration_log(tenant_id, 'jazzhr', email)` UNIQUE |
| Retry rules | Max 3 attempts, exponential backoff |
| Failure handling | integration_log status='failed', error in payload |
| Edge Function | `detect-hires-jazzhr` (Epic 2, not yet built) |
| Test EF | `test-connector` (deployed) |

**Notes:**
- JazzHR does not expose a stable "hired date" field. Use first detection timestamp as hired_at.
- JazzHR webhooks unreliable — polling only in MVP.

---

## WordPress + LearnDash

| Property | Value |
|---|---|
| Auth method | Application Password (Basic Auth: `{username}:{app_password}`) |
| Credentials storage | `tenant_settings.wp_username_encrypted`, `wp_app_password_encrypted` |
| Site URL storage | `tenant_settings.wp_site_url` (plaintext) |
| WP user creation | `POST {wp_site_url}/wp-json/wp/v2/users` |
| WP user lookup | `GET {wp_site_url}/wp-json/wp/v2/users?search={email}` |
| LD group enrollment | `POST {wp_site_url}/wp-json/ldlms/v2/groups/{group_id}/users` |
| LD course progress | `GET {wp_site_url}/wp-json/ldlms/v2/users/{wp_user_id}/course-progress` |
| Sync cadence | On hire (process-hire EF) + daily training sync |
| Idempotency | WP user lookup before create; LD enrollment checked before POST |
| Failure handling | integration_log status='failed'; retry safe |
| Edge Functions | `process-hire` (Epic 3, deployed), `sync-training` (Epic 4, deployed) |
| LD group mappings | `tenant_settings.ld_group_mappings` JSONB: `[{job_title, group_id}]` |

**Notes:**
- WP multisite provisioning deferred post-MVP. Tenants connect existing standalone WP sites.
- LearnDash REST API requires WP 5.0+ and LearnDash 3.0+.
- `wp_user_id` stored on `people` record after creation.
- Training sync uses 3-layer compliance model (see SCHEMA.md).

**Training sync details (Story 4.2):**
- Endpoint: `GET {wp_site_url}/wp-json/ldlms/v2/users/{wp_user_id}/course-progress`
- Course name: `GET {wp_site_url}/wp-json/ldlms/v2/courses/{course_id}` -> `title.rendered`
- Pagination: `per_page=100`, loop via `x-wp-totalpages` header
- UPSERT: `ON CONFLICT (tenant_id, person_id, course_id) DO UPDATE SET course_name, status, completion_pct, completed_at, last_synced_at, updated_at`
- Omitted from upsert: `training_hours`, `expires_at` (NFR-3 protection)
- Status mapping: `not-started` -> `not_started`, `in-progress` -> `in_progress`, `completed` -> `completed`
- Schedule: Daily 7:00 AM UTC via pg_cron
- Run dedup: integration_log `running` status check, 1hr stale threshold
- Rate limit: 200ms delay between employees if >50 per tenant

---

## JotForm

| Property | Value |
|---|---|
| Auth method | API key (header: `APIKEY: {key}`) |
| API key storage | Supabase EF secret: `JOTFORM_API_KEY` |
| Base URL | `https://api.jotform.com` |
| Endpoints used | `GET /form/{formId}/submissions`, `GET /submission/{submissionId}` |
| Webhook | POST to `{supabase_url}/functions/v1/jotform-webhook` |
| Rate limits | 1,000 API calls/month on free plan |
| Idempotency | Email-based deduplication on applicants table |
| Retry rules | 3 attempts, exponential backoff (in jotform-client.ts) |
| Rate limit detection | HTTP 429 → automatic retry with backoff |
| All calls go through | `_shared/jotform-client.ts` — never call JotForm API directly |
| Logging | All calls logged to `ai_logs` table |

**Notes:**
- JotForm is MVP intake for credentials/policies (Epic 5).
- Existing jotform-webhook EF is NOT multi-tenant aware. Refactor in Epic 5.
- File migration: JotForm CDN → Supabase Storage via `_shared/file-manager.ts`.

---

## Anthropic Claude API

| Property | Value |
|---|---|
| Auth method | API key (header: `x-api-key`) |
| API key storage | Supabase EF secret: `ANTHROPIC_API_KEY` |
| Model | claude-sonnet-4-6 (latest) |
| Features | Applicant ranking, summarization, offer letter drafting |
| All calls go through | `_shared/aiClient.ts` |
| Logging | All calls logged to `ai_logs` table |
| Rate limits | Per Anthropic plan; monitor via ai_logs |
