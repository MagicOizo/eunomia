# Changelog

Each released version has its own section here; the release workflow publishes the matching section
as the body of the GitHub release. Entries are written in English, like everything else that leaves
the repository (`Notes/eunomia-plan.md` §2.8). Version numbers follow the rules in `Notes/eunomia-plan.md` §2.9:
a minor per finished feature, a patch for a hotfix, and `X.Y.Z-slice.N` for a preview while a
feature is being built. For the history before 0.9.0, see the git log and the slice list in
`Notes/eunomia-plan.md`.

## 0.19.0-slice.6 — 2026-10-04

The last three items the two reviews before 1.0 left lying about. None of them is a feature; one
closes a question the owner had to answer, one stops a mistake that has been made three times, and
one makes two tests tell the truth.

- **A mistyped version tag is stopped before it leaves the machine.** Three times a tag was pushed
  that did not match the version in the commit it named, and three times nobody noticed, because
  the only check ran in a job _after_ the one that builds and publishes the image — and that job
  moves the `latest` image tag. Once it did so for a preview, which is what every production host
  pulls by default. There are now two bolts. A `pre-push` hook checks every version tag on its way
  out, reading the version from **the commit the tag names** rather than from the working directory,
  which is precisely the distinction that was missed each time. And the workflow checks the version
  in its own step first, with the image build waiting on it, so the published `latest` can no longer
  move ahead of the check.
- **The export of one person's data now asks for all three read permissions.** It used to ask only
  for permission to see the person's record, on the reasoning that whoever may read a record may
  read what is stored about it — but the document it hands over holds that person's invoices,
  submissions, billings and reimbursements, and every other way to those asks for its own
  permission. It was the one door with a weaker lock. With the two roles the instance ships this
  changed nothing; a role put together differently would have found the gap. The button stays where
  it is for someone without the permissions, disabled and saying so, as every other action does.
- **Two tests that went red about once in a hundred runs now hold.** Both were racing the same
  thing: a dialog moves the cursor into its first field a moment after it opens, and a test that
  had meanwhile opened a dropdown lost it again. The tests now wait for the dialog to have finished
  rather than for a fixed number of turns, and a helper that used to shrug when it could not find
  the button it was asked to click now says so — which is why the real cause took two reviews to
  surface. Checked over three hundred runs.
- **The scripts in `scripts/` can be tested at all.** They were covered by no test pattern, so the
  one that guards every release had never run outside a release. There is now `npm run test:scripts`,
  wired into the normal test command, and the version check has eight cases of its own — including
  one against a repository built by the test, with a tag on an older commit, which is the only way
  to show that it really reads the commit and not the files on disk.

## 0.19.0-slice.5 — 2026-10-04

The two reviews before 1.0 set thirteen security invariants and asked for one more pass over them
once the findings had been worked through. This is that pass, and it is the last item of the review
work. Nothing here is a feature; two of the three findings are closed, and three of the rules can
now be checked by running the tests instead of by reading the code.

- **A list limit is a parameter again.** Two of the three list endpoints put the requested `limit`
  into the SQL as a number rather than as a placeholder. Not exploitable — it had been narrowed to
  an integer in range before it got there — but the rule says values reach the database as
  parameters, with no exceptions, and the third list already did it that way. Both now match it.
- **The release URL is checked where it arrives.** The update check read GitHub's link to the
  release with a validation that accepts `javascript:` — the very one the review had ruled
  insufficient for links a person types — and the footer and the settings page put it straight into
  a link. It now passes the same check an invoice document link does, at the point where the answer
  enters rather than at the two places that display it.
- **Three rules are tested, not just written down.** That the access token never reaches browser
  storage, that an invoice or a policy cannot be moved to another insured person, and that the
  development seed refuses to run against a production environment: each had been true and each had
  rested on nobody changing it. Each is now a test, and each was checked by breaking the rule by
  hand and watching the test fall.
- **One question left for the owner, written down.** The export of everything stored about one
  insured person asks for permission to view that person's record, and hands out their invoices and
  billings with it — which is what it was built to do, but it is the one place where a single
  permission reaches data that otherwise needs its own. It is recorded as an open point rather than
  changed, because what it should ask for is a decision, not a bug.

## 0.19.0-slice.4 — 2026-10-04

Health data that was deleted stayed anyway. The trash kept every deleted record for as long as the
instance lived, a deleted user kept their name and address in the table for ever and could not even
be looked at any more, and there was no way to say what the instance had stored about a person. All
three are closed here — the last of the findings the two reviews before 1.0 turned up.

- **A retention period the trash empties itself by.** After a set number of days a deleted record
  goes for good, and with it every user deleted longer ago than that. It is **off by default**, with
  90 days as the suggested period: an instance that updates into this version must not start
  deleting because nobody read a changelog. Before switching it on, a dry run on the settings page
  says exactly how much it would take and from which kinds of record, without touching anything.
- **It deletes the way the button does.** The daily sweep goes through the very same code the
  Papierkorb's "delete for good" uses, so an unattended deletion follows the same rules: what hangs
  below a record and is deleted itself goes with it, and a record something in use still points at
  stays and is tried again next time. Records from before the Papierkorb existed carry no deletion
  date and are never swept — a period must not delete on the strength of a moment nobody wrote down.
- **Deleted users can be seen, brought back, or removed for good.** The user administration now has
  a section for them, with the day they were deleted. Restoring brings an account back
  **deactivated**, never live, so a returning login is a second, deliberate step. Removing one for
  good takes their roles, account access, sessions and reminder notes with it, and frees their
  address again; who last changed a setting deliberately outlives the account.
- **Everything stored about one insured person, as a file.** The list of insured persons has an
  export: one JSON document with the person, their policies, premiums, terms, bonus scale, recorded
  years, invoices, treatment days, exclusions, submissions, billings and reimbursements — values as
  stored, deleted rows included, and nothing about anybody else. It needs the same permission as
  reading the record itself. The build holds a list of every table in the database against the
  database: each one is either in the export or carries a written reason why not, so a new kind of
  record cannot quietly fall out of an export again.
- **The log says what the instance did on its own.** A sweep writes one line per record it removed,
  marked `actor=system`, plus a summary — and writes nothing at all on a day it removed nothing.
  Restoring and finally deleting a user have their own lines too.

## 0.19.0-slice.3 — 2026-10-04

The app keeps a record of itself. Until now the log knew about mail, reminders and the update
check, and about nothing a person did: not a single login, refused request, user, role, deletion or
setting. A password being guessed was invisible, and after an incident there was no way to say who
had deleted what. For health data that traceability is not a convenience — it is part of the
protection.

- **Fourteen events, one line each.** Signing in and failing to sign in; a request turned away for
  want of a token or a permission; a user created, changed, switched off; roles and account grants
  granted; a record restored or deleted for good; the settings written. Each is a fixed word an
  operator can filter on — `docker logs eunomia | grep TRASH_PURGED` — and all fourteen are listed
  in `DEV.md` with what they mean.
- **A failed login says who was aimed at and from where**, so a sweep across many accounts reads
  differently from a hundred tries against one. The answer to the caller is unchanged: it still
  does not reveal whether the address exists.
- **What never appears in a line.** No record's label — a purged invoice is its kind and its id,
  not its number and the treated person's name — and no setting's value, so changing the mail
  password does not write it into the log. Both rules sit in one module and are checked by its
  test.
- **An expired login is not an incident.** Every open browser tab retires a token every fifteen
  minutes; those write nothing. A token that is malformed, forged, or belongs to a user who is gone
  or switched off does, and says which.
- **The list in the handbook cannot go stale.** The test reads `DEV.md` and fails if an event is
  missing from it, or if the handbook still advertises a search for an event that no longer exists.

## 0.19.0-slice.2 — 2026-10-04

Nothing in this release changes what the app does. It changes what the build knows: three promises
that until now lived in a comment or in a review document are checked on every push, and the test
suites report how much of the code they actually cover.

- **Every endpoint's authorization is written down, and the build holds it.** All 83 routes were
  already guarded — that was never in doubt — but only 33 of them carry that guard where anyone can
  see it. Thirty-seven check inside the handler, sometimes only in the service function the handler
  calls, and the remaining thirteen need nothing beyond being signed in; so a new route that forgot
  its check would look exactly like its neighbours. There is now one list that
  names, for every single route, either the guard on it or the place where it checks. A new route
  fails the suite until someone adds it to that list, and the suite also refuses a list entry whose
  route has disappeared. On top of that it refuses a guard that asks for an instance-wide permission
  per insured person — a grant that can never be satisfied — and it proves over HTTP that each of
  the 78 guarded routes answers "not signed in" with nothing more than that.
