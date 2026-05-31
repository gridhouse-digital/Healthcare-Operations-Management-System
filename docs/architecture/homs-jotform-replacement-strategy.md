# HOMS JotForm Replacement Strategy

## Summary

HOMS is moving to native forms for core workflows. JotForm is retained only as a legacy adapter and for exceptional third-party form cases where the platform deliberately chooses not to own the form experience yet.

The first replacement priority is applicant intake. After that, HOMS should migrate onboarding packet forms and workforce compliance forms in a staged way, while keeping regulated health and care workflows out of native form rollout until a separate approved compliance architecture exists.

This strategy document is not a legal compliance certification and does not replace legal, privacy, or compliance review.

## Purpose And Decision

This document defines the platform direction for form ownership inside HOMS.

It answers:

- what role JotForm plays in the current product
- why JotForm is the wrong long-term core workflow engine for a multitenant modular SaaS
- what the approved end state is
- what stays on JotForm temporarily versus what moves native

Approved platform decision:

- native HOMS forms own core applicant, onboarding, and workforce compliance workflows over time
- JotForm remains a temporary compatibility layer and exception tool
- new strategic HOMS modules must not be designed around JotForm as the primary workflow engine

## Current State

JotForm is still an active operational dependency in the current HOMS codebase.

Current implementation evidence:

- applicant flows still expose `Sync JotForm` and JotForm-origin applicant behavior in `prolific-hr-app/src/features/applicants/ApplicantList.tsx` and `prolific-hr-app/src/features/applicants/ApplicantDetailsPage.tsx`
- manual applicant sync still runs through `prolific-hr-app/supabase/functions/listApplicants/index.ts`
- webhook ingestion still depends on `prolific-hr-app/supabase/functions/jotform-webhook/index.ts`
- connector setup still includes JotForm API key and form ID configuration in `prolific-hr-app/src/features/settings/components/ConnectorSettingsPage.tsx`
- the current integration reference in `prolific-hr-app/docs/Project Docs/INTEGRATIONS.md` still documents JotForm API usage, webhook routing, rate limits, and file migration
- the multitenant redesign analysis in `_bmad-output/planning-artifacts/prolific-hr-multitenant-redesign-analysis-2026-03-01.md` already states the intended principle: native Prolific HR forms for core HR and compliance flows, with JotForm retained as a legacy adapter and for complex third-party forms only

Current practical meaning:

- JotForm is still part of applicant intake operations
- JotForm form IDs are still part of tenant configuration
- some onboarding and compliance assumptions still inherit legacy JotForm thinking
- HOMS is not yet fully independent of JotForm for form-driven intake

## Why Native Forms Are The Right Direction

JotForm is useful as a transitional connector, but it is the wrong long-term boundary for a modular multitenant SaaS.

Native HOMS forms give the platform:

- direct ownership of validation and workflow rules
- tenant-controlled UX, branding, and future configuration
- immediate writes into the system of record instead of sync-driven ingestion
- better auditability and lifecycle traceability across applicant, employee, onboarding, and compliance flows
- less webhook routing and form-ID complexity
- less dependence on third-party rate limits, third-party downtime, and third-party workflow semantics
- cleaner modularization across hiring, onboarding, compliance, and later platform domains

HOMS should not do an immediate hard cut because:

- current tenants and operating flows still depend on JotForm
- current applicant and compliance paths still contain JotForm-shaped assumptions
- staged migration reduces disruption and lets HOMS replace workflows in a controlled order

## Privacy And Compliance Boundary

Native HOMS forms are the approved direction for core workflows, but native forms are not automatically HIPAA- or PHIPA-compliant.

Every form must be classified before launch into one of these categories:

1. HR / applicant workflow
2. Sensitive workforce document workflow
3. Regulated health/care workflow

Required boundary rules:

- applicant intake may move native first because it is primarily an HR workflow
- native HOMS forms must not collect client care data, EVV notes, participant records, clinical notes, or other regulated health information until a separate regulated-data compliance architecture is approved
- native forms are not automatically HIPAA- or PHIPA-compliant just because they are internal to HOMS
- any module storing or processing PHI or ePHI must run only on infrastructure with the required vendor agreements and project posture, including a Supabase BAA and HIPAA-enabled setup where applicable
- for PHIPA-sensitive Canadian tenants, Canadian-region hosting should be the preferred default unless a documented privacy or legal review approves another arrangement

This is a hard design boundary. Early native-form migration is limited to workflows that are inside the currently approved HR and workforce-document scope.

## Staff App / EVV Boundary Clarification

The planned Staff App, AI-Powered EVV, visit notes, EVV notes, issue reports, client or participant records, and incident-style workflows are not part of the early native forms replacement rollout.

They belong to the future regulated care-data architecture track.

The fact that HOMS is moving applicant, onboarding, and workforce compliance forms native does not automatically approve native capture of regulated care data.

Before Staff App or EVV workflows collect or process client care data, participant records, visit notes, incident reports, or PHI or ePHI-sensitive data, HOMS must have an approved regulated-data architecture including infrastructure posture, vendor agreements, access controls, audit model, retention rules, and privacy or legal review.

## Scope Matrix

| Form Category | Default Disposition | Why |
|---|---|---|
| Applicant intake | `Replace with native now` | Core HR workflow and highest leverage front-door replacement |
| Offer-adjacent applicant data capture | `Migrate next` | Should follow native applicant intake and share the same workflow ownership |
| Onboarding packet forms such as I-9, W-4, direct deposit, policy acknowledgement | `Migrate next` | Core workforce workflow, but requires stronger security and document-handling controls |
| Workforce compliance uploads and attestations | `Migrate next` | Should move native after onboarding foundations are in place |
| Legacy tenant-specific intake forms still in use | `Keep temporarily on JotForm` | Needed for continuity until native equivalents exist |
| Unusually complex third-party or externally mandated forms | `Allow on JotForm only by exception` | Keep only where JotForm capability materially exceeds build value |
| Client care data capture, EVV notes, participant records, clinical notes, incident reports tied to regulated care data | `Blocked pending regulated-data approval` | Out of scope for early native rollout until separate approved compliance architecture exists |

