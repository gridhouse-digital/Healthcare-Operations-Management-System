# HOMS Planned Capability Map

## Purpose

This document describes the planned HOMS platform shape, not the current shipped product. It exists so architecture and modularization work can reason about the target system without confusing roadmap intent with present implementation.

## Scope Rule

- Planning evidence comes from `_bmad-output/planning-artifacts`, legacy architecture notes, and the current HOMS modularization direction.
- If a capability is not materially present in `prolific-hr-app/src` or `prolific-hr-app/supabase`, it must not be described here as current functionality.

## Status Taxonomy

- `Implemented`
- `Partially Implemented`
- `Wired but Incomplete`
- `Planned`
- `Not Implemented`
- `Deprecated / Superseded`

## Planned Capability Table

| Domain / Module | Status | Planning Evidence | Notes |
|---|---|---|---|
| Core Platform | `Partially Implemented` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md` | Tenant model, connector settings, access intake, and user management exist now. Future intent is a broader platform layer with stronger provisioning, subscription, and cross-module governance. |
| Hiring And Applicant Management | `Partially Implemented` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/epics.md` | Applicant, offer, and conversion flows exist, but the planned platform expects a cleaner lifecycle and more configurable hiring operations. |
| Employee Management | `Partially Implemented` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md` | Unified employee records exist. Planned expansion points toward richer employee lifecycle, self-service, and broader operational linkages. |
| Training And Compliance | `Partially Implemented` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md` | LearnDash sync and recurring compliance exist. The longer-term plan is a fuller compliance engine with deeper credentialing, reminders, and evidence-pack workflows. |
| Recurring Compliance As Standalone Module Boundary | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Recurring compliance exists today inside the training/compliance cluster. The future architecture likely promotes it to a clearer module boundary because of its own rules, cycles, actions, and audit needs. |
| Care Operations / Field Operations | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md`; current modularization direction | New parent module for field workflows. Intended to own Staff App, scheduling, staff assignments, AI-powered EVV workflow experience, shift readiness, in-shift support, open shift recovery, and visit exceptions. No current app implementation exists. |
| Staff App | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/prd.md`; current modularization direction | Caregiver-facing interface and likely PWA surface. Intended for readiness, shift workflow, clock-in or clock-out actions, notes, issues, and field interactions. This is not currently implemented. |
| Scheduling | `Planned` | `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md`; current modularization direction | Planned care-operations scheduling layer for visit timing, staffing coordination, and assignment context. No current code exists. |
| Staff Assignments | `Planned` | `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md`; current modularization direction | Planned assignment model linking staff to visits, clients or participants, and readiness context. No current code exists. |
| AI-Powered EVV | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md` | Planned field-facing EVV workflow under Care Operations. Covers clock-in or clock-out, GPS capture, and official visit evidence from the staff workflow perspective. Official normalization, submission, and vendor routing belong under EVV Governance & Integrations, not directly in the Staff App. |
| Agentic Shift Readiness | `Planned` | current modularization direction; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md` | Planned before-shift readiness layer for confirmation, "on my way" state, proximity checks, and early risk signaling. No current code exists. |
| In-Shift AI Staff Support | `Planned` | current modularization direction; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md` | Planned active-shift support surface for reminders, quick issues, operational assistance, and note help. No current code exists. |
| Open Shift Recovery | `Planned` | current modularization direction; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md` | Planned cancellation and unavailable replacement workflow that finds candidates, broadcasts open shifts, and routes reassignment. No current code exists. |
| Visit Exceptions | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned exception handling for late arrivals, missed clock-outs, GPS anomalies, and visit evidence problems. No current code exists. |
| EVV Governance & Integrations | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md`; current modularization direction | Planned backend-only module for normalized EVV records, audit ledger, broker logic, vendor adapters, state overlays, and reconciliation. It should not be exposed directly in the Staff App. |
| US EVV Core | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md` | Planned official EVV record model and compliance baseline for U.S. workflows. No current code exists. |
| EVV Record Normalization | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned normalized EVV schema and transformation layer separating staff workflow events from official submission records. No current code exists. |
| EVV Audit Ledger | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned append-oriented ledger for official EVV evidence, amendments, and submission history. No current code exists. |
| EVV Integration Broker | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned broker layer that owns backend submission routing, statuses, retries, and rejection handling. Staff App must not connect directly to Sandata, HHAeXchange, state aggregators, or payer systems. |
| Sandata Adapter | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md` | Planned backend adapter for Sandata-compatible submission and reconciliation. Not implemented in the current app. |
| HHAeXchange Adapter | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md`; `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-02.md` | Planned backend adapter for HHAeXchange exchange patterns and reconciliation. Not implemented in the current app. |
| State EVV Overlays | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/architecture.md` | Planned state-specific compliance overlays above the normalized EVV core. No current code exists. |
| Reconciliation | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned workflow for comparing internal EVV records with broker submissions, vendor feedback, and state responses. No current code exists. |
| Intelligence / Agentic Operations | `Planned` | `_bmad-output/planning-artifacts/architecture.md`; current modularization direction | Planned AI and rule-assisted operational reasoning layer for field operations, staff support, risk evaluation, note assistance, and coordinator recommendations. Current AI features do not implement this subsystem. |
| Staff Support Agent | `Planned` | current modularization direction | Planned agentic support surface for staff-facing assistance during shift preparation and shift execution. No current code exists. |
| Visit Risk Evaluator | `Planned` | current modularization direction | Planned risk analysis component for readiness, visit exception likelihood, lateness, and operational escalation. No current code exists. |
| AI Note Assist | `Planned` | current modularization direction | Planned note-improvement and note-completion support for field workflows. This is not the same as current hiring or onboarding AI helpers. |
| Coordinator Copilot | `Planned` | current modularization direction | Planned coordination-side AI workspace for summaries, staff recommendations, open shift triage, and workflow suggestions. No current code exists. |
| Workflow Recommendations | `Planned` | current modularization direction | Planned recommendation layer for coordinators and operations teams. No current code exists. |
| Family Portal | `Planned` | current modularization direction; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md` | Intended later-stage module. There is no current code evidence for a family-facing portal. |
| Billing | `Planned` | `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md`; `_bmad-output/planning-artifacts/prd.md` | Appears in roadmap research and product direction as a later operational module. No current implementation exists. |
| Payroll | `Planned` | `_bmad-output/planning-artifacts/prd.md`; `_bmad-output/planning-artifacts/research/Research - Home care and home health agencies in the US and Canada HR lifecycle, credentialing, compliance, and Agency OS design.md` | Planned as later export or integration capability, especially tied to EVV and operations. No current implementation exists. |

