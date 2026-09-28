# Contrast audit

Ratios computed with the standard WCAG relative-luminance formula (sRGB → linear → relative
luminance → `(L1 + 0.05) / (L2 + 0.05)`). Thresholds: **4.5:1** for normal text, **3:1** for large
text (≥18pt / ≥14pt bold) and non-text UI components (e.g. focus indicators). All pairs below meet
at least the threshold noted.

Two colors from the first attempt at this project failed these thresholds and were replaced (see
Notes/eunomia-plan.md, 2.7): the accent blue `#3395f3` reaches only 3.12:1 as white text on it
(kept as `--eu-color-accent-soft` for non-text uses only), and the focus ring `#80bdff` reaches
only 1.97:1 against a white surface (kept as `--eu-color-focus-ring-on-brand`, where it still
works, and replaced with `#1d6fd6` for general use).

## Light mode

| Pair                                                                                          | Ratio   | Threshold                   |
| --------------------------------------------------------------------------------------------- | ------- | --------------------------- |
| `--eu-color-text` `#1a1a2e` on `--eu-color-surface-bg` `#ffffff`                              | 17.06:1 | 4.5:1 (text) ✅             |
| `--eu-color-text-inverse` `#ffffff` on `--eu-color-page-bg`/`--eu-color-sidebar-bg` `#030088` | 15.45:1 | 4.5:1 (text) ✅             |
| `--eu-color-text-muted` `#595964` on `#ffffff`                                                | 6.91:1  | 4.5:1 (text) ✅             |
| `--eu-color-text-inverse-muted` `#b8c4e8` on `#030088`                                        | 8.90:1  | 4.5:1 (text) ✅             |
| `--eu-color-accent` `#0b57c7` on `#ffffff`                                                    | 6.56:1  | 4.5:1 (text) ✅             |
| `--eu-color-accent-soft` `#3395f3` on `#ffffff`                                               | 3.12:1  | 3:1 (large text/UI only) ⚠️ |
| `--eu-color-focus-ring` `#1d6fd6` on `#ffffff`                                                | 4.89:1  | 3:1 (non-text) ✅           |
| `--eu-color-focus-ring-on-brand` `#80bdff` on `#030088`                                       | 7.83:1  | 3:1 (non-text) ✅           |
| `--eu-color-error-fg` `#8f2317` on `--eu-color-error-bg` `#fbe0df`                            | 6.95:1  | 4.5:1 (text) ✅             |
| `--eu-color-error-fg` `#8f2317` on `--eu-color-surface-bg` `#ffffff` (short reimbursement)    | 8.68:1  | 4.5:1 (text) ✅             |
| `--eu-color-warning-fg` `#6b4e00` on `#ffffff` (reimbursement still running)                  | 7.74:1  | 4.5:1 (text) ✅             |

## Status badges — light mode

| Status    | fg on bg               | Ratio     |
| --------- | ---------------------- | --------- |
| open      | `#8f2317` on `#fbe0df` | 6.95:1 ✅ |
| submitted | `#6b4e00` on `#fff1b8` | 6.82:1 ✅ |
| partial   | `#5b2a9e` on `#ece3fb` | 7.47:1 ✅ |
| billed    | `#0b4a8f` on `#dbeeff` | 7.40:1 ✅ |
| done      | `#146328` on `#ddf3df` | 6.31:1 ✅ |

## Dark mode (`prefers-color-scheme: dark`)

| Pair                                                                                                                                                                | Ratio            | Threshold         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------- |
| `--eu-color-text` `#e8e8f0` on `--eu-color-page-bg` `#12121b`                                                                                                       | 15.28:1          | 4.5:1 (text) ✅   |
| `--eu-color-text` `#e8e8f0` on `--eu-color-surface-bg` `#1c1c28`                                                                                                    | 13.83:1          | 4.5:1 (text) ✅   |
| `--eu-color-text-muted` `#a6a6b3` on `#12121b`                                                                                                                      | 7.74:1           | 4.5:1 (text) ✅   |
| white text on `--eu-color-accent` `#2d6fd1` (button)                                                                                                                | 4.88:1           | 4.5:1 (text) ✅   |
| `--eu-color-accent-soft` `#8fc4ff` on `#12121b` / `#1c1c28`                                                                                                         | 10.20:1 / 9.24:1 | 4.5:1 (text) ✅   |
| `--eu-color-accent-text` `#8fc4ff` (secondary button, links, active tab) on `#12121b` / `#1c1c28` — the fill accent `#2d6fd1` as text would only reach 3.45:1       | 10.20:1 / 9.24:1 | 4.5:1 (text) ✅   |
| `--eu-color-focus-ring` `#4da3ff` on `#12121b`                                                                                                                      | 7.09:1           | 3:1 (non-text) ✅ |
| `--eu-color-error-fg` `#ffb3a8` on `--eu-color-surface-bg` `#1c1c28` (short reimbursement)                                                                          | 9.84:1           | 4.5:1 (text) ✅   |
| `--eu-color-warning-fg` `#ffd873` on `#1c1c28` (reimbursement still running)                                                                                        | 12.30:1          | 4.5:1 (text) ✅   |
| Sidebar stays brand blue `#030088` with white text/`#80bdff` focus ring in both modes — see light-mode rows above; those ratios are unaffected by the color scheme. |

## Status badges — dark mode

| Status    | fg on bg               | Ratio     |
| --------- | ---------------------- | --------- |
| open      | `#ffb3a8` on `#4a1f1a` | 8.17:1 ✅ |
| submitted | `#ffd873` on `#4a3900` | 8.17:1 ✅ |
| partial   | `#d7bcff` on `#33204f` | 8.58:1 ✅ |
| billed    | `#a8d4ff` on `#123a5c` | 7.58:1 ✅ |
| done      | `#9ee8ac` on `#163d1d` | 8.49:1 ✅ |

## Focus ring: contrast is not enough, it also has to be visible

The ring (`global.css`, `:focus-visible`) is painted **outside** the element's border box:
`--eu-focus-ring-width` `3px` plus `--eu-focus-ring-offset` `2px`, so it needs
`--eu-focus-ring-space` `5px` of room on every side. An element flush with the edge of a
**scroll container** — anything whose `overflow` is not `visible`, and note that `overflow-x: auto`
alone also makes the y axis clip — loses that part of its ring. A ring cut in half fails WCAG 2.4.11
however good its contrast is, and it is easy to miss: nothing in the DOM measurements shows it
(`scrollWidth` ignores outlines), only a keyboard-focused screenshot does.

Remedy: put `eu-scroll-focus-safe` (`global.css`) on the scrolling element. It pads the container by
`--eu-focus-ring-space` and pulls the same amount back with a negative margin, so the content stays
where it was and only the area the container paints in grows. Applied to `.eu-main__content`
(`DefaultLayout.vue`) and `.eu-bsearch__results` (`BillingSearchDialog.vue`). Containers with at
least `5px` of padding of their own — the dialog body (`1.25em`), table cells in the scrolling table
wrappers (`0.6rem`) — already have the room and need nothing.

When adding a scroll container: either give it that padding or the class, and check it by tabbing
into the element in its top-left corner.

## Re-running this audit

The ratios above were computed with a small throwaway Node script (relative-luminance formula,
no dependency). Re-derive with any WCAG contrast calculator if a token value changes — there is
no automated check wired into CI for this yet (only the axe-core smoke test in
`StyleGuideView.a11y.test.ts`, which flags contrast failures axe can detect on rendered DOM, not
this exhaustive token-pair table).
