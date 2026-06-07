# Production-Ready Healthcare AI Architecture (HOMS Upgrade)

This plan details the architectural evolution of the HOMS AI integration, elevating it from a basic Cloudflare AI Gateway to a robust, Production-Ready Healthcare AI Architecture inspired by best practices from Folk Care.

## User Review Required

> [!IMPORTANT]
> **Vendor Agreements:** To support the `safetyCritical` routing tier required for Care-Ops, you must execute a Business Associate Agreement (BAA) with your chosen enterprise AI provider (e.g., Microsoft Azure for OpenAI, or Anthropic Enterprise).

> [!WARNING]
> **Scrubbing Strategy:** We need to finalize whether the PII/PHI scrubber will run entirely within the Cloudflare Worker (using lightweight NLP/Regex) or if we will spin up a dedicated Microsoft Presidio instance for strict HIPAA compliance.

## Open Questions

1. **Enterprise Provider Choice:** Will our primary enterprise provider for safety-critical reasoning be Microsoft Azure OpenAI or Anthropic Enterprise?
2. **Schema Engine:** Are we comfortable standardizing on `zod` for all AI JSON validation across the codebase?

## Comparison: Current HOMS vs. Target State

| Feature | Current HOMS | Target Architecture |
|---|---|---|
| **Routing** | Everything hits Cloudflare Workers AI | Dynamic routing via **Provider Factory** |
| **Model Tiers** | Hardcoded to Llama/DeepSeek | Abstracted to `fast`, `balanced`, `powerful` |
| **Task Mapping** | Basic string mapping (`summary` -> `chat`) | **Feature Categories** (`safetyCritical`, `generation`, `analysis`) |
| **Validation** | Basic `JSON.parse()` with try/catch | Strict **Zod Schema validation** with auto-retries |
| **Privacy** | None. Raw HR data sent to model. | **Privacy Shield** (PII/PHI anonymization) at Gateway |
| **Resiliency** | Single point of failure | Multi-provider fallbacks |

## Proposed Changes

### 1. Supabase Edge Functions (`_shared/aiClient.ts`)

#### [MODIFY] Implement Provider Factory & Categories
Replace the flat `aiRequest` function with a robust Provider Factory pattern.
- Introduce `FeatureCategory` (`safetyCritical`, `analysis`, `generation`, `embeddings`).
- Introduce `ModelTier` (`fast`, `balanced`, `powerful`).
- Ensure any request flagged as `safetyCritical` (e.g., future clinical visit reviews) strictly requires an Enterprise BAA-compliant provider and ignores cost-saving rules.

#### [NEW] Implement `generateJSON` with Zod
- Wrap all AI requests that expect structured data (like applicant scoring) in a new `generateJSON` method.
- This method will take a Zod schema, pass it to the model, and automatically validate the output. If the model hallucinates a bad format, it will trigger an automatic retry.

### 2. Cloudflare Worker (HOMS AI Gateway)

#### [MODIFY] Gateway Router Update
Update the worker to act as a true multi-model router.
- Map requests tagged for `safetyCritical` or `powerful` to Azure OpenAI / Anthropic.
- Map requests tagged for `fast` or `analysis` to Cloudflare Workers AI.

#### [NEW] Privacy Shield (Scrubber Middleware)
- Intercept the incoming payload before it reaches any external AI provider.
- Run a sanitization pass to detect and mask entities (e.g., replacing "Patient Smith" with "[PATIENT_1]").
- Maintain a temporary mapping dictionary in memory so the gateway can un-mask the response before returning it to HOMS.

## Verification Plan

### Automated Tests
- **Scrubber Tests:** Feed the worker dummy payloads containing synthetic SSNs, phone numbers, and patient names. Assert that the outgoing request to the AI provider contains none of the original PII.
- **Routing Tests:** Assert that payloads flagged with `category: 'safetyCritical'` are never routed to the default open-weight Cloudflare models.
- **Validation Tests:** Force the mock AI provider to return malformed JSON and assert that the Zod validator catches it and triggers a retry.

### Manual Verification
- Attempt to summarize a dummy resume with sensitive PII and verify the AI provider only receives anonymized tokens.
- Verify the `ai_logs` table reflects the correct model and tier were used for the specific task category.