## Planned Domain Notes

### Already Present As Foundations

- Core Platform
- Hiring And Applicant Management
- Employee Management
- Training And Compliance

These domains already exist in the current app, but only as the first platform slice. They should be treated as existing foundations that need cleaner modular boundaries and stronger lifecycle consistency.

### Next Expansion Direction

- Care Operations / Field Operations
- Staff App
- Scheduling
- Staff Assignments
- AI-Powered EVV
- Agentic Shift Readiness
- In-Shift AI Staff Support
- Open Shift Recovery
- Visit Exceptions
- Intelligence / Agentic Operations

These reflect the next major HOMS expansion beyond HR and training. The Staff App is the caregiver-facing surface. AI-Powered EVV belongs under Care Operations as the staff workflow experience, while official EVV normalization and submission belong under the backend governance layer.

### Later Modules

- EVV Governance & Integrations
- US EVV Core
- EVV Record Normalization
- EVV Audit Ledger
- EVV Integration Broker
- Sandata Adapter
- HHAeXchange Adapter
- State EVV Overlays
- Reconciliation
- Family
- Billing
- Payroll

These remain planned modules or submodules only. EVV governance and vendor submission are backend concerns and should not be treated as direct Staff App features.

## Guardrail

Nothing in this document should be used as evidence that the current app already supports care operations, caregiver field workflows, Staff App, AI-Powered EVV, shift readiness, in-shift staff support, open shift recovery, EVV vendor submission, family access, billing, or payroll. Those belong to the planned HOMS platform shape, not the current shipped system.

Nothing in this planned capability map means the current app already supports Staff App, EVV, shift readiness, open shift recovery, or EVV vendor submission.
