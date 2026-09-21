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

## Status badges — light mode

| Status    | fg on bg               | Ratio     |
| --------- | ---------------------- | --------- |
| open      | `#8f2317` on `#fbe0df` | 6.95:1 ✅ |
| submitted | `#6b4e00` on `#fff1b8` | 6.82:1 ✅ |
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
| `--eu-color-accent-text` `#8fc4ff` (secondary button, links, active tab) on `#12121b` / `#1c1c28` — the fill accent `#2d6fd1` as text would only reach 3.45:1      | 10.20:1 / 9.24:1 | 4.5:1 (text) ✅   |
| `--eu-color-focus-ring` `#4da3ff` on `#12121b`                                                                                                                      | 7.09:1           | 3:1 (non-text) ✅ |
| Sidebar stays brand blue `#030088` with white text/`#80bdff` focus ring in both modes — see light-mode rows above; those ratios are unaffected by the color scheme. |

## Status badges — dark mode

| Status    | fg on bg               | Ratio     |
| --------- | ---------------------- | --------- |
| open      | `#ffb3a8` on `#4a1f1a` | 8.17:1 ✅ |
| submitted | `#ffd873` on `#4a3900` | 8.17:1 ✅ |
| billed    | `#a8d4ff` on `#123a5c` | 7.58:1 ✅ |
| done      | `#9ee8ac` on `#163d1d` | 8.49:1 ✅ |

## Re-running this audit

The ratios above were computed with a small throwaway Node script (relative-luminance formula,
no dependency). Re-derive with any WCAG contrast calculator if a token value changes — there is
no automated check wired into CI for this yet (only the axe-core smoke test in
`StyleGuideView.a11y.test.ts`, which flags contrast failures axe can detect on rendered DOM, not
this exhaustive token-pair table).
