# Prolific HR Design System

## Purpose
This document is the canonical UI reference for `prolific-hr-app`.

It should be treated as the app-specific interpretation of the `a1zBuS` shadcn preset.

It is intended for Codex, Claude, Cursor, and human developers who need to:
- extend the UI without reintroducing legacy styling drift
- understand the current visual contract implemented in code
- reuse the existing token system, typography, spacing, and component patterns

This is an implementation-grounded spec based on the current app state, primarily:
- [`src/index.css`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/index.css)
- [`src/components/ui/button.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/ui/button.tsx)
- shared shell and overlay components in `src/components`

The source design inspiration is the `a1zBuS` preset previously inspected from shadcn CLI v4, which resolves to a `radix-nova` style system with:
- Inter-led typography
- neutral surfaces
- green primary accents
- softer rounding
- cleaner SaaS presentation than the app's previous dark-infrastructure styling

## Design Direction
The current system should be reviewed and extended as a hybrid `a1zBuS` / `radix-nova` SaaS UI:
- dark-first, but with full light-theme support
- Inter-led typography
- neutral surfaces with green primary accents
- softened radii and cleaner SaaS spacing
- restrained use of mono for metadata only

This means:
- follow the visual language of `a1zBuS`
- keep the app's existing semantic token model and custom HR utilities
- do not reintroduce old branding artifacts from the previous cyan/purple system
- do not add a second competing design language at the feature level

Avoid the old visual language:
- serif or italic page titles
- IBM Plex or mono for standard UI text
- hardcoded cyan or purple literals for product surfaces
- terminal-style uppercase microcopy everywhere

## Theme Model
The app uses semantic CSS variables, not hardcoded per-page colors.

Rules:
- keep semantic token names stable
- use tokens in components and feature pages
- prefer shared utility classes before introducing one-off inline styles
- dark mode is the default baseline
- `.light` overrides provide light theme behavior

### `a1zBuS` Alignment
For this codebase, "matches `a1zBuS`" means:
- Inter is the primary UI and display font
- green is the only product accent family
- surfaces stay neutral rather than tinted or neon
- controls are softly rounded and moderately dense
- labels are restrained, not terminal-like
- component styling should resemble Nova-style shadcn surfaces, even when implemented through local wrappers

This app is intentionally a hybrid, not exact preset parity:
- it preserves the existing token names
- it preserves the current app structure and custom HR components
- it does not import the preset verbatim or depend on `shadcn/tailwind.css`
- it should still visually read as `a1zBuS` first, Prolific HR second

## Core Tokens

### Dark Theme
Primary tokens from [`src/index.css`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/index.css):

- `--background`: `oklch(0.145 0 0)`
- `--foreground`: `oklch(0.985 0 0)`
- `--card`: `oklch(0.205 0 0)`
- `--popover`: `oklch(0.205 0 0)`
- `--primary`: `oklch(0.62 0.11 152)`
- `--primary-foreground`: `oklch(0.18 0.01 152)`
- `--primary-subtle`: `oklch(0.26 0.028 152)`
- `--primary-muted`: `oklch(0.34 0.048 152)`
- `--secondary`: `oklch(0.24 0.004 230)`
- `--muted`: `oklch(0.22 0.003 230)`
- `--muted-foreground`: `oklch(0.72 0.003 230)`
- `--accent`: `oklch(0.29 0.006 230)`
- `--border`: `oklch(1 0 0 / 8%)`
- `--border-strong`: `oklch(1 0 0 / 14%)`
- `--input`: `oklch(1 0 0 / 12%)`
- `--ring`: `oklch(0.62 0.06 152)`
- `--radius`: `0.875rem`

### Light Theme
Key `.light` overrides:

- `--background`: `oklch(1 0 0)`
- `--foreground`: `oklch(0.145 0 0)`
- `--card`: `oklch(1 0 0)`
- `--primary`: `oklch(0.58 0.1 152)`
- `--secondary`: `oklch(0.96 0.003 230)`
- `--muted`: `oklch(0.975 0.002 230)`
- `--muted-foreground`: `oklch(0.52 0.006 230)`
- `--border`: `oklch(0.922 0 0)`
- `--border-strong`: `oklch(0.85 0 0)`
- `--ring`: `oklch(0.58 0.06 152)`

## Color Roles

### Primary
Use `--primary` for:
- primary actions
- active states
- selected nav states
- progress bars
- branded accents

Do not replace `--primary` with raw green or cyan hexes in feature code.

`a1zBuS` expectation:
- green should feel polished and muted, not electric
- primary accents should highlight actions and states, not flood entire screens

### Severity
Severity tokens:
- `--severity-critical`
- `--severity-high`
- `--severity-medium`
- `--severity-low`
- `--severity-ok`

Use severity tokens for:
- compliance warnings
- risk states
- onboarding/training status emphasis
- alert borders or supporting indicators

### Destructive
Use:
- `--destructive`
- `--destructive-foreground`

For:
- delete/danger actions
- blocking failure messages
- destructive confirmation actions

### AI Surface
AI-specific tokens:
- `--ai-surface`
- `--ai-border`
- `--ai-text`
- `--ai-pulse`
- `--ai-glow`

Use only for AI-tagged surfaces, panels, and generated/loading states.

## Sidebar Tokens
Sidebar has its own token family and supports both dark and light themes.

Primary sidebar tokens:
- `--sidebar`
- `--sidebar-foreground`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-accent`
- `--sidebar-accent-foreground`
- `--sidebar-border`
- `--sidebar-ring`

Sidebar widths:
- expanded: `248px`
- collapsed: `56px`

Rules:
- sidebar should not remain visually dark in light theme
- use sidebar tokens for nav backgrounds, text, and active states
- tooltips for collapsed sidebar should use card-like surfaces

## Typography

### Font Families
Defined in [`src/index.css`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/index.css):

- `--font-sans`: `Inter, system-ui, sans-serif`
- `--font-display`: `Inter, system-ui, sans-serif`
- `--font-mono`: `IBM Plex Mono, Fira Code, monospace`

Intent:
- `font-sans`: standard UI copy
- `font-display`: headers, hero numbers, prominent titles
- `font-mono`: metadata only

This matches `a1zBuS` intent:
- Inter carries almost all visible interface typography
- display and body should feel like one family, not multiple competing brands

### When To Use Mono
Allowed:
- tiny operational labels
- IDs
- timestamps if needed
- keyboard shortcuts
- AI/system tags

Avoid for:
- page titles
- section titles
- form labels
- navigation
- cards and standard body text

If a component reads "developer tool" instead of "SaaS product", check whether mono is overused.

### Base Type Scale
- `--text-xs`: `0.75rem`
- `--text-sm`: `0.875rem`
- `--text-base`: `0.9375rem`
- `--text-lg`: `1.125rem`
- `--text-xl`: `1.25rem`
- `--text-2xl`: `1.5rem`
- `--text-3xl`: `1.875rem`
- `--text-4xl`: `2.25rem`

### Tracking
- `--tracking-normal`: `-0.012em`
- `--tracking-tight`: `-0.028em`
- `--tracking-caps`: `0.08em`

General guidance:
- body and control text should feel slightly tight, not airy
- titles should use negative tracking
- uppercase labels should be restrained, not exaggerated

### Base Element Rules
Current base styles:
- `body`: `font-family: var(--font-sans)`, `font-size: var(--text-base)`
- `h1`: `1.95rem`, weight `750`, tracking `-0.034em`
- `h2`: `1.0625rem`, weight `600`, tracking `-0.02em`
- `h3`: `1rem`, weight `600`, tracking `-0.018em`
- `p`: `var(--text-sm)`, line-height `1.65`

## Spacing
Global spacing token:
- `--spacing`: `0.25rem`

Practical spacing rhythm in components:
- cards commonly use `p-4`, `p-5`, or `p-6`
- headers often use `px-5 py-3.5` or `px-6 py-4`
- vertical section rhythm usually ranges from `space-y-4` to `space-y-6`
- compact controls usually use heights `h-8`, `h-9`, or `h-10`

Preferred spacing feel:
- not cramped
- not airy
- dense, but premium SaaS rather than infrastructure-console dense

`a1zBuS` bias:
- slightly more breathing room than the old HR UI
- enough density for operations workflows without feeling severe

## Radius
Base radius:
- `--radius`: `0.875rem`

Derived Tailwind bridge:
- `radius-sm`: `calc(var(--radius) - 1px)`
- `radius-md`: `var(--radius)`
- `radius-lg`: `calc(var(--radius) + 2px)`
- `radius-xl`: `calc(var(--radius) + 6px)`

Guidance:
- primary controls usually use rounded `md` or `lg`
- pills and badges use full rounding
- avoid sharp rectangular controls unless already part of a semantic micro-pattern

`a1zBuS` favors soft rounding over sharp enterprise corners.

## Shadows
Shadow tokens are defined for both dark and light themes.

Common usage:
- cards: `--shadow-sm`
- floating UI / menus: `--shadow-xl`
- large overlays / drawers: `--shadow-2xl`

Guidance:
- prefer tokenized shadows
- avoid ad hoc heavy box-shadows unless matching an existing overlay pattern

## Motion And Animation
Defined utility keyframes:
- `reveal-up`
- `reveal-right`
- `fade-in`
- `ai-pulse`
- `ai-shimmer`
- `progress-fill`
- `sidebar-collapse`
- `sidebar-expand`
- `dot-ping`

Provided utility classes:
- `animate-reveal-up`
- `animate-reveal-right`
- `animate-fade-in`
- `animate-ai-pulse`
- `animate-dot-ping`
- `ai-shimmer`

Stagger helpers:
- `.delay-0` through `.delay-500`

Motion guidance:
- use short, purposeful transitions
- avoid bouncy or playful motion
- motion should communicate state, loading, or reveal hierarchy

The motion target is subtle SaaS polish, not dashboard theatrics.

## Utility Classes

### Layout And Surface
- `.saas-card`
  - standard card surface
  - use for panels that should feel consistent with the new system

- `.panel`
  - legacy shared content section pattern still in use
  - acceptable where already used

- `.metric-block`
  - structured metric/stat card with hover underline accent

- `.ai-surface`
  - AI-highlighted surface with tokenized top accent

### Typography And Labels
- `.page-header-title`
  - canonical page title style

- `.page-header-meta`
  - canonical subtitle/meta line under page title

- `.form-label`
  - canonical form label

- `.meta-label`
  - canonical small semantic label for key/value sections

- `.zone-label`
  - small section label for table headers, zones, and summary headings

- `.data-value`
  - large metric number

### Status
- `.status-chip`
- `.status-chip-green`
- `.status-chip-red`
- `.status-chip-amber`
- `.status-chip-cyan`
- `.status-chip-muted`

### Navigation And Tables
- `.sidebar-tooltip`
- `.table-row-interactive`
- `.tab-bar`
- `.tab-item`
- `.tab-count`
- `.tab-count-active`
- `.tab-count-inactive`

### Interaction
- `.focus-ring`
- `.input-with-icon`
- `.notif-dot`
- `.divider-label`

## Component Patterns

### Buttons
Implemented in [`src/components/ui/button.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/ui/button.tsx).

Button characteristics:
- rounded-lg baseline
- medium-weight text
- token-driven focus and ring
- `h-9` default control height

Variants:
- `default`
- `destructive`
- `outline`
- `secondary`
- `ghost`
- `link`

Sizes:
- `default`
- `sm`
- `lg`
- `icon`

Guidance:
- use `default` for primary calls to action
- use `outline` for secondary actions
- use `secondary` for softer filled controls
- use `destructive` for destructive actions only

`a1zBuS` button feel:
- compact but not tiny
- rounded, stable, and quiet
- emphasis comes from contrast and spacing, not loud color tricks

### Dropdowns And Menus
Implemented in [`src/components/ui/dropdown-menu.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/ui/dropdown-menu.tsx).

Pattern:
- rounded floating surface
- border + blur + elevated shadow
- no mono-heavy label styling by default
- labels use subtle uppercase but reduced tracking

Menus should feel like Nova-style floating panels, not dev-console popovers.

### Confirm Dialog
Implemented in [`src/components/ui/ConfirmDialog.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/ui/ConfirmDialog.tsx).

Pattern:
- rounded elevated card
- simple centered modal
- title uses sans header styling
- actions use consistent button-scale typography

### Slide Over
Implemented in [`src/components/ui/SlideOver.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/ui/SlideOver.tsx).

Pattern:
- edge-attached drawer
- sticky header
- tokenized border and shadow
- title should not use bespoke font stacks

### Status Badge
Implemented in [`src/components/shared/StatusBadge.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/components/shared/StatusBadge.tsx).

Pattern:
- rounded full pill
- left dot + label
- tokenized per-status colors

### Auth Pattern
Implemented through:
- [`src/features/auth/LoginPage.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/features/auth/LoginPage.tsx)
- [`src/features/auth/ForgotPasswordPage.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/features/auth/ForgotPasswordPage.tsx)
- [`src/features/auth/UpdatePasswordPage.tsx`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/features/auth/UpdatePasswordPage.tsx)

Auth-specific shared classes:
- `.auth-shell`
- `.auth-grid`
- `.auth-card`
- `.auth-title`
- `.auth-meta`
- `.saas-input`

Use this pattern for any future auth-like isolated surface.

## Layout Conventions

### Header
Header should:
- align with sidebar width and transitions
- use tokenized search/input styles
- keep account metadata subtle
- avoid mono-heavy role labels

### Sidebar
Sidebar should:
- use sidebar token family
- clearly distinguish active nav items
- support dark and light theme equally
- use collapsed tooltips with card-like styling

### Page Header
Preferred structure:

```tsx
<div className="pl-1">
  <h1 className="page-header-title">Page Title</h1>
  <p className="page-header-meta">Helpful subtitle or state summary</p>
</div>
```

Do not:
- use serif or italic titles
- use mono uppercase for standard page subtitles
- use feature-specific font stacks that diverge from Inter

## Tables
Preferred table behavior:
- subtle section labels in header
- row hover via `table-row-interactive` or equivalent
- restrained metadata text
- avoid mono in standard cells unless representing IDs or machine values

## Forms
Preferred form rules:
- labels use `.form-label`
- standard inputs use tokenized borders and ring
- textareas and selects should match the same font and spacing rhythm
- avoid inline font stacks in feature code

## Copy Style
Copy should feel:
- operational
- clear
- concise
- product-grade, not dev-console-like

Avoid:
- excessive uppercase
- robotic system phrases in every section
- decorative serif or editorial headline styling

## Do / Don’t

### Do
- use semantic tokens
- use `page-header-title` and `page-header-meta`
- use `form-label` and `meta-label`
- use `saas-card` for standard elevated content surfaces
- reserve mono for IDs, timestamps, and machine-like metadata
- keep radius soft and consistent
- ask whether the result still visually resembles `a1zBuS`

### Don’t
- hardcode `#00C9B1`, `#7152F3`, or old cyan/purple literals in product UI
- introduce `DM Serif`, `Plus Jakarta Sans`, or ad hoc font stacks
- make new pages feel like a different product
- apply mono uppercase to every label by default
- create page-specific title styles unless there is a very strong reason
- optimize for exact old-screen fidelity if it breaks the `a1zBuS` design direction

## Review Checklist
Before merging UI work, verify:
- dark and light theme both look intentional
- sidebar is consistent in both themes
- page titles visually relate across screens
- dialogs, drawers, dropdowns, and tables use the same font rhythm
- no old cyan/purple literals are visible in core product surfaces
- mono is used only for metadata, not main content

## Canonical Source Of Truth
When this doc and the code diverge, update both, but trust implemented tokens in:
- [`src/index.css`](c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/prolific-hr-app/src/index.css)

For visual intent, use this precedence:
1. `a1zBuS` / `radix-nova` design direction
2. this document
3. current implementation details in feature files

If a feature file visually conflicts with this document, treat the file as drift unless there is a deliberate documented exception.

When building new UI:
1. start from this document
2. use existing utilities and semantic tokens
3. verify visually in both themes
4. update this document if the system evolves