- **The rights model has its own test.** The rules the whole access control rests on — a global
  grant covers every insured person, an account-scoped one covers exactly one, a deactivated role
  grants nothing — were only ever exercised by whatever the workflow tests happened to walk
  through. They now have a test of their own: two insured persons, four users, every function of
  the model.
- **Test coverage is measured.** Both suites report their coverage and CI prints the numbers; today
  they stand at 98 % of the API's lines and 68 % of the frontend's. Nothing fails on a percentage —
  the point for now is that a fall becomes visible instead of being discovered at the next review.
- **Three rules of the interface are checked instead of assumed.** That saving the mail settings
  with an empty password field does _not_ delete the stored password; that a new year's terms are
  taken over from the previous year complete with its bonus scale, and say which year they came
  from; and that one insurer letter books all its reimbursements in a single request, with the
  bonus-forfeit flag written only afterwards, so a refused booking leaves the letter untouched.
- **The test suite stopped repeating itself.** Ten of the backend's integration suites carried the
  same forty lines of setup, each with slightly different omissions — one of them already carried a
  note about leftovers from another suite's run. They share one now.

## 0.19.0-slice.1 — 2026-10-04

The first of the last block: everything that lies outside the application code. The app itself looks
and behaves exactly as before — what changed is what a browser is allowed to do with it, what the
production image contains, how the container runs, and what the backup documentation demands of you.

**Read this before updating:** the app's port is now published on `127.0.0.1` instead of on every
interface of the host. With a reverse proxy on the same machine — the documented setup — nothing
changes for you. If you reach the app directly from your network, set `BIND_ADDRESS=0.0.0.0` in
`.env` before updating, or it will stop answering.

- **The app sends security headers of its own.** It sent none: no Content-Security-Policy, no
  `nosniff`, no referrer policy, no frame protection, and it announced its server software in every
  answer. There is a policy now, written out rather than taken from a library's defaults: scripts may
  only come from the app itself, never inline and never from a string, so a link or a field that
  smuggled in code would no longer get it executed. Two relaxations are named in the code: images
  may be data URLs, because the payment QR code is one, and inline styles are allowed, because Vue
  and the icon set write them. The full path of a page no longer travels to externally linked
  documents, and over HTTPS the app asks the browser to stay there.
- **The production image carries only what the API runs.** It also installed the frontend's
  libraries — Vue, the router, the icon set, the QR encoder — although the interface in the image is
  a finished bundle that needs none of them at runtime. They brought two of the three known
  vulnerabilities in the image with them. The image is 357 MB instead of 408 MB.
- **Known vulnerabilities are a build step now.** All seven advisories across the project are fixed
  (transitive updates only, nothing moved to a new major), and every push is checked from now on, so
  the next one shows up the day it arrives instead of at the next review.
- **The container runs with less.** Read-only filesystem, no capabilities, no path to more
  privileges, and memory and CPU limits so a problem in the app cannot take the host with it. The
  database keeps what its startup genuinely needs, and still has limits.
- **Backups: the documentation now says what it expects.** The dump is the complete case record in
  plain text — health data. The scripts deliberately hold no key; the README shows how to encrypt on
  the host with `age` or `gpg` in both directions and states the rules: encrypted at rest, a copy
  off this host, deleted when its retention is up, and restored once so you know it works. Both
  scripts also report failure properly now: a backup whose dump died used to come out truncated with
  a success code, and a restore fed an encrypted file said "Restore complete" without writing a row.
- **Migrations run one instance at a time.** Two containers starting together would have applied the
  same migration twice, because the bookkeeping table is only written afterwards. The second one
  waits for the first now, then finds nothing left to do.

## 0.18.0 — 2026-10-03

Everything from the six previews below, as one release: the third of four blocks working off the
security and code reviews on the way to 1.0.0. It closes eleven more of the 54 findings; eleven are
left, and they are the last block.

This is the first of these blocks with something to see. An account that is not an administrator
now meets an interface that knows what it may offer, instead of one that assumed everything and let
the server say no. Everything else is structure and speed: the pages that were slow because they
asked the database a question per record ask a fixed number now, and the three largest source files
of the project have been taken apart.

- **The interface knows your permissions.** The API has had twelve permissions, granted globally or
  per insured person, since the beginning; the web app read exactly one of them and called it
  "admin or not". Now every area appears with the permission its page actually needs, every button
  that writes is disabled with the reason where the permission is missing — shown, not hidden — and
  a record you may read but not change opens as a display mask rather than refusing to open. For an
  administrator, who holds everything, nothing changes.
- **A document link can no longer be a piece of code.** The link to a scanned invoice or billing was
  checked for being an address but not for what kind, so `javascript:` and `data:` passed and became
  something clickable in the payment information. Only `http://` and `https://` are accepted now,
  asked in one place that the API, the database migration and the three spots in the interface that
  open a document all read from. **This release migrates data:** a stored link a browser must not
  follow is cleared, and the migration names the records it cleared.
- **Every list from a request has an upper bound, and is written in one go.** The reimbursements of
  a service billing, the invoices of a submission and a user's roles were limited by nothing but the
  size of the request — and were inserted row by row, two round trips each, while every invoice
  involved was locked.
- **Pages ask a fixed number of questions.** Opening the invoice workspace cost five questions per
  policy and every change of year cost them again; listing the trash walked the records below every
  single entry, around ten questions each, so fifty entries meant several hundred round trips for
  one page. Both now ask per kind rather than per record — eleven questions instead of twenty-two
  for the reimbursement plan of the development data, and a further policy or trash entry costs
  none at all. Two tests count the questions so they cannot start growing again. The invoice
  workspace also stopped fetching every insured person's policies to drop most of them on arrival.
- **Three files that had grown past reading.** The invoice endpoints, the invoice workspace and the
  dialogs: 944, 1034 and fourteen-times-the-same-twenty-lines. The rules an invoice obeys now live
  in a file of their own with 33 tests that need no database — the first tests in the project to
  address them directly — and every dialog shares one form contract instead of writing it out again.
- **The compiler checks what the database hands over.** The driver answers untyped rows, and in 45
  places the code took the type back with an assertion, which is a promise nobody checks. A table
  now carries the shape of its rows, the column list is checked against it, and where the database
  itself guarantees nothing — a policy's kind is stored as plain text — the value is checked when it
  is read instead of assumed. Eleven assertions are left, each at a boundary to a foreign library.

## 0.18.0-slice.6 — 2026-10-03

Nothing in the app looks different after this release, and the eleven endpoints that were measured
answer character for character what they answered before. What changed is how much of the code the
compiler checks: the database driver hands out untyped rows, and in 45 places the code took the type
back with an assertion — a promise the compiler then stops checking. Eleven of those are left, each
at a boundary to a foreign library and each with a sentence saying why it stays.

- **A table says what its rows look like.** The description of a table — its name, its UID column,
  its columns — now carries the shape of a row as well, and the column list is checked against it:
  a typo in the list, or a column renamed on one side only, no longer compiles. Reading a policy,
  an invoice or a service billing therefore needs no assertion, and a dozen field accesses that
  used to name their own type (`row.invoiceDate as string`) simply have one.
- **A write says what it answers.** Twelve places asked the driver to run an UPDATE or a DELETE and
  then fished the number of affected rows out of an `any`. There is one helper for it now, and the
  one value that needed converting — the generated key, which the driver types as possibly a
  BigInt — is converted rather than claimed.
- **An unknown value in a policy column is now noticed.** Whether a policy is full cover and when
  its bonus is forfeited are stored as plain text; only the API ever writes them, and it checks
  them, but the column itself would take anything. These two are now checked where they are read,
  so a record holding something else answers with an error naming the column and the value, instead
  of quietly calculating with it. Nothing in the seeded or production data changes hands here.
- **Every setting has the type its definition gives it.** `mail.port` is a number, `mail.enabled` a
  boolean, `reminders.timeZone` a string — read off the settings catalog instead of claimed anew by
  each of the five readers. Several defensive checks around the mail configuration fall away with
  it, because the type now proves what they were asking.
- **Four places no longer talk a null away.** The invoice after a write, the presented invoice, and
  two lookups in a map were typed as "certainly there" by assertion; they now say it as a check, at
  the one spot where it cannot happen.

## 0.18.0-slice.5 — 2026-10-03

Nothing in the app looks different after this release. Three places asked the database a number of
questions that grew with the data instead of staying put; they now ask a fixed number, and two
tests count the questions so they cannot start growing again.

- **The reimbursement plan asks once for the whole household.** Opening the invoice workspace, and
  every change of year in it, built the plan by asking five questions per policy — the terms, the
  claims, the year records, the terms again and their bonus scale. It asks four for all policies
  together now. With the three policies of the development data that is eleven questions for the
  page instead of twenty-two, and a fourth policy would add none at all. The bonus calculation
  itself is untouched.
