# Code-Review

## 1 Zweck und Geltungsbereich

Dieses Dokument ist die Bestandsaufnahme des gewachsenen Codes vor dem Sprung auf 1.0.0 —
Meilenstein B neben dem [Sicherheits-Review](Sicherheits-Review.md). Es fragt nicht, ob die
Anwendung sicher ist, sondern ob sie so gebaut ist, dass die nächsten fünfzig Scheiben so leicht
fallen wie die letzten fünfzig: Dopplungen, geteilte Typen, Stringenz, Schnitt der großen Dateien,
tote Pfade, Testabdeckung, fehlende Funktionen.

Erste vollständige Prüfung: 2026-09-29, Stand `0.16.0-slice.1`. Geprüft wurde der gesamte
Anwendungscode (`apps/api`, `apps/web`, `packages/shared-types`), die Testsuiten, die CI und die
Werkzeuge im Repository — rund 42 000 Zeilen in 261 Dateien.

Die Befunde stehen zusätzlich als Punkte in [issues.md](issues.md) und werden dort abgehakt. Dieses
Dokument trägt Begründung, Fundstelle, Aufwand und Risiko; `issues.md` trägt den Arbeitsstand.

**Die Auswahl trifft der Autor.** Jeder Befund trägt eine Empfehlung „vor 1.0“ oder „nach 1.0“; sie
ist ein Vorschlag, keine Entscheidung. Kein Befund hier ist ein Fehler, den ein Nutzer heute sieht —
wo doch, steht es ausdrücklich dabei.

**Entscheidung des Autors, 2026-09-29: alle 37 Befunde werden vor 1.0.0 umgesetzt.** Es gibt keine
Frist, auf die das Release zuläuft, und damit keinen Grund, etwas als Rückstand zu führen. Die
Spalte „Empfehlung“ in der Übersicht bleibt stehen, weil sie festhält, wie das Review selbst
gewichtet hat — sie ist ab hier eine Notiz, keine Anweisung. Als besonders behebenswert benannt hat
der Autor CR-04, CR-05, CR-20 (ausdrücklich unter dem Gesichtspunkt der Lesbarkeit), CR-22, CR-23,
CR-29, CR-30 und CR-31; sie sind im Schnitt in Abschnitt 7 nach vorn gezogen.

## 2 Maßstab

Geprüft wurde gegen das, was dieses Projekt sich selbst vorgenommen hat, nicht gegen einen
allgemeinen Stilkatalog:

- **Eine Regel hat einen Ort.** Fachregeln stehen einmal; wo zwei Seiten dieselbe Regel brauchen,
  gehört sie in etwas Geteiltes und nicht zweimal hingeschrieben.
- **Ein Muster hat eine Form.** Wo das Projekt einen Helfer gebaut hat (`sendData`,
  `withTransaction`, `parseQuery`, `requireEntityAccount`), benutzen ihn alle Stellen — oder er ist
  falsch geschnitten und gehört weg.
- **Eine Datei hat eine Aufgabe.** Eine Datei, die Tabelle, Schema, Abfrage, Regel und Router in
  einem trägt, ist nicht zu lang, weil sie viele Zeilen hat, sondern weil sie fünf Gründe hat, sich
  zu ändern.
- **Was nicht mehr gebraucht wird, geht weg.** Ein exportierter Helfer ohne Aufrufer ist kein
  Vorrat, sondern eine Behauptung, die niemand prüft.
- **Was die Anwendung kann, muss die Oberfläche zeigen.** Ein Rechtemodell, das nur die API kennt,
  ist ein halbes Rechtemodell.

## 3 Methode

Gelesen wurde gebietsweise und vollständig: jede Datei der API, jede Datei des Web-Clients, die
Konfiguration und die CI. Wo ein Befund eine Zahl behauptet (sieben Kopien, fünfzehn Stellen,
35 Envelopes), ist sie ausgezählt und nicht geschätzt; die Kommandos dazu stehen im Befund oder
lassen sich aus der Fundstelle wiederholen. Vermutungen, die sich beim Nachsehen nicht hielten,
sind nicht aufgenommen — zwei Beispiele stehen in Abschnitt 6, damit niemand sie ein zweites Mal
prüft.

Nicht geprüft wurde, was das Sicherheits-Review bereits abgedeckt hat. Wo ein Code-Befund an einem
SEC-Befund hängt, ist das vermerkt: das sind die Stellen, an denen es sich lohnt, beide in einer
Scheibe zu erledigen.

## 4 Befunde

### Übersicht

| Nr | Gebiet | Befund | Aufwand | Risiko | Empfehlung |
| --- | --- | --- | --- | --- | --- |
| CR-01 | Geteilte Verträge | `packages/shared-types` ist seit Slice 1 leer | L | mittel | vor 1.0 |
| CR-02 | Geteilte Verträge | Zahlungsampel zweimal implementiert, mit abweichender Datumsrechnung | M | mittel | vor 1.0 |
| CR-03 | Geteilte Verträge | Status-Typen wörtlich doppelt | S | niedrig | vor 1.0 |
| CR-04 | Geteilte Verträge | `defaultAccount` doppelt | S | niedrig | nach 1.0 |
| CR-05 | Geteilte Verträge | Deutsche Formatierung doppelt, mit unterschiedlichem Leerverhalten | S | niedrig | nach 1.0 |
| CR-06 | Geteilte Verträge | `directPayment` verlässt die API als 0/1, die anderen Flags als boolean | S | niedrig | vor 1.0 |
| CR-07 | API-Querschnitt | Kontoskopierung siebenmal von Hand ausgeschrieben | M | mittel | vor 1.0 |
| CR-08 | API-Querschnitt | `requireEntityAccount` ist tot, fünfzehn Stellen schreiben ihn nach | M | niedrig | vor 1.0 |
| CR-09 | API-Querschnitt | Antwort-Envelope zwölfmal am Helfer vorbei | S | niedrig | vor 1.0 |
| CR-10 | API-Querschnitt | `withTransaction` existiert, drei Stellen rollen von Hand | S | niedrig | vor 1.0 |
| CR-11 | API-Querschnitt | Parameter mal geprüft, mal roh gelesen | S | niedrig | vor 1.0 |
| CR-12 | API-Querschnitt | API antwortet an drei Stellen deutsch statt englisch | S | niedrig | vor 1.0 |
| CR-13 | API-Querschnitt | `GROUP_CONCAT` ohne Längengrenze kürzt still | S | niedrig | vor 1.0 |
| CR-14 | API-Querschnitt | Suchtext maskiert `%` und `_` nicht | S | niedrig | nach 1.0 |
| CR-15 | API-Domäne | `invoices.ts` trägt fünf Rollen in 940 Zeilen | L | mittel | vor 1.0 |
| CR-16 | API-Domäne | Erstattungsplan fragt je Police fünfmal nach | M | niedrig | nach 1.0 |
| CR-17 | API-Domäne | Papierkorb-Liste fragt je Eintrag ein Dutzend Mal nach | M | niedrig | nach 1.0 |
| CR-18 | API-Domäne | Einfügen in Schleife, wo `batch` danebensteht | S | niedrig | nach 1.0 |
| CR-19 | API-Domäne | 32 `as`-Casts, weil Treiberzeilen untypisiert ankommen | M | mittel | nach 1.0 |
| CR-20 | API-Domäne | „account“ bezeichnet drei verschiedene Dinge | M | mittel | nach 1.0 |
| CR-21 | API-Domäne | ID-Muster erlaubt ein Zeichen, das der Generator nie erzeugt | S | niedrig | vor 1.0 |
| CR-22 | API-Domäne | Jahr im DELETE der Vertragsjahre ungeprüft | S | niedrig | nach 1.0 |
| CR-23 | API-Domäne | Eindeutigkeitsprüfung im PATCH außerhalb der Transaktion | S | niedrig | nach 1.0 |
| CR-24 | Web-Datenzugriff | Paralleler 401 löst mehrere Refreshes aus und wirft den Nutzer hinaus | M | mittel | **vor 1.0** |
| CR-25 | Web-Datenzugriff | 35 handgeschriebene Envelopes, fünfmal derselbe `unwrap` | S | niedrig | vor 1.0 |
| CR-26 | Web-Datenzugriff | Die Oberfläche kennt nur „Admin oder nicht“ | L | mittel | vor 1.0 |
| CR-27 | Web-Datenzugriff | Policen werden vollständig geladen und im Client gefiltert | S | niedrig | nach 1.0 |
| CR-28 | Web-Komponenten | `design-system/index.ts` ist tot | S | niedrig | vor 1.0 |
| CR-29 | Web-Komponenten | 17 Dialoge wiederholen denselben Vertrag von Hand | M | mittel | nach 1.0 |
| CR-30 | Web-Komponenten | Vier Ansichten über 750 Zeilen | L | mittel | nach 1.0 |
| CR-31 | Web-Komponenten | Composable-Dateinamen uneinheitlich | S | niedrig | nach 1.0 |
| CR-32 | Tests und CI | Keine Abdeckungsmessung, nirgends | M | niedrig | vor 1.0 |
| CR-33 | Tests und CI | Das Rechtemodell hat keinen eigenen Test | M | niedrig | vor 1.0 |
| CR-34 | Tests und CI | 17 der 43 Web-Tests prüfen nur Barrierefreiheit | L | niedrig | nach 1.0 |
| CR-35 | Tote Pfade | Zwei Demo-Endpunkte aus Slice 3 sind produktiv gemountet | S | niedrig | vor 1.0 |
| CR-36 | Tote Pfade | Exportierte Helfer ohne Aufrufer | S | niedrig | vor 1.0 |
| CR-37 | Betrieb | Migrationen laufen ohne Sperre | S | niedrig | nach 1.0 |

