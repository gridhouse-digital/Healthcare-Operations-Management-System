# BADideas.fund × Anthropic — HOM pitch

This is a copy-ready pitch pack for BADideas.fund’s Anthropic partnership pipeline: deck outline + memo + concrete AI/Anthropic roadmap.

## Positioning (core narrative)

- **One-liner**
  - **HOM is the operations OS for healthcare agencies, starting by eliminating compliance chaos in hire-to-onboard.**

- **What it is**
  - Multi-tenant, compliance-grade **B2B SaaS** for healthcare agencies
  - System of record + automation layer across **BambooHR/JazzHR**, **JotForm**, **WordPress/LearnDash**, and internal HR workflows
  - Wedge: **homecare agencies** (high churn, high compliance burden), then expansion into adjacent healthcare verticals

- **Problem**
  - Onboarding is still driven by **spreadsheets, email, and brittle checklists**
  - Teams chase missing trainings, signatures, and credentials across disconnected systems
  - One missed requirement can trigger **audit findings, fines, clawbacks, and lost contracts**
  - Leadership lacks a real-time view of who is truly compliant, and why

- **Wedge**
  - Detect a new hire →
  - Auto-provision access (WordPress) →
  - Enroll into the right training paths (LearnDash) →
  - Track completions and credentials →
  - Produce an **immutable, tenant-scoped compliance record** and exports

- **Expansion**
  - More healthcare verticals with similar credentialing and training patterns
  - Deeper integrations: additional HRIS/ATS, LMS, payroll/scheduling, contract/payor requirements
  - Higher-order compliance products: analytics, forecasting, remediation workflows, export packs
  - AI copilot becomes the default interface for ops teams

- **Venture-scale logic (bottom-up)**
  - \(# agencies\) × \(ACV per agency\) × \(expansion modules\)
  - Multi-tenant infra + integrations create high switching costs once HOM becomes the compliance source of truth
  - Long-term defensibility compounds via structured compliance data + workflow learning

- **Why now**
  - Staffing churn + tightening oversight makes “fast, provable onboarding” a board-level problem
  - AI is now good enough to reason over policy text and messy HR data, but only with a clean, auditable data layer

## AI & Anthropic roadmap (Claude API + Agents)

These are designed to be concrete and defensible (not generic “AI features”).

- **1) Hire event summarization + risk radar (Claude API)**
  - Input: BambooHR/JazzHR hire event + JotForm credentials + tenant requirements
  - Output: “hire brief”, missing items, risk flags, prioritized next actions

- **2) Policy → training mapping agent (Claude Agents + tools)**
  - Input: agency policies / payor requirements (docs or pasted text)
  - Output: extracted obligations + mapping to LearnDash modules + updates to training matrix

- **3) Compliance copilot (chat + actions)**
  - Natural language queries over tenant data:
    - “Who is out of compliance and why?”
    - “What blocks this hire from going live?”
    - “Generate an audit summary for last quarter”
  - Agent can trigger actions: enroll, notify, assign remediation, generate exports

- **4) Auditor-ready compliance packets**
  - Auto-assemble structured report + narrative based on immutable logs (who/what/when/why)
  - Replaces days of manual spreadsheet compilation

- **5) Multi-tenant learning + benchmarking (moat)**
  - Aggregate and anonymize patterns across tenants (where permitted) to recommend playbooks
  - Use structured signals (exceptions, remediation times, completion rates) to improve outcomes over time

- **Why the Anthropic partnership matters**
  - **$5,000 credits**: iterate quickly on real workflows, prompt evals, and agent orchestration
  - **Higher limits**: supports background summarization + real-time copilot experiences
  - **Direct support**: accelerate a serious regulated-industry Claude use case
  - **Claude Agent SDK**: natural fit for orchestrating Supabase + WordPress/LearnDash + JotForm flows

## Deck (slide-by-slide)

### S1 — Title & mission

- HOM — the operations OS for healthcare agencies
- Tagline: Eliminating compliance chaos in hire-to-onboard
- 1 sentence: From scattered spreadsheets to a single compliant onboarding pipeline

### S2 — The problem

- Every hire triggers a mess of email, spreadsheets, and checklists
- Requirements live across HRIS/ATS, JotForm, LMS, shared drives
- Missed trainings/credentials create audit risk, fines, clawbacks, lost contracts
- Leaders lack a real-time compliance view

### S3 — Broken workflow today

- Visual: BambooHR/JazzHR + JotForm + spreadsheets + WordPress/LearnDash + ad-hoc exports
- Caption: Disjointed tools, no single source of truth, no immutable audit record

### S4 — HOM solution overview

- Detect hire → provision access → enroll training → track → export
- Multi-tenant, audit-logged model designed for compliance

### S5 — Product walkthrough (MVP today)