- **The trash asks per kind, not per entry.** Listing the trash walked the foreign keys below every
  single entry twice over and counted its attached rows one table at a time — around ten questions
  for one deleted invoice, so a trash of fifty entries cost several hundred round trips for one
  page. The descent now reads a whole level at once and walks the result in memory. Two further
  entries of a kind cost no further question, which is what the retention period planned for a
  later release will rely on.
- **Policies can be asked for by insured person.** `GET /contracts` takes `?accountUID=` like the
  invoice and billing lists always have. The invoice workspace used to fetch every policy of every
  insured person and drop what it did not need on arrival; it now receives only the ones it shows.
- **One way to write a bound list.** The `?, ?, ?` of an `IN (…)` was written out by hand in
  fourteen places, each one a chance to get the count wrong. There is one helper for it now, and
  the grouping of rows that every batched query needs afterwards has one as well, with its own test.

## 0.18.0-slice.4 — 2026-10-03

The interface learns the permission model. The API has twelve permissions, granted globally or per
insured person; until now the web app read exactly one of them and called it "admin or not". Nothing
changes for an administrator, who holds everything — this is for the first user who does not.

- **Areas appear with the permission their page needs.** The trash asks for `MANAGE_TRASH` and the
  settings for `MANAGE_SETTINGS`, but both were shown — and their routes opened — for
  `MANAGE_USERS` alone. A role carrying the trash now finds it, and finds nothing else. The master
  data stays visible for everyone signed in, because the API gives those lists to everyone.
- **Actions say when they are not yours.** Every button that writes — new invoice, submit, settle,
  delete, the policy's premium and terms histories, an agency's payment details — is now disabled
  unless the permission covers the record it is about, and carries the reason the API would have
  answered with: "Dazu fehlt dir die Berechtigung." Shown instead of hidden: a missing permission
  is something to see, not something to hide.
- **A record you may read opens read-only.** The display mask shows every row as text and offers no
  save, instead of refusing to open. The rows learned to say a date, an amount, a switch and a
  relation without their editors, in German rather than as stored.
- **A new policy is only offered for the people you may write.** The insured-person picker of the
  create form is filtered by the permission, so a form cannot be filled in for a record the API
  would then refuse.
- **One list of permission names.** The twelve keys and the rule that six of them are instance-wide
  now live in `@eunomia/shared`; both apps read them from there, and a typo in a permission check
  stops the build.
- **One fix on the way.** The footer polled the update status for `MANAGE_USERS`, while its endpoint
  requires `MANAGE_SETTINGS` — so one role asked in vain and another never asked. It now follows the
  permission its endpoint names.

## 0.18.0-slice.3 — 2026-10-03

Nothing in the app looks different after this release. It takes the shape that every dialog of the
project had written out for itself and gives it one place to live — which is what the next slice
needs, where the interface learns the permission model and every dialog has to ask about it.

- **One form for every dialog.** Fourteen dialogs declared the same three props, thirteen kept their
  own error beside the one their host passed down, and nine wrote their own "start over when it
  opens" watcher. They now share `useFormDialog()` and one prop type; the same three CSS rules,
  written out character for character in fifteen files, moved to the stylesheet the whole app reads.
- **One write for every host.** The counterpart: busy, error, close the dialog, reload the list — a
  page wrote that out once per action, fifteen times in all. `useDialogAction()` holds it, one group
  per set of actions, so the form, the delete confirmation and each history block keep their own
  state instead of sharing one and having to say which was meant. Left as they are: the loaders, the
  objection dialog (which counts busy per row) and the invoice mask's blocks (which report into one
  of several places without closing anything).
- **The settings page is three pages.** Version, mail and reminders are now three components with a
  page above them that does nothing but load the snapshot and hand it down. Each writes its own keys
  and hands back what the API answered with, so the section below always sees what the one above
  just saved.
- **The invoice workspace keeps the work, not the table.** The table moved into a component of its
  own that is handed finished rows, and the eight dialog states moved into `useInvoiceDialogs()`.
  The largest file of the web app went from 1034 lines to 644, and its behaviour is held down by the
  tests that were already there.
- **One sentence changed.** A failure that is not an answer from the server — the network is gone
  mid-request — was reported in the service-billing list as "Aktion fehlgeschlagen."; it now says
  "Unerwarteter Fehler.", like everywhere else.

## 0.18.0-slice.2 — 2026-10-03

Three findings that all sit in the same place: where a value or a list from a request enters the
database. One of them is the single exploitable path the security review found.

- **A document link can no longer be a piece of code.** The link to a scanned invoice or billing
  was checked for being an address, but not for what kind: `javascript:`, `data:`, `vbscript:` and
  `file:` all passed, and in the payment information the value became a link you could click. A
  user who may enter invoices for one insured person could put one there and wait for an
  administrator to open it. Only `http://` and `https://` are accepted now — asked in one place
  that the API, the stored rows and the three spots in the interface that open a document all read
  from. A link already stored that a browser must not follow is removed when the database is
  migrated, and the migration names the records it cleared.
- **Every list from a request has an upper bound.** The reimbursements of one service billing, the
  invoices of one submission, and a user's roles and account grants were limited by nothing but the
  size of the request. Each entry is a row written inside one transaction, and for the
  reimbursements every invoice involved is locked while it happens. The bounds are 200, 200, 100
  and 100, all far above anything the subject matter produces.
- **A list is written in one go.** The same lists were inserted row by row, two round trips each,
  where a service billing answering thirty invoices paid for thirty of those pairs with every
  invoice locked. They go in one statement now, which is also how the rest of the project already
  did it.

## 0.18.0-slice.1 — 2026-10-03

Nothing in the app changes with this release. It takes the largest source file in the project
apart, so that the rules an invoice obeys can be read — and tested — on their own.

- **The invoice rules have a file, and a test.** Five rules decide what a write to an invoice
  leaves behind: which days it is billed for, whether the "not covered" mark may be set, what the
  two transfer dates become when a bill was paid on the spot, and which of a collection agency's
  payment details it goes to. They were buried in the middle of a 944-line file that was also the
  table description, the schemas, the database queries and seven endpoints, and the only way to
  reach them was through a running server and a database. They now live in one file of their own,
  with 33 tests that run in a quarter of a second — the first tests in the project to address
  these rules directly. The rules themselves are unchanged, line for line.
- **One list of columns instead of two.** The invoice's columns were written out twice, a few
  lines apart, and had to be kept in step by hand. The second list is now derived from the first.

## 0.17.0 — 2026-10-03

Everything from the nine previews below, as one release: the `0.16.0-slice.N` and
`0.17.0-slice.N` series together. The number 0.16.0 is deliberately skipped — the two series are
one body of work, the first two of four blocks working off the security and code reviews on the
way to 1.0.0, and they are released together rather than separately.

Almost nothing here is visible. Of the 54 findings the two reviews produced, these blocks close
24, and exactly one of them was something a user could run into. The rest is the groundwork that
has to be right before 1.0.0: one place for each rule instead of seven copies, contracts the
compiler checks, and sessions that end when they are supposed to.

- **A pause no longer costs you the page.** After a quarter of an hour, the first page that loaded
  two lists at once could put you back on the login screen with the state of the page gone. The
  browser now renews the session once, however many requests are waiting for it, and the waiting
  ones go through on the new token. This is the one finding of the code review a user could
  actually meet.
- **Your own password, and the sessions a change ends.** A password could only be set by an
  administrator, who then knew it; the sidebar's name now leads to "Mein Konto", which asks for the
  old password before accepting a new one. A password change — yours or an administrator's reset —
  ends every session of that account on every other device, which is the one case one changes a
  password for. A refresh token shown a second time is taken as a stolen one and ends the whole
  chain. And the session table, which only ever grew, is swept daily.
- **Who may see which insured person, decided in one place.** Seven list endpoints each carried
  their own copy of the same twenty lines, and the copies had begun to drift apart; two more
  endpoints had no copy at all. They now share one helper, and a test pins down that a login with
  no grant sees nothing anywhere. The dry run of the payment reminders, which handed out every
  recipient's address and full mail text to anyone allowed to change the settings, now shows a text
  only to someone who may read every account it speaks about.
- **The package both apps were supposed to share.** Empty since the first slice, so every contract
  between the API and the web was written down twice and kept in step by hand. It now holds the
  status names, the error codes, the enum values and the payment-due rule. One consequence was
  visible: five date fields took "today" from the UTC day, which in Berlin is yesterday until two
  in the morning.
- **Four helpers, used everywhere they belong.** One way to check who may see a record, one way to
  answer, one way to run a transaction, one way to read a parameter — each existed already and each
  was bypassed in a dozen places. A uniqueness check that ran outside its transaction now runs
  inside it.