## Migration Sequence

### Phase 1 - Replace applicant intake

Goal:
- make HOMS own the front door for new applicants

Must exist before cutover:
- native applicant form UX
- applicant submission validation owned by HOMS
- direct write path into the applicant record model
- basic tenant-aware routing and audit coverage

Remaining JotForm dependency:
- legacy tenants and fallback intake paths

Cutoff rule:
- new primary applicant intake for targeted tenants no longer requires JotForm sync

Allowed under current privacy boundary:
- yes, as HR and applicant workflow

### Phase 2 - Stop designing new applicant features around JotForm

Goal:
- remove product dependence on JotForm-shaped applicant assumptions

Must exist before cutover:
- applicant lifecycle screens and logic operate cleanly from native HOMS data

Remaining JotForm dependency:
- adapter ingestion for old forms or specific tenants still migrating

Cutoff rule:
- no new applicant feature relies on JotForm-only fields or sync semantics

Allowed under current privacy boundary:
- yes

### Phase 3 - Move onboarding packet forms native

Goal:
- bring workforce onboarding forms under HOMS control

Must exist before cutover:
- secure handling for sensitive workforce documents
- workflow-level audit trail
- clear document ownership and submission lifecycle

Remaining JotForm dependency:
- old onboarding packets not yet migrated

Cutoff rule:
- primary onboarding packet collection for active target tenants runs natively

Allowed under current privacy boundary:
- yes, but only within sensitive workforce document scope and not as approval for PHI or ePHI processing

### Phase 4 - Move workforce compliance collection and attestations native

Goal:
- own recurring and onboarding-related workforce compliance submissions

Must exist before cutover:
- native submission path
- compliance-to-person linking
- operational review and audit visibility

Remaining JotForm dependency:
- exceptional legacy compliance forms

Cutoff rule:
- workforce compliance collection no longer depends on hardcoded JotForm form ownership for target tenants

Allowed under current privacy boundary:
- yes, if still within approved workforce scope and not crossing into regulated care-data capture

### Phase 5 - Keep regulated health and care workflows blocked

Goal:
- prevent accidental expansion into regulated care-data collection before architecture approval

Must exist before cutover:
- separate regulated-data compliance architecture
- documented privacy, legal, infrastructure, and vendor posture approval

Remaining JotForm dependency:
- any current or future regulated workflow must stay outside native rollout until approved

Cutoff rule:
- none in this strategy; this is intentionally blocked

Allowed under current privacy boundary:
- no

### Phase 6 - Convert JotForm to adapter-only mode

Goal:
- make JotForm secondary instead of foundational

Must exist before cutover:
- native ownership of applicant intake and targeted workforce workflows

Remaining JotForm dependency:
- explicit exceptions and unmigrated legacy tenants

Cutoff rule:
- JotForm is no longer the primary engine for any core HOMS workflow

Allowed under current privacy boundary:
- yes

### Phase 7 - Decide whether JotForm still deserves to remain

Goal:
- evaluate whether the remaining edge cases justify continued support

Must exist before decision:
- clear inventory of all remaining JotForm use cases
- cost and risk review of keeping the adapter alive

Cutoff rule:
- formal platform decision to retain for exceptions or fully remove later

Allowed under current privacy boundary:
- yes

## Cutoff Rules And Governance

Platform rules:

- no new core workflow may be introduced on JotForm
- any new JotForm use must be justified as an exception
- tenant-specific core forms should be modeled in HOMS, not externally owned
- JotForm configuration remains supported only for compatibility during migration
- future modular domains must assume native form ownership by default
- no regulated health or care native form launches may occur without explicit privacy, legal, infrastructure, and compliance-architecture approval

## Interface And Architecture Implications

This document does not define final schema, but it does lock these architecture implications:

- HOMS must own native applicant intake submission flow
- HOMS must own native onboarding and workforce compliance submission flow over time
- HOMS must own the workflow and audit trail for core forms
- legacy JotForm submissions need an adapter or migration path during transition
- applicant, offer, onboarding, and compliance flows should be stripped of JotForm-specific assumptions over time
- Staff App and EVV workflows belong to a separate future architecture track, not to this migration path
- regulated health and care data collection belongs to that separate future architecture track, not to this migration path

Target architecture intent:

- HOMS owns the workflow
- JotForm becomes an adapter or exception path
- Staff App and EVV remain a separate approval boundary, not an automatic extension of applicant-form work
- regulated health-data workflows remain a separate approval boundary, not an automatic extension of applicant-form work

## Non-Goals

This document does not:

- implement the native form system
- define the final database schema
- approve HOMS for PHI or ePHI processing
- approve EVV, client documentation, care notes, or incident reports for native form collection
- replace legal, privacy, or compliance review

## Validation Checklist

This document is complete only if it:

- clearly states JotForm is not the future core workflow engine
- clearly states applicant intake is the first replacement priority
- distinguishes current dependency from target architecture
- does not imply immediate removal without staged migration
- includes the three-way form classification boundary
- explicitly blocks regulated health and care native forms pending separate approved compliance architecture
- includes the infrastructure and vendor-agreement rule for PHI and ePHI processing
- states the Canadian-region preference for PHIPA-sensitive tenants
- includes the disclaimer that the document is not a legal compliance certification
- stays consistent with the existing repo direction that core HR and workforce compliance flows should move native over time
