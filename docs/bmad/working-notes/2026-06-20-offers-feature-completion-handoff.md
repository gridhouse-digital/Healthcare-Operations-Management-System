# Dev Handoff — Offers Feature Completion (edit route, real delivery, per-tenant template, AI)

- **Date:** 2026-06-20
- **Author:** Architecture (traced end-to-end against the live codebase + DB)
- **Type:** Feature completion — the offers feature is half-built. **Ship as FOUR separate PRs** (one per phase) so each is small and reviewable. Route each back for review before the next.
- **Deploy:** from `main` only. Phases 2–3 include a migration + EF redeploys.

## CTO addendum - 2026-06-21 transactional email provider strategy

This addendum supersedes Brevo-specific wording below for Phase 3. Brevo remains a current/legacy integration in the repo (`tenant_settings.brevo_api_key_encrypted`, `PLATFORM_BREVO_API_KEY`, and direct Brevo calls in existing EFs), but Phase 3 must not add a new Brevo-only offer delivery path.

Phase 3 must start by adding a transactional email provider abstraction. Resend is acceptable for MVP non-PHI offer email; AWS SES is the regulated-platform target before any workflow sends ePHI/PHI, patient-specific, credential, clinical, or medical-content email. Email bodies must stay minimal and link back to secure HOMS pages. The no-false-success rule remains unchanged: mark `Sent` only after the selected provider accepts the message.

Phase status after CTO review: Phase 1 is done/merged as PR #25. Phase 2 is PR #26, code approved with comments and awaiting CTO review/merge. Phase 3 is blocked until explicit CTO approval after Phase 2 / PR #26 is merged. Phase 4 is blocked until explicit CTO approval after Phase 3.

---

## 0. Confirmed problems (evidence)

1. **Edit route missing.** `src/App.tsx` registers `offers` and `offers/new` but **not `offers/:id/edit`**. `OfferList.handleEdit` (`OfferList.tsx:114`) navigates to `/offers/${id}/edit` → dead route. `OfferEditor` already supports edit (`useParams id` → `loadOffer` → `updateOffer`), so only the route is missing.
2. **"Send" never emails.** `OfferList.handleSend` (`OfferList.tsx:44-64`) calls `offerService.updateStatus(id,'Sent')` — flips a DB column only, **no email**. The `sendOffer` Edge Function *does* email (Brevo) but is **orphaned** — no `functions.invoke('sendOffer')` anywhere in `src/`.
3. **Hardcoded single-tenant content (5 sites):** `OfferList.tsx` (~291/301/335-336 letter preview + "Jane Wilson / HR Director"), `OfferPublicView.tsx` (~79/138), `components/ai/OfferLetterDraftPanel.tsx` (~187/188/197), `lib/ai/prompts.ts` (~72-102), and `supabase/functions/sendOffer/index.ts` (sender name/email/subject). All literal "Prolific Homecare LLC". Multi-tenant correctness bug.
4. **AI draft is disconnected.** `OfferLetterDraftPanel` is wired to the form's live values but its generated letter never flows into the saved offer or the sent email; the company name is hardcoded.

### Schema facts (verified live — do not re-add)
- `offers.secure_token` **already defaults** to `encode(gen_random_bytes(32),'hex')` — every offer gets a token regardless of creation path. Do NOT add token generation.
- `offers.offer_letter_url` (text, nullable) exists — use it (or add `offers.letter_html`) to store the rendered letter actually sent.
- `tenant_settings` has **no** offer/template/signatory/company columns — Phase 2 adds them.
- `tenant_settings.brevo_api_key_encrypted` exists (per-tenant Brevo key, pgcrypto) — `sendOffer` already decrypts it. Email delivery is per-tenant already.

---

## 1. Locked design decisions

- **Per-tenant offer letter is template-driven**, stored in `tenant_settings` (single default template per tenant; a dedicated `offer_templates` table can come later if multiple templates are needed — not now).
- **Merge fields:** `{{candidate}}`, `{{position}}`, `{{rate}}`, `{{start_date}}`, `{{company}}`, `{{signatory}}`, `{{signatory_title}}`, `{{accept_url}}`.
- **Single render source of truth:** the SEND path renders the final letter from the tenant template + offer values, **stores** the rendered HTML on the offer (`offer_letter_url`/`letter_html`), emails it, and the public accept view shows the **stored** letter (so the candidate sees exactly what was sent). Live editor preview may render client-side for WYSIWYG, but the sent/stored copy is authoritative.
- **Creation vs sending are separated:** creation stays client-side (`offerService.createOffer`, `Draft`); **sending is the `sendOffer` EF**, refactored to *send an existing offer by id* (load it, render template, email, store letter, set `Sent`) — NOT create a new one.
- **No false success:** "Send" reports success only if the EF confirms the selected email provider accepted the message. If the tenant has no configured provider/key or the provider rejects, surface an actionable error and do NOT mark `Sent`.
- **De-hardcode completely:** zero "Prolific Homecare"/"Jane Wilson" literals may remain in offer code paths after Phase 2. Add a CI invariant-guard grep for these literals under `src/features/offers`, `components/ai/OfferLetterDraftPanel`, and `supabase/functions/sendOffer`.

---

## 2. Phase 1 — Edit route (tiny, ship first)

- **Do:** add `<Route path="offers/:id/edit" element={<OfferEditor />} />` in `src/App.tsx` next to `offers/new`.
- **Verify:** `OfferList` edit button opens the populated editor; saving calls `updateOffer` and returns to `/offers`. `npm run build` clean.
- One PR. No backend.