- **Seven small corrections to the API.** A flag that left as a number now leaves as a flag; long
  lists are no longer cut off in silence at 1024 bytes; a search for `%` searches for a percent
  sign; deleting a contract year checks the year; the API answers in English and the interface
  translates, as it was always supposed to.
- **One word for one thing.** A collection agency's bank connection was called an "account", which
  is what an insured person is called. It is `paymentDetail` in the code now. The database and the
  API are untouched, so nothing about the app behaves differently.
- **Dead paths are gone.** Two demo endpoints from the third slice that shipped in every release,
  a collection file nothing imported, exported helpers without callers, and an ID check that
  allowed characters the generator never hands out.

## 0.17.0-slice.3 — 2026-10-03

Account separation — the rule that decides who may see which insured person's case data — was
written out by hand in seven places, and in two more it was not written at all. Nothing a user does
changes; what changes is that there is now one place to get it right.

- **The preview of the payment reminders shows only what you may read.** The settings page can
  render the reminder mails before they go out, and it handed out every recipient's address and
  full text — invoice numbers, the treated person, the payee, the amount — to anyone allowed to
  change the settings, a permission that says nothing about reading invoices. A text now appears
  only for someone who may read every account it speaks about; the rest are counted, with a
  sentence saying why they are not shown. For an administrator the preview looks exactly as before.
- **One rule, one place.** Seven list endpoints — invoices, treatment years, submissions,
  reimbursements, service billings, policies, insured persons — asked "which accounts may this
  person see?" with their own copy of the same twenty lines, and the copies had begun to drift
  apart. They now share one helper. Every list answers exactly what it answered before, which is
  what the new tests pin down: a login with no grant at all sees nothing anywhere, a login scoped
  to one insured person sees that one.
- **The trash is an administrative view, and says so now.** It shows the deleted records of every
  insured person and always did; that is a decision, not an oversight — a deleted record may have
  lost the link to the person it belonged to, and a third of the trash holds master data that has
  no person at all. The right to empty the trash is therefore an instance-wide administrator right,
  like the right to manage users, and it is written down as one. Nothing moved in the app.

## 0.17.0-slice.2 — 2026-10-03

Passwords and sessions. Until now a password could only be set by an administrator, who then knew
it — and a new password left every session that was open before it running, for up to thirty days.
That is the one case one changes a password for.

- **Your own password, changed by you.** The sidebar's name leads to a new page, "Mein Konto". It
  asks for the old password before it accepts a new one, so nobody but you ever knows it. For the
  same reason, the user administration no longer offers a password field for your own account and
  points here instead; it keeps offering one for everyone else.
- **A new password ends the other sessions.** Every session of that account, on every other device
  and in every other browser, is over the moment the password changes — whether you changed it
  yourself or an administrator reset it. The browser you are changing it in stays signed in.
- **A refresh token shown twice costs the whole chain.** The server already refused a token that
  had been exchanged once; it now draws the conclusion. Showing one a second time is the reliable
  sign of a stolen one, so every session of that account ends and the event is written to the log
  as `AUTH_REFRESH_REUSE`. If that was your own browser after a lost connection, you sign in once
  more — the price of noticing a theft at all.
- **The session table stops growing.** Every sign-in and every renewal wrote a row and none was
  ever removed. A daily sweep deletes what is expired or has been revoked longer than a refresh
  token lives.

## 0.17.0-slice.1 — 2026-10-03

The one finding of the code review that a user could actually run into. After a quarter of an hour's
pause, the first page that loaded two lists at once could put you back on the login screen, with the
state of the page gone and nothing to explain it.

- **One renewal, however many requests are waiting for it.** An access token lives fifteen minutes;
  when it has expired, the request that notices renews it and repeats itself. A page that loads two
  lists sends two requests, so both ran into the expired token and both asked for a renewal — and
  because the server rotates the refresh token and revokes the one it was shown, the second ask
  presented a token that had just been revoked, was refused, and ended the session the first ask had
  just renewed. Every request waiting on a renewal now shares the one that is already running, and a
  request whose refusal arrives after a sibling has renewed the token repeats itself with that token
  instead of asking for another one. When it works, there is nothing to see: the page loads and the
  session holds.
- **The browser stops writing the envelope out by hand.** Every list and record answer carries its
  payload under `data`, which 35 call sites spelled out in their own types, and five modules
  unpacked with their own copy of the same one-line helper. One `apiData()` next to `apiFetch()`
  does it for all of them; `apiFetch` keeps the three routes that answer without an envelope and the
  ones that answer nothing at all. No answer on the wire changes.

## 0.16.0-slice.6 — 2026-10-03

The package both apps were supposed to share has been empty since the first slice, so every contract
between them was written down twice and kept in step by hand. It now holds what cannot be allowed to
drift: the status names, the error codes, the policy enums, the setting keys, the payment-due rule
and the German number and date formats. Two things a user can notice changed with it.

- **The payment-due rule is one rule now.** The traffic light in the invoice list and the payment
  reminder mails each had their own copy — the same threshold, but not the same date arithmetic: the
  server compared calendar days, the browser cut local midnight out of a UTC timestamp. West of UTC
  the light would have turned red a day before the mail went out. Both sides now use the server's
  version, which compares calendar days as calendar days.
- **Today is the reader's today.** Five date fields offered "today" as their default and took
  it from `toISOString()`, which is the UTC day: in Berlin, between midnight and 2 a.m., they
  prefilled yesterday. They now use the reader's own calendar day — the one the light reads too.
- **A contract the compiler checks.** The web's table of German error sentences is keyed by the
  API's list of error codes, and its setting labels by the API's list of setting keys, so a new
  code without a sentence or a renamed key no longer compiles. The status ladder, the two policy
  enums and the rule for which payment details to suggest exist once instead of twice.
- **The German formats no longer disagree about nothing.** `germanDate('')` wrote
  "undefined.undefined.undefined" into a trash label on the server while the web printed a dash for
  the same value; both print the dash now, and an amount that is not a number prints one too instead
  of "NaN €". The web's `euro()` is called `germanMoney()` with its twin.

## 0.16.0-slice.5 — 2026-09-30

Four helpers this project already had, now used everywhere they belong. Nothing a user can see
changes: the same answers, the same fields, the same status codes — except for four query and path
parameters that used to be read unchecked and now say what is wrong with them.

- **One way to check who may see a record.** Resolving the owning account, answering "not found",
  then checking the permission on it — three lines that stood, written out by hand, at fifteen
  endpoints, with the resource name retyped at each one. They now go through one guard per entity
  (`requireInvoiceAccount`, `requireBillingAccount`, …), so "404 before 403" is a property of the
  helper instead of a habit, and the name of the thing that was not found is stated once.
- **One way to answer.** The user administration wrote its response envelope by hand six times
  instead of using the helper that exists for it. The bytes on the wire are unchanged. The three
  routes that deliberately answer without an envelope — the version check and the two session
  routes — are now named as the exceptions they are, so a bare response is a decision, not an
  oversight.
- **One way to run a transaction.** Five places opened a connection and did their own
  commit/rollback/release: creating a submission, deleting a service billing, creating a policy and
  the two role assignments. Creating a submission wrote its response _inside_ the transaction after
  the commit, so a failure while writing it would have rolled back an already committed
  transaction. All five use the helper now, and the response is written after it.
- **One way to read a parameter.** Four endpoints read query and path parameters raw: the year tabs,
  the reimbursements list, the reimbursement plan's year and every user id in the administration. A
  malformed value is now a 400 that names the parameter instead of a filter that is quietly ignored
  or a lookup that can only end in 404. The reimbursements list also accepts the optional `limit`
  its neighbours already took.
- **A uniqueness check that ran too early.** Changing a premium or a set of terms checked that no
  other entry claims the same start date _before_ opening its transaction, while creating one
  checked inside it. Two simultaneous edits could therefore both pass the check and then write the
  same date, which no database index would have caught. The check now runs inside the transaction
  it guards.

## 0.16.0-slice.4 — 2026-09-30

One word for one thing. Nothing about the app behaves differently — this is a rename in the code, and
the database and the API are untouched.

- **The billing agency's bank connection is no longer called an "account".** `account` meant three
  things at once in the code: the insured person, a billing agency's bank connection, and the login.
  Two modules exported a table description under the very same name, so one of them had to be
  renamed on import, and two functions called `accountForInvoice` returned entirely different things.
  The bank connection is now `paymentDetail` throughout — deliberately a different word rather than a
  longer one, so that looking for `account` no longer finds it. The insured keeps the word, and the
  login was never called that: it is `user` everywhere, so of the three meanings only two were real.
  One case is worth naming: in the invoice write path an inner `account` shadowed an outer one with a
  different meaning inside the same function. That is gone.
