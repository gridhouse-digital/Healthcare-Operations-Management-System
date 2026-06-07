# HOMS AI Architecture Review - Enterprise Gateway Upgrade

> Status: BMAD working note, not promoted architecture
> Date: 2026-06-06
> Skill: `bmad-ai-architect-review`
> Scope: Documentation review and modernization planning only

## Executive Summary

Current HOMS AI is a tenant-guarded Supabase Edge Function surface for HR workflows: applicant summarization, applicant ranking, offer-letter drafting, onboarding summary logic, WordPress validation, AI logs/cache, and an admin AI dashboard. It is not yet a healthcare AI platform for Care Ops, Staff App notes, EVV, RAG, or safety-critical clinical reasoning.

The strongest current controls are tenant derivation via `tenantGuard(req)` in the AI Edge Functions and the Phase 0.1 remediation that removed broad authenticated reads from `ai_logs` and `ai_cache`. The weakest controls are prompt authority and structured-output reliability: the frontend builds `messages` and passes them to server functions, several Edge Functions accept those caller-supplied messages directly, and the current JSON contract is prompt-and-parse rather than schema-validated server-side.

The supplied plan at `docs/architecture/enterprise-ai-gateway-upgrade-plan.md` points in the right direction with provider categories, model tiers, Zod validation, and privacy shielding. It needs tightening before approval: do not frame regulated Care Ops or `safetyCritical` routing as implementable until BAA/HIPAA/PHIPA posture is approved, do not make the external gateway the only enforcement point, and do not copy Folk Care. Use Folk Care as reference for provider abstraction and usage tracking, but also note that Folk Care itself still has direct Anthropic service calls and prompt-only JSON parsing in several vertical services.

> [!IMPORTANT]
> This review is not a legal compliance certification. PHI/ePHI, Staff App note AI, AI-Powered EVV, RAG over care data, and safety-critical clinical reasoning remain blocked until a separate approved regulated-data architecture and vendor BAA posture exist.

## Findings

### P1 - Caller-supplied `messages` can bypass server-owned prompt guardrails

Status: Current fix

Evidence:
- `src/lib/aiClient.ts` builds a `messages` array in the frontend and invokes Edge Functions with `body: { messages }`.
- `supabase/functions/ai-rank-applicants/index.ts`, `supabase/functions/ai-draft-offer-letter/index.ts`, and `supabase/functions/ai-summarize-applicant/handler.ts` accept `messages: z.array(z.any())` and pass it into `aiRequest`.
- `supabase/functions/ai-onboarding-logic/index.ts` accepts `_ai_instructions` embedded in the employee payload and converts it into the system prompt.

Impact:
Authenticated callers can influence system prompts and output instructions from outside the trusted server boundary. The current frontend uses intended prompts, but the Edge Functions do not require typed domain payloads only. This is especially risky for hiring workflows because EEO guardrails live in prompt text, not in a server-owned policy layer.

Recommendation:
Remove public `messages` inputs from current HR AI endpoints. Each Edge Function should own the system prompt, derive or validate the domain payload server-side, and call a typed helper such as `generateJSON(schema, prompt, payload)`. If an internal messages mode is retained for tests or admin diagnostics, gate it behind an explicit server-only path unavailable from normal client calls.

### P1 - Structured outputs are not enforced server-side

Status: Current fix

Evidence:
- `src/lib/ai/schemas.ts` defines Zod schemas, but `src/lib/aiClient.ts` returns `parsed as T` after `JSON.parse`; it does not call the schemas' `parse` methods.
- `src/lib/ai/prompts.ts` embeds schema text for ranking via `zodToJsonSchema`, but validation is still prompt-only.
- `supabase/functions/_shared/aiClient.ts` extracts `output` from gateway responses and stores/logs it without validating feature-specific schemas.
- Folk Care's `packages/core/src/ai/providers/anthropic-provider.ts` and `cloudflare-provider.ts` provide a stronger reference pattern: `generateJSON<T>(prompt, schema, options)` parses, validates with Zod, and retries with error feedback.

Impact:
Malformed or subtly wrong JSON can reach the UI as trusted data. Applicant ranking, offer letters, and onboarding summaries need reliable structured validation because operators may act on them.

Recommendation:
Add server-side schema validation for each current AI feature before returning or caching output. Use Zod schemas in the Edge Function/shared AI layer, not just the frontend. Validation failures should be logged as AI failures without storing unvalidated output in `ai_cache`.

### P1 - The gateway boundary is under-specified and currently trusted as a black box