Aufwand: **S** unter zwei Stunden · **M** ein halber bis ganzer Tag · **L** ein bis zwei Tage.
Risiko ist das Risiko des Eingriffs, nicht das des heutigen Zustands.

### Gebiet A — Geteilte Verträge zwischen API und Web

#### CR-01 — `packages/shared-types` ist seit Slice 1 leer

**Befund.** Das Paket enthält sechs Zeilen: einen Kommentar, der die erste gemeinsame DTO
ankündigt, und `export type Placeholder = never`. Seitdem sind 50 Scheiben gebaut worden, und beide
Apps führen dieselben Verträge doppelt: die Status-Unions, die Fehlercodes, die Enum-Werte
(`ContractKind`, `BonusForfeitRule`), die Namen der Systemeinstellungen und rund zwanzig DTO-Formen,
die im Web als Interface nachgeschrieben sind, was die API als Zeile ausliefert.

**Fundstelle.** `packages/shared-types/src/index.ts` gegen `apps/web/src/invoices/api.ts`,
`apps/web/src/contracts/api.ts`, `apps/web/src/admin/api.ts`, `apps/web/src/trash/api.ts`,
`apps/web/src/invoices/status.ts`, `apps/web/src/lib/error-messages.ts`.

**Warum es zählt.** Der Compiler prüft heute keine einzige dieser Zusagen. Eine Spalte, die in der
API ihren Typ wechselt, fällt im Web erst zur Laufzeit auf — im besten Fall als Dash in einer
Tabelle, im schlechteren als falsch gerundeter Betrag. Der Code selbst weiß das: `reminders/payment.ts`
schreibt ausdrücklich, dass der einzige richtige Ort ein Paket wäre, das beide importieren, und dass
es das nicht gibt.

**Empfehlung.** Das Paket aufsetzen (Build-Reihenfolge, Vite-Alias, Produktionsimage) und zuerst nur
das hineinlegen, was auseinanderlaufen *kann*: die Status-Unions, die Fehlercode-Konstante, die
Enum-Werte, die Settings-Schlüssel. Die vollständigen DTOs können danach Stück für Stück folgen —
sie sind viel Arbeit und wenig Risiko, also gutes Material für „nach 1.0“. CR-02 bis CR-05 hängen an
dieser Scheibe und sollten ihr folgen, nicht vorausgehen.

**Aufwand** L · **Risiko** mittel (Build-Kette und Image sind betroffen) · **Empfehlung** vor 1.0

#### CR-02 — Die Zahlungsampel ist zweimal implementiert, mit abweichender Datumsrechnung

**Befund.** `calcPaymentState` und die Schwelle `DUE_SOON_DAYS = 10` stehen in
`apps/api/src/reminders/payment.ts` und in `apps/web/src/invoices/payment.ts`. Die Regel ist dieselbe
und ausdrücklich als Zwilling dokumentiert („Change one, change the other“). Die Datumsrechnung ist
es nicht: die API vergleicht Kalendertage als UTC-Zeitstempel aus `YYYY-MM-DD`-Zeichenketten, das Web
parst dieselbe Zeichenkette zu einem `Date` (das ist UTC-Mitternacht) und schneidet es dann in
**lokaler** Zeit auf den Tagesanfang.

**Fundstelle.** `apps/api/src/reminders/payment.ts` (`daysUntil`, `calcPaymentState`) gegen
`apps/web/src/invoices/payment.ts` (`startOfDay`, `daysUntil`, `calcPaymentState`).

**Warum es zählt.** In einer Zone östlich von UTC — Europe/Berlin, also der einzige Betriebsfall —
fällt beides zusammen, und heute stimmt die Ampel mit der Mail überein. Westlich von UTC nicht: dort
liegt `new Date('2026-03-01')` lokal noch am 28. Februar, und die Ampel steht einen Tag zu früh auf
Rot, während die Erinnerung noch schweigt. Das ist kein Fehler, den jemand heute sieht, aber es ist
genau die Klasse von Abweichung, für die zwei Implementierungen derselben Regel da sind.

**Empfehlung.** Mit CR-01 in das geteilte Paket, die API-Fassung als die richtige nehmen (sie rechnet
zonenfest) und im Web nur noch das „heute“ hineinreichen. Die Anzeigeteile (`PAYMENT_DISPLAY`,
`PAYMENT_COLOR_VAR`) bleiben, wo sie sind — die gehören der Oberfläche.

**Aufwand** M · **Risiko** mittel (die Ampel ist überall sichtbar) · **Empfehlung** vor 1.0

#### CR-03 — Die Status-Typen stehen wörtlich doppelt

**Befund.** `WorkflowStatus` und `SubmissionStatus` sind in
`apps/api/src/domain/invoice-status.ts:9-10` und `apps/web/src/invoices/status.ts:11-12` zeichengleich
noch einmal geschrieben, bis in den Zeilenumbruch hinein. Dasselbe gilt für `STATUS_FILTERS` (API)
gegen die Filterwerte der Rechnungsliste und für `ContractKind`/`BonusForfeitRule` in
`apps/web/src/contracts/api.ts:3-4`.

**Warum es zählt.** Ein sechster Status — und die Leiter ist in diesem Projekt schon zweimal
gewachsen — wird an zwei Orten gepflegt. Fällt einer aus, rendert das Web `undefined` als Badge-Ton,
weil `STATUS_DISPLAY` den Schlüssel nicht kennt.

**Empfehlung.** Erster Inhalt des geteilten Pakets (CR-01); die Anzeigetabellen bleiben im Web.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-04 — `defaultAccount` steht zweimal

**Befund.** Dieselbe Funktion, derselbe Kommentar, zwei Dateien:
`apps/api/src/domain/agency-accounts.ts` und `apps/web/src/agencies/accounts.ts`, jeweils
`defaultAccount`. Beide
nennen einander „the twin of“.

**Warum es zählt.** Der Inhalt ist heute eine Zeile (`accounts[0] ?? null`), also kostet die Dopplung
wenig. Sie steht hier, weil sie die Regel benennt, welches Konto vorgeschlagen wird — und diese Regel
hat sich in Slice 44 schon einmal geändert, von einer Gültigkeitshistorie zu „das erste“.

**Empfehlung.** Mit CR-01 in das geteilte Paket.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

#### CR-05 — Deutsche Formatierung steht doppelt, mit unterschiedlichem Leerverhalten

**Befund.** `germanDate` und `germanMoney` in `apps/api/src/lib/german.ts` gegen `germanDate` und
`euro` in `apps/web/src/lib/format.ts`. Die API-Fassung von `germanDate` prüft ihre Eingabe nicht:
`germanDate('')` liefert `undefined.undefined.undefined`. Erreichbar ist das über
`domain/trash-registry.ts`, wo `germanDate(text(row.birthDate))` steht und `text()` ausdrücklich
`''` für NULL liefert — ein Versicherter ohne Geburtsdatum kann in der Datenbank allerdings nicht
stehen (NOT NULL), die Zeile ist also heute unerreichbar.

**Fundstelle.** `apps/api/src/lib/german.ts` (`germanMoney`, `germanDate`),
`apps/web/src/lib/format.ts` (`euro`, `germanDate`),
`apps/api/src/domain/trash-registry.ts` (Eintrag `account`, `describe`).

**Empfehlung.** Mit CR-01 zusammenlegen und dabei die Web-Fassung nehmen, die den Dash kennt.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

#### CR-06 — `directPayment` verlässt die API als 0/1, die anderen beiden Flags als boolean

**Befund.** `present()` in `domain/invoices.ts:359-364` wandelt `reimbursementClosed` und
`notCovered` in `Boolean`, lässt `directPayment` aber als TINYINT stehen. Das Web schreibt deshalb
`directPayment: number` in seine DTO und vergleicht an drei Stellen gegen `=== 1`.

**Fundstelle.** `apps/api/src/domain/invoices.ts:359-364`, `apps/web/src/invoices/api.ts:62`,
`apps/web/src/invoices/PaymentInfoPopover.vue:128`, `apps/web/src/invoices/InvoiceFormDialog.vue:141`,
`apps/web/src/invoices/payment.ts:51`.

**Warum es zählt.** Drei Flags derselben Zeile, zwei Darstellungen. Wer die dritte wie die ersten
beiden behandelt und `if (invoice.directPayment)` schreibt, bekommt zufällig das Richtige heraus —
bis jemand die Spalte einmal als `null` ausliefert. Und in den Testfixtures steht `directPayment: 0`
neben `notCovered: false`, was die Uneinheitlichkeit weiterträgt.