- **The database and the API did not move.** Columns, fields (`agencyAccountUID`, `bankAccount`), the
  routes and the response shapes are unchanged to the character, so no migration and nothing for a
  client to adapt to. Renaming those would need a new API version; the vocabulary and the reason the
  two sides differ are now written down in the project's naming conventions.
- **Two "not found" messages are in German again.** Unrelated to the rename but found through it: a
  missing bank connection and a missing trashed record had no German name, so instead of saying which
  entry was not found the app fell back to "Der Eintrag wurde nicht gefunden."

## 0.16.0-slice.3 — 2026-09-30

Seven small corrections to the API, from both reviews: three of them change what an answer contains,
four close a gap between what the code says and what it does. No migration, no field moves.

- **A flag that was a number is a flag.** `directPayment` left the API as `0`/`1` while the two
  other flags of the same row came as `true`/`false`, so the web compared it against `1` in three
  places and wrote `number` into its own type. It is a boolean now, everywhere it is read — the
  payment traffic light included, which is the one place where treating it like its two neighbours
  would quietly have given the right answer only by accident.
- **Long lists are no longer cut off in silence.** A submission's invoice IDs and a billing's
  invoice numbers were collected with `GROUP_CONCAT`, whose default limit is 1024 bytes — from about
  78 invoices on, the rest simply went missing, with no warning. Both lists come from a query of
  their own now, the way the detail route has always done it.
- **A search for `%` searches for a percent sign.** Every free-text search built its `LIKE` term by
  hand, so `%` matched everything and `_` matched any single character. The term goes through one
  helper that escapes both, and the billing search gets the same 50-character limit the invoice
  search already had.
- **Deleting a contract year checks the year.** `DELETE /contracts/:uid/years/:year` passed the year
  on unchecked, so `/years/abc` answered 204 for a deletion that never happened. It runs the same
  check as the write.
- **The API answers in English.** Two messages in the settings routes and every `reason` the mailer
  returns were German, against the rule that the API answers in English and the web translates by
  code. One consequence was visible: starting the reminder run with reminders switched off showed
  "Die Aktion ist fehlgeschlagen." instead of a sentence about reminders, because
  `REMINDERS_DISABLED` was the only one of the 51 codes without a German text. It has one now.
- **Control characters are refused in the text settings.** `mail.fromName` goes into the From header
  of every mail the app sends, and a line break there is header injection nobody should have to
  trust a library to encode away. No setting has a use for a tab or a line break, so all of them
  reject one now.
- **The request body limit is written out.** `express.json()` was left to its default. The limit is
  spelled out as 100 kB — the same value, but a major upgrade can no longer move it unnoticed.

## 0.16.0-slice.2 — 2026-09-29

First of the slices that work off the two reviews before 1.0.0, and the smallest: five findings that
change no behaviour, only what the code claims about itself.

- **Dead paths are gone.** Two demo endpoints from the very early days — `GET /admin/ping` and
  `GET /accounts/:accountUID/ping` — were shipped in every release since, kept alive by nothing but
  two test cases. They are deleted, and the cases now prove the same two guards over routes that
  really exist: the globally gated user list, and a single account. The collected export file of the
  design system, which named five of its fifteen components and was imported nowhere, is deleted as
  well, and so are two exports without a caller.
- **The ID check no longer promises more than it keeps.** Public IDs leave out the characters that
  are read wrong out loud (`0`, `O`, `1`, `I`, `l`), but the pattern that enforces this was written
  out by hand beside the alphabet and let `l` through. It is built from the alphabet now, so the two
  cannot drift apart again, with a test on the excluded characters.
- **One file name follows the convention.** `lib/useTableSort.ts` is `lib/table-sort.ts`, like every
  other file beside it. The function keeps its name.

## 0.16.0-slice.1 — 2026-09-29

- **A version check reaches the footer.** The button in the system settings asks GitHub on the spot,
  and its answer used to stop at the card it was pressed on: the footer kept the answer from the page
  load and only caught up on a reload. Both read one shared state now, so a check made in the
  settings shows up in the footer in the same moment — in both directions, so the notice appears when
  a release is found and goes when the instance turns out to be the latest itself. It no longer
  outlives the session either: signing out takes it with it.

## 0.15.0 — 2026-09-29

Everything from the three `0.15.0-slice.N` previews below, as one release. It answers the five
findings that came out of using 0.13.0 on real data — all of them polish on masks that are opened
many times a day, none of them touching the database, the API or anything already recorded.

- **The create form asks only what a new invoice needs.** Three of the findings sat on the form that
  is filled in more often than any other mask. The sentence that appeared under
  "Direkt-/Barzahlung" is gone: what a direct payment does to the due date and the payment date is
  the API's rule, and the fields it talked about leave the form in the same moment the switch is on.
  "Nicht gedeckt" is gone as well — a bill is marked as uncovered once it exists, not while it is
  being written down, so the mark lives in the detail mask alone. And the further treatment days,
  which about one bill in ten has, no longer sit in a bordered group with a heading, a standing
  sentence and a full-size button that made them look all but required: under "Behandlungsdatum"
  there is now a quiet add action, and the rows — with their own labels and remove actions — appear
  above it as soon as it is used.
- **An amount is taken over with one click.** When invoices are booked onto a Leistungsabrechnung,
  the amount that belongs in "Erstattung" is usually already on the card above the field — the full
  invoice amount where the policy paid everything, the open one where an earlier billing paid part
  of it — and was still typed by hand. Both now act as the way into the field of their own card: a
  click, or Enter on the keyboard, writes the amount where it was going anyway. The same handle
  sits on the invoice amount in "Erstattung ändern". Nothing is preset and nothing is sent
  differently; what the numbers were before is what they still say.
- **The GiroCode no longer gives up its place.** Entering a payment date takes the code away — there
  is nothing left to transfer — and the button simply disappeared with it. The detail mask sizes
  itself to its content, so on a wide screen the whole dialog jumped narrower mid-entry. The button
  now keeps its place when it goes: hidden rather than removed, out of the tab order and out of a
  screen reader's way, but with its space held, so the row and the dialog stay put.

## 0.15.0-slice.3 — 2026-09-29

- **The GiroCode no longer gives up its place.** Entering a payment date takes the code away — there
  is nothing left to transfer — and the button simply disappeared with it. The detail mask sizes
  itself to its content, so on a wide screen the whole dialog jumped narrower mid-entry. The button
  now keeps its place when it goes: hidden rather than removed, out of the tab order and out of a
  screen reader's way, but with its space held, so the row and the dialog stay put.

## 0.15.0-slice.2 — 2026-09-29

- **An amount is taken over with one click.** When invoices are booked onto a Leistungsabrechnung,
  the amount that belongs in "Erstattung" is usually already on the card above the field — the full
  invoice amount where the policy paid everything, the open one where an earlier billing paid part
  of it — and was still typed by hand. Both now act as the way into the field of their own card: a
  click, or Enter on the keyboard, writes the amount where it was going anyway. The same handle
  sits on the invoice amount in "Erstattung ändern". Nothing is preset and nothing is sent
  differently; what the numbers were before is what they still say.

## 0.15.0-slice.1 — 2026-09-29

- **The create form asks only what a new invoice needs.** Three findings from using 0.13.0, all on
  the same form. The sentence that appeared under "Direkt-/Barzahlung" is gone: what a direct
  payment does to the due date and the payment date is the API's rule, and the fields it talked
  about are no longer on the form the moment the switch is on. "Nicht gedeckt" is gone as well — a
  bill is marked as uncovered once it exists, not while it is being written down, so the mark lives
  in the detail mask alone. And the further treatment days, which about one bill in ten has, no
  longer sit in a bordered group with a heading, a standing sentence and a full-size button that
  made them look all but required: under "Behandlungsdatum" there is now a quiet add action, and
  the rows — with their own labels and remove actions — appear above it as soon as it is used.

## 0.14.0 — 2026-09-29

Everything from the three `0.14.0-slice.N` previews below, as one release. It answers the two
findings the 0.13.0 package deliberately left open — the accounts a collection agency is paid on and
the invoice list per agency (`Notes/issues.md` 0.12.0-4/5) — together with the one that came out of
building them.

- **A collection agency can be paid on several accounts, and the invoice says which one.** In
  practice one agency lists several accounts on its bills and names a different one on the next —
  nothing is replaced, each bill simply picks one. Bank accounts are therefore no longer a history
  with one account in force at a time: they stand side by side, in the order they were recorded, and
  the invoice carries the account it goes to. The create form suggests the agency's first account as
  soon as the agency is picked, offers the others, and takes an unknown one on the spot; the detail
  mask edits the same choice later, with the GiroCode, the payment details and the payment reminder
  all following it. Every invoice recorded so far keeps the account it showed: the migration writes
  it down, resolved by the old rule, so nothing changes over the upgrade. The "valid from" date of
  an account goes — what it said is kept in the account's note.