Status: Current fix / Near-term foundation

Evidence:
- `supabase/functions/_shared/aiClient.ts` sends all current model calls to `AI_GATEWAY_URL`, defaulting to `https://hr-ai-worker.gridhouse-digital10.workers.dev/`.
- It forwards `x-tenant-id` and `x-user-id` headers to the gateway after deriving them from JWT context.
- No HOMS repository code for that Worker was inspected in this review, so provider retention, logging, model routing, and redaction behavior are not source-verifiable here.
- The supplied plan proposes moving privacy and routing into a Cloudflare Worker gateway, including provider routing and scrubber middleware.

Impact:
The Edge Function layer logs/cache-scopes by tenant, but provider behavior, privacy enforcement, timeout policy, and model selection are delegated to infrastructure outside the app repository. A default production URL also makes environment drift easier.

Recommendation:
Make `AI_GATEWAY_URL` required in production and document the gateway as a separately versioned, reviewed component. Do not rely only on the Worker for privacy: perform minimum-necessary payload construction in HOMS before calling the gateway, then let the gateway add provider routing and second-layer redaction.

### P2 - PII minimization exists only partially for hiring AI

Status: Current fix

Evidence:
- `src/lib/aiClient.ts` strips top-level protected applicant keys before summarization/ranking.
- `src/lib/ai/prompts.ts` includes an EEO guardrail in applicant summary and ranking prompts.
- The same file notes that nested JotForm `answers` blobs may still embed protected data.
- `ai-summarize-applicant` can attach `resume_text` from the verified DB row before sending the applicant payload to the model.

Impact:
The current implementation has useful anti-bias intent, but it can still send nested protected characteristics, full resumes, and other unnecessary applicant data to the LLM. This is not PHI/ePHI Care Ops data, but it is still sensitive HR data.

Recommendation:
Switch from denylist stripping to allowlisted AI payload builders per feature. For applicant ranking, send only job-related fields needed for ranking. For summarization, separate "resume extraction" from "summary generation" and cap/normalize text length before model calls.

### P2 - AI logs/cache are tenant-scoped now, but telemetry and cache handling remain immature

Status: Current fix / Near-term foundation

Evidence:
- `supabase/migrations/20251203000000_create_ai_tables.sql` creates `ai_logs` and `ai_cache`; `ai_logs.tenant_id` is legacy `TEXT`, while `ai_cache` later gains `tenant_id uuid`.
- `supabase/migrations/20260530000000_phase01_rls_legacy_policy_remediation.sql` drops broad authenticated reads and adds `ai_logs_select_own_tenant`; `ai_cache` tenant-scoped policies remain.
- `supabase/tests/rls/rls.test.ts` covers cross-tenant denial for `ai_logs`, `ai_cache`, and storage buckets.
- `src/features/admin/pages/AIDashboardPage.tsx` selects `input_hash, created_at, model, output, ttl_seconds` from `ai_cache`, pulling cached AI output into the frontend even though the UI only displays model and age.
- `supabase/functions/_shared/aiClient.ts` logs model, token counts, success/error, and writes a 24-hour cache, but it does not log latency, provider, model tier, estimated cost, prompt version, schema version, or feature category.
- Folk Care's `packages/core/migrations/20251209000000_create_ai_usage_table.ts` and `packages/core/src/ai/usage/ai-usage-service.ts` provide a useful reference for provider/model tier/cost/latency reporting.

Impact:
Tenant isolation is substantially better after Phase 0.1, but observability does not yet support production-grade AI cost attribution or eval traceability. The dashboard also fetches cached output unnecessarily.

Recommendation:
Stop selecting `ai_cache.output` in the dashboard. Extend current `ai_logs` or introduce an approved successor table for provider, model tier, latency, cost estimate, schema/prompt version, and redacted metadata. Treat `ai_inference_log` as planned until implemented under the master spec.

### P2 - Reliability controls are thin

Status: Current fix

Evidence:
- `supabase/functions/_shared/aiClient.ts` performs a direct `fetch(gatewayUrl, ...)` without an `AbortController` timeout or retry policy.
- Rate limiting is a fixed per-tenant `ai_logs` count of 60 requests/minute.
- Invalid gateway JSON and HTTP errors are logged to `ai_logs`, but successful calls with zero tokens are marked as failures for debugging.
- `src/hooks/useAI.ts` surfaces loading/error state, but no cancellation, retry affordance, or stale-call protection is visible at the hook level.

Impact:
Long gateway stalls can tie up Edge Function execution, and provider outages become synchronous user-facing failures. A single tenant-wide limit does not distinguish expensive ranking from cheap setup help.

