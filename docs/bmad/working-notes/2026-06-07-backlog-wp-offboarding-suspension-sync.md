# Backlog story — WordPress suspension → HOMS lifecycle (offboarding sync)

- **Logged:** 2026-06-07
- **Status:** Backlog (deferred — needs design + product/governance decision before any code)
- **Origin:** Operational question during the `onConflict` hotfix session.

## Ask
When a user is suspended in WordPress, automatically change their HOMS
`people.employee_status` to an inactive/terminated state.

## Why this is a designed story, not a sync tweak (open questions to resolve FIRST)

1. **Source-of-truth inversion (governance).** Employment lifecycle in HOMS is driven by
   ATS hire-detection + HR actions; WordPress is the training/LMS side. Letting a WP flag
   change `employee_status` means a training-system state drives a **compliance-bearing**
   field that gates training-compliance math and the Epic 6 tamper-evident exports.
   → DECISION NEEDED: is WordPress ever allowed to be authoritative for employment status?

2. **No target status exists.** `people.employee_status` CHECK allows only
   `Active | Onboarding | Terminated` (or NULL). There is no `Suspended`/`Inactive`.
   → DECISION NEEDED: add a new `Suspended` status (CHECK + lifecycle resolver +
   `employee-status-resolver.ts` + UI), or map suspension → `Terminated` (and accept that
   suspension is treated as termination)?

3. **NFR-3 sync-boundary conflict.** `sync-wp-users` deliberately never overwrites lifecycle
   fields on existing rows (sets `employee_status` only on first insert). Auto-flipping
   status from sync is the forbidden "sync overwrites the HR/lifecycle layer" pattern and
   needs an explicit, audited carve-out + reversal semantics (un-suspend → back to what?).

4. **Detection mechanism is unknown (BLOCKER).** WordPress core has no native "suspended"
   user state — it's plugin-specific (BuddyBoss suspend, a membership plugin, or a
   disable-account plugin). Must confirm:
   - How is suspension represented (role change? user meta? separate plugin table?)
   - Does `GET /wp-json/wp/v2/users?context=edit` expose it, or is a different/plugin
     endpoint required?
   - Does a suspended user **disappear** from the users list? If so, the current
     add/update-only sync has **no de-provisioning/reconciliation path** and would need a
     "present-last-run but absent-now ⇒ tombstone" pass (with care: a transient API error
     or pagination gap must not mass-suspend everyone).

## Rough scope (once the above are decided)
- Extend WP fetch to read suspension signal (or add reconciliation for absent users).
- New `employee_status` value or documented mapping; update resolver + UI + audit.
- Explicit, audited write path that is exempt from the NFR-3 "no lifecycle overwrite" rule,
  with reversal (un-suspend) semantics.
- Tests: suspend→status change, un-suspend→restore, transient-error must-not-mass-change.

## First action for the product owner
Answer Q4 — *how is a user suspended in your WordPress install, and does the REST API
expose it?* Nothing can be scoped until that's known.