**Empfehlung.** In `present()` mit umwandeln, die DTO auf `boolean` ziehen, die `=== 1`-Vergleiche
entfernen. Eine halbe Stunde, und sie gehört vor die DTO-Vereinheitlichung aus CR-01, nicht danach.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

### Gebiet B — API: Querschnitt der Routen

#### CR-07 — Die Kontoskopierung ist siebenmal von Hand ausgeschrieben

**Befund.** Sieben Listen-Endpunkte lösen dieselbe Frage — „welche Konten darf dieser Nutzer hier
sehen?“ — mit demselben zwölf- bis zwanzigzeiligen Block: `getAccessibleAccounts`, dann `scope.all`
abfangen, dann die leere Liste abfangen, dann eine `IN (?, ?, …)`-Klausel bauen.

**Fundstelle.** `domain/invoices.ts:669` und `:743`, `domain/submissions.ts:197`,
`domain/allocations.ts:274`, `domain/service-billings.ts:143`, `domain/contracts.ts:88`,
`domain/accounts.ts:56`.

**Warum es zählt.** Das ist die Kontotrennung — die Regel, an der das ganze Rechtemodell hängt. Sie
siebenmal hinzuschreiben heißt, sie siebenmal richtig hinschreiben zu müssen, und die Fassungen sind
bereits leicht verschieden (`accounts.ts` baut einen `Filter` für `listRows`, `contracts.ts` hängt an
ein fertiges SELECT an, `invoices.ts` schiebt in ein `where`-Array). Der Papierkorb-Befund des
Sicherheits-Reviews (SEC-04) ist genau die achte Stelle, an der der Block **fehlt**.

**Empfehlung.** Ein Helfer neben `getAccessibleAccounts`, der entweder `null` („darf alles“), eine
`{ clause, params }`-Filterform oder „darf nichts“ zurückgibt, und die sieben Stellen darauf ziehen.
Gehört in dieselbe Scheibe wie SEC-04, weil die dort fällige Entscheidung — filtern oder
instanzweit — hier ihren Ort bekommt.

**Aufwand** M · **Risiko** mittel (jede Änderung daran ist eine Änderung an der Sichtbarkeit) ·
**Empfehlung** vor 1.0

#### CR-08 — `requireEntityAccount` ist toter Code, fünfzehn Stellen schreiben ihn nach

**Befund.** `domain/workflow-access.ts:76-86` bietet genau die drei Schritte an, die jeder
Einzelsatz-Endpunkt braucht: Konto auflösen, 404 wenn es keines gibt, Recht darauf prüfen. Kein
einziger Aufrufer. Stattdessen stehen die drei Zeilen fünfzehnmal von Hand da.

**Fundstelle.** Der Helfer: `domain/workflow-access.ts:76`. Die Nachbauten:
`domain/invoices.ts:809, 870, 875, 918, 932`, `domain/service-billings.ts:137, 219, 228, 248, 264`,
`domain/submissions.ts:134, 232, 278`, `domain/allocations.ts` (zweimal über das lokale
`accountForAllocation`).

**Warum es zählt.** Ein exportierter Helfer ohne Aufrufer sieht aus wie eine Zusage und ist keine.
Und die Nachbauten sind nicht identisch: mal heißt die Ressource im 404 `'Invoice'`, mal
`'Service billing'`, mal `'Submission'` — richtig, aber von Hand richtig.

**Empfehlung.** Entweder die fünfzehn Stellen auf den Helfer ziehen (dann trägt er den
Ressourcennamen als Parameter), oder ihn löschen. Das Erste ist besser: es macht die Reihenfolge
„404 vor 403“ zu einer Eigenschaft des Helfers statt zu einer Gewohnheit. `accountForAllocation`
(`domain/allocations.ts:325`) wandert bei der Gelegenheit zu seinen Geschwistern in
`workflow-access.ts`.

**Aufwand** M · **Risiko** niedrig (rein mechanisch, durch die Integrationstests gedeckt) ·
**Empfehlung** vor 1.0

#### CR-09 — Der Antwort-Envelope wird zwölfmal am Helfer vorbei geschrieben

**Befund.** `crud/envelope.ts` sagt: „Every successful response carries its payload under a `data`
key“. Sechzehn Dateien halten sich daran. Zwölf Antworten tun es nicht: `auth/admin-routes.ts`
schreibt sechsmal `res.json({ data: … })` von Hand, `auth/routes.ts` antwortet sechsmal ganz ohne
Envelope (`{ accessToken, user }`, `{ user, permissions, setupTokenActive }`, `{ ok: true }`), und
`routes/version.ts` antwortet `{ version, environment }`.

**Fundstelle.** `apps/api/src/auth/admin-routes.ts`, `apps/api/src/auth/routes.ts`,
`apps/api/src/routes/version.ts` gegen `apps/api/src/crud/envelope.ts`.

**Warum es zählt.** Für `/version` und die Auth-Antworten ist es eine bewusste Ausnahme (die Version
ist der Health-Check, die Session-Antwort ist kein Datensatz) — nur steht das nirgends, und der
Client muss beide Formen kennen. Für die Nutzerverwaltung ist es schlicht der Helfer, den niemand
importiert hat.

**Empfehlung.** `admin-routes.ts` auf `sendData` ziehen. Für `/version`, `/auth/*` und `/me` die
Ausnahme im Kommentar von `envelope.ts` benennen, statt sie zu dulden. Danach gilt: wer `res.json`
schreibt, tut es mit Begründung.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-10 — `withTransaction` existiert, drei Stellen rollen die Transaktion von Hand

**Befund.** `db/transaction.ts` kapselt `getConnection`/`begin`/`commit`/`rollback`/`release`. Neun
Stellen benutzen es. Drei nicht: das Anlegen einer Einreichung, das Löschen einer
Leistungsabrechnung und das Anlegen einer Police.

**Fundstelle.** `domain/submissions.ts:138`, `domain/service-billings.ts:276`, `domain/contracts.ts:140` — jeweils der
`const conn = await pool.getConnection()`-Block.

**Warum es zählt.** In `submissions.ts` liegt das `sendData(…)` **innerhalb** des `try`-Blocks, nach
dem `commit()`. Wirft das Schreiben der Antwort — heute praktisch ausgeschlossen, aber die Form ist
falsch —, läuft ein `rollback()` auf einer bereits bestätigten Transaktion. Der Helfer hat dieses
Problem nicht, weil er nur das Fachliche einschließt.

**Empfehlung.** Die drei Stellen auf `withTransaction` ziehen, die Antwort nach außen. Danach gibt es
im Projekt genau einen Weg, eine Transaktion zu führen.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-11 — Parameter werden mal geprüft, mal roh gelesen

**Befund.** Das Projekt hat `parseQuery` (zod über `req.query`, mit einer 400, die den Parameter
benennt) und `pathParam`. Vier Endpunkte lesen trotzdem roh:

- `domain/invoices.ts:735` — `typeof req.query.accountUID === 'string'` statt `listQuery`;
- `domain/allocations.ts:261-273` — `req.query.invoiceUID` und `req.query.billingUID` ungeprüft, ohne
  Formatprüfung und ohne Obergrenze auf der Liste;
- `domain/reimbursement-plan.ts:71-77` — `req.query.year` von Hand nach `Number` und in drei Zeilen
  geprüft, was ein `z.coerce.number().int().min(1900).max(2999)` wäre;
- `auth/admin-routes.ts` — `req.params.uuid` durchgehend roh statt über `pathParam`, und ohne
  UUID-Prüfung.

**Warum es zählt.** Kein Loch: alle vier landen als gebundener Parameter in der Abfrage. Aber die
Fehlermeldung ist eine andere (generisch statt benannt), und `allocations.ts` liefert damit den
einzigen Listen-Endpunkt ohne `limit`.

**Empfehlung.** Die vier auf `parseQuery`/`pathParam` ziehen; bei `allocations` ein `limit` mit
aufnehmen. Ergänzt SEC-11 (unbegrenzte Listen), das aus derselben Richtung kommt.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-12 — Die API antwortet an drei Stellen deutsch, obwohl sie englisch antworten soll

**Befund.** `lib/error-codes.ts` legt den Vertrag fest: die API antwortet englisch (für Clients und
Logs), das Web übersetzt über den Code. Drei Stellen halten sich nicht daran:
`settings/routes.ts:128` („Zahlungserinnerungen sind ausgeschaltet.“),
`settings/routes.ts:135` („Der E-Mail-Versand ist ausgeschaltet oder unvollständig eingerichtet.“)
und sämtliche `reason`-Texte in `mail/mailer.ts:95-110`.

**Warum es zählt.** Es ist nicht nur Stilbruch, es hat eine Folge: `REMINDERS_DISABLED` ist der
einzige der 51 Fehlercodes, für den `apps/web/src/lib/error-messages.ts` keinen deutschen Satz hat —
weil der Satz ja schon deutsch ankam. Der Nutzer sieht deshalb heute „Die Aktion ist
fehlgeschlagen.“, und auf der Konsole landet „Untranslated API error“. Ausgezählt: 51 Codes in der
API, 50 übersetzt, `VALIDATION_ERROR` geht seinen eigenen Weg über `describeIssue`.