Recommendation:
Add gateway timeouts, bounded retry for transient failures, per-feature rate limits, and structured error codes. Defer async job queues until a real long-running use case requires them.

### P3 - Folk Care is a useful reference, not a direct target

Status: Near-term foundation / Future planned

Evidence:
- `packages/core/src/ai/types.ts` defines `ModelTier`, provider types, `AIFeatureCategory`, and default feature-to-tier mapping.
- `packages/core/src/ai/providers/provider-factory.ts` routes safety-critical, analysis, generation, and embedding categories across providers.
- `packages/core/src/ai/providers/anthropic-provider.ts` and `cloudflare-provider.ts` implement Zod-validated JSON generation with retries.
- Several Folk Care vertical services, such as `verticals/visit-notes/src/services/documentation-quality-service.ts`, `note-autofill-service.ts`, and `compliance-checking-service.ts`, still call Anthropic directly and use prompt-only JSON parsing. `compliance-checking-service.ts` has notable prompt-injection sanitation and cost controls.

Impact:
The provider abstraction is valuable, but Folk Care is not uniformly centralized. HOMS should adopt the patterns deliberately rather than copying implementation or inheriting the same gaps.

Recommendation:
Use Folk Care to inform HOMS API shapes: provider interface, model tier, feature category, `generateJSON`, usage logging, and prompt-injection sanitation. Do not copy code or imply that Folk Care's care AI services are approved for HOMS regulated workflows.

## Current AI Inventory

Implemented current HOMS AI surfaces:

| Surface | Evidence | Current status |
|---|---|---|
| Applicant summary | `src/lib/aiClient.ts`, `supabase/functions/ai-summarize-applicant/handler.ts` | Current HR feature |
| Applicant ranking | `src/lib/aiClient.ts`, `supabase/functions/ai-rank-applicants/index.ts` | Current HR feature |
| Offer-letter drafting | `src/lib/aiClient.ts`, `supabase/functions/ai-draft-offer-letter/index.ts` | Current HR feature |
| Onboarding summary logic | `src/lib/aiClient.ts`, `supabase/functions/ai-onboarding-logic/index.ts` | Current HR feature |
| WordPress validation helper | `src/lib/aiClient.ts`, `supabase/functions/ai-wp-validation/index.ts` | Current helper feature |
| Setup helper | `src/lib/aiClient.ts` invokes `ai-summarize-applicant` with setup prompt | Current client helper, overloaded endpoint |
| Model map | `src/lib/ai/modelRouter.ts` | Current source file, not observed in the Edge Function call path |
| Shared AI gateway client | `supabase/functions/_shared/aiClient.ts` | Current EF gateway/cache/log layer |
| AI telemetry UI | `src/features/admin/pages/AIDashboardPage.tsx` | Current admin UI |
| AI persistence | `ai_logs`, `ai_cache` migrations | Current tables |
| AI RLS tests | `supabase/tests/rls/rls.test.ts`, `_seed.ts` | Current cross-tenant table/storage coverage |
| AI summarize unit tests | `supabase/functions/_shared/tests/ai-summarize-applicant.test.ts` | Current tenant/SSRF coverage for summarize only |

Planned or not implemented in current HOMS:

| Surface | Source | Status |
|---|---|---|
| `ai_inference_log` | Master spec Phase 5/6 references | Planned |
| Care Ops note assistance | Master spec Phase 6 | Future planned |
| Supervisor copilot / quality scoring | Master spec Phase 7 | Future planned |
| RAG over regulated care data | Not implemented in `src/` or `supabase/` | Blocked pending compliance |
| AI-Powered EVV | Planned capability docs/master spec | Future planned / blocked pending compliance |
| Provider factory with categories | Supplied plan and Folk Care reference | Not implemented in HOMS |
| Privacy Shield / PHI scrubber | Supplied plan | Not implemented in HOMS |

## Upgrade Plan Evaluation

Supplied plan reviewed: `docs/architecture/enterprise-ai-gateway-upgrade-plan.md`.

What is directionally correct:
- Provider categories and model tiers match a useful Folk Care reference pattern.
- `generateJSON` with Zod validation and retry addresses a real HOMS current gap.
- A privacy shield is the right direction for future regulated data, if it is an added layer rather than the only control.
- Routing safety-critical tasks away from default open-weight/cost-saving models is the right principle.
- Automated tests for scrubber, routing, and validation are appropriate.

