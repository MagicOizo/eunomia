# Changelog

Each released version has its own section here; the release workflow publishes the matching section
as the body of the GitHub release. Entries are written in English, like everything else that leaves
the repository (`Notes/eunomia-plan.md` §2.8). Version numbers follow the rules in `Notes/eunomia-plan.md` §2.9:
a minor per finished feature, a patch for a hotfix, and `X.Y.Z-slice.N` for a preview while a
feature is being built. For the history before 0.9.0, see the git log and the slice list in
`Notes/eunomia-plan.md`.

## 0.10.0-slice.4 — 2026-09-24

- A policy's premium and terms histories no longer fill the dialog: each block shows the entry
  currently in force, newest first, and folds the older ones behind one click. The same for the
  year history.
- A note on a premium or a year is now a speech bubble next to its period, with the text as its
  tooltip — a note recorded for a year was stored but never shown until now.
- View/edit masks are usable on a phone again: below 34rem the label moves above its value instead
  of squeezing it into a column too narrow to read.
- The invoice table fits the card on a 1440px screen, so the actions column is no longer pushed out
  of sight; longer facility names are cut with the full name as a tooltip.
- Fixed: fields in a display mask, the entity picker and the currency field showed no focus ring at
  all for keyboard users — they replaced it with a thin border.
- Amounts in a mask now line up with every other value instead of hanging at the right edge, labels
  end with a colon, an empty field shows a dash, and dialogs have an edge in dark mode.

## 0.10.0-slice.3 — 2026-09-24

- Invoices that are paid through a collection agency now offer a GiroCode next to the IBAN — in the
  payment popover and in the invoice details. Scanning it hands beneficiary, IBAN, amount and
  reference to a banking app instead of typing them over. The code is built in the browser, so
  payment data is never sent anywhere.
- The code appears only while there is something left to transfer, and says in words why it cannot
  be shown when the data does not fit the scheme.
- Fixed: the info popover marked its open state on an element that may not carry it, which screen
  readers could report wrongly, and its heading added a second banner landmark to the page.

## 0.10.0-slice.2 — 2026-09-24

- Creating a service billing from a policy's billing list now leads straight into booking its
  reimbursements, with the same invoice cards as the invoice workspace: an amount field per invoice,
  a receipt number, and a check against what the invoice still has open.
- Creating and editing a service billing now use one and the same dialog, so its fields behave
  identically wherever they are reached from.
- Fixed: a dialog that appeared on screen already open stayed invisible. No dialog in the
  application reached that state before this release.

## 0.10.0-slice.1 — 2026-09-24

- Versioning mechanics for the rules agreed in §2.9: `npm run version:next -- slice|minor|patch|major`
  and `npm run version:set` move the number through all four `package.json` files and the lockfile in
  one step.
- `npm run version:check` (now part of CI) fails when the workspaces, the lockfile and this changelog
  disagree about the version, and the release workflow checks the tag against it as well.
- The Docker tag `latest` no longer moves for a pre-release — only a final release updates it, so a
  slice preview can be published without touching what `docker compose pull` fetches by default.
- Pushing a version tag now creates the GitHub release (a pre-release for `-slice.N` tags) from this
  changelog, after the image has been pushed.

## 0.9.0 — 2026-09-24

First beta of the rebuilt application: the complete billing round trip (invoices, submissions,
service billings, reimbursements) on the policy-based data model, master data with display masks,
role and permission management, the reimbursement optimiser with its overview and recommendations,
German error messages throughout, backup and restore scripts, and an update check that points admins
at a newer release.