**Empfehlung.** Die drei Stellen auf englische Meldungen ziehen und `REMINDERS_DISABLED` in
`error-messages.ts` nachtragen. Eine Viertelstunde, und der Vertrag stimmt wieder.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-13 — `GROUP_CONCAT` ohne Längengrenze kürzt still

**Befund.** Zwei Listen fassen Kindzeilen mit `GROUP_CONCAT` zusammen, ohne
`group_concat_max_len` zu setzen: die Einreichungsliste (`si.invoiceUID`) und die Liste der
Leistungsabrechnungen (`inv.invoiceNumber`). Der MariaDB-Standard ist 1024 Byte; die IDs sind
12 Zeichen plus Trennzeichen.

**Fundstelle.** `domain/submissions.ts:211`, `domain/service-billings.ts:201`.

**Warum es zählt.** Ab etwa 78 Rechnungen in einer Einreichung fällt der Rest der Liste stillschweigend
weg — keine Warnung, kein Fehler, nur eine kürzere Liste. Bei den Rechnungsnummern der
Leistungsabrechnung hängt die Grenze an deren Länge und liegt eher niedriger. Ein Haushalt erreicht
das nicht so schnell, aber „so schnell nicht“ ist kein Verlass, und der Fehler ist von außen nicht
erkennbar.

**Empfehlung.** Bei den Einreichungen die Rechnungs-IDs als zweite Abfrage holen (wie es die
Detailroute schon tut) — das macht die Grenze gegenstandslos. Bei den Rechnungsnummern der Abrechnung
reicht ein `SEPARATOR` mit gesetztem `group_concat_max_len` auf der Sitzung, oder dieselbe zweite
Abfrage.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-14 — Der Suchtext maskiert `%` und `_` nicht

**Befund.** Alle Freitextsuchen bauen `%${q}%` und geben das an `LIKE`. Wer `%` eingibt, findet
alles; wer `_` eingibt, findet jeden Einzelzeichen-Treffer. Zusätzlich hat `q` in der
Abrechnungssuche keine Längengrenze, während dasselbe Feld in der Rechnungssuche auf 50 Zeichen
begrenzt ist.

**Fundstelle.** `domain/invoices.ts:686-687`, `domain/service-billings.ts:157-166` (dort viermal
dasselbe `like`), `listQuery` in beiden Dateien.

**Warum es zählt.** Kein Sicherheitsproblem (der Wert ist gebunden), sondern ein leises
Verhaltensrätsel: die Suche nach einer Rechnungsnummer mit Unterstrich findet zu viel.