What must be corrected before approval:
- The plan states "Current HOMS: Everything hits Cloudflare Workers AI" and "Hardcoded to Llama/DeepSeek." Current inspected HOMS code calls an external `AI_GATEWAY_URL`; exact provider behavior is not source-verifiable from this repo. `src/lib/ai/modelRouter.ts` contains Llama/DeepSeek mappings, but the Edge Function path delegates to the gateway.
- "Privacy: None" is too broad. There is top-level protected-key stripping and prompt-level EEO guidance, plus summarize-specific SSRF controls. The more accurate finding is "partial PII minimization, not sufficient for production-grade hiring AI."
- `safetyCritical` routing belongs behind a compliance gate. It should be designed now but not implemented for real care/clinical data until regulated-data architecture and vendor BAA posture are approved.
- The plan places too much enforcement in the Cloudflare Worker. HOMS must also minimize and validate payloads before the gateway.
- The plan should explicitly state that `ai_inference_log`, Staff App note assist, Care Ops AI, and PHI/ePHI handling are planned, not current.
- The plan should add tenant-scope test cases for cache/log/dashboard behavior, not only gateway scrubber/routing tests.

Recommended disposition:
- Approve as a working direction only after revisions.
- Do not promote to official architecture until owner approvals below are resolved.
- Do not implement the Care Ops or safety-critical portions as part of a current HR AI hardening pass.

## Eval Rubric

| Category | Score | Evidence notes |
|---|---:|---|
| Source grounding | 4 | Current claims are grounded in inspected HOMS files, migrations, tests, master spec, supplied plan, and Folk Care references. Gateway internals were not available in this repo. |
| Tenant isolation | 4 | AI EFs use `tenantGuard(req)` and Phase 0.1 RLS covers `ai_logs`/`ai_cache`. Remaining risk is prompt/input authority, not direct tenant derivation. |
| Privacy/compliance | 2 | EEO prompts and top-level protected-key stripping exist, but full resumes and nested applicant blobs can still reach the model. Regulated care data remains blocked. |
| Reliability | 2 | Current calls lack timeout/retry/cancellation and use a fixed per-tenant rate limit. Error logging exists. |
| Observability/cost | 2 | `ai_logs` tracks model/tokens/success/error, but no latency/provider/tier/cost/prompt/schema version. Dashboard pulls cache output unnecessarily. |
| Scalability | 2 | Cache and rate limiting exist, but provider abstraction, per-feature quotas, async paths, and gateway health strategy are not implemented in HOMS. |
| Testability | 3 | RLS and summarize SSRF/tenant tests exist. Missing structured-output, gateway, prompt-injection, and all-AI-entrypoint tests. |
| Phase alignment | 4 | Review keeps Care Ops, Staff App, EVV, RAG, and `ai_inference_log` as planned/blocked unless code proves otherwise. |

## Recommended Upgrade Plan

### Phase A - Current Fix: HR AI safety and reliability hardening

Goal: Make current applicant/offer/onboarding AI safer without starting Care Ops or regulated-data work.

- Remove public `messages` request mode from current AI Edge Functions.
- Move prompt construction and schema selection fully server-side.
- Add feature-specific Zod validation before returning or caching AI output.
- Add payload allowlists for applicant summary/ranking/offer drafting.
- Add nested protected-characteristic stripping for applicant/JotForm payloads.
- Cap and normalize resume text before model calls.
- Require explicit `AI_GATEWAY_URL` and fail closed if missing in production.
- Add `AbortController` timeout and bounded retry for transient gateway failures.
- Stop selecting `ai_cache.output` in the AI dashboard.
- Add prompt/schema version fields to AI logs or redacted metadata.

### Phase B - Near-Term Foundation: Provider and observability layer

Goal: Prepare HOMS for approved future AI without changing product scope.

- Define HOMS-native `FeatureCategory` and `ModelTier` types inspired by Folk Care, but scoped to current HR AI first.
- Add a provider/gateway adapter interface behind `_shared/aiClient.ts`; keep Edge Functions as the authoritative policy boundary.
- Add a `generateJSON` helper with Zod validation, retry-on-validation-failure, raw-response redaction, and no cache writes on validation failure.
- Extend AI telemetry with provider, model tier, latency, token source, estimated cost, feature category, prompt version, schema version, and redacted resource references.
- Decide whether to evolve `ai_logs` or introduce a new table. Do not rename this to `ai_inference_log` unless the owner approves that planned-spec table now.
- Add per-feature and per-user rate limits; keep tenant-wide limit as a backstop.

