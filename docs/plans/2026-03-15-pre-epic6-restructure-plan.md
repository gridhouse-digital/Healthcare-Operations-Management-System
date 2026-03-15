# 2026-03-15 - Pre-Epic 6 Restructure Plan

## Why this plan exists

Before starting Epic 6 exports, the product needs one more restructuring pass in four areas:

1. JotForm-based compliance forms need to become part of the compliance model instead of staying hardcoded tenant settings.
2. The Applicants page needs to reflect the tenant's active ATS source, not just hired rows written by the current detectors.
3. The offer flow needs a source-agnostic audit now that applicants can originate from more than JotForm.
4. The AI intelligence flow needs a post-restructure audit for source assumptions, tenant scoping, and operator usefulness.

This plan defines the work as a pre-Epic 6 tranche rather than letting these changes leak into export work later.

---

## Feasibility answers

### 1. Can HR select compliance forms from a list pulled from JotForm?

Yes.

Current state:
- the app already stores a JotForm API key per tenant
- the shared JotForm client already supports form-level reads like questions and properties
- tenant settings currently use six fixed JotForm form ID columns:
  - `jotform_form_id_application`
  - `jotform_form_id_emergency`
  - `jotform_form_id_i9`
  - `jotform_form_id_vaccination`
  - `jotform_form_id_licenses`
  - `jotform_form_id_background`

Why a change is needed:
- that model is hardcoded to a small set of onboarding forms
- it does not support arbitrary compliance forms or tenant-specific variations
- it mixes connector configuration with compliance semantics

Recommended direction:
- add a tenant-scoped JotForm form catalog synced from the tenant's JotForm account
- let HR choose which forms count as compliance artifacts
- separate "form exists in JotForm" from "form is part of compliance"

### 2. Can the Applicants page pull full ATS applicants instead of hires only?

Yes, but the integration path differs by source.

BambooHR:
- feasible through BambooHR Applicant Tracking endpoints
- the current implementation only uses the employee directory for hire detection, not full ATS applications

JazzHR:
- feasible, but should be treated more carefully
- the current implementation uses a legacy `/v1/applicants` read for hired detection
- official JazzHR partner docs emphasize candidate export webhooks and Apply API, not a general read-all-applicants API

Recommended direction:
- BambooHR: build a proper ATS applicant sync path using ATS application endpoints
- JazzHR: audit whether the current applicants endpoint is stable enough for full sync; if not, pivot to candidate export webhook ingestion or a documented partner-safe path

---

## Current implementation constraints

### JotForm compliance

Current coupling:
- `tenant_settings` stores hardcoded JotForm form ID fields
- `getApplicantDetails` assumes a fixed set of related compliance forms
- JotForm webhook routing uses form ID matching, but compliance meaning is still implied by column names

Implication:
- adding a new compliance form type currently requires schema changes and code changes

### Applicants page

Current behavior:
- `useApplicants` reads directly from the `applicants` table
- `listApplicants` is a manual JotForm sync, not a general-purpose read API
- `detect-hires-bamboohr` and `detect-hires-jazzhr` only write hired rows into `applicants`

Implication:
- the table is source-agnostic in schema
- but ATS ingestion is still "hire detection writes applicant shadow rows", not true applicant syncing

### Offers flow

Current risk areas:
- offer creation still assumes a relatively simple applicant payload
- some paths still implicitly treat JotForm as the richer applicant source
- public offer acceptance and onboarding need a regression pass once applicants come from different ATS flows

### AI intelligence flow

Current risk areas:
- AI panels need review for source assumptions
- prompts may rely on JotForm-shaped data richness
- AI usefulness may degrade if BambooHR/JazzHR applicants do not carry equivalent detail fields

---

## Proposed workstreams

## Workstream A - JotForm compliance form catalog + HR selection

### Goal

Move JotForm compliance forms from hardcoded tenant settings into a tenant-managed compliance catalog.

### Scope

- add a tenant-scoped JotForm form catalog table
- add a tenant-scoped compliance form binding table
- build a JotForm "sync forms" path that lists forms available in the tenant account
- let HR mark forms as:
  - informational only
  - onboarding compliance
  - recurring/annual compliance support artifact
- update applicant/compliance detail views to read form bindings from DB instead of fixed tenant settings columns

### Recommended schema shape

- `tenant_jotform_forms`
  - `id`
  - `tenant_id`
  - `jotform_form_id`
  - `title`
  - `status`
  - `url`
  - `last_synced_at`
  - `metadata jsonb`

- `tenant_compliance_forms`
  - `id`
  - `tenant_id`
  - `jotform_form_id`
  - `compliance_category`
  - `display_name`
  - `required_for_onboarding`
  - `active`
  - `sort_order`
  - `policy_notes`

### Acceptance criteria

- HR can fetch available JotForm forms from a tenant settings/admin page
- HR can select which forms count as compliance forms without schema edits
- applicant/compliance detail screens render selected forms from DB configuration
- adding a new compliance form does not require a migration

### Risks

- existing `getApplicantDetails` logic assumes a fixed set of form roles
- webhook routing still needs a safe path for unauthenticated form submissions

---

## Workstream B - Applicants page becomes source-aware ATS intake

### Goal