**Empfehlung.** Einen kleinen Helfer `likeTerm(q)`, der `\`, `%` und `_` maskiert, und `q` in beiden
Schemata gleich begrenzen.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

### Gebiet C — API: Domäne und Datenzugriff

#### CR-15 — `invoices.ts` trägt fünf Rollen in 940 Zeilen

**Befund.** Die Datei ist die größte Quelldatei des Projekts (ohne Tests) und enthält: die
Tabellenbeschreibung, sämtliche zod-Schemata, die Abfrage- und Präsentationsschicht (`queryInvoices`,
`present`, `byInvoice`, `byInvoicePolicy`), fünf Fachregeln als reine Funktionen (`nextTreatmentDays`,
`nextNotCovered`, `nextPaymentDates`, `nextAgencyAccount`, `assertOneYear`) und den Router mit sieben
Endpunkten.

**Fundstelle.** `apps/api/src/domain/invoices.ts` (940 Zeilen).

**Warum es zählt.** Die Regelfunktionen sind das Wertvollste in der Datei — sie sind rein, sie tragen
die längsten Kommentare, sie sind die Stellen, an denen sich das Fach ändert. Und sie haben keinen
einzigen Unit-Test, weil man an sie nur über den Router und eine laufende Datenbank herankommt
(vgl. CR-34). Die anderen Domänendateien zeigen, dass es auch anders geht: `invoice-status.ts` und
`bonus-timeline.ts` sind rein und einzeln getestet.

**Empfehlung.** Drei Dateien statt einer, ohne Verhaltensänderung:
`invoices/rules.ts` (die fünf `next*`/`assert*`-Funktionen, dann sofort unit-testbar),
`invoices/queries.ts` (`queryInvoices`, `present`, die Row-Typen),
`invoices.ts` (Schemata und Router). Danach ist die Frage „wo steht die Regel für den Direktkauf“
mit einem Dateinamen beantwortet.

**Aufwand** L · **Risiko** mittel (viel Bewegung, aber durch die Workflow-Integrationstests gedeckt) ·
**Empfehlung** vor 1.0 — und zwar **vor** den SEC-Scheiben, die dieselbe Datei anfassen (SEC-01
`documentLink`, SEC-11 Obergrenzen).

#### CR-16 — Der Erstattungsplan fragt je Police fünfmal nach

**Befund.** `createReimbursementPlanRouter` läuft in einer `for`-Schleife über die Policen des Kontos
und stellt je Police fünf Abfragen nacheinander: `termsForYear` (1) und `loadBonusTimeline`
(Ansprüche, Jahresdatensätze, Konditionen, Bonusstufen = 4). Bei drei Policen sind das
15 Rundreisen zusätzlich zu den vier Abfragen des Rahmens, alle streng sequenziell.

**Fundstelle.** `apps/api/src/domain/reimbursement-plan.ts`, Schleife über `contracts`.

**Warum es zählt.** Der Endpunkt hängt an jedem Öffnen des Rechnungs-Arbeitsbereichs und an jedem
Wechsel des Jahres. Bei drei Policen und einer lokalen Datenbank ist das unauffällig; es ist trotzdem
die einzige Stelle im Projekt, an der die Abfragezahl mit den Daten wächst statt fest zu sein.

**Empfehlung.** Die drei Listen (`ContractYears`, Ansprüche, Konditionen samt Stufen) einmal für alle
Policen des Kontos holen und im Speicher gruppieren — dieselbe Technik, die `present()` in
`invoices.ts` bereits vorführt. `loadBonusTimeline` bekommt dafür eine Variante, die ihre Zeilen
gereicht bekommt statt sie zu holen.

**Aufwand** M · **Risiko** niedrig (die Bonus-Berechnung selbst bleibt unangetastet und ist getestet) ·
**Empfehlung** nach 1.0

#### CR-17 — Die Papierkorb-Liste fragt je Eintrag ein Dutzend Mal nach

**Befund.** `listTrash` läuft über die zwölf Entitätsarten, holt je Art alle gelöschten Zeilen und
stellt dann **je Eintrag**: `deletedDescendants` (rekursiv, eine Abfrage je Fremdschlüssel je Ebene),
dasselbe noch einmal für den Löschstapel, und `attachedRows` (eine Zählabfrage je verweisender
Link-Tabelle).

**Fundstelle.** `apps/api/src/domain/trash.ts`, `listTrash` mit `deletedDescendants` und
`attachedRows`.

**Warum es zählt.** Für eine Rechnung sind das rund zehn Abfragen; ein Papierkorb mit fünfzig
Einträgen kostet damit mehrere hundert Rundreisen für eine Seite. Die Fremdschlüssel selbst sind
gecacht (`trash-references.ts`), die Zählungen nicht. Heute ist der Papierkorb klein — mit der
Aufbewahrungsfrist aus SEC-15 wird er es planmäßig nicht bleiben.

**Empfehlung.** Je Entitätsart eine Abfrage über alle Einträge statt je Eintrag eine (`IN (…)` über
die UIDs, danach gruppieren). Gehört sinnvollerweise in dieselbe Scheibe wie SEC-15, weil die dort
eingeführte Frist die Liste erst lang macht.

**Aufwand** M · **Risiko** niedrig · **Empfehlung** nach 1.0

#### CR-18 — Eingefügt wird in einer Schleife, obwohl `batch` danebensteht

**Befund.** `createAllocationsForBilling` fügt die gebuchten Erstattungen einzeln ein
(`for (const entry of entries) … insertRow`), `replaceBonusTiers` die Stufen der Bonus-Staffel
ebenso. Im selben Projekt benutzt `submissions.ts` für genau diesen Fall `conn.batch(…)`, und
`reminders/store.ts` baut die Mehrfach-`VALUES`-Liste von Hand.

**Fundstelle.** `apps/api/src/domain/allocations.ts` (`createAllocationsForBilling`),
`apps/api/src/domain/contract-history.ts` (`replaceBonusTiers`).

**Warum es zählt.** Drei Schreibweisen für dieselbe Aufgabe, und die langsamste sitzt dort, wo eine
Leistungsabrechnung mit dreißig Rechnungen dreißig Rundreisen unter Sperren kostet. Hängt an SEC-11,
das für dieselben Listen eine Obergrenze fordert.

**Empfehlung.** Auf `conn.batch` vereinheitlichen; mit SEC-11 zusammen erledigen.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

#### CR-19 — 32 `as`-Casts, weil die Treiberzeilen untypisiert ankommen

**Befund.** Der Treiber liefert `Record<string, unknown>`, und der Code holt sich die Typen mit
Zusicherungen zurück: 32 `as Typ`-Stellen in der API (ohne Tests). Die schärfste ist
`contract-years.ts`: `(await listTermsWithValidity(db, contract)) as unknown as BonusTerms[]` — ein
doppelter Cast, also die ausdrückliche Feststellung, dass die beiden Typen nichts miteinander zu tun
haben. Häufig sind außerdem `(await getInvoice(pool, uid)) as InvoiceRow` nach einem Schreibvorgang
und `String(row.contractUID)` als Ersatz für eine Typaussage.

**Fundstelle.** Zählung: `grep -rn " as [A-Z]" apps/api/src --include='*.ts' | grep -v test`.
Beispiele: `domain/contract-years.ts` (`listTermsWithValidity`), `domain/invoices.ts` (POST/PATCH),
`domain/contract-access.ts` (`getRow … as ContractRow`).

**Warum es zählt.** Jeder Cast ist eine Prüfung, die der Compiler nicht mehr macht. Die Zahl ist für
42 000 Zeilen nicht hoch, und die meisten sind harmlos — aber der doppelte Cast in
`contract-years.ts` ist die Stelle, an der eine Umbenennung in `listTermsWithValidity` lautlos die
Bonus-Berechnung falsch füttern würde.

**Empfehlung.** Keine große Typisierungsoffensive. Zwei gezielte Schritte: `listTermsWithValidity`
einen echten Rückgabetyp geben, der `BonusTerms` erfüllt (dann fällt der doppelte Cast weg), und für
die häufigste Form einen kleinen Helfer `rowAs<T>(row)` mit einer Stelle, an der die Annahme
dokumentiert ist.

**Aufwand** M · **Risiko** mittel (Typänderungen ziehen Kreise) · **Empfehlung** nach 1.0

#### CR-20 — „account“ bezeichnet drei verschiedene Dinge

**Befund.** Im Code heißt `account` (a) der Versicherte (`Accounts`, `accountUID`), (b) die
Kontoverbindung eines Abrechnungsdienstleisters (`AgencyBankAccounts`, `agencyAccountUID`) und (c) in
der Nutzerverwaltung das Benutzerkonto („This action is not possible on your own account“). Zwei
Module exportieren beide ein `accountsTable`, weshalb der Papierkorb eines davon beim Import
umbenennen muss: `import { accountsTable as agencyAccountsTable } from './agency-accounts.js'`.
Dazu gibt es zwei Funktionen `accountForInvoice` mit verschiedener Bedeutung — in
`workflow-access.ts` liefert sie den Versicherten, in `apps/web/src/agencies/accounts.ts` die
Bankverbindung.

**Fundstelle.** `apps/api/src/domain/accounts.ts` gegen `apps/api/src/domain/agency-accounts.ts`,
`apps/api/src/domain/trash-registry.ts:6` (die umbenennende Import-Zeile),
`apps/api/src/domain/workflow-access.ts` gegen `apps/web/src/agencies/accounts.ts`.

**Warum es zählt.** Es hat noch zu keinem Fehler geführt, aber es ist die Sorte Uneindeutigkeit, die
beim Lesen Zeit kostet und bei einer Umbenennung durch die Suchfunktion gefährlich wird.

**Empfehlung.** Die Bankverbindung durchgängig `bankAccount` nennen: `bankAccountsTable`,
`listBankAccounts`, `defaultBankAccount`. Rein innerhalb des Codes — die Spaltennamen der Datenbank
und die API-Felder bleiben, wie sie sind, sonst wird daraus eine Migration.

**Aufwand** M · **Risiko** mittel (viele Berührungspunkte, aber alle mechanisch) ·
**Empfehlung** nach 1.0

#### CR-21 — Das ID-Muster erlaubt ein Zeichen, das der Generator nie erzeugt

**Befund.** `ID_ALPHABET` lässt `0`, `O`, `1`, `I` und `l` bewusst weg — „safe to read aloud“. Das
Prüfmuster `entityIdPattern` erlaubt aber `[2-9A-HJ-NP-Za-z]{11}`, und `a-z` schließt `l` mit ein.
Eine ID mit `l` würde also jede Validierung passieren, obwohl sie nie vergeben wird.

**Fundstelle.** `apps/api/src/lib/ids.ts` (`ID_ALPHABET` gegen `entityIdPattern`).

**Warum es zählt.** Kein Loch (IDs werden exakt verglichen), aber die Doku sagt etwas anderes als der
Code, und das Muster ist genau dafür da, das Alphabet durchzusetzen.

**Empfehlung.** Das Muster aus dem Alphabet ableiten statt es danebenzuschreiben, oder `a-km-z`
schreiben. Fünf Minuten, und die Zusage stimmt.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-22 — Das Jahr im DELETE der Vertragsjahre ist ungeprüft

**Befund.** `PUT /contracts/:uid/years/:year` prüft das Jahr über `assertYearWithinContract`, das
auch `NaN` abfängt. `DELETE /contracts/:uid/years/:year` prüft gar nicht und gibt
`Number(pathParam(…))` direkt in die Abfrage — bei `/years/abc` also `NaN`, was nichts löscht und
trotzdem 204 antwortet.

**Fundstelle.** `apps/api/src/domain/contract-years.ts`, die beiden Routen.

**Empfehlung.** Dieselbe Prüfung auch im DELETE, oder das Jahr in beiden über ein zod-Schema aus dem
Pfad ziehen (vgl. CR-11).

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

#### CR-23 — Die Eindeutigkeitsprüfung im PATCH läuft außerhalb der Transaktion

**Befund.** Beim Anlegen eines Beitragsstands oder einer Konditionen-Zeile läuft
`assertValidityFree` innerhalb der Transaktion (über `insertHistoryEntry`). Beim Ändern läuft sie
davor, gegen den Pool, und die Transaktion beginnt erst danach.

**Fundstelle.** `apps/api/src/domain/contract-history.ts`, `createHistoryRouter`, PATCH-Route.

**Warum es zählt.** Zwei gleichzeitige Änderungen könnten beide die Prüfung bestehen und danach
dasselbe Gültigkeitsdatum schreiben. Ein UNIQUE-Index fängt das nicht ab — es gibt keinen, die Regel
lebt allein in dieser Prüfung. In einem Haushalt mit einem Bearbeiter ist das theoretisch; die
Asymmetrie zur POST-Route ist es nicht.

**Empfehlung.** Die Prüfung in die Transaktion ziehen (eine Zeile verschieben). Wer es gründlich will,
setzt zusätzlich den UNIQUE-Index auf `(contractUID, validFrom)` bzw. `(contractUID, validFromYear)`
für die aktiven Zeilen — das ist allerdings eine Migration und deshalb eine eigene Entscheidung.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

### Gebiet D — Web: Datenzugriff und Zustand

#### CR-24 — Ein paralleler 401 löst mehrere Refreshes aus und wirft den Nutzer hinaus

**Befund.** `apiFetch` fängt eine 401 ab, ruft `auth.tryRefresh()` und wiederholt die Anfrage. Es
gibt keinen Single-Flight: laufen mehrere Anfragen gleichzeitig und ist der Zugriffstoken abgelaufen,
ruft **jede** von ihnen `tryRefresh()`. Der Refresh rotiert serverseitig und widerruft den
vorgezeigten Token sofort (`auth/service.ts`, `refresh`) — der erste Aufruf gewinnt, die übrigen
zeigen einen bereits widerrufenen Token vor, bekommen 401, und `tryRefresh()` ruft in seinem
`catch`-Zweig `clear()`. Damit ist die gerade erneuerte Sitzung im Client gelöscht und der Nutzer
landet auf der Anmeldeseite.

**Fundstelle.** `apps/web/src/lib/api.ts` (`apiFetch`) und `apps/web/src/stores/auth.ts`
(`tryRefresh`, ohne gemerkte laufende Anfrage). Parallele Aufrufe gibt es an fünf Stellen:
`invoices/InvoicePickerView.vue:243`, `invoices/BillingPickerView.vue:33`,
`invoices/ObjectionDialog.vue:55`, `components/resource/ResourceView.vue:66`,
`invoices/InvoiceWorkspaceView.vue:500`.

**Warum es zählt.** Das ist der einzige Befund dieses Reviews, den ein Nutzer als Fehler erlebt: nach
15 Minuten Pause (der Zugriffstoken lebt so lange) eine Seite öffnen, die zwei Listen gleichzeitig
lädt, und mit etwas Pech wieder bei der Anmeldung stehen — ohne erkennbaren Grund, und der Zustand
der Seite ist weg. Es verschärft sich mit SEC-07: sobald die Wiederverwendung eines Refresh-Tokens
die ganze Token-Kette fallen lässt, macht der eigene Client genau das, was dort als Diebstahl
gewertet wird, und meldet den Nutzer auf allen Geräten ab.

**Empfehlung.** Single-Flight im Store: die laufende Refresh-Zusage in einem `ref` halten und jedem
weiteren Aufrufer dieselbe zurückgeben, statt eine zweite zu starten. Zehn Zeilen, und sie gehören
**vor** die SEC-07-Scheibe — sonst baut die einen Alarm auf ein Verhalten, das der eigene Client
auslöst.

**Aufwand** M (die Zeilen sind wenige, der Test dafür ist die Arbeit) · **Risiko** mittel (betrifft
jede Anfrage) · **Empfehlung** vor 1.0

#### CR-25 — 35 handgeschriebene Envelopes und fünfmal derselbe `unwrap`

**Befund.** `apiFetch<T>` liefert die Antwort samt Hülle, also schreibt jeder Aufrufer die Hülle in
seinen Typ: 35-mal `apiFetch<{ data: … }>`. Und weil das lästig ist, steht in fünf Modulen dieselbe
Zeile: `const unwrap = <T>(res: { data: T }): T => res.data;`.

**Fundstelle.** Die fünf Kopien: `agencies/api.ts:35`, `admin/api.ts:21`, `invoices/api.ts:182`,
`contracts/api.ts:97`, `admin/settings-api.ts:49`. Die 35 Hüllen verteilen sich auf zehn Dateien
(`grep -rn "apiFetch<{ data" apps/web/src`). `lib/resource.ts` macht dasselbe noch einmal in seinen
vier CRUD-Helfern.

**Warum es zählt.** Kein Fehler, nur Reibung — und eine Stelle, an der ein `data`, das einmal anders
heißt, an 35 Orten nachgezogen werden müsste.

**Empfehlung.** Ein `apiData<T>(path, options)` neben `apiFetch`, das auspackt. Danach verschwinden
die fünf `unwrap` und die meisten der 35 Hüllen; `apiFetch` bleibt für die Antworten ohne Envelope
(Auth, Version — siehe CR-09).

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-26 — Die Oberfläche kennt nur „Admin oder nicht“

**Befund.** Die API hat zwölf Rechte, global oder je Versichertem vergebbar. Der Client wertet davon
genau eines aus: `isAdmin = hasGlobalPermission('MANAGE_USERS')`. Daran hängen der gesamte
System-Bereich der Navigation und die Routen-Wache (`requiresAdmin`). Kein einziger Knopf, kein
einziges Formular prüft ein Recht — die Suche nach `MANAGE_`/`VIEW_` im Web findet außerhalb des
Auth-Stores nur Anzeigetexte der Rollenübersicht.

**Fundstelle.** `apps/web/src/stores/auth.ts` (`hasGlobalPermission`, `isAdmin`),
`apps/web/src/router/index.ts` (`requiresAdmin`), `apps/web/src/components/layout/AppSidebar.vue:45`.

**Warum es zählt.** Zwei Folgen, beide real:

1. **Zu wenig Zugang.** Papierkorb und Systemeinstellungen hängen an `MANAGE_TRASH` bzw.
   `MANAGE_SETTINGS`, die Oberfläche zeigt sie aber nur bei `MANAGE_USERS`. Wer eine Rolle bekommt,
   die den Papierkorb darf, sieht ihn trotzdem nicht — das Recht ist vergeben und wirkungslos.
2. **Zu viel Angebot.** Ein Nutzer mit reinem Leserecht sieht „Neue Rechnung“, „Löschen“,
   „Einreichen“ und erfährt erst nach dem Absenden „Dazu fehlt dir die Berechtigung“. Die API hält
   dicht — die Oberfläche lügt.

Das ist die größte fehlende Funktion, die dieses Review gefunden hat. Sie fällt heute nicht auf, weil
die Instanz so gut wie nur Administratoren kennt; sie fällt in dem Moment auf, in dem zum ersten Mal
jemand mit eingeschränkten Rechten angelegt wird — und genau dafür ist das Rechtemodell gebaut.

**Empfehlung.** Im Auth-Store ein `can(permission, accountUID?)`, das globale *und* kontobezogene
Grants auswertet (die Daten liegen bereits in `permissions.perAccount`). Danach: `requiresAdmin` in
der Route durch das jeweils richtige Recht ersetzen, die Navigation daran hängen, und die Aktionen
der Listen und Dialoge deaktivieren statt anzubieten. Als eine Scheibe planbar, aber breit — sie
berührt jede Ansicht.

**Aufwand** L · **Risiko** mittel (sichtbar überall; ein zu strenges `can` sperrt den Autor aus) ·
**Empfehlung** vor 1.0

#### CR-27 — Die Policen werden vollständig geladen und im Client gefiltert

**Befund.** Der Rechnungs-Arbeitsbereich holt `/contracts` ohne Filter und wirft anschließend alles
weg, was nicht zum angezeigten Versicherten gehört.

**Fundstelle.** `apps/web/src/invoices/InvoiceWorkspaceView.vue`, `loadStatic()`:
`listResource('/contracts')` gefolgt von `.filter((c) => c.accountUID === props.accountUID)`.

**Warum es zählt.** Die API bietet für Policen keinen `accountUID`-Filter, obwohl Rechnungen und
Abrechnungen einen haben — also überträgt die Seite die Policen aller Versicherten, auch die, die den
Nutzer nichts angehen (sichtbar sind sie ohnehin nur im Rahmen seiner Rechte, aber sie werden
übertragen). Bei einem Haushalt sind das ein Dutzend Zeilen; die Uneinheitlichkeit ist der
eigentliche Punkt.

**Empfehlung.** `?accountUID=` an `GET /contracts` ergänzen (der Scope-Helfer aus CR-07 macht das zu
wenigen Zeilen) und im Client filtern lassen, wer filtern soll.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

### Gebiet E — Web: Komponenten und Design-System

#### CR-28 — `design-system/index.ts` ist tot

**Befund.** Die Sammeldatei exportiert fünf der fünfzehn Komponenten. Importiert wird sie nirgends:
null Treffer für `from '…/design-system'`, dagegen 141 direkte Importe aus
`design-system/components/…`.

**Fundstelle.** `apps/web/src/design-system/index.ts`.

**Warum es zählt.** Sie sieht aus wie die öffentliche Oberfläche des Design-Systems und ist keine —
wer sie pflegt, pflegt nichts, und wer ihr glaubt, hält zehn Komponenten für privat, die es nicht
sind.

**Empfehlung.** Löschen. Oder vollständig machen und die 141 Importe darauf ziehen — aber dafür
spricht wenig: die direkten Pfade sind in Vue-Einzeldateien üblich und funktionieren mit
Auto-Import-Werkzeugen besser.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-29 — 17 Dialoge wiederholen denselben Vertrag von Hand

**Befund.** Die Dialoge des Projekts folgen alle derselben Form — was gut ist —, schreiben sie aber
jeder für sich: 14 von ihnen deklarieren das Paar `submitting: boolean` / `error: string | null` als
Props, 13 halten ein eigenes `localError`, und 9 bauen einen eigenen
`watch(() => props.open, …)`-Block, um die Felder beim Öffnen zurückzusetzen.

**Fundstelle.** 17 Dateien `*Dialog.vue` unter `apps/web/src`; die Zählungen über
`grep -rln "submitting: boolean" / "localError" / "() => props.open"`.

**Warum es zählt.** Das ist die Sorte Dopplung, die nicht wehtut, bis sich die Form ändert — etwa
wenn die Fehleranzeige einmal einen Fokus-Sprung bekommen soll oder die Rechteprüfung aus CR-26 in
jeden Dialog muss. Dann sind es 17 Änderungen statt einer.

**Empfehlung.** Ein `useFormDialog()`-Composable, das `localError`, das Zurücksetzen beim Öffnen und
das Absenden bündelt, und ein gemeinsamer Prop-Typ. Schrittweise einführbar: neue Dialoge zuerst,
bestehende bei Gelegenheit.

**Aufwand** M · **Risiko** mittel (17 Dialoge auf einmal umzustellen wäre viel Bewegung ohne
sichtbaren Nutzen — deshalb schrittweise) · **Empfehlung** nach 1.0

#### CR-30 — Vier Ansichten über 750 Zeilen

**Befund.** `InvoiceWorkspaceView.vue` (1025), `InvoiceDetailDialog.vue` (983),
`ContractDetailDialog.vue` (830) und `SettingsView.vue` (766) tragen jeweils Vorlage, Logik und
Stil in einer Datei. Im Arbeitsbereich stehen allein acht Dialog-Zustände nebeneinander
(`formOpen`, `detailOpen`, `submitOpen`, `billingOpen`, `settleOpen`, `deleteTargets`, `dialogBusy`,
`dialogError`).

**Warum es zählt.** Weniger schlimm, als die Zahlen klingen: die Logik ist bereits gut ausgelagert
(`eligibility.ts`, `recommendation.ts`, `treatment-days.ts`, `payment.ts`, `billing-actions.ts` sind
alle klein, rein und getestet), und was übrig bleibt, ist überwiegend Vorlage. Der Rest ist trotzdem
die Stelle, an der jede neue Funktion des Rechnungsbereichs landet.

**Empfehlung.** Keine Generalüberholung. Zwei gezielte Schnitte: die Dialog-Zustände des
Arbeitsbereichs in ein `useInvoiceDialogs()` (das nimmt ~150 Zeilen), und die Tabelle als eigene
Komponente. `SettingsView.vue` lässt sich entlang seiner Abschnitte (Mail, Erinnerungen,
Aktualisierung) in drei Komponenten teilen — das ist die einfachste der vier.

**Aufwand** L · **Risiko** mittel · **Empfehlung** nach 1.0

#### CR-31 — Composable-Dateinamen sind uneinheitlich

**Befund.** Fünf Dateien exportieren ein `use…`: `lib/useTableSort.ts` in camelCase,
`lib/debounce.ts`, `invoices/entity-create.ts`, `invoices/forfeit-toggle.ts` und
`invoices/agency-account-picker.ts` in kebab-case. Alle übrigen Dateien des Projekts sind kebab-case
(außer den Komponenten, die PascalCase sind).

**Empfehlung.** `useTableSort.ts` → `table-sort.ts`. Eine Umbenennung, fünf Importe.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

### Gebiet F — Tests, CI und Werkzeug

#### CR-32 — Es gibt keine Abdeckungsmessung, nirgends

**Befund.** Weder die API (`node --test`) noch das Web (vitest) messen Abdeckung: keine
`coverage`-Konfiguration in `vite.config.ts`, kein `--experimental-test-coverage`, kein Schritt in
der CI, keine Schwelle.

**Fundstelle.** `apps/web/vite.config.ts`, `apps/api/package.json`, `.github/workflows/ci.yml`.

**Warum es zählt.** Die Suiten sind gut — 1493 Zeilen Workflow-Integrationstest sind kein Alibi.
Aber ohne Messung ist jede Aussage über Lücken eine Schätzung, auch die in diesem Dokument. Vor einer
1.0.0 will man die Zahl einmal gesehen haben, und danach will man wissen, wenn sie fällt.

**Empfehlung.** Beide Suiten mit Abdeckung laufen lassen und die Zahl in der CI ausgeben — erst
einmal ohne Schwelle, damit der Schritt nichts blockiert, bevor der Ist-Stand bekannt ist. Die
Schwelle folgt, wenn die Zahl steht. Passt in dieselbe Scheibe wie der `npm audit`-Schritt aus
SEC-10, weil beide dieselbe Datei anfassen.

**Aufwand** M · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-33 — Das Rechtemodell hat keinen eigenen Test

**Befund.** `auth/permissions.ts` trägt die Regeln, an denen die ganze Zugriffskontrolle hängt:
globale Grants schlagen kontobezogene, deaktivierte Rollen zählen nie, `getAccessibleAccounts` ist
die Umkehrung von `listUsersWithAccess`. Dafür gibt es keine eigene Testdatei — geprüft wird nur
indirekt, über das, was die Integrationstests zufällig durchlaufen.

**Fundstelle.** `apps/api/src/auth/permissions.ts` (229 Zeilen, kein `permissions.test.ts`).

**Warum es zählt.** Die Invarianten stehen ausführlich im Kommentar und nirgends als Prüfung. Eine
Änderung am SQL — etwa die aus SEC-04 fällige Entscheidung über `MANAGE_TRASH` — müsste sie von Hand
nachlesen. SEC-17 fordert aus der anderen Richtung dasselbe: einen Test, der die Routentabelle
ausliest und jede Route ohne Token und mit fremdem Konto prüft.

**Empfehlung.** Mit SEC-17 zusammen erledigen: dessen Routentest deckt die Außenseite ab, ein
kleiner Integrationstest gegen `hasPermission`/`getAccessibleAccounts`/`listUsersWithAccess` die
Innenseite (vier Nutzer, zwei Konten, eine deaktivierte Rolle — das ist die ganze Matrix).

**Aufwand** M · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-34 — 17 der 43 Web-Tests prüfen nur Barrierefreiheit

**Befund.** Das Web hat 43 Testdateien für 61 Komponenten; 17 davon sind `*.a11y.test.ts`, die axe
über eine gerenderte Komponente laufen lassen. Verhaltenstests gibt es für 11 Komponenten. Ohne
eigenen Test sind unter anderem `SettingsView.vue` (766 Zeilen, nur a11y),
`ContractDetailDialog.vue` (830 Zeilen, nur a11y) und `BillingsView.vue` (657 Zeilen, gar nichts).

**Fundstelle.** `find apps/web/src -name '*.test.ts' -o -name '*.spec.ts'` gegen
`find apps/web/src -name '*.vue'`.

**Warum es zählt.** Die a11y-Tests sind wertvoll und haben in diesem Projekt echte Fehler gefunden
(siehe die Fokusring-Befunde in `issues.md`). Sie prüfen aber kein Verhalten: dass das Speichern der
Einstellungen ein leeres Passwortfeld **nicht** als Löschung schickt, steht in keiner Prüfung,
obwohl die Regel dafür ausdrücklich in der API dokumentiert ist.

**Empfehlung.** Keine Abdeckungsoffensive, sondern drei gezielte Tests entlang der Regeln, die schon
ausformuliert sind: das Passwortfeld der Einstellungen, der Vorjahres-Übernahme-Pfad des
Konditionen-Dialogs, und die Zuordnung mehrerer Rechnungen in `BillingsView`. Danach entscheidet die
Zahl aus CR-32, ob mehr nötig ist.

**Aufwand** L · **Risiko** niedrig · **Empfehlung** nach 1.0

### Gebiet G — Tote Pfade und Betrieb

#### CR-35 — Zwei Demo-Endpunkte aus Slice 3 sind produktiv gemountet

**Befund.** `GET /api/v1/admin/ping` und `GET /api/v1/accounts/:accountUID/ping` stammen aus der
Definition-of-Done von Slice 3 („Protected demo endpoints proving the guard works“) und sind seitdem
in jeder Auslieferung enthalten. Der Auth-Integrationstest benutzt sie noch.

**Fundstelle.** `apps/api/src/auth/routes.ts`, die beiden `/ping`-Routen;
`apps/api/src/auth/auth.integration.test.ts`.

**Warum es zählt.** Sie tun nichts Schädliches — sie sind bewacht und geben `{ ok: true }` zurück.
Aber sie sind zwei der 47 Routen, die SEC-17 absichern will, sie stehen in keiner Dokumentation, und
sie sind Gerüst, das stehen geblieben ist — der einzige Grund, warum sie noch da sind, ist, dass zwei
Testfälle sie benutzen.

**Empfehlung.** Löschen und die beiden Testfälle auf echte Endpunkte umschreiben — `GET /me` für den
globalen Fall, `GET /accounts/:uid` für den kontobezogenen. Der Beweis, dass die Wache funktioniert,
ist dann ein Beweis über eine Route, die es wirklich gibt.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-36 — Exportierte Helfer ohne Aufrufer

**Befund.** Drei Stellen behaupten eine Schnittstelle, die niemand benutzt:

- `forgetSchemaLinks()` in `domain/trash-references.ts` — „für Tests, die eine Datenbank hoch- und
  runtermigrieren“; kein Test ruft sie, und der Migrationstest berührt den Cache gar nicht erst. Die
  Funktion beschreibt also einen Testaufbau, den es nicht gibt.
- `requireEntityAccount` — siehe CR-08.
- `premiumsTable` und `termsTable` in `contract-history.ts` sind exportiert, werden aber nur in ihrer
  eigenen Datei (über `premiumSpec`/`termsSpec`) verwendet.

**Empfehlung.** `forgetSchemaLinks` entweder im Migrationstest aufrufen (dann ist sie richtig) oder
löschen; die beiden Tabellen nicht mehr exportieren. Zusammen mit CR-08 und CR-28 eine kleine
Aufräum-Scheibe.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** vor 1.0

#### CR-37 — Die Migrationen laufen ohne Sperre

**Befund.** `index.ts` ruft beim Start `runMigrations(pool)`. Es gibt keine Sperre — zwei
gleichzeitig startende Container würden dieselbe Migration parallel anwenden, und umzugs
`schema_migrations`-Tabelle schützt davor nicht, weil der Eintrag erst nach dem Lauf geschrieben
wird.

**Fundstelle.** `apps/api/src/index.ts`, `apps/api/src/db/migrate.ts`.

**Warum es zählt.** Für den dokumentierten Betrieb (eine Instanz, `docker compose up`) ist das kein
Problem, und das Projekt verspricht nirgends horizontale Skalierung. Es gehört trotzdem in die Liste,
damit die Annahme „genau ein Container“ irgendwo steht, statt implizit zu bleiben.

**Empfehlung.** Entweder ein `GET_LOCK()` um den Migrationslauf (fünf Zeilen), oder die Annahme in
der README festhalten. Beides ist vertretbar; die README ist ehrlicher, solange niemand skalieren
will.

**Aufwand** S · **Risiko** niedrig · **Empfehlung** nach 1.0

## 5 Was geprüft wurde und gut ist

Ein Review, das nur Befunde aufzählt, gibt ein falsches Bild. Das Folgende wurde geprüft und ist
tragfähig — es ist der Grund, warum die Liste oben so viele „S“ und so wenige „XL“ enthält.

**Der Schnitt der Domäne.** Die schwierigen Rechnungen sind rein und einzeln getestet:
`invoice-status.ts` (abgeleiteter Status), `bonus-timeline.ts` (leistungsfreie Jahre),
`reimbursement-optimizer.ts` (501 Zeilen, 435 Zeilen Test), auf der Web-Seite `eligibility.ts`,
`recommendation.ts`, `girocode.ts`, `treatment-days.ts`, `reimbursement-gap.ts`. Das ist genau die
richtige Aufteilung: Das Fach ist ohne Datenbank prüfbar, die Datenbank trägt nur Zeilen.

**Der Papierkorb.** `trash-references.ts` leitet die Abhängigkeiten aus den Fremdschlüsseln der
Datenbank ab statt aus einer Liste im Code. Eine neue Tabelle kann damit nicht aus den Regeln fallen.
Das ist die beste Einzelentscheidung im Datenmodell.

**Die Fehlerbehandlung.** Ein Fehlercode je Fall, die Begründung in `details`, die Übersetzung im
Web — und tatsächlich 50 von 51 Codes übersetzt. Nachlässig wäre eine Handvoll englischer Sätze in
Dialogen; das gibt es hier nicht (der eine Ausreißer ist CR-12).

**Die Kommentare.** Sie erklären Entscheidungen, nicht Syntax, und nennen das Datum oder die Scheibe,
in der entschieden wurde. Beim Lesen von 42 000 Zeilen war das der Unterschied zwischen Verstehen und
Raten — an mehreren Stellen (`nextPaymentDates`, `byInvoicePolicy`, `deletionTimestamp`,
`agency-accounts.ts`) beantwortet der Kommentar genau die Frage, die man gerade stellen wollte.

**Die Hygiene.** Kein einziges `TODO`, `FIXME` oder `HACK` im Anwendungscode. Kein `any`. Ein einziges
`eslint-disable`, mit Begründung (Express braucht die Vier-Argument-Form). Prettier, ESLint,
Typecheck, Tests und Build laufen in der CI, dazu ein eigener Schritt gegen Versionsdrift.

**Die Transaktionsgrenzen.** Wo es zählt, sitzen sie richtig: Einreichung mit ihren Rechnungen,
Leistungsabrechnung mit ihren Erstattungen, Wiederherstellung eines ganzen Löschstapels, Schreiben
der Einstellungen. Die Sperren (`FOR UPDATE`) sitzen dort, wo zwei Buchungen kollidieren könnten, und
der gemeinsame `deletedAt`-Zeitstempel als Stapelkennung ist eine elegante Lösung für ein Problem,
das die meisten Anwendungen gar nicht erst angehen.

**Die Barrierefreiheit.** 17 axe-Tests, Fokusringe, `aria-current`, Tastaturbedienung, Farben, die
nicht allein die Information tragen. Das ist mehr, als die meisten Anwendungen dieser Größe haben.

## 6 Was bewusst nicht aufgenommen wurde

**Zwei Vermutungen, die sich beim Nachsehen nicht hielten** — damit sie niemand ein zweites Mal
prüft:

- *„Die Zod-Fehlerübersetzung im Web geht von zod 3 aus, die API benutzt zod 4.“* Falsch: die API
  benutzt zod 3.25.76, die Formen der Issues stimmen überein.
- *„Die abgeflachten Konto-Felder am Abrechnungsdienstleister (`bankAccount`, `bic`,
  `recipientName`) sind toter Ballast, seit die Konten als Liste mitkommen.“* Falsch: die
  Stammdatenliste und das Anlegeformular benutzen sie (`resources/definitions.ts`).

**Nicht als Befund gewertet:**

- *Zwei Testläufer* (`node --test` für die API, vitest für das Web). Das ist eine bewusste
  Entscheidung — die API kommt ohne Testabhängigkeit aus —, und sie kostet nichts außer zwei
  Kommandos.
- *Die englischen Kommentare bei deutscher Oberfläche.* Durchgehend konsequent, also kein Bruch.
- *`connectionLimit: 5` fest verdrahtet.* Für den dokumentierten Betrieb richtig dimensioniert; eine
  Umgebungsvariable dafür wäre Vorrat ohne Bedarf.
- *Der Verzicht auf eine Logging-Bibliothek.* In `lib/log.ts` begründet, und die Begründung trägt.

## 7 Der Schnitt der Scheiben

Nach der Entscheidung aus Abschnitt 1 (alles vor 1.0.0) sind die 37 Befunde dieses Reviews und die
17 des Sicherheits-Reviews zu **18 Scheiben in vier Blöcken** geschnitten. Die Reihenfolge folgt drei
Zwängen, nicht dem Geschmack:

- **CR-24 vor SEC-07.** Ohne Single-Flight im Client löst die App selbst aus, was die
  Reuse-Erkennung als Diebstahl werten würde.
- **CR-15 vor SEC-01 und SEC-11.** Die Sicherheitsscheiben landen in `invoices.ts`; die Datei wird
  vorher geteilt, sonst wird derselbe Code zweimal angefasst.
- **CR-20 früh.** Eine Umbenennung quer durch die Module kollidiert mit jedem größeren Umbau, der
  danach käme — also kommt sie davor.

Die acht vom Autor besonders benannten Befunde (CR-04, CR-05, CR-20, CR-22, CR-23, CR-29, CR-30,
CR-31) sind entsprechend nach vorn gezogen; sie sind unten mit **(★)** markiert.

### Block I — Ordnung

1. **Tote Pfade und Namen im Kleinen** — CR-28, CR-35, CR-36, CR-31 (★), CR-21. Nichts davon ändert
   Verhalten; danach ist die Liste der toten Pfade leer.
2. **Kleine Korrekturen an der API** — CR-06, CR-12, CR-13, CR-14, CR-22 (★), SEC-12, SEC-16. Sieben
   Einzelfehler, jeder für sich in Minuten erledigt, jeder für sich schwer wiederzufinden.
3. **Ein Name für die Kontoverbindung** — CR-20 (★). Rein mechanisch, quer durch beide Apps, ohne
   Migration: `bankAccount` statt `account`, wo die Bankverbindung gemeint ist.
4. **Die Helfer durchsetzen** — CR-08, CR-09, CR-10, CR-11, CR-23 (★). Vier Vereinheitlichungen und
   eine verschobene Zeile; danach gibt es je einen Weg, zu antworten, zu transaktionieren, zu prüfen
   und Parameter zu lesen.
5. **Das geteilte Paket** — CR-01, CR-02, CR-03, CR-04 (★), CR-05 (★). Die größte Scheibe des Blocks
   und die, die den meisten künftigen Ärger verhindert.

### Block II — Sitzung und Sichtbarkeit

6. **Der Client hält die Sitzung** — CR-24, CR-25. Muss vor Scheibe 7 liegen.
7. **Anmeldung und Sitzungen** — SEC-05, SEC-06, SEC-07, SEC-08. Der ganze Auth-Block auf einmal:
   eigener Passwortwechsel, Widerruf bei Passwortänderung, Reuse-Erkennung, Aufräumen.
8. **Kontotrennung an einem Ort** — CR-07, SEC-03, SEC-04. Der Skopierungs-Helfer und die beiden
   Stellen, an denen die Trennung heute nicht greift.

### Block III — Struktur

9. **`invoices.ts` schneiden** — CR-15. Vor den Sicherheitsscheiben, die dieselbe Datei anfassen.
10. **Grenzen an den Eingängen** — SEC-01, SEC-11, CR-18. Schemata, Obergrenzen und das
    Stapel-Einfügen, das an denselben Listen hängt.
11. **Dialoge und große Ansichten** — CR-29 (★), CR-30 (★). Das Gegenstück zu Scheibe 9 auf der
    Web-Seite, und die Vorbereitung für Scheibe 12.
12. **Die Oberfläche lernt das Rechtemodell** — CR-26. Die einzige echte Funktionslücke des Reviews.
13. **Weniger Fragen an die Datenbank** — CR-16, CR-17, CR-27.
14. **Typen statt Zusicherungen** — CR-19.

### Block IV — Betrieb und Nachweis

15. **Header, Image, Abhängigkeiten** — SEC-02, SEC-10, SEC-13, SEC-14, CR-37. Alles, was außerhalb
    des Anwendungscodes liegt.
16. **Prüfbar statt dokumentiert** — SEC-17, CR-32, CR-33, CR-34. Die Routentabelle, das Rechtemodell
    und die Abdeckungszahl.
17. **Audit-Trail** — SEC-09.
18. **Aufbewahrung, Löschung, Auskunft** — SEC-15. Die größte der Sicherheitsscheiben, und die
    einzige mit neuen Masken.

Danach folgen die Delta-Nachprüfung der Invarianten I-1 bis I-13 (Abschnitt 8 des
Sicherheits-Reviews) und 1.0.0.