- **The invoice list can be asked who bills it.** Which invoices go through this agency, which of
  them on this account of it, which came from this provider — questions that grew out of an agency
  holding several accounts at once, and that nothing could answer so far. The invoice page keeps its
  number search and gains a filter row beside it: agency, one of its accounts, provider, and a
  status, from a single one to "not done yet". The result list names the provider, the agency and
  the IBAN an invoice goes to, so a further filter is a matter of one more entry. A row of
  "Abrechnungsdienstleister" and of "Leistungserbringer" links straight into that list, already
  narrowed to the record. The filter is written into the address, so a filtered list can be
  bookmarked, reloaded, and returned to from the workspace instead of landing on an empty page.
- **A suggestion list bears what it offers.** Picking a bank account showed the IBAN in a list
  pinned to the width of its field, so it scrolled sideways — on a scrollbar that could not even be
  grabbed, since reaching for it closed the list. The list now takes the field's width as its
  minimum and grows with its content up to the room the window leaves, breaking an entry onto a
  second line where even that is not enough. Every picker in the app is the better for it. And an
  IBAN is printed the way it is read, grouped in fours, wherever it is shown; what is stored, sent
  and encoded into the GiroCode stays compact, and the search ignores spaces.

## 0.14.0-slice.3 — 2026-09-29

- **A suggestion list is no longer too narrow for what it offers.** Picking a bank account showed
  the IBAN in a list pinned to the width of its field, so it scrolled sideways — on a scrollbar that
  could not even be grabbed, since reaching for it closed the list. The list now takes the field's
  width as its minimum and grows with its content up to the room the window leaves; where even that
  is not enough, an entry breaks and its second line drops underneath instead of running off the
  edge. Every picker in the app is the better for it, not just the one holding IBANs.
- **An IBAN is printed the way it is read.** Grouped in fours — `DE89 3704 0044 0532 0130 00` — in
  the picker, the agency's account list, the payment details and the invoice list. What is stored,
  sent and encoded into the GiroCode stays compact, and the search ignores spaces, so an IBAN typed
  in one go still finds the entry it belongs to.

## 0.14.0-slice.2 — 2026-09-29

- **The invoice list can be asked who bills it.** Which invoices go through this collection agency,
  which of them on this bank account of it, which came from this provider — questions that grew out
  of an agency holding several accounts at once, and that nothing could answer so far. The invoice
  page keeps its number search and gains a filter row beside it: agency, one of its accounts (as
  soon as an agency is chosen), provider, and a status, from a single one to "not done yet". Every
  search fills the same result list, which now names the provider, the agency and the IBAN an
  invoice goes to, so a further filter is a matter of one more entry.
- **The master-data lists lead there.** A row of "Abrechnungsdienstleister" and of
  "Leistungserbringer" carries a filter action that opens the invoice list already narrowed to that
  record. It is a real link, so it opens in a new tab like any other.
- **The filter stays where it was.** It is written into the address, so a filtered list can be
  bookmarked and reloaded, and following a hit into the workspace and coming back through its arrow
  lands on the same list again instead of an empty page.

## 0.14.0-slice.1 — 2026-09-28

- **A collection agency can be paid on several accounts, and the invoice says which one.** In
  practice one agency lists several accounts on its bills and names a different one on the next —
  nothing is replaced, each bill simply picks one. Bank accounts are therefore no longer a history
  with one account in force at a time: they stand side by side, in the order they were recorded, and
  the invoice carries the account it goes to. The create form suggests the agency's first account as
  soon as the agency is picked, offers the others, and takes an unknown one on the spot; the detail
  mask edits the same choice later, with the GiroCode following it. Payment details and the payment
  reminder name the account the invoice chose. Every invoice recorded so far keeps the account it
  showed: the migration writes it down, resolved by the old rule, so nothing changes over the
  upgrade. The "valid from" date of an account goes — what it said is kept in the account's note.

## 0.13.0 — 2026-09-28

Everything from the six `0.13.0-slice.N` previews below, as one release. It answers seven of the
nine findings that came out of using 0.11.0 and 0.12.0 on real data; the two about bank accounts
per provider are a subject of their own and open the next package.

- **An invoice can name every day it bills.** A bill from a practice often covers several
  appointments, and until now one of them had to be picked while the rest were lost. The whole list
  is now carried, entered and corrected: the create form keeps "Behandlungsdatum" as the leading day
  and adds rows for the others, the detail mask edits the same list weeks later, and the lists show
  the span an invoice covers (`11.02.–18.02.2025`) with every day in the tooltip. All days of an
  invoice must fall in the same calendar year, because deductible and bonus are counted per
  treatment year; anything across the turn of the year is split into a second invoice, which nothing
  prevents. The submit dialog now judges a policy on the whole span instead of the leading day
  alone, so an invoice whose last appointment fell outside a term is no longer offered as covered.
- **An invoice can be marked as not covered by the insurance.** Some treatments are outside the
  cover; once that is known the invoice is never handed in, and it should not count towards any
  deductible either. The mark belongs to the invoice rather than to a single policy — a policy taken
  out later would not be covered by a set of per-policy marks — and a short reason is required with
  it, so months on it still says why the invoice was put aside. A marked invoice fills no deductible
  anywhere, is left out of the eligible costs, and reads "Nicht erstattbar" without a new status
  being invented; submitting it is refused, as is marking one that already sits at a policy.
- **A bill paid on the spot dates itself.** Cash at the counter or card at the practice: there is
  nothing to transfer and nothing to wait for, so an invoice marked as a direct payment is now due
  and paid on its own date. Until now both dates stayed empty, which left a settled bill standing as
  unpaid and kept it from ever reaching "Erledigt". The rule lives in the API, where both ways of
  writing an invoice meet, so correcting the invoice date takes the two dates with it and dropping
  the mark frees them again.
- **The invoice list says when a reimbursement fell short.** A tariff excess or a deductible can
  leave part of an invoice with the insured person, and that difference had to be worked out from
  two columns. The reimbursement is now written in red once the case is closed and in amber while a
  supplementary policy can still answer; an invoice nobody has answered yet stays plain. The colour
  is never the only carrier: the same sentence, naming the amount, is the cell's tooltip and is read
  out before the figure, and both colours were measured in light and dark mode.
- **A dialog keeps its header and its single scrollbar.** Flipping a switch inside a scrolled dialog
  used to grow a second scrollbar, leave empty space below the buttons and push the title off the
  top — the switch hid its checkbox with `position: absolute` and, with nothing positioned around
  it, that box was laid out against the `<dialog>` itself. The switch now anchors its own checkbox,
  as does the tooltip trigger behind the icon labels.
- **Input fields no longer offer the browser's own suggestions**, which sat oddly in the design and
  got in the way of typing; the login form keeps them, so password managers still fill it in. And
  the instance-address label in the reminder settings fits on one line again, instead of pushing its
  input out of line with the time zone beside it.

## 0.13.0-slice.6 — 2026-09-28

- **The invoice list says when a reimbursement fell short.** A tariff excess or a deductible can
  leave part of an invoice with the insured person, and until now that difference had to be worked
  out from two columns. The reimbursement is now written in red once the case is closed — the
  invoice was marked as billed although the money does not cover it, so what is left is borne by
  the insured person — and in amber while it is still running, where a supplementary policy can
  still answer. An invoice nobody has answered yet stays plain: a zero is no news there.
- **The colour is never the only carrier.** The same sentence, naming the amount, is the cell's
  tooltip and is read out before the figure, and both colours were measured as text on the card
  surface in light and dark mode (design-system/CONTRAST.md).

## 0.13.0-slice.5 — 2026-09-28

- **A bill paid on the spot dates itself.** Cash at the counter or card at the practice: there is
  nothing to transfer and nothing to wait for, so an invoice marked as a direct payment is now due
  and paid on its own date. Until now both dates stayed empty, which left a bill that had long been
  settled standing as unpaid — and kept it from ever reaching "Erledigt", however completely it was
  reimbursed.
- **One rule for every way of writing it.** The create form and the detail mask both set the mark,
  so the rule lives in the API and not in either of them. Correcting the invoice date takes the two
  dates with it, and dropping the mark frees them again, empty: "paid on the invoice date" must not
  stay behind as a statement nobody made. In the detail mask the two dates are shown and locked
  while the mark stands, so what will be saved is what is on screen.

## 0.13.0-slice.4 — 2026-09-28

