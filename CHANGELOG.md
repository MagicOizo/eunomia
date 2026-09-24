# Changelog

Each released version has its own section here; the release workflow publishes the matching section
as the body of the GitHub release. Version numbers follow the rules in `Notes/eunomia-plan.md` §2.9:
a minor per finished feature, a patch for a hotfix, and `X.Y.Z-slice.N` for a preview while a
feature is being built. For the history before 0.9.0, see the git log and the slice list in
`Notes/eunomia-plan.md`.

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
