# HOMS design system: Dusk

Locked by a Hallmark redesign, 2026-11-04. Tokens live in `src/tokens.css`; the shadcn role mapping lives in `src/index.css`.

- **Theme:** Dusk, adapted for an app. Slate paper, Wix Madefor Display and Text, light by default on a designed bone palette, with Dusk slate as Dark mode. In Light mode, drawers share the page background.
- **Signals:** periwinkle (`--color-signal`) is moving or done; apricot (`--color-accent-2`) is open or waiting. Neither is ever a large fill.
- **Kept red:** `--color-error` is a deliberate departure from Dusk, for expired compliance and destructive actions only.
- **Figures:** a ruled tally (`.tally`), rows and lists. Never a grid of stat tiles.
- **Status:** always the shared `StatusBadge`: an icon and a word, never colour alone. A feature with no data source uses `NotTrackedState`, never a zero or a tick.
- **Surfaces:** cards at 18px with a lit top edge (`.saas-card`, `.panel`), controls at 10px, primary actions as one periwinkle pill. In Light mode cards share the page colour with a hairline edge, and white is kept for the theme toggle, switch thumbs and the printed offer letter.
- **Labels:** sentence case in the body face. Never tracked capitals, never mono labels.
- **Token names:** `--color-signal`, `--color-ink-3` and `--color-well-card` replace Dusk's accent, muted and card names, which collide with shadcn.
- **Motion:** state only, with `transform` and `opacity`. The sidebar no longer animates its width.
- **Icons:** 14px in controls and rows, 16px in headers and navigation, stroke 1.75. Decorative icons are hidden from screen readers; icon-only buttons carry a name.
- **Search:** `.saas-input pl-9` with a 14px icon at left 12px. The header uses `.saas-input-quiet`.
- **Tables:** rules only, no box and no header band. Secondary navigation is `.tab-bar`, never paired buttons.
- **Page width:** every page uses the shell's width, so titles share one left edge.