### Phase C - Future Planned: Staff App and care documentation AI

Goal: Implement only after platform phases and compliance approvals allow it.

- Build `ai-improve-note` only after Care Ops tables/module gating exist and the Staff App decision is made.
- Require `requireModule("care-ops")` once module gating exists.
- Log every inference to the approved inference log table.
- Enforce "do not invent care facts" and missing-task detection server-side.
- Add supervisor review workflow before any AI-improved note is treated as accepted documentation.

### Phase D - Blocked Pending Compliance: Safety-critical and regulated data AI

Blocked until explicit owner/legal/privacy approval:

- `safetyCritical` provider routing for clinical risk, medication, vitals anomaly, or care compliance reasoning.
- Any PHI/ePHI payload to AI providers.
- RAG over client/care/visit records.
- AI-Powered EVV anomaly or compliance decisioning.
- Gateway-level PHI scrubber as a substitute for approved regulated-data architecture.
- Vendor selection claims that assume a BAA exists.

## Validation Plan

Automated tests to add:

- Edge Function contract tests proving `messages` is rejected for public AI endpoints.
- Feature schema tests: invalid applicant summary/ranking/offer JSON fails validation and is not cached.
- Prompt-injection tests: applicant/resume text containing "ignore previous instructions" does not become system authority.
- Nested protected-characteristic tests: JotForm-style payloads with DOB/race/gender in nested answers are removed or ignored before ranking.
- Gateway timeout tests with mocked `fetch`.
- Gateway invalid JSON / non-200 / zero-token behavior tests.
- AI dashboard query test or code assertion that cache output is not selected for the telemetry list.
- RLS suite remains green for `ai_logs`, `ai_cache`, resumes, and compliance-documents.
- Regression tests for `ai-summarize-applicant` SSRF behavior remain green.

Manual checks:

- Use synthetic applicant records only. Verify summary, ranking, and offer drafting still work after typed payload conversion.
- Confirm AI dashboard displays per-tenant logs and cache metadata without cached output payloads.
- Verify failed AI calls produce actionable operator errors without exposing raw applicant/resume text.
- Confirm current HR AI features still work for sparse BambooHR/JazzHR applicants, not only JotForm-rich applicants.

Eval scenarios:

- Applicant ranking ignores protected characteristics when two candidates differ only by age/race/gender/disability fields.
- Applicant summary flags only job-related risks, not protected attributes.
- Offer-letter drafting returns valid JSON and preserves required offer terms.
- Resume extraction refuses internal/private URLs and only uses DB-sourced resume URLs.
- Gateway provider mock returns malformed JSON twice, then valid JSON; helper retries and records one successful validated result.
- Gateway provider mock returns valid JSON with wrong shape; helper rejects and logs validation failure.

## Approvals and Open Questions

Owner approvals required:

- Should the supplied `enterprise-ai-gateway-upgrade-plan.md` remain a draft input, be revised in place, or be superseded by a promoted architecture decision?
- Should HOMS evolve current `ai_logs`, or introduce a new table for richer inference telemetry before Phase 5?
- Which provider strategy is approved for current HR AI: continue gateway-first, direct enterprise provider from Edge Functions, or hybrid?
- Is Cloudflare Worker gateway code in scope for the next review? It must be inspected before relying on gateway privacy/routing claims.
- Are applicant ranking and summarization allowed to send full resume text to an LLM, or must payload minimization be tightened first?
- What is the target budget/latency envelope per AI feature?

Compliance and product gates:

- BAA and HIPAA/PHIPA posture must be approved before any PHI/ePHI model calls.
- Staff App technology decision is required before Phase 6 note AI.
- Care Ops module gating and care tables must exist before care documentation AI.
- Legal/privacy review is required before any safety-critical or regulated-data AI is enabled for real agency data.

Open implementation questions:

- Should `setupHelper` keep reusing `ai-summarize-applicant`, or get its own typed Edge Function?
- Should AI cache be disabled for high-sensitivity features unless the output is explicitly safe to retain?
- Should cache keys include prompt/schema version so changed prompts do not reuse stale outputs?
- Should AI ranking be limited to candidate IDs fetched server-side by tenant instead of accepting full candidate arrays from the caller?

## Out-of-Scope Confirmations

- No application code changes are part of this review.
- No Folk Care code should be copied into HOMS.
- Care Ops, Staff App, EVV, Family Portal, Billing, Payroll, RAG, and regulated care AI remain planned or blocked, not current HOMS implementation.
- This report is a BMAD working note until owner review and promotion under documentation governance.
