# Changelog

Each released version has its own section here; the release workflow publishes the matching section
as the body of the GitHub release. Entries are written in English, like everything else that leaves
the repository (`Notes/eunomia-plan.md` §2.8). Version numbers follow the rules in `Notes/eunomia-plan.md` §2.9:
a minor per finished feature, a patch for a hotfix, and `X.Y.Z-slice.N` for a preview while a
feature is being built. For the history before 0.9.0, see the git log and the slice list in
`Notes/eunomia-plan.md`.

## 0.11.0-slice.3 — 2026-09-24

- **Payment reminders.** Eunomia now speaks up on its own when an invoice's payment falls due or is
  already overdue, instead of only showing it to whoever happens to open the app. Each user gets one
  mail about exactly the invoices they are allowed to see.
- **Once, then again when it gets worse.** A due invoice is announced once; an overdue one repeats
  at a configurable interval until it is paid. A mail that could not be delivered is retried on the
  next run rather than silently counted as sent.
- **Preview before it goes out.** The settings page renders what a run would send without sending
  it, and can trigger a real run. Both refuse while the reminders are switched off.
- **A daily schedule that survives a restart.** The run happens at a configured hour in a configured
  time zone; a window missed while the machine was off is caught up at the next check instead of
  waiting for the next day.

## 0.11.0-slice.2 — 2026-09-24

- **The browser tab names the environment.** A non-production instance titles itself `Eunomia-DEV`
  (or `Eunomia-<NAME>` for any other environment), so an open tab shows at a glance which instance
  it belongs to. The environment comes from the public version endpoint, which means a container
  started with `NODE_ENV=development` marks itself as well — not only the local dev server.

## 0.11.0-slice.1 — 2026-09-24

- **System settings.** The admin area's settings page is no longer a placeholder. Values an
  operator used to set through `.env` now live in the database and can be changed in the browser,
  in collapsible sections.
- **Encrypted secrets.** The SMTP password and the GitHub token for the update check are stored
  with AES-256-GCM under `CONFIG_ENCRYPTION_KEY`, which stays in the environment — a database dump
  alone does not reveal them, and the API never hands a stored secret back. Without the key
  everything else still works and the page says why those two fields do not.
- **Mail.** An SMTP account can be configured and proven with a test mail to the admin's own
  address. The result of the last send — including the mail server's own words — is shown on the
  page and survives a restart.
- **Greppable log events.** Mail and update-check events are written as one line each with a fixed
  `event=` token, so `docker logs eunomia | grep MAIL_SEND_FAILED` finds a failed send. Passwords
  never appear in them.
- **The update check says why it is silent.** It now reports a reason (a private repository needs a
  token, GitHub unreachable, token rejected, rate limit) instead of showing nothing, the token can
  be entered on the page, and **Check now** bypasses the six-hour cache.

## 0.10.0 — 2026-09-24

Everything from the four `0.10.0-slice.N` previews below, as one release:

- **Release mechanics.** `npm run version:next -- slice|minor|patch|major` moves the version through
  all four workspaces and the lockfile, `npm run version:check` (in CI) fails when they drift apart,
  and pushing a version tag builds the image and publishes the matching GitHub release from this
  file. `latest` moves only for a final release, never for a preview.
- **One dialog per service billing.** Booking a billing from a policy and from the invoice workspace
  now use the same fields, including the check against what an invoice still has open.
- **GiroCode next to the IBAN.** An invoice paid through a collection agency offers a scannable code
  with beneficiary, IBAN, amount and reference, built in the browser — payment data is never sent
  anywhere.
- **Polish.** View/edit masks are usable on a phone, a policy's histories show the entry in force and
  fold the rest away, notes appear as a bubble with their text as tooltip, and the invoice table fits
  a 1440px screen again. Fields in a mask, the entity picker and the currency field show a focus ring
  again — they were the only places in the application without one.
- Fixed: the GiroCode button next to an IBAN was sized like a standalone button and made its row
  twice as tall as the rest of the payment details, pulling that row out of line.

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