Make the Applicants page a true tenant ATS intake view instead of a mix of JotForm submissions plus hired-only ATS shadows.

### Scope

- define a canonical applicant ingestion strategy per connector
- add tenant-level applicant source policy:
  - `jotform`
  - `bamboohr`
  - `jazzhr`
  - later: multi-source if truly needed
- build source-specific ATS applicant sync
- preserve `applicants` as the unified UI table, but improve source freshness and status accuracy

### Recommended connector strategy

#### BambooHR

- build a new applicant sync EF against BambooHR ATS applications
- ingest application status/stage, job, timestamps, and candidate basics
- keep hire detection separate from applicant listing logic

#### JazzHR

- do a compatibility spike first
- validate whether the existing `/v1/applicants` path is stable and sufficient for full ingestion
- if not, switch the planned design to JazzHR candidate export webhook ingestion as the supported path

### Acceptance criteria

- each tenant can designate the primary applicant source
- Applicants page reflects current ATS applicants for that source, not just hires
- existing JotForm applicants remain intact for tenants still using JotForm
- source badge and filters continue to work
- platform-admin view still respects tenant filter

### Risks

- applicant dedup rules need to avoid clobbering JotForm-origin records
- status models differ across BambooHR, JazzHR, and JotForm
- JazzHR may require a webhook-first architecture instead of polling

---

## Workstream C - Offer flow audit + hardening

### Goal

Make the offers workflow source-agnostic and safe after applicant-source restructuring.

### Audit checklist

- verify `OfferEditor` works cleanly for BambooHR-, JazzHR-, and JotForm-origin applicants
- remove any remaining reliance on JotForm-specific fields for offer drafting or sending
- verify `sendOffer` correctly resolves tenant applicant context for all sources
- verify onboarding from accepted offers still links correctly into `people`
- verify public offer response still works without tenant leakage or missing applicant context

### Likely fix areas

- applicant field fallbacks
- status transitions between ATS applicant states and offer states
- richer offer templates per tenant/source
- source-aware applicant preview in offer creation

### Acceptance criteria

- offers can be created and sent for applicants from the configured source
- accepted offers can still onboard employees safely
- no JotForm-only assumptions remain in the offer path

---

## Workstream D - AI intelligence audit + hardening

### Goal

Make AI features reliable after applicant/compliance restructuring.

### Audit checklist

- verify applicant ranking works on ATS-origin applicants, not just JotForm-rich payloads
- verify applicant summarization handles sparse ATS profiles gracefully
- verify offer-letter drafting still produces usable results for non-JotForm applicants
- verify tenant-scoped caching remains correct after any source-policy changes
- identify prompts that should incorporate compliance state or source metadata

### Likely outcomes

- prompt updates for missing-field tolerance
- better fallbacks when applicant context is thin
- possible split between:
  - applicant intelligence
  - compliance intelligence
  - offer drafting

### Acceptance criteria

- AI actions do not fail when applicant data comes from BambooHR or JazzHR
- outputs remain useful when source fields differ
- no tenant-scoping regressions in `ai_cache` or `ai_logs`

---

## Recommended delivery order

1. Workstream A design + schema
2. Workstream B applicant source policy + BambooHR/JazzHR ingestion spike
3. Workstream B implementation for the chosen supported ATS path(s)
4. Workstream C offer flow audit + fixes
5. Workstream D AI audit + fixes
6. Epic 6 exports only after the above stabilizes

---

## Suggested stories

### Story 5.18 - JotForm compliance catalog
- replace hardcoded tenant JotForm compliance form slots with tenant-managed catalog/bindings

### Story 5.19 - Applicant source policy + ATS sync restructure
- make `applicants` reflect the tenant's configured source strategy

### Story 5.20 - Offer flow source-agnostic audit
- harden offer creation/send/onboard paths for non-JotForm applicants

### Story 5.21 - AI intelligence post-restructure audit
- validate and patch ranking/summarization/drafting across source variants

---

## Open decisions

1. Should a tenant use exactly one primary applicant source at a time, or can JotForm + ATS coexist operationally?
2. For JazzHR, do we accept a legacy polling path if it works, or require a partner-documented webhook/export flow?
3. Should JotForm compliance forms support recurring compliance evidence, or onboarding only in the first cut?
4. Do offers always originate from `applicants`, or should employees/internal candidates also be supported later?

---

## Recommendation

Do not start Epic 6 yet.

First complete the pre-Epic 6 restructure tranche:
- dynamic JotForm compliance forms
- real ATS applicant ingestion
- offer flow audit
- AI audit

That will keep exports from being built on top of assumptions that are already changing.

---

## Sources

- Jotform API overview: https://api.jotform.com/
- BambooHR Applicant Tracking / Get Applications: https://documentation.bamboohr.com/reference/get-applications
- BambooHR Getting Started / auth changes: https://documentation.bamboohr.com/docs
- BambooHR API historical changes: https://documentation.bamboohr.com/docs/past-changes-to-the-api
- JazzHR API & Platform docs: https://apidoc.jazzhrapis.com/
- JazzHR Candidate Export Webhook: https://apidoc.jazzhrapis.com/candidate-export/
- JazzHR Apply API: https://apidoc.jazzhrapis.com/custom-apply/