- **An invoice can be marked as not covered by the insurance.** Some treatments are outside the
  cover; once that is known the invoice is never handed in, and it should not count towards any
  deductible either. The mark belongs to the invoice, not to a single policy — a policy taken out
  later would not be covered by a set of per-policy marks, and there the invoice would start
  counting again. A short reason goes with the mark and is required by it: months on it says why
  the invoice was put aside.
- **A marked invoice drops out of the calculation.** It fills no deductible at any policy, is left
  out of the eligible costs, and the overall advice for it reads "Nicht erstattbar" without a new
  status being invented. It still counts in the year's invoice total, because it is an invoice that
  was billed and paid — only the insurance has nothing to do with it.
- **The mark is only for an invoice that was never submitted.** Submitting one is refused, the
  submit action disappears from its row and its detail dialog, and marking an invoice that is
  already at a policy is refused in turn, with the advice to withdraw it first or to mark it at that
  one policy. Along the way the invoice mask stopped explaining every rejected save with the same
  sentence about the amount: each refusal now says what actually happened.

## 0.13.0-slice.3 — 2026-09-28

- **The treatment days of an invoice can be entered, seen and corrected.** The model learned the
  whole list in the previous preview; the masks now follow. The create form keeps
  "Behandlungsdatum" as the leading day and adds repeatable rows for the rest, and the detail mask
  edits the same list, so a day mistyped weeks ago can still be put right. Both refuse a day from
  another calendar year before they ask the server, in the server's own words.
- **Lists show the span an invoice covers**, `11.02.–18.02.2025` instead of one of its days, with
  all the days in the cell's tooltip — the span says when the treatment began and ended, not which
  days in between were billed. Sorting still goes by the earliest day.
- **The submit dialog judges a policy on the whole treatment span.** It used to look at the leading
  day alone, so an invoice whose last appointment fell outside a policy's term was offered as if it
  were covered.

## 0.13.0-slice.2 — 2026-09-28

- **An invoice can name every day it bills, not just one.** A bill from a practice often covers
  several appointments; until now one of them had to be picked and the rest were lost. The model and
  the API now carry the whole list: it comes back sorted, the recorded treatment date is always its
  earliest day, and a client that sends just the one date keeps working exactly as before — it moves
  the leading day and leaves the others alone. All days of an invoice must fall in the same calendar
  year, because deductible and bonus are counted per treatment year; anything across the turn of the
  year is split into a second invoice, which nothing prevents. The masks follow in the next preview.

## 0.13.0-slice.1 — 2026-09-28

- **A dialog keeps its header and its single scrollbar.** Flipping a switch inside a scrolled dialog
  used to grow a second scrollbar, leave empty space below the buttons and push the title off the
  top. The switch hides its checkbox with `position: absolute`, and with nothing positioned around
  it that box was laid out against the `<dialog>` instead of the switch: measured 764px of scrollable
  height in a dialog 682px tall, and a jump of 82px the moment the label took focus. The switch now
  anchors its own checkbox, as does the tooltip trigger that carries the icon labels' hidden text.
- **Input fields no longer offer the browser's own suggestions.** Autofill and the browser's
  dropdown sat oddly in the design and got in the way of typing. Every field of the app turns them
  off; the login form keeps them, asking for the account name and the current password by name, so
  password managers still fill it in.
- **A settings label fits on one line.** "Adresse dieser Instanz (für den Link in der Mail)" wrapped
  and pushed its input out of line with the time zone beside it; it now reads "URL dieser Instanz".

## 0.12.0 — 2026-09-26

Everything from the nine `0.12.0-slice.N` previews below, as one release. It answers the thirteen
findings that came out of using 0.9.0 on real data:

- **Entering data stops fighting back.** Tab takes the picked entry of a typeahead along instead of
  dropping it, the suggestion list opens on a click, on typing and on the down arrow but no longer
  on focus alone, Escape closes the list rather than the whole dialog, and a date pasted in German
  notation (`24.09.2026`) lands in every date field. Every dialog starts at the top of its body, so
  the next invoice is not typed into a field scrolled out of view.
- **Every list can be searched.** Providers, agencies, insured persons, insurers and policies narrow
  as you type, matching what the table shows — a policy is found by the name of the person it
  belongs to. An invoice is found by its number alone, across everyone and every year the user may
  see, and the hit leads straight into its workspace with the row marked and under the keyboard's
  cursor.
- **A Leistungsabrechnung belongs to the policy, not to one submission.** Insurers answer invoices
  handed in on different days in a single letter; the model forbade recording that, so the same
  letter had to be entered twice. A billing now hangs off the policy, its number is used once per
  policy, and the dialog books invoices from several submissions in one go — each card saying which
  day its invoice went in. Withdrawing an invoice from a submission is judged per invoice instead of
  being blocked by any billing in sight.
- **A booked reimbursement can be corrected.** Amount and receipt number reopen with a pencil next
  to the booking, instead of a typo costing the whole assignment and throwing the invoice back
  through every status. The "no enrichment" rule still holds, measured without the booking's own
  amount.
- **The submit dialog offers the policy that was running.** The list holds the policies that covered
  the treatment period, each with the term it ran; a switch brings the others back, because an
  insurer does accept a treatment from outside the term. A selection that straddles a change of
  policy says so instead of guessing.
- **A collection agency keeps a history of bank accounts.** A new IBAN no longer means creating the
  agency a second time. Which account applies follows from the day of payment — a paid invoice keeps
  showing the account that was valid back then, an unpaid one shows today's, and entering a payment
  date switches the IBAN and the GiroCode before saving. The GiroCode finally carries the BIC and,
  where the money is addressed to someone else, that beneficiary's name.
- **What was deleted can be seen, brought back or let go.** Everything Eunomia deleted was only
  hidden, with no way back and no way out. **Papierkorb** under System lists it by kind, with name,
  origin and moment, and each row either returns or goes for good — under the new `MANAGE_TRASH`
  right, which only Admin carries. A restore runs the same checks the masks do and is all or
  nothing; deleting for good is refused while something active still points at the record and names
  what that is. A letter comes back together with the reimbursements booked through it.
- **Deletions now record their moment.** The new `deletedAt` sorts the trash, allows a retention
  period later, and carries microseconds because it also identifies a single deletion — two
  deletions a millisecond apart must not be undone as if they were one.

## 0.12.0-slice.9 — 2026-09-26

- **Deleted records are no longer gone for good — or kept for ever.** Everything Eunomia deletes was
  only ever hidden: the row stayed in the database, invisible, with no way to bring it back and no
  way to be rid of it. A new page under System, **Papierkorb**, lists what was deleted — grouped by
  kind, each entry with its name, where it belonged and when it went — and each row either comes
  back or goes for good. It is an administrative view: it needs the new `MANAGE_TRASH` right, which
  only the Admin role carries.
- **A letter comes back with its reimbursements.** Deleting a Leistungsabrechnung detaches the
  refunds booked through it; the trash records that as one deletion, shows the letter "samt 3
  Erstattungen" and restores all of it with one click. The same holds the other way: deleting such
  an entry for good takes along what hangs on it and is itself in the trash, and the confirmation
  names every piece — including hand-entered work like a recorded insurance year.
