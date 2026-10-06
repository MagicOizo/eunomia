# UI texts and translations

Every text the web app shows lives in one catalogue per language in this folder:

| File      | Language | Role                                                            |
| --------- | -------- | --------------------------------------------------------------- |
| `de.json` | German   | Source language. Its shape is the schema every catalogue meets. |
| `en.json` | English  | Translation.                                                    |

The app uses [vue-i18n](https://vue-i18n.intlify.dev/) in composition mode. The catalogues are
compiled at build time (`@intlify/unplugin-vue-i18n`), so the shipped bundle carries no message
compiler and needs no `unsafe-eval` in the Content Security Policy.

## How the checks keep the catalogues whole

- **Type check:** `src/lib/i18n.ts` types `t('…')` against `de.json`. An unknown key does not
  compile, and a catalogue that lacks a key of `de.json` does not compile either.
- **Lint** (`@intlify/eslint-plugin-vue-i18n`, see `eslint.config.js`): keys missing from another
  catalogue, duplicate keys, invalid message syntax, keys nothing uses, and raw text in templates of
  the areas already moved to the catalogue.

## Writing a message

- **Keys are grouped by area**, not by sentence: `nav.invoices`, `login.submit`,
  `components.picker.search`. Words used everywhere sit under `common`.
- **Placeholders** are named: `"Search {label}"`, filled with `t('components.picker.search', { label })`.
- **Markup inside a sentence** (a `<code>`, a link) goes through `<i18n-t>` with named slots, never
  through HTML in the message.
- **Plurals** use vue-i18n's pipe syntax: `"no invoice | one invoice | {n} invoices"`.
- vue-i18n treats `{`, `}`, `@`, `$` and `|` as syntax. Write them as a literal interpolation
  (`{'@'}`) when the text itself needs them.

## Style

- **English labels are in sentence case**: "Due date", not "Due Date".
- **Address the user directly.** The German UI uses the informal "du"; the English one uses the
  plain imperative ("Remove the entry").
- **Quotation marks belong to the language** and live in the catalogue: „…“ in German, “…” in
  English.
- **"Eunomia" is a name** and is never translated.
- Data values the API carries in German (the workflow status `offen`, `eingereicht`, …) stay as they
  are in URLs and requests. Only their labels are translated.

## Glossary

The domain is German private health insurance (PKV). These terms are binding for every catalogue
and for English project documentation (README, CHANGELOG) from 1.2.0 on.

| German                                                         | English                                               | In the code            |
| -------------------------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| Rechnung                                                       | invoice                                               | `Invoice`              |
| Versicherte(r)                                                 | insured person                                        | `Account`              |
| Hauptversicherte(r)                                            | policyholder                                          |                        |
| Police                                                         | policy                                                | `Contract`             |
| Versicherung (the company)                                     | insurer                                               | `InsuranceCompany`     |
| Leistungserbringer                                             | provider                                              | `Facility`             |
| Abrechnungsdienstleister                                       | billing agency                                        | `CollectionAgency`     |
| Kontoverbindung                                                | bank details                                          | `paymentDetail`        |
| Einreichung / einreichen                                       | submission / submit                                   | `Submission`           |
| Leistungsabrechnung                                            | service billing                                       | `ServiceBilling`       |
| Zuordnung                                                      | allocation                                            | `Allocation`           |
| Erstattung                                                     | reimbursement                                         |                        |
| Selbstbeteiligung                                              | deductible                                            |                        |
| Erstattungssatz / Erstattungsobergrenze                        | reimbursement rate / reimbursement cap                |                        |
| Konditionen (per year)                                         | terms                                                 | `ContractTerms`        |
| Versicherungsjahr                                              | insurance year                                        |                        |
| Bonus, Bonus-Staffel, Stufe                                    | no-claims bonus (short: bonus), bonus scale, tier     | `ContractBonusTiers`   |
| leistungsfreie Jahre                                           | claim-free years                                      |                        |
| Bonus verwirkt / verfällt                                      | bonus forfeited                                       |                        |
| Monatsbeitrag / bonusrelevanter Monatsbeitrag                  | monthly premium / bonus-relevant monthly premium      | `ContractPremiums`     |
| Erstattungsplan                                                | reimbursement plan                                    |                        |
| Behandlungsdatum / Behandlungstage                             | treatment date / treatment days                       |                        |
| Zahlungsziel                                                   | due date                                              |                        |
| Direkt-/Barzahlung                                             | paid on the spot                                      |                        |
| Widerspruch                                                    | objection                                             |                        |
| nicht erstattungsfähig                                         | not reimbursable                                      | exclusion              |
| nicht gedeckt                                                  | not covered                                           |                        |
| Belegnummer                                                    | reference number                                      |                        |
| Verwendungszweck                                               | payment reference                                     |                        |
| Zahlungserinnerung                                             | payment reminder                                      |                        |
| Papierkorb                                                     | trash                                                 |                        |
| offen · eingereicht · teilabgerechnet · abgerechnet · erledigt | open · submitted · partially settled · settled · done | workflow status values |
| Startseite · Nutzer & Rechte · Einstellungen · Mein Konto      | Home · Users & permissions · Settings · My account    |                        |
| Anmelden / Abmelden                                            | Sign in / Sign out                                    |                        |

"Billing agency" replaces "collection agency", which earlier changelog entries use: in English,
the latter mostly means a debt collector.

## Adding a language

1. Copy `en.json` to `<code>.json` and translate every value, keeping the keys.
2. Add the code to `SUPPORTED_LOCALES` and the catalogue to `messages` in `src/lib/i18n.ts`.
3. Run `npm run typecheck` and `npm run lint`. Both name every key that is still missing.