- Settings & integrations
- Hire pipeline view (status + blockers)
- Training compliance dashboards (red/green by person/role)
- Export pack generation

### S6 — AI-powered future with Anthropic (Claude)

- Hire briefs and risk radar
- Policy→training agent to keep matrices current
- Compliance copilot for queries and actions
- Auditor-ready narrative packets on top of immutable logs

### S7 — Market & timing

- Compliance + onboarding is universal across healthcare labor
- Bottom-up TAM (fill in): agencies × ACV × expansion modules
- “Why now”: staffing churn + tighter oversight + AI orchestration now feasible

### S8 — Business model & GTM

- SaaS per-tenant subscription, tiered by headcount/modules
- Add-ons: advanced exports, AI copilot, analytics
- GTM: small/mid agencies first, ROI on time-to-onboard + reduced audit risk, land and expand

### S9 — Traction & roadmap

- Live MVP + pilots (fill in numbers)
- Next 12–18 months: deeper integrations, AI copilot v1, exports v1, expand customers

### S10 — Team

- Why this team can win: domain depth + shipping speed + AI execution capability
- Advisors / operators (fill in)

### S11 — Raise & use of funds

- Raising: $[X] pre-seed / seed (fill in)
- Use: product + AI workflows, integrations, GTM, domain/compliance expertise
- Milestone: $[Y]k MRR / [N] agencies / key retention metrics (fill in)

### S12 — Why BADideas.fund × Anthropic

- Bold, globally relevant B2B infrastructure bet hiding inside “compliance”
- BADideas.fund: community of builders + fast no-frills decisions
- Anthropic: credits, limits, direct support to build serious agentic workflows in healthcare ops

### Bonus slide — Why this is a BADidea (in a good way)

- At first glance: “healthcare compliance software” sounds niche and boring
- In reality: it sits on top of every healthcare labor transaction
- The workflow and data compound into defensibility and a natural AI copilot surface
- If right: HOM becomes the default compliance infrastructure layer for healthcare agencies

## Memo (1–2 pages, ready-to-send structure)

### 1) Opening (3–4 sentences)

HOM is the operations OS for healthcare agencies, starting by eliminating compliance chaos in hire-to-onboard. Today, onboarding is driven by spreadsheets and email while requirements are scattered across HRIS/ATS, JotForm, and LMS tools. HOM connects these systems into a multi-tenant, audit-proof pipeline from “offer accepted” to “compliant, ready-to-work,” with one-click export packs. We’re raising $[X] to scale distribution and build Anthropic-powered agentic workflows that make compliance operations dramatically faster and safer.

### 2) Problem

Healthcare agencies don’t just need staff; they need provably compliant staff. HR and clinical teams chase documents and training completions across multiple tools with no single source of truth. A single missed training or expired credential creates financial and operational risk. As churn increases and oversight tightens, manual processes break.

### 3) Solution (MVP today)

HOM automates hire-to-onboard across BambooHR/JazzHR, JotForm, and WordPress/LearnDash. It provisions users, assigns training paths, tracks completions and credentials, and stores everything in an immutable, tenant-scoped model with audit logs. Operators get real-time dashboards and export packs designed for audits and payor checks.

### 4) AI & Anthropic (roadmap + defensibility)

We’re building a compliance copilot on top of HOM’s structured, auditable data. Claude generates hire briefs and risk radar, keeps training matrices aligned by reading policies and mapping them to modules, and enables natural language operations (“who is out of compliance and why?”) with action execution. With Anthropic credits, higher limits, and direct support, we can move quickly and position HOM as a flagship regulated-industry agents use case.

### 5) Market & business model

We start with homecare agencies where time-to-onboard and audit readiness directly impact revenue and contracts, then expand across adjacent healthcare verticals. HOM is SaaS priced per tenant, tiered by headcount/modules with add-ons for advanced exports, AI copilot, and analytics. Bottom-up TAM: agencies × ACV × expansion.

### 6) Traction & roadmap

Live MVP with pilots (fill in): [N] agencies, [N] hires processed, [pipeline]. Next 12–18 months: deeper integrations, AI copilot v1, exports v1, grow to [N] paying agencies and $[Y]k MRR.

### 7) Team

Founder-led execution with a bias for shipping. Built multi-tenant, audit-logged foundation from day one. (Add domain/compliance/advisor credibility here.)

### 8) The ask

Raising $[X] to scale GTM, ship the Claude-powered workflow layer, and reach [milestones]. Looking for a partner who is comfortable backing bold, globally ambitious B2B infrastructure with a strong AI advantage.

## Notes to customize fast

- Replace: $[X], $[Y], [N], and market size with your real numbers or best estimates
- Add 1 customer quote or anecdote (1 paragraph max) to make the problem visceral
- Add 1 screenshot per “MVP today” bullet when you convert to slides

