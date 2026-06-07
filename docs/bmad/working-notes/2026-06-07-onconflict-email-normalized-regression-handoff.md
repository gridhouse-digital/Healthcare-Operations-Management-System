# Dev Handoff — `onConflict` regression: `tenant_id,email` → `tenant_id,email_normalized`

- **Date:** 2026-06-07
- **Author:** Architecture (root-cause verified live against `peffyuhhlmidldugqalo`)
- **Severity:** P1 — core hire/onboarding pipeline correctness regression
- **Phase:** Operational hotfix (Phase 1 lifecycle work already touched `conversion.ts` correctly; these 4 EFs were missed)
- **Branch:** `hotfix/onconflict-email-normalized` off `main`. Deploy from `main` only.

---

## 1. Summary (what's broken and why)

Migration `20260528000002_normalized_email_uniqueness.sql` replaced the unique index on
`people` and `applicants` from `(tenant_id, email)` with `(tenant_id, email_normalized)`
(a `GENERATED ALWAYS AS (lower(btrim(email)))` column). **Four Edge Functions still upsert
with `onConflict: "tenant_id,email"`.** Postgres requires the `ON CONFLICT` target to match
an existing unique constraint; when it doesn't it raises:

```
ERROR: 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

`conversion.ts` was correctly migrated to `onConflict: "tenant_id,email_normalized"`. These
four sites were not.

### Evidence (live, 2026-06-07)
- `people` unique indexes: **only** `people_tenant_email_normalized_idx (tenant_id, email_normalized)`. No `(tenant_id, email)`.
- `applicants` unique indexes: **only** `applicants_tenant_email_normalized_idx (tenant_id, email_normalized)`. No `(tenant_id, email)`.
- Zero-write probe `INSERT … ON CONFLICT (tenant_id, email) DO NOTHING` → raised `42P10`.
- 15 WP-sourced `people` rows span `2026-03-09` → `2026-05-26`; the migration landed `2026-05-28`. **No WP-direct insert has succeeded since.** (Triggering case: applicant "Ida", WP id 293, added directly to WordPress 2026-06-06 — shows Hired in applicants but never created in `people`.)

### Why it manifested differently per function
- `sync-wp-users` **does not check** the upsert's `{ error }` → the 42P10 is swallowed; the
  follow-up `UPDATE … WHERE email=` matches 0 rows for a new user (not an error) → `synced++`
  fires. Result: **silent data loss**, falsely reported as `synced` (e.g. `synced:16` = 15 real
  updates + Ida counted-but-never-written), `errors:0`.
- `detect-hires-bamboohr` / `detect-hires-jazzhr` **do** check (`if (peopleUpsertErr) throw`) →
  they **hard-throw** — but only when an actual hire reaches the upsert. Current 15-min JazzHR
  polls complete `error_count:0` because no new hires are present, so the line never executes.
  **Latent-but-certain: throws on the next real BambooHR/JazzHR hire.**
- `listApplicants` upserts `applicants` on the email-conflict branch → same latent throw.

---

## 2. Scope of change

### Fix A — correct the conflict target (6 occurrences, 4 files)

| File | Line | Table | Change |
|---|---|---|---|
| `supabase/functions/sync-wp-users/index.ts` | 302 | people | `tenant_id,email` → `tenant_id,email_normalized` |
| `supabase/functions/detect-hires-bamboohr/index.ts` | 252 | people | `tenant_id,email` → `tenant_id,email_normalized` |
| `supabase/functions/detect-hires-bamboohr/index.ts` | 271 | applicants | `tenant_id,email` → `tenant_id,email_normalized` |
| `supabase/functions/detect-hires-jazzhr/index.ts` | 266 | people | `tenant_id,email` → `tenant_id,email_normalized` |
| `supabase/functions/detect-hires-jazzhr/index.ts` | 285 | applicants | `tenant_id,email` → `tenant_id,email_normalized` |
| `supabase/functions/listApplicants/index.ts` | 241 | applicants | `tenant_id,email` → `tenant_id,email_normalized` |

Safe because `email_normalized` is generated from `email`; these functions already store a
trim/lowercased or raw `email` that Postgres normalizes identically. Behavior is unchanged on
existing data; it simply makes the insert-ignore actually work.

> Do **not** change the `onConflict: "id"`, `"jotform_id"`, `"tenant_id,source,idempotency_key"`,
> `"tenant_id,user_id"`, `"tenant_id,applicant_id,normalized_email"`, `"tenant_id,course_id"`,
> `"input_hash"`, etc. occurrences — those target their own real unique indexes and are correct.

### Fix B — stop the silent swallow in `sync-wp-users`

Current (`sync-wp-users/index.ts` ~288–303): the upsert return is discarded. Capture and check
`{ error }`; on error, `errors++` + `console.error(...)` and **`continue`** (do NOT fall through
to the `UPDATE` / `synced++`). The `synced` counter must reflect actual writes so a future target
mismatch cannot masquerade as success again.

**Before:**
```ts
        // Insert-ignore: profile_source='wordpress' only on first insert
        await admin.from("people").upsert(
          [
            {
              tenant_id: config.tenant_id,
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
          { onConflict: "tenant_id,email", ignoreDuplicates: true },
        );
```

**After:**
```ts
        // Insert-ignore: profile_source='wordpress' only on first insert
        const { error: insertErr } = await admin.from("people").upsert(
          [
            {
              tenant_id: config.tenant_id,
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
          { onConflict: "tenant_id,email_normalized", ignoreDuplicates: true },
        );

        if (insertErr) {
          console.error(`Insert-ignore failed for ${email}: ${insertErr.message}`);
          errors++;
          continue;
        }
```

---

## 3. Tests

1. **Regression unit test (Deno).** In `supabase/functions/_shared/tests/` (or a new
   `sync-wp-users` test), assert the `people`/`applicants` upserts pass
   `onConflict: "tenant_id,email_normalized"`. The existing `conversion.test.ts` fake already
   models uniqueness on `(tenant_id, email_normalized)` — reuse that pattern so a future
   reversion to `tenant_id,email` fails the suite.
2. **Swallow guard.** Add a case where the upsert returns an error → assert the user is counted
   in `errors`, **not** `synced`, and the `UPDATE` is not reached.
3. Run: `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net` → expect green.

---

## 4. Verification (post-deploy, against `peffyuhhlmidldugqalo`)

```sql
-- 4a. Probe must now SUCCEED (no 42P10) for the corrected target:
insert into people (tenant_id, email, type, profile_source, employee_status)
select '11111111-1111-1111-1111-111111111111','__probe@example.com','employee','wordpress','Onboarding'
where false
on conflict (tenant_id, email_normalized) do nothing;   -- expect: no error
```

1. Deploy the 4 functions (`npx supabase functions deploy sync-wp-users detect-hires-bamboohr detect-hires-jazzhr listApplicants`).
2. Force-run WP sync (Connectors → Sync, or POST `{ "force": true }`).
3. Confirm Ida now exists and auto-linked:
   ```sql
   select id, email, wp_user_id, first_name, last_name, type, profile_source, applicant_id, employee_status
   from people where wp_user_id = 293 or email_normalized = 'idalwsbnl@gmail.com';
   ```
   Expect: one `people` row, `profile_source='wordpress'`, `wp_user_id=293`, `applicant_id` set
   (linked to her existing applicant), and she appears in **Employees**.
4. WP sync summary `synced` count now equals real writes; any failure shows in `errors` (not hidden).

---

## 5. Rollback

Revert the 4 files (single commit). No DB/migration change is involved — this is application-layer
only — so rollback is `git revert` + redeploy the 4 functions. Document in `DECISIONS.md`.

---

## 6. Deliverables checklist (per root CLAUDE.md)

- [ ] Files changed: `sync-wp-users`, `detect-hires-bamboohr`, `detect-hires-jazzhr`, `listApplicants` (+ test file)
- [ ] Tests added/updated + `deno test` green; `npm run build` clean
- [ ] Verification steps 4a–4 executed and pasted into PR
- [ ] `PROJECT_LOG.md` updated (regression cause + timeline 2026-05-28)
- [ ] `DECISIONS.md`: note that `20260528000002` changed the uniqueness key and **all** `people`/`applicants` upserts must target `email_normalized`; add a grep guard / review item
- [ ] `SPRINT_PLAN.md` status note
