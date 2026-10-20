# Admin console design guidelines

Goal: a calm, modern, product-grade admin tool (in the spirit of Linear / Vercel / Stripe dashboards), not a template. Avoid the generic dashboard look: dark sidebars, every section in a shadowed card, loud coloured pills, stacked banners, uppercase tracked labels, decorative icons and wordy helper text.

Shared building blocks live in `components/shared/` (Card, StatGroup, SectionHeading, Notice, StatusBadge, DataTable, PageHeader, Tabs…). Use them rather than restyling per page.

## Principles
1. **Content over chrome.** Fewer boxes. Use whitespace and 1px dividers to group things; only use a bordered container where it genuinely groups a unit (a table, a form, a record summary). Never nest bordered boxes inside bordered boxes.
2. **Quiet by default, colour only for meaning.** Near-black text on white. The brand blue is for links, focus, selection and the active nav item, not decoration. Red/amber/green only for status that matters.
3. **Typographic hierarchy, not decoration.** Page title 20px semibold. Section headings 14px semibold. Body 14px. Secondary text 13px muted. Meta 12px faint. No uppercase + letter-spacing labels (except nothing). No icon next to every heading.
4. **Dense, aligned, scannable.** Tables are the backbone: compact rows, numbers right-aligned with tabular figures, muted secondary lines.
5. **Short copy.** Cut filler like "Search, filter and open a profile to review or take action." Page descriptions are optional and at most one short line. Helper text only where it prevents a mistake.
6. **Backend-gap messaging is quiet.** No big yellow "Waiting on the backend" banners on every page. Use the compact `Notice` (neutral, one line, small info icon). Disabled actions keep their `disabledReason` tooltip.

## Tokens (defined in `app/globals.css`; use these Tailwind names)
- Surfaces: `bg-canvas` (#fafafa page background), `bg-surface` (#fff), `bg-subtle` (#f6f6f7 hover / table header / inputs on hover), `bg-sidebar` (#f6f6f7).
- Lines: `border-line` (#ebebed default), `border-line-strong` (#dcdde0, inputs/buttons).
- Text: `text-ink` (#111318), `text-ink-muted` (#5f636d), `text-ink-faint` (#8e929b).
- Accent: `text-brand` / `bg-brand` (#315b9e), `bg-brand-soft` (#eef2f9).
- Status (text / soft bg): `text-success` / `bg-success-soft`, `text-warning` / `bg-warning-soft`, `text-danger` / `bg-danger-soft`, `bg-neutral-soft`.
- Primary button colour is ink (`bg-ink text-white hover:bg-ink/85`), not blue. Destructive confirm buttons are `bg-danger`.

## Recipes (use exactly these so pages match)
- Radius: `rounded-md` (6px) for controls and badges, `rounded-lg` (8px) for containers, `rounded-xl` only for dialogs. **No `shadow-*` on page content**; shadows only on dialogs, toasts and popovers (`shadow-lg` max, prefer `shadow-[0_8px_30px_rgba(0,0,0,0.08)]`).
- Page: content max width `max-w-6xl`, padding `px-6 py-8` (`px-4` on mobile). Space between page sections `space-y-8`.
- Page header: title `text-xl font-semibold tracking-tight`; optional one-line description `text-sm text-ink-muted`; breadcrumbs `text-[13px] text-ink-faint` with `/` separators; actions right-aligned.
- Section heading (outside a box): `text-sm font-semibold text-ink` + optional `text-[13px] text-ink-muted` line, `mb-3`.
- Container (Card): `rounded-lg border border-line bg-surface`; header `px-4 py-3` with title `text-sm font-semibold`, no divider unless the body is a list/table; body `p-4`.
- Key/value details: label `text-[13px] text-ink-muted`, value `text-sm text-ink`; a two-column grid. Not uppercase.
- Stat: number `text-2xl font-semibold tabular-nums tracking-tight`, label `text-[13px] text-ink-muted` above. Stats sit in a single bordered strip divided by `divide-x divide-line` (one container), not separate cards.
- Table: container `rounded-lg border border-line`; header row `bg-subtle text-xs font-medium text-ink-muted` (normal case); cells `px-4 py-2.5 text-sm`; row hover `hover:bg-subtle`; secondary line `text-[13px] text-ink-muted`.
- Status badge: `inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium` with soft bg and a 6px dot for the tone. Neutral/default statuses (draft, cancelled, completed, dismissed, scheduled) use plain muted text with a grey dot and NO background, so colour is reserved for states that need attention.
- Buttons: height `h-8` (sm `h-7`), `rounded-md text-[13px] font-medium px-3`. Secondary: `border border-line-strong bg-surface hover:bg-subtle`. Ghost: `text-ink-muted hover:bg-subtle hover:text-ink`. Icons 14–16px.
- Inputs/selects: `h-8 rounded-md border border-line-strong bg-surface px-2.5 text-sm`, focus `ring-2 ring-brand/20 border-brand`.
- Tabs: underline style, `text-[13px]`, counts as plain muted numbers (no pill).
- Notice: `rounded-md bg-subtle px-3 py-2 text-[13px] text-ink-muted` with a small icon; danger/warning variants only for things that need action (e.g. account suspended).
- Avatars: neutral (`bg-neutral-soft text-ink-muted`), never coloured.
- Icons: lucide, 16px, `text-ink-faint`, used sparingly (nav, buttons with a verb, empty states). Remove decorative icons from headings and detail rows.

## Don'ts
- No dark sidebar, no gradients, no emoji, no coloured icon bubbles, no "✓ Live" pulsing badges except one small dot where live data matters, no heavy uppercase labels, no stacked banners, no card-inside-card, no 3+ font weights on one screen.