---

## 3. Phase 2 — Per-tenant template foundation (the keystone)

**Migration** (`tenant_settings`):
```sql
alter table public.tenant_settings add column if not exists offer_company_name    text;
alter table public.tenant_settings add column if not exists offer_signatory_name  text;
alter table public.tenant_settings add column if not exists offer_signatory_title text;
alter table public.tenant_settings add column if not exists offer_letter_template text; -- body with {{merge}} fields
```
(Optional `offers.letter_html text` if not reusing `offer_letter_url`.) RLS already covers `tenant_settings`; no new policy. Document rollback in DECISIONS.md.

**Settings UI:** add an "Offer Letter" section (Settings → likely `SystemSettingsPage`) to edit company name, signatory name/title, and the template body (with a documented merge-field legend). Persist via the existing tenant-settings save path (tenant_id from JWT only).

**Render util:** a tiny pure `renderOfferLetter(template, values)` (string-replace merge fields, escape values). Implement once for the frontend (`src/features/offers/`) and mirror in Deno for the EF (it's trivial; or have the EF be the only renderer — see Phase 3).

**De-hardcode all 5 sites** to read from tenant settings + merge fields:
- `OfferList` letter preview + signatory block.
- `OfferPublicView` company/signatory (interim: render from template; Phase 3 switches it to the stored sent letter).
- `OfferLetterDraftPanel` HTML (company/signatory from props/settings).
- `lib/ai/prompts.ts` (company/signatory injected, not literal).
- `sendOffer` EF sender/subject (Phase 3 fully).

**Fallback:** if a tenant hasn't configured a template/company yet, fall back to a **generic, non-tenant-specific** default (e.g. company = tenant name; a built-in neutral template) — never the literal "Prolific Homecare".

**Verify:** with Prolific's settings populated, every letter surface shows Prolific's configured values; with them blank, the neutral fallback (no "Prolific" literal). `npm run build` clean; the new CI literal-guard passes.

---

## 4. Phase 3 — Real delivery (wire "Send" to email)

- **Add a transactional email provider abstraction first** (Resend acceptable for MVP non-PHI; AWS SES target for regulated/ePHI-capable delivery; Brevo legacy-compatible only). Then refactor `sendOffer` EF to: `tenantGuard` first; take an existing `offerId`; load the offer + applicant (tenant-scoped); read `tenant_settings` template/company/signatory + selected provider config; build `accept_url` from `secure_token`; render the letter via the merge util; **store** the rendered HTML on the offer (`offer_letter_url`/`letter_html`); send through the provider abstraction with a per-tenant sender/subject; on provider failure throw a typed error (NO status change); on success set `status='Sent'`. Remove all hardcoded sender/company/subject.
- **Wire the UI:** `OfferList.handleSend` calls `supabase.functions.invoke('sendOffer', { body: { offerId } })`, checks BOTH the network error AND `data.error`, only toasts success when the EF confirms delivery, then reloads.
- **`OfferPublicView`** reads the **stored** letter HTML (what was sent), falling back to template render for legacy offers.
- **Guardrail:** if the tenant has no selected email provider/key configured, the UI must say "configure email delivery in Settings → Connectors" rather than silently succeeding.
- **Verify (live, test data):** create a draft → Send → confirm the selected provider accepted the message (check `sendOffer` logs / a real inbox), `offers.status='Sent'`, stored letter present, and the public accept link renders the sent letter and `respond_to_offer` still works. Confirm a no-provider tenant gets an error, not a false success.

---

## 5. Phase 4 — AI reconnect (depends on Phase 2)

- `OfferLetterDraftPanel` + `lib/ai/prompts.ts`: the AI **fills/drafts the tenant template** (merge-field aware; company/signatory injected from settings — no literals). The drafted body populates the editable template (tenant default and/or per-offer), it is **not** a throwaway preview.
- Keep all AI calls going through `aiClient` (per CLAUDE.md). Decide (and document) whether AI output edits the tenant default template or a per-offer override; recommend per-offer override stored on the offer so each candidate's letter can be tailored without changing the tenant default.
- **Verify:** AI draft produces a letter using the tenant's real company/signatory + the candidate's merge values, no hardcoded names; the result is what gets saved/sent.

---

## 6. Global guardrails (all phases)

- `tenant_guard()`/tenant_id from JWT `app_metadata` ONLY; every query tenant-scoped.
- No false success — every send/save checks the real result before toasting success.
- No hardcoded tenant identity anywhere in offer paths (CI grep guard).
- Don't break the existing accept flow (`OfferPublicView` + `respond_to_offer` RPC) or `handleOnboard` (convert-applicant).
- Per phase: `npm run build` + `npm run lint` (touched files clean); `deno check`/tests for the EF; the RLS suite stays green.
- Update PROJECT_LOG, DECISIONS (per-tenant template decision; sendOffer = send-existing-offer; no-false-success), SPRINT_PLAN each phase.

## 7. Deliverables per PR
1. Phase 1: route line. 2. Phase 2: migration + Settings UI + render util + de-hardcode + CI guard. 3. Phase 3: sendOffer refactor + UI wire + stored letter + public-view switch. 4. Phase 4: AI fills template.
Each: build/lint/tests green, docs updated, verification evidence pasted in the PR. Do NOT deploy/db push without sign-off.