- **A record that is still in use says who is using it.** Deleting for good is refused while
  something active still points at the record, and the sentence names it ("Daran hängt noch: 1
  Rechnung.") instead of failing with a foreign-key error.
- **A restore never creates a state the forms forbid.** It runs the same checks the masks do — no
  second premium for one start date, no billing number used twice under a policy, no refunds above
  the invoice amount — and it is all or nothing: if any part of the batch fails, nothing moves and
  the message says which record refused, and that nothing was restored.
- **An emptied submission is visible but not restorable.** A submission only disappears when its
  last invoice is withdrawn, so what lies in the trash is an empty shell; it is listed with its date
  and policy, says why it cannot come back, and can be cleared away.
- **Every deletion now records its moment.** The new `deletedAt` sorts the trash and later allows a
  retention period; it carries microseconds because it also identifies one deletion — two deletions
  a millisecond apart must not be undone as if they were one.

## 0.12.0-slice.8 — 2026-09-26

- **A collection agency that changes bank stays one entry.** Its account used to be a single field,
  so recording a new IBAN meant creating the agency a second time — and at the picker, nothing said
  which of the two was meant. An agency now carries a history of bank accounts, edited in its own
  mask like a policy's premiums, and an account can be corrected or removed without touching the
  agency.
- **An invoice names the account its money actually went to.** Which account applies follows from
  the day of payment: a paid invoice keeps showing the account that was valid back then (and says
  so, so the difference to the agency's page is not a puzzle), an unpaid one shows today's. Entering
  a payment date in the invoice mask switches the IBAN and the GiroCode right away, before saving.
- **The GiroCode carries the BIC and the right beneficiary.** Both fields were missing: the code
  left the BIC line empty, and it always used the agency's own name — which is wrong wherever the
  money is addressed to someone else. A bank account can now name a beneficiary, and that name is
  what the GiroCode, the payment details and the reminder mails use.
- **The first bank account of an agency needs no date.** "Valid from" is empty for the account an
  agency started with and means "applies from the beginning"; only a change carries a date. So
  neither creating an agency nor migrating the existing ones has to invent a day nobody knows,
  and an invoice paid years ago still resolves to an account.
- **The migration rebuilds the agency table instead of dropping a column in place.** MariaDB's
  default "instant" DROP COLUMN keeps the removed column's row space reserved for ever; on a
  database that has seen enough schema changes, that reserve alone breaks InnoDB's row limit and
  the migration would fail halfway, leaving the new table behind and blocking every later start.

## 0.12.0-slice.7 — 2026-09-25

- **One Leistungsabrechnung books invoices from several submissions at once.** The model already
  allowed it since the last version, but the dialog still insisted on a shared submission and turned
  a mixed selection away. It now asks for a shared _policy_, which is what a billing belongs to — so
  the invoices an insurer answers in one letter are booked in one go, however many days apart they
  were handed in. Each card says which day its invoice went in, so it is clear what is being put
  together.
- **Booking from the Leistungsabrechnungen page starts empty.** Creating a letter used to fill the
  dialog with every open invoice of the policy, leaving the ones it does not answer to be thrown out
  one by one — and it refused outright when those invoices came from different submissions. The
  dialog now opens with no card, and the invoices the letter names are picked from the policy's own,
  across submissions.
- **Booking from an invoice's submission card picks the right policy again.** For an invoice held by
  two policies, the card's button silently lost its preselection in the last version and the dialog
  fell back to guessing.
- **Preparing the database for the billing-per-policy migration is documented.** README now carries
  the read-only check for billing numbers used twice under one policy, what to look at before
  merging such a pair, and the merge itself — including the rule that decides which of the two
  letters survives, because the wrong choice quietly stops a year from forfeiting the bonus.

## 0.12.0-slice.6 — 2026-09-25

- **A Leistungsabrechnung now belongs to the policy, not to one submission.** Insurers routinely
  answer invoices handed in on different days in a single letter, and the data model forbade
  recording that: a billing was tied to exactly one submission, so the only way out was to enter the
  same letter twice. A billing now hangs off the policy, and which submissions it answers follows
  from the reimbursements booked on it. The rule for booking changed accordingly, from "the invoice
  belongs to this billing's submission" to "the invoice is submitted at this billing's policy"; the
  "no enrichment" rule is untouched.
- **A billing number is used once per policy.** The database enforces it, and deleting a billing
  gives its number back. One letter settling two policies — a parent's contract and a child's own
  member policy — still carries the same number on both, because those are two policies.
- **Withdrawing an invoice from a submission is judged per invoice.** It used to be blocked as soon
  as the submission had any billing at all, which now makes no sense and was always coarser than
  needed: an invoice nobody has answered yet comes back, even when the invoices beside it have long
  been settled. Only a reimbursement booked for that invoice at that policy keeps it in place.
- **Creating a billing no longer asks which submission it belongs to.** The Leistungsabrechnungen
  page is about one policy, so there is nothing left to ask.

The dialog for booking a reimbursement still works one submission at a time; opening that up is the
next step.

## 0.12.0-slice.5 — 2026-09-25

- **Every master-data list can be searched.** The lists of providers, agencies, insured persons,
  insurers and policies grow quickly, and all they could do was sort. A search field above each list
  now narrows it as you type, matching what the table actually shows — so a policy is found by the
  name of the insured person it belongs to, not only by its number.
- **An invoice is found by its number alone.** The workspace is entered through an insured person
  and a treatment year; with an invoice in hand and no memory of the year, there was no way in. The
  invoice page now carries a search over invoice numbers across everyone and every year the user may
  see. A hit leads straight to its workspace, on the right year, with the row marked, scrolled into
  view and under the keyboard's cursor.

## 0.12.0-slice.4 — 2026-09-25

- **The submit dialog offers the policy that was running.** Choosing where an invoice goes listed
  every policy of the insured person, including ones that had not started yet or had already ended
  at the time of the treatment. The list now holds the policies that covered the treatment period,
  each with the term it ran; a switch brings the others back, because an insurer does accept a
  treatment from outside the term and the API deliberately does not forbid it. For several invoices
  at once, the period runs from the earliest treatment to the latest — a selection that straddles a
  change of policy says so instead of guessing.

## 0.12.0-slice.3 — 2026-09-25

- **A booked reimbursement can be corrected.** Amount and receipt number used to be settled the
  moment an invoice was assigned to a Leistungsabrechnung; a typo could only be undone by removing
  the whole assignment, which threw the invoice back through every status. A pencil next to the
  booking now opens both fields again. The "no enrichment" rule still holds, measured without the
  booking's own amount — otherwise a correction would block itself.
- **The two fields line up again.** "Erstattung" and "Belegnummer" carried the invoice number in
  their labels; a long number wrapped and left the fields at different heights. The number stands in
  the card's header, where it names both fields for a screen reader as well.

## 0.12.0-slice.2 — 2026-09-25

- **A dialog begins at the top.** Entering several invoices in a row, each form worked through from
  top to bottom, opened the next one already scrolled down while the cursor sat in the first field —
  so you typed into a field you could not see. Every dialog now starts at the top of its body, no
  matter how the one before it was left.

## 0.12.0-slice.1 — 2026-09-25

- **Tab takes the picked entry along.** Choosing an entry in a typeahead field and pressing Tab used
  to move the focus on and drop the choice; the entry is now taken into the field first. A picker
  merely tabbed through still changes nothing, and Tab never springs the "add ‹name›" dialog open.
- **The suggestion list no longer opens on focus alone.** It opens on a click, on typing and with the
  down arrow. That keeps a stale search text from coming back on the next visit and stops a
  full-height list from covering the dialog's Save button on the way back from a subdialog.
- **Escape closes the list, not the whole dialog.** Dismissing a suggestion list used to close the
  form around it and lose everything typed into it.
- **A date can be pasted in German notation.** `24.09.2026` (or `4.9.2026`) copied from a
  spreadsheet now lands in every date field of the app, which the browser had refused. A two-digit
  year is deliberately not accepted — for a birth date the century would be a guess.
- **The switch in the view/edit mask has a name.** Screen readers announced "Direkt-/Barzahlung" as a
  nameless checkbox, because the mask prints the label in its own column.

## 0.11.0 — 2026-09-25

Everything from the four `0.11.0-slice.N` previews below, as one release:

- **System settings in the browser.** Values an operator used to set through `.env` now live in the
  database and are changed on the admin settings page, in collapsible sections.
- **Encrypted secrets.** The SMTP password and the GitHub token are stored with AES-256-GCM under
  `CONFIG_ENCRYPTION_KEY`, which stays in the environment; the API never hands a stored secret back.
- **Mail, and payment reminders that use it.** An SMTP account is configured and proven with a test
  mail. From there Eunomia speaks up on its own: each user gets one mail about exactly the invoices
  they may see, a due invoice is announced once, an overdue one repeats until it is paid, and a run
  missed while the machine was off is caught up. The settings page previews a run without sending
  it.
- **The update check says why it is silent.** It reports a reason — private repository, GitHub
  unreachable, token rejected, rate limit — instead of showing nothing, and **Check now** bypasses
  the six-hour cache.
- **The browser tab names the environment.** A non-production instance titles itself `Eunomia-DEV`,
  so an open tab shows which instance it belongs to.
- **Ad-hoc create that sticks.** A facility or collection agency created from an invoice dialog now
  reaches the table, the mask and the agency's IBAN immediately instead of after a reload, and the
  view/edit mask offers the same ad-hoc create as the create form.
- **Greppable log events.** Mail and update-check events are one line each with a fixed `event=`
  token; passwords never appear in them.

## 0.11.0-slice.4 — 2026-09-25

- **A facility created on the side no longer disappears.** Adding a facility or a collection agency
  from the invoice form left the rest of the page unaware of it: the invoice list showed an empty
  provider column and the invoice's own mask showed an empty field until the page was reloaded. The
  workspace now reloads those two lists as soon as a dialog creates an entry, so the table, the mask
  and the agency's IBAN are right immediately.
- **The invoice mask can create them too.** The view/edit mask offers the same ad-hoc create as the
  create form — as a **+** in the row's action column and as the "add ‹typed name›" row of the
  typeahead, prefilled with what was typed. As everywhere else in the mask, the picked value reaches
  the invoice when you save, and the reset arrow takes it back to the stored one.

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
