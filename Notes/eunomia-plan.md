# 1 Eunomia Project Plan
## 1.1 Projektbeschreibung
Eunomia ist eine WebApp zur Verwaltung des Abrechnungsprozesses mit privaten Krankenversicherungen (PKV). Sie begleitet den Prozess einer eingegangenen Rechnung einer **Facility** (Ärzte, Krankenhäuser, Apotheken etc.), die dann bei einer Versicherung (**Insurance Company**) eingereicht wird. Die Versicherung erstellt zu der Rechnung eine Leistungsabrechnung und es kommt zu einer Erstattung, woraufhin die ursprüngliche Rechnung bezahlt werden kann.

Zu jedem Vertrag kann es Selbstbeteiligungsschwellen geben und auch Bonuszahlungen, wenn in einem Jahr keine Rechnungen eingereicht wurden sind. Die App soll also nachhalten, ob es noch günstiger ist, die Rechnung zurück zu halten, weil die Summe aus möglicher Bonuszahlung und Selbstbeteiligung noch nicht erreicht ist, oder ob es zu einer tatsächlichen Erstattung kommen würde und eine Einreichung sinnvoll ist.

Ein Versicherter kann **mehrere Policen parallel** haben (z. B. eine PKV-Vollversicherung und eine Zusatzversicherung). Eine Rechnung kann bei mehreren davon eingereicht werden — typischerweise erst bei der Vollversicherung und der nicht erstattete Rest (Selbstbeteiligung, Abgelehntes) bei der Zusatzversicherung, oder bewusst nur bei der Zusatzversicherung, um den Bonus der Vollversicherung zu schonen. Die App soll diese Zusammenhänge sichtbar machen, Erstattungsfähigkeit signalisieren und empfehlen, **wo** sich eine Einreichung lohnt (siehe 2.3 "Datenmodell v3" und Slices 16–20).

Dokumente können über einen Link auf eine Dokumentenmanagement-Plattform verlinkt werden (z.B. Paperless NGX oder Nextcloud). Auch sollen später einmal API-Interaktionen möglich sein (Paperless pushed eine neue Rechnung).

Die App ist für den privaten Einsatz geplant. Ein öffentlicher Einsatz (z.B. als SaaS) ist wegen der möglichen Verarbeitung von Gesundheitsdaten und der damit verbundenen Auflagen nicht geplant. Vielmehr soll das Projekt in Home Labs betrieben werden können. Aber durchaus breiter, als nur im Haushalt des Autors. Eine Veröffentlichung als public Repo ist also möglich.

### 1.1.1 Der Loop
1. Rechnung erfassen
1. Rechnung einreichen (einer Police zuweisen — laut Empfehlung der Übersicht)
1. Leistungsabrechnung mit Erstattungsbetrag erfassen
1. Leistungsabrechnung zu Rechnung zuordnen
1. Ggf. den nicht erstatteten Rest bei einer weiteren Police (Zusatzversicherung) einreichen → zurück zu Schritt 3
1. Nachhalten des Status ob die Rechnung bezahlt wurde und ob die Zahlung der Versicherung eingegangen ist

## 1.2 Projekthistorie
Das Projekt ist schon begonnen worden (siehe 1.4 Vorlagen). Allerdings wurden einige Entscheidungen in Architektur und Datenmodell getroffen, die später zu Problemen geführt haben. Daher soll das Projekt noch einmal von Anfang an mit den Erkenntnissen des ersten Versuchs neu gebaut werden.

## 1.3 Probleme
1. Das Datenmodell macht eine Situation schwierig nachzuhalten. Es ist möglich, dass für eine einmal eingereichte Rechnung mehrere Leistungsabrechnungen erstellt werden. Das kann verschiedene Ursachen haben, aber das heutige Datenmodell sieht dafür eine n:n-Tabelle vor und das entspräche in der Verarbeitung einer erneuten Einreichung. Das Datenmodell könnt diesen Fall eleganter abfangen, indem eine Einreichung fest zu einer Rechnung zugeordnet wird (eine Einreichung kann mehrere Rechnungen beinhalten aber eine Rechnung kann nicht mehrfach eingereicht werden). Und dann Wertden Leistungsabrechnungen (auch mehrere) einer Einreichung zugeordnet.
2. Das Look und Feel der UI gefällt mir schon sehr gut, aber durch den Verzicht auf Frameworks ist die erstellung von einigen Funtionen sehr mühsam. Hier muss überdacht werden, ob die Verwendung eines Front-End Frameworks nicht verbesserungen bringen würde, insbesondere bei der Erstellung der Version für mobile Endgeräte
3. Die UI sollte eher als SPA aufgebaut werden, heute sind nur die einzelnen Bereiche in sich jeweils "SPA"-like und es kommt bei kontextwechsel zu einem reload
4. Aufbau auf Basis von TypeScript statt plain JavaScript
5. Mit der Umstellung auf SPA kann der Access Token (JWT) auch klassisch im Bearer geführt werden und nicht als Cookie. Nur den Reauth-Token werden wir an die Route gebunden im Cookie http-only behalten.
6. Rechtemanagement als Bitmaske ist zu wenigig Differenzierbar. Wir bauen eine eigene Rollen- und Rechte-Tabellenstruktur auf, die einfacher erweiterbar ist und bauen Standardrollen (mind. Admin und Nutzer)
7. **(Erkenntnis aus der ersten Echtdaten-Erfassung in Prod, 2026-09)** Das Vertragsmodell trägt nicht:
   - Unterjährige Beitragsanpassungen erzwingen heute einen neuen `Contract` — dieselbe Police erscheint mehrfach (gleiche Vertragsnummer, ohne sichtbaren Gültigkeitszeitraum), die Selbstbeteiligung zerfällt auf mehrere "Verträge", die Auswahl beim Einreichen ist nicht eindeutig.
   - Die Regel "eine Rechnung kann nur einmal eingereicht werden" (aus Punkt 1) ist fachlich falsch: eine Zusatzversicherung kann z. B. die Selbstbeteiligung einer anderen Versicherung übernehmen.
   - Die Bonus-Staffel (Beitragsrückerstattung abhängig von der Zahl leistungsfreier Jahre) ist nicht abbildbar, der Bonus ist ein fester Betrag.
   - Die "lohnt sich Einreichen?"-Analyse betrachtet jeden Vertrag isoliert (und summiert dabei alle Rechnungen des Versicherten je Vertrag, zählt also bei mehreren Policen doppelt) — das Zusammenspiel mehrerer Policen fehlt.
   
   Lösung: Datenmodell v3, siehe 2.3 und Slices 16–20.

## 1.4 Vorlagen
- Erster Umsetzungsversuch: /home/magicoizo/projects/rechnungs-verwaltung

## 1.5 Design-Entscheidungen für den Neuaufbau
Ergänzung nach Durchsicht des ersten Umsetzungsversuchs (siehe 1.4) und Klärung mit dem Autor.

### Zu den Problemen aus 1.3
- **1.3.1** (Datenmodell Einreichung/Abrechnung): gelöst durch eine neue Entität `Submissions`, siehe 2.3.
- **1.3.2 / 1.3.3** (Framework, SPA): Vue 3 + TypeScript + Vite, siehe 2.2.
- **1.3.4** (TypeScript): gilt für Backend **und** Frontend, siehe 2.2.
- **1.3.5** (Access Token im Bearer): bestätigt. Backend liefert den Access Token im JSON-Response-Body, das Frontend hält ihn nur im Speicher (nicht `localStorage`, um XSS-Persistenz zu vermeiden) und legt ihn selbst in den `Authorization`-Header. Der Refresh-Token bleibt ein httpOnly-Cookie, pfadgebunden auf die Refresh-Route.
- **1.3.6** (Rechte als Tabellenstruktur): siehe 2.4. Zusätzlich werden Rechte pro Account vergebbar (siehe unten).

### Aus der Klärung mit dem Autor
- **Mehrmandantenfähigkeit:** nicht Ziel dieser Iteration — ein Haushalt pro Instanz, wie bisher (siehe 2.5).
- **Migrations-Werkzeug:** etabliertes Tool statt Eigenbau, siehe 2.2/2.3.
- **Rechte pro Account:** werden von Anfang an ins Datenmodell aufgenommen (siehe 2.4), auch wenn die Verwaltungs-UI dafür erst in einem späteren Slice kommt.
- **E-Mail-Benachrichtigungen:** spätere Ausbaustufe, das Datenmodell soll sie aber nicht verbauen (siehe 2.5).
- **Repo-Struktur:** Monorepo mit npm workspaces statt getrennter Repos für Frontend/Backend.

# 2 Architektur
## 2.1 App-Architektur & -Vorgaben
- Die App wird später hinter einem Reverse Proxy laufen (z.B. Traefik), der die TLS-Verschlüsselung übernimmt. Das muss berücksichtigt werden in Funktionen wie z.B. dem Rate-Limiting.
- Es soll ein eigener Container für eine MariaDB mitlaufen
- Backups- / Restore muss gleich mitgedacht werden und nutzerfreundlich ausgestaltet werden (z.B. anstoßen eines Backups durch Aufruf eines scripts im backend-container per docker exec von "Außen" und ablage in gemountetem backup volume)
- Migration des Datenbankshemas beim starten des Containers aber auch bei einspielen eines Backups einer vorgängerversion
- versionierung der API
- Möglichst sicherer Aufbau der Datenbank (erster Versuch der App nutzte z.B. Random Root-PW, siehe Projektdateien dort)
- Für die Prod soll der docker compose Aufruf möglichst einfach sein (verwendung von compose file ohne -f in der commandline oder von .env ohne -env-file etc.). Idealerweise soll ein docker compose up -d reichen

## 2.2 Technologie-Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Repo-Struktur | Monorepo, npm workspaces: `apps/api`, `apps/web`, ggf. `packages/shared-types` | Ein Build, eine Versionsnummer, gemeinsame TS-Typen zwischen API und Web ohne ein separat zu veröffentlichendes Paket |
| Backend-Sprache | TypeScript auf Node.js 24 (LTS) | Typsicherheit über die ganze API; Node 24 ist bereits lokal installiert und war schon im Vorgänger als Zielversion vorgesehen (siehe `future-dev-environment.md` §4.1) |
| Backend-Framework | Express 5, wie im Vorgänger | Die dort entwickelten Konventionen (siehe `eunomia-description.md` §6) waren solide; kein Grund für einen Wechsel |
| Frontend | Vue 3 (`<script setup>`) + TypeScript + Vite, `vue-router`, `pinia` | SPA mit Routing und State-Management, deutlich weniger Boilerplate als React für die formular-/dialoglastigen Screens dieser App |
| DB-Zugriff | Weiterhin rohes SQL über den `mariadb`-Treiber, kein ORM | Die Summen-/Status-Abfragen im Vorgänger sind bewusst in SQL gelöst (siehe `database.md`); ein ORM erschwert das, ohne Mehrwert für dieses kleine Schema |
| DB-Migrationen | `umzug` (Migrations-Runner) mit handschriftlichen Migrationsdateien | Framework-agnostisch, funktioniert mit rohem SQL, bietet Historie/Idempotenz ohne einen ORM-Umbau zu erzwingen |
| Validierung | `zod`, Schemas als gemeinsame Typen exportiert | Ersetzt `express-validator`; Formulare im Frontend können dieselben Schemas verwenden |
| Tests | `node:test` im Backend, `vitest` im Frontend | Keine zusätzliche Testframework-Abhängigkeit im Backend; `vitest` passt nativ zu Vite |
| Linting/Formatting | ESLint + Prettier, einheitlich für beide Apps | Fehlte im Vorgänger komplett (siehe `future-dev-environment.md` §4.6) |
| CI | GitHub Actions: Lint + Typecheck + Test bei jedem Push/PR | Kein Deployment aus CI (Homelab-Betrieb, siehe 2.1), nur Qualitätssicherung |

## 2.3 Datenmodell (Entwurf v2)

Bewährtes aus dem Vorgängerprojekt wird übernommen: NanoID-basierte öffentliche IDs mit Entitäts-Präfix (siehe `database.md` / `eunomia-description.md` §5), Soft-Delete über eine `status`-Spalte (`1`=aktiv, `0`=inaktiv, `-1`=gelöscht — künftig **konsistent für alle** Entitäten, ohne die Ausnahmen, die `ServiceBillings`/`Assignment` im Vorgänger hatten), Geldbeträge als `DECIMAL`, Datumsfelder als `DATE`.

### Kern-Fix für Problem 1.3.1: `Submissions` als eigene Entität

Statt eine Rechnung direkt (n:n) mit Leistungsabrechnungen zu verknüpfen, wird eine **Einreichung** (`Submission`) zur eigenständigen Entität:

```
Contracts ──1:n──→ Submissions ──1:n──→ Invoices
                        │
                        └──1:n──→ ServiceBillings ──1:n──→ Allocations ──n:1──→ Invoices
```

> **Revidiert durch Datenmodell v3 (siehe unten):** Die Regel "nur einmal einreichen" gilt jetzt **pro Police**, `Invoices.submissionUID` wird durch die Tabelle `SubmissionInvoices` ersetzt.

- Eine `Invoice` bekommt beim Einreichen eine `submissionUID` (statt bisher `submittedDate` + `contractUID` direkt auf der Rechnung). Einmal gesetzt, ist sie **unveränderlich** — das erzwingt "eine Rechnung kann nicht mehrfach eingereicht werden" strukturell, nicht nur per Anwendungslogik.
- Eine `Submission` kann mehrere `Invoices` enthalten (Sammeleinreichung) und trägt darüber `contractUID` und `submittedDate`.
- `ServiceBillings` hängen an der `Submission`, nicht mehr direkt an einer einzelnen `Invoice` — eine Einreichung kann mehrere Leistungsabrechnungen erhalten (z.B. bei Teilabrechnungen).
- `Allocations` (Nachfolger der alten `Assignment`-Tabelle) ordnet einer `ServiceBilling` den Erstattungsbetrag pro `Invoice` zu. Da sowohl `ServiceBilling` als auch `Invoice` an dieselbe `Submission` gebunden sind, kann die UI beim Zuordnen nur noch Rechnungen aus derselben Einreichung anbieten — das alte Fehlerpotential (beliebige Rechnung mit beliebiger Abrechnung verknüpfen) entfällt strukturell.
- Rechnungsstatus bleibt wie bisher **abgeleitet, nicht gespeichert** (`offen`/`eingereicht`/`abgerechnet`/`erledigt`), jetzt aus `submissionUID IS NOT NULL`, der Summe der `Allocations` und `transferDate`.

> Diese konkrete Ausprägung ist ein Vorschlag zur Diskussion beim Start des Slices "Rechnungs-Workflow-API" (siehe 3) — das Grundprinzip (Submission als Bindeglied) ist durch 1.3.1 vorgegeben, die genaue Spaltenaufteilung kann sich beim Entwurf noch verschieben.

### Übrige Entitäten

`Accounts`, `InsuranceCompanies`, `Contracts`, `Facilities`, `CollectionAgencies` — Struktur bleibt im Kern wie im Vorgängerprojekt (siehe `database.md`), wird aber im TypeScript-Modell explizit typisiert.

**Geklärt: `cap`-Spalte auf `Contracts`.** Im Vorgänger in `database.md` nur in einer Referenz-Query verwendet, aber nie in der `CREATE TABLE Contracts`-DDL definiert (Doku-Lücke, nicht Schema-Lücke — die Spalte existiert in der laufenden DB). Bedeutung anhand der Frontend-Logik verifiziert (`public/scripts/invoices.js`, Summary-Zeile pro Vertrag): `cap` ist eine **Erstattungs-Obergrenze pro Vertrag** — der Höchstbetrag, den die Versicherung insgesamt erstattet, unabhängig von `deductible` (Selbstbeteiligung) und `bonus`. `NULL` bedeutet kein Cap. Übernahme ins neue Schema als eigene, dokumentierte Spalte auf `Contracts` (`DECIMAL`, nullable).

Rechte-/Nutzer-Entitäten — siehe 2.4.

### Datenmodell v3: Policen, Mehrfach-Einreichung, Bonus-Staffel (beschlossen 2026-09-21)

Löst 1.3.7. **Ersetzt** Teile des obigen Entwurfs: die Konditionen-Spalten auf `Contracts` (`monthlyRate`, `deductible`, `bonus`, `reimbursementCap`) und die Regel "eine Rechnung wird genau einmal eingereicht" (`Invoices.submissionUID`). Das Grundprinzip der `Submission` als Bindeglied (1.3.1) bleibt erhalten.

```
Accounts ─1:n→ Contracts (Police, stabil)
                 ├─1:n→ ContractPremiums   (Beitragsstände, gültig ab Datum — nur Information)
                 ├─1:n→ ContractTerms      (Konditionen, gültig ab Kalenderjahr)
                 │         └─1:n→ ContractBonusTiers (Staffel: leistungsfreie Jahre → absoluter Bonusbetrag)
                 ├─1:n→ ContractYears      (Jahresstatus: Bonus verwirkt?, tatsächliche Rückerstattung)
                 └─1:n→ Submissions ─n:m→ Invoices   (über SubmissionInvoices)
                            └─1:n→ ServiceBillings ─1:n→ Allocations ─n:1→ Invoices
Invoices ─n:m→ Contracts über InvoiceExclusions ("nicht erstattungsfähig bei dieser Police")
```

- **`Contracts` = stabile Police.** Tabellenname und `/api/v1/contracts` bleiben (weniger Umbau), die UI spricht von "Police". Felder: Nummer, Versicherung, Versicherter, Beginn/Ende, neu `contractKind` (`FULL` = Vollversicherung / `SUPPLEMENTARY` = Zusatzversicherung), `bonusForfeitRule` (`ON_SUBMISSION` = schon das Einreichen verwirkt den Bonus / `ON_REIMBURSEMENT` = erst eine tatsächliche Erstattung), sowie der Startwert der Leistungsfreiheit `claimFreeYearsAtStart` + `claimFreeCountingFromYear` (Default: 0 bzw. Beginnjahr — für neu abgeschlossene Policen passt der Default, für ältere trägt man die bisherigen leistungsfreien Jahre ein). Eine neue Police entsteht nur noch bei echtem Vertragswechsel.
- **`ContractPremiums`**: `validFrom` (DATE), Monatsbeitrag, Notiz (z. B. "Beitragsanpassung 01/2026"). `validTo` wird aus dem Folgeeintrag abgeleitet, nicht gespeichert. Rein informativ (Beitragsverlauf, Jahreskosten) — **kein Einfluss auf Selbstbeteiligung oder Bonus**. Bewusst keine Aufteilung in Tarif-Bestandteile.
- **`ContractTerms`**: gültig ab `validFromYear` bis zum nächsten Eintrag (ein Jahr ohne eigenen Eintrag erbt den vorherigen). Felder: Selbstbeteiligung (jährlich), Jahres-Erstattungsobergrenze (nullable), Erstattungssatz in % (Default 100). Unterjährige Änderungen gibt es hier nicht — die Selbstbeteiligung ist immer eine Jahresgröße der Police.
- **`ContractBonusTiers`**: gehört zu einem `ContractTerms`-Eintrag, also fest zu einem (ab-)Versicherungsjahr (= Kalenderjahr). Pro Stufe: Mindestzahl leistungsfreier Jahre → **absoluter Bonusbetrag in €** (z. B. 1 → 300 €, 2 → 450 €, 4 → 600 €). Keine Berechnung aus Monatsbeiträgen — ändern sich die Werte, werden sie mit einem neuen `ContractTerms`-Eintrag neu eingegeben (UI bietet "vom Vorjahr übernehmen" an). Ist für ein Jahr keine eigene Staffel erfasst, gilt die geerbte als Prognose und wird in der UI als "nicht aktualisiert" gekennzeichnet.
- **Leistungsfreiheit wird gezählt, nicht gepflegt:** Ein Jahr ist für eine Police leistungsfrei, wenn der Bonus darin nicht verwirkt ist. Verwirkt ist er — je nach `bonusForfeitRule` — durch eine Einreichung bzw. eine Erstattung > 0 bei dieser Police in dem Behandlungsjahr; übersteuerbar pro Leistungsabrechnung (`ServiceBillings.forfeitsBonus`, nullable = Regel der Police folgen; wird bei Erfassung der Erstattung abgefragt) und pro Jahr (`ContractYears`). Die Serie leistungsfreier Jahre = `claimFreeYearsAtStart` + ununterbrochen leistungsfreie Jahre ab `claimFreeCountingFromYear`; ein verwirktes Jahr setzt sie auf 0.
- **`ContractYears`** (optional pro Police und Jahr): tatsächlich erhaltene Beitragsrückerstattung laut Schreiben der Versicherung (überschreibt die Prognose) und manueller Override "Bonus verwirkt ja/nein".
- **`SubmissionInvoices`** (`submissionUID`, `invoiceUID`, `contractUID` denormalisiert) ersetzt `Invoices.submissionUID`. `UNIQUE (invoiceUID, contractUID)`: **eine Rechnung höchstens einmal pro Police** — die Doppel-Einreichung bei derselben Versicherung bleibt strukturell ausgeschlossen, bei verschiedenen Policen ist sie erlaubt.
- **Bereicherungsverbot:** Summe aller `Allocations` einer Rechnung (über alle Policen) ≤ Rechnungsbetrag — Validierung im Anwendungslayer.
- **`InvoiceExclusions`** (`invoiceUID`, `contractUID`, Notiz): manuelle Markierung "nicht erstattungsfähig bei dieser Police" (z. B. stationäre Leistung bei einer ambulanten Zusatzversicherung). Eine Einteilung in Leistungsbereiche ist bewusst (noch) nicht vorgesehen.
- **Abgeleiteter Status:** Der Workflow-Status (`eingereicht`/`abgerechnet`) wird je Einreichung bestimmt; die Rechnung erhält einen Gesamtstatus plus den **nicht erstatteten Restbetrag** als Kandidat für die nächste Police. Gesamtstatus (festgelegt in Slice 17): `offen` = nirgends eingereicht; `eingereicht` = bei ≥ 1 Police eingereicht, noch keine Erstattung zugeordnet; `teilabgerechnet` = Erstattungen < Rechnungsbetrag (Zahlung egal); `abgerechnet` = Erstattungen decken den Betrag **oder** die Rechnung ist von Hand „als abgerechnet markiert“ (`Invoices.reimbursementClosed`, z. B. der Rest ist Selbstbeteiligung), noch nicht bezahlt; `erledigt` = wie `abgerechnet` und bezahlt.

**Erstattungs-Optimierer** (ersetzt `evaluateReimbursement` / den Analyse-Endpoint je Vertrag): reine, unit-getestete Funktion **pro Versichertem und Behandlungsjahr über alle Policen**. Für jede Kombination "Police mit Bonus in Anspruch nehmen / schonen" (2ⁿ, n = Zahl der Bonus-Policen, in der Praxis 1–3) wird gerechnet: in Anspruch genommene Vollversicherungen erstatten zuerst (Satz × (Summe − Selbstbeteiligung), gedeckelt), Zusatzversicherungen erstatten auf den Rest bis zu ihrer Obergrenze, `InvoiceExclusions` werden je Police herausgenommen, bereits verwirkte Boni gelten als verloren. Ziel: maximale Summe aus Erstattungen + Boni. Ausgabe: empfohlene Strategie je Police, Schwelle "ab weiteren N € lohnt sich Police x", Empfehlung je Rechnung ("bei y einreichen", "zurückhalten", "bei x, Rest bei y"). Die Beispieljahre des Autors sind Pflicht-Testfälle (PKV x: SB 200 €, Staffel 300/450/…; Zusatz y: 200 €/Jahr):

| Jahr | Kosten | x schonen, nur y | x + Rest bei y | Empfehlung |
|---|---|---|---|---|
| 1 | 150 € | 150 + 300 = 450 € | 0 + 150 = 150 € | nur y |
| 2 | 640 € | 200 + 450 = 650 € | 440 + 200 = 640 € | nur y |
| 3 | 1000 € | 200 + Bonus (≈ 450–600 €) | 800 + 200 = 1000 € | x, Rest bei y |

## 2.4 Rechte- und Rollenmodell (Entwurf)

Ablösung der Bitmaske (1.3.6) durch eine erweiterbare Tabellenstruktur, ergänzt um Rechte pro Account:

```
Permissions ──n:n── RolePermissions ──n:n── Roles
                                               │
                          ┌────────────────────┼──────────────────────┐
                          │                                           │
                    UserRoles (global)                      UserAccountRoles (scoped)
                          │                                           │
                        Users                                Users + Accounts
```

- `Permissions`: Katalog einzelner Rechte (`VIEW_INVOICES`, `MANAGE_INVOICES`, `MANAGE_ACCOUNTS`, `MANAGE_FACILITIES`, `MANAGE_USERS`, `MANAGE_CONTRACTS`, …) — feingranularer als die alte Bitmaske, jederzeit erweiterbar ohne Migrationsbruch (neue Zeile statt neues Bit).
- `Roles`: benannte Bündel von Permissions. Mindestens zwei Standardrollen (`Admin`, `Nutzer`), frei erweiterbar.
- `UserRoles`: instanzweite Rollen — für Dinge ohne Account-Bezug (z.B. wer darf Facilities/Companies/Nutzer verwalten).
- `UserAccountRoles`: dieselbe Rolle, aber gebunden an einen konkreten `accountUID` — steuert, wer welchen Versicherten (und dessen Rechnungen/Verträge) sehen/bearbeiten darf. Ein Nutzer kann für Account A "Nutzer" und für Account B gar keinen Zugriff haben.
- Auflösung zur Laufzeit: Zugriff, wenn ein Nutzer die Permission **global** (`UserRoles`) **oder** für den konkret angefragten `accountUID` (`UserAccountRoles`) besitzt. Eine global gesetzte Admin-Rolle hebelt beides aus (Superadmin-Charakter wie bisher Bit 128).

## 2.5 Nicht-Ziele der ersten Iteration (spätere Ausbaustufen)

Explizit **nicht** Teil der in Abschnitt 3 geplanten Slices, aber beim Datenmodell nicht verbaut:

- ~~**E-Mail-Benachrichtigungen** (Zahlungserinnerungen, ggf. TOTP-Versand)~~ — Infrastruktur in Slice 30, die Zahlungserinnerungen selbst in Slice 31 umgesetzt; der TOTP-Versand bleibt offen. Vorgaben siehe 2.6.
- **Paperless/Nextcloud API-Push-Integration** (Paperless schiebt aktiv eine neue Rechnung in Eunomia) — laut 1.1 ohnehin "später einmal"; v1 bietet nur den reinen Link auf das externe Dokument.
- **Mehrmandantenfähigkeit** (mehrere unabhängige Haushalte in einer Instanz).
- ~~**Aktive Update-Prüfung gegen das Git-Repository**~~ — in Slice 25 umgesetzt (siehe dort).

## 2.6 System-Konfiguration & Verschlüsselung (~~Vorgaben für spätere Umsetzung~~ — in Slice 30 umgesetzt)

Der E-Mail-Versand bleibt spätere Ausbaustufe (siehe 2.5), aber der Autor legt jetzt schon fest, **wie** er umzusetzen ist, damit die Infrastruktur nicht nachträglich umgebaut werden muss:

- Konfiguration (z.B. SMTP-Host, -Port, -Nutzer, -Passwort, Absenderadresse) wird **nicht** allein über `.env`-Variablen gepflegt, sondern über eine **System-Einstellungen-UI** für Admins, die Werte in der Datenbank ablegt (Tabelle `SystemSettings`, key-value-artig).
- Sensible Werte (z.B. das SMTP-Passwort) werden **verschlüsselt** in der DB gespeichert, nicht im Klartext. Symmetrische Verschlüsselung (z.B. AES-256-GCM) mit einem Schlüssel, der ausschließlich in der `.env` liegt (`CONFIG_ENCRYPTION_KEY`) und nie in die DB gelangt — ein DB-Dump allein reicht dann nicht, um die Secrets zu lesen.
- Nur die `Admin`-Rolle (siehe 2.4) darf System-Einstellungen lesen/ändern.
- Dieser Mechanismus wird generisch gebaut (nicht E-Mail-spezifisch), damit er später auch für andere Secrets taugt — z.B. für die im alten `todo.md` skizzierte Idee, `JWT_SECRET` aus der `.env` in die DB zu verlagern (siehe `future-dev-environment.md` §8). Das ist aber kein Ziel dieser Iteration, nur eine Randnotiz zur Wiederverwendbarkeit.
- Wird zusammen mit dem E-Mail-Feature gebaut (siehe "Ausblick" in Abschnitt 3), nicht vorab — vermeidet eine Abstraktion ohne aktuellen Verwendungszweck.

**Umgesetzt in Slice 30** (siehe dort): `SystemSettings`, `CONFIG_ENCRYPTION_KEY`, die Einstellungsseite und als erster Verbraucher der SMTP-Versand. Die Benachrichtigungs-Mails selbst (Zahlungserinnerungen) sind in **Slice 31** dazugekommen.

## 2.7 Navigations-, Design- und Barrierefreiheits-Konzept

Die Navigationsstruktur wird **einmal zu Beginn (Slice 6) fixiert** und wächst danach nur noch durch neue Einträge in dieser Struktur, statt sich mit jedem neuen Bereich zu verschieben. Vorbild ist die Sidebar-Navigation des ersten Entwurfs (siehe `eunomia-description.md` §8/§9):

- **Sidebar** mit Logo, Hauptnavigation und Footer, wie im ersten Entwurf — Seitenaufbau (`body` → `content` → `aside` + `main` → `footer`) wird als Ausgangspunkt übernommen.
- **Hauptnavigation:** Rechnungen (Startpunkt, pro Account/Jahr), Accounts, Verträge, Versicherungen, Leistungserbringer, Inkasso-Firmen, Leistungsabrechnungen.
- **Separater Systembereich** (nur für Admins sichtbar): Nutzer- und Rechteverwaltung (Slice 9), System-Einstellungen (siehe 2.6).
- Spätere Slices fügen ihre Seiten als zusätzliche Einträge in diese vorgegebene Struktur ein; die Navigation selbst wird danach nicht mehr grundlegend umgebaut.

### Farben, Typografie, Icons — eng am ersten Entwurf orientiert, gezielt verbessert

Design-Referenz ist explizit der erste Entwurf: Markenblau `#030088`, Akzentblau, die vierstufige Status-Farbskala, die Schriftarten `FallingSky`/`Raleway` und die Font-Awesome-Icons (siehe `eunomia-description.md` §9) — kein Neu-Design von Grund auf. Verbindlich ausgearbeitet wird das als eigenes Design-System in Slice 1 (siehe 3), an dem sich alle folgenden UI-Slices orientieren. Dabei werden gezielt Schwächen des ersten Entwurfs behoben statt übernommen:

- Farben als CSS Custom Properties statt ~30 wiederholter Farbliterale, mit getrennten Light-/Dark-Wertesätzen (siehe unten).
- Font Awesome **Free** statt einer eventuell im ersten Entwurf genutzten Pro-Variante (Lizenzklärung pro Icon).
- Bereinigung des Font-Familien-Namens-Bugs (`FalingSky` vs. `FallingSky`, siehe §9 dort).
- Statusfarben erhalten zusätzlich Text/Icon statt ausschließlich Farbcodierung.
- Die Chromium-exklusive CSS-Anchor-Positioning des ersten Entwurfs wird durch eine breiter unterstützte Lösung ersetzt (z.B. Floating-UI für Vue).

### Barrierefreiheit & Darstellungsmodi

- **Dark/Light Mode ausschließlich über `prefers-color-scheme`** (Vorgabe durch Browser/Betriebssystem) — kein manueller In-App-Umschalter geplant.
- Tastaturzugängliche Submenüs/Popups statt der `:hover`-only-Lösung des ersten Entwurfs.
- Sidebar von Anfang an responsiv/mobil einklappbar (löst 1.3.2/1.3.3 und die in `eunomia-description.md` §9 "Known CSS issues" dokumentierten Probleme).
- Kontrastwerte für Text und interaktive Elemente in beiden Modi auf WCAG AA geprüft.
- Sichtbarer, in beiden Modi kontrastgeprüfter Fokus-Stil (Basis: der im ersten Entwurf verwendete Bootstrap-Fokusring).
- Automatisierte Accessibility-Checks (z.B. `axe-core`) als Teil der Definition-of-Done aller UI-nahen Slices, beginnend mit Slice 1.

## 2.8 Dokumentations- und Namenskonventionen

- **Sprache:** Code-Kommentare und Dokumentation (JSDoc/TSDoc) sind **englisch**, wie schon im ersten Entwurf so gehandhabt (siehe `eunomia-description.md`, "Language note") — unabhängig von deutschen UI-Texten und deutschen Fachbegriffen im Datenmodell (`Rechnung`, `Einreichung`, …), die bewusst erhalten bleiben.
- **Alles, was mit dem Repo nach außen geht, ist englisch** (beschlossen 2026-09-24): `CHANGELOG.md` und damit die Titel und Texte der GitHub-Releases, `README.md`, `DEV.md`, Commit-Meldungen. Grund: Wenn das Repo irgendwann veröffentlicht wird, entscheidet die Sprache über die Reichweite — und nachträglich umzuschreiben wäre teurer als es von Anfang an so zu halten. Deutsch bleibt bei den **UI-Texten**, den Fachbegriffen im Datenmodell (`Rechnung`, `Einreichung`, …), den Fehlermeldungen in der App (Slice 24) und den Planungsnotizen in `Notes/` — die sind das Arbeitsmaterial des Autors, nicht Teil der Veröffentlichung.
- **Selbsterklärender Code hat Vorrang vor Kommentaren:** sprechende Namen für Variablen, Funktionen/Methoden und deren Parameter sind die primäre Form der Dokumentation. Ein Kommentar ist kein Ersatz für einen schlechten Namen.
- **Kommentare dort, wo der Name nicht reicht:** explizite Kommentare/TSDoc-Blöcke für nicht offensichtliche Zusammenhänge — versteckte Invarianten, den Grund für eine unübliche Lösung, Randfälle, die beim Lesen überraschen würden. Kein Kommentar, der nur wiederholt, was der Code bereits zeigt.
- **Priorität für ausführlichere Dokumentation:** Business-Logik mit Rechenregeln, die nicht aus dem Code allein ersichtlich sind — insbesondere die Selbstbeteiligungs-/Bonus-Berechnung (Slice 5) und die Rechte-Auflösung global vs. account-scoped (2.4/Slice 3).
- Gilt für Backend und Frontend gleichermaßen, wird in Slice 0 in die ESLint-Konfiguration (z.B. `eslint-plugin-jsdoc` für öffentliche Funktionen der API- und Service-Schicht) aufgenommen, damit die Konvention nicht nur dokumentiert, sondern auch geprüft wird.

## 2.9 Versionierung (`x.y.z`, beschlossen 2026-09-24)

An semver orientiert, mit einer projektspezifischen Belegung für die Slice-Arbeit:

- **Major `x`** — nur bei einem wirklich bedeutenden Stand: alle Grundfeatures vorhanden und der Ablauf in der Produktion mit Echtdaten verifiziert und als gut genug befunden. Keine automatische Regel, sondern eine Entscheidung des Autors.
- **Minor `y`** — jedes vollständig abgeschlossene Feature. Git-Tag `vX.Y.0` und ein **volles** GitHub-Release, damit `releases/latest` (Update-Check, Slice 25) und das Docker-`:latest` darauf zeigen.
- **Patch `z`** — reserviert für Hotfixes auf ein veröffentlichtes Minor, ebenfalls Tag + volles Release + `:latest`. **Nicht** für die Arbeit an einem Feature.
- **Slices während der Arbeit an einem Feature** — Prerelease-Versionen auf die **kommende** Minor: `0.10.0-slice.1`, `0.10.0-slice.2`, … Tag `v0.10.0-slice.N`, GitHub-**Prerelease**, Docker-Image unter dieser Version, aber **ohne** `:latest`.
  - Gezählt wird pro gepushtem Commit, der am Produkt etwas ändert. Reine Doku-, Formatierungs- und Build-Commits bekommen keine Nummer (sonst stehen drei Prereleases für einen Prettier-Durchlauf).
  - Der Versions-Bump gehört in den Slice-Commit selbst, nicht in einen eigenen Commit.
- **Tag und Release werden nie ohne ausdrückliche Zustimmung erzeugt** — sie sind Veröffentlichung, genau wie der Push (siehe Arbeitsweise pro Slice).

**Warum die Slices nicht einfach `0.9.1`, `0.9.2`, … heißen** (die naheliegende Variante, verworfen):

- Ein `0.9.1` nach dem Release `0.9.0` sieht von außen wie ein Bugfix-Release aus, ist aber eine Vorschau auf `0.10.0`.
- Es verbraucht genau die Nummern, die ein echter Hotfix auf `0.9.0` bräuchte. Eine laufende Vorschau `0.9.3` hielte das Hotfix-Release `0.9.1` für älter und würde den Update-Hinweis nicht anzeigen.
- `lib/semver.ts` ordnet Prereleases bereits korrekt (`0.10.0-slice.3 < 0.10.0`), und `releases/latest` filtert Prereleases ohnehin heraus — die Prerelease-Schreibweise braucht also keine neue Logik im Update-Check.

**Mechanik dazu:** in Slice 26 umgesetzt (Bump-Skript `scripts/version.ts`, `latest`-Guard und Release-Job in `.github/workflows/docker.yml`, `CHANGELOG.md` als Quelle der Release-Notes, `npm run version:check` in der CI). Der Alltagsablauf steht in [DEV.md](../DEV.md) unter „Versioning a change".

---

# 3 Umsetzungsplanung (Slices)

Jeder Slice ist für sich lauffähig/überprüfbar (App startet, Tests laufen, sichtbarer Fortschritt im Browser oder per REST-Call) — kein Slice hinterlässt einen halbfertigen Zwischenzustand ohne Definition-of-Done. Die Reihenfolge ist eine Abhängigkeitskette, keine Zeitschätzung.

## Slice 0 — Projekt-Grundgerüst
**Ziel:** Monorepo steht, alle Werkzeuge sind lauffähig, noch ohne Fachlogik.
- npm workspaces (`apps/api`, `apps/web`, `packages/shared-types`)
- TypeScript-Konfiguration (strict) für beide Apps, ESLint + Prettier
- `docker-compose.yml` mit App-Container (Platzhalter) + MariaDB-Container, `.env.example`
- GitHub Actions: Lint + Typecheck + Test-Platzhalter
- `.editorconfig`, `.gitattributes`
- Versions-Endpoint (z.B. `GET /api/v1/version`) liefert die aktuelle Backend-Version aus `package.json` — Grundlage für die Footer-Anzeige (Slice 6) und den späteren Update-Check-Backlog-Punkt (siehe 2.5)

**DoD:** `docker compose up -d` startet beide Container, `/` liefert eine Antwort, `GET /api/v1/version` liefert die Version aus `package.json`, CI ist grün.

## Slice 1 — Design-Konzept & Design-System
**Ziel:** Ein dokumentiertes, technisch verbindliches Design-System steht, an dem sich alle folgenden UI-Slices orientieren — bevor eine einzige echte Seite gebaut wird. Rein frontend-seitig, kann parallel zu Slice 2 (Datenmodell) laufen.
- Farbpalette als CSS Custom Properties: abgeleitet von Markenblau/Akzentblau/Status-Farben des ersten Entwurfs (siehe 2.7 und `eunomia-description.md` §9), in getrennten Light- und Dark-Wertesätzen (`:root` + `@media (prefers-color-scheme: dark)`), gegen WCAG-AA-Kontrast geprüft — die reinen Statusfarben des ersten Entwurfs (`lightcoral`, `#ffd900`, `lightblue`, `lightgreen`) werden dafür angepasst
- Statusfarben erhalten zusätzlich Text/Icon-Kennzeichnung statt ausschließlich Farbcodierung (WCAG 1.4.1)
- Typografie: `FallingSky`/`FallingSkyBold` (Headings) + `Raleway` (Daten/Formulare) übernommen, Font-Familien-Namens-Bug des ersten Entwurfs bereinigt, System-Font-Fallback-Stack ergänzt
- Icons: Font Awesome Free (Lizenzprüfung je übernommenem Icon), dekorative Icons `aria-hidden`, icon-only Elemente mit `aria-label`
- Fokus-Stil für beide Modi, Tastaturzugänglichkeit als Grundanforderung an jede interaktive Komponente
- Popups/Tooltips/Dropdowns über eine breit unterstützte Positionierungslösung (z.B. Floating-UI für Vue) statt der Chromium-exklusiven CSS-Anchor-Positioning des ersten Entwurfs
- Ergebnis ist keine reine Doku, sondern eine kleine Vue-Komponentenbibliothek/Style-Guide-Seite (Buttons, Formularelemente, Badges, Dialog-Grundgerüst, Statusanzeigen) als lebendige Referenz für alle weiteren Frontend-Slices

**DoD:** Eine Style-Guide-Seite zeigt alle Grundkomponenten in Light- und Dark-Mode (Umschaltung nur über Browser-/OS-Einstellung, kein manueller Toggle); Kontrastwerte sind dokumentiert (mind. AA für Text); ein automatisierter Accessibility-Check (z.B. `axe-core`) läuft gegen die Style-Guide-Seite ohne kritische Findings.

## Slice 2 — Datenmodell & Migrations-Infrastruktur
**Ziel:** Schema aus 2.3 existiert, ist versioniert, DB ist sicher aufgesetzt.
- `umzug`-Setup + erste Migration mit dem vollständigen Schema (alle Entitäten aus 2.3 außer Rechte-Feindesign, das kommt in Slice 3)
- Migration läuft automatisch beim Container-Start; Restore-Pfad (Migration nach Einspielen eines alten Backups) mitgedacht
- Sicherer DB-Bootstrap (kein Random-Root-Passwort-Problem wie im Vorgänger, siehe 1.3; dediziertes Anwendungs-User mit minimalen Rechten)
- Seed-Skript mit anonymisierten Testdaten für die lokale Entwicklung

**DoD:** Frische DB-Instanz hochfahren → Migration läuft durch → Seed-Daten sind da → zweiter Start (bereits migriert) verändert nichts.

## Slice 3 — Auth & Rechte-Grundgerüst
**Ziel:** Login funktioniert Ende-zu-Ende mit dem neuen Rechtemodell.
- `Users`, `Roles`, `Permissions`, `RolePermissions`, `UserRoles`, `UserAccountRoles`, `RefreshTokens` (siehe 2.4)
- Login/Logout/Refresh, Access Token im Response-Body (Bearer), Refresh Token im httpOnly-Cookie (pfadgebunden), siehe 1.3.5
- Middleware zur Permission-Prüfung (global + account-scoped)
- Zwei Standardrollen (`Admin`, `Nutzer`) werden beim Init angelegt

**DoD:** Login per REST-Call liefert Access Token; ein geschützter Test-Endpunkt lässt sich nur mit passendem Recht aufrufen; Refresh funktioniert nach Ablauf des Access Tokens.

## Slice 4 — Stammdaten-API
**Ziel:** CRUD-API für alle Nicht-Rechnungs-Entitäten, versioniert unter `/api/v1`.
- `Accounts`, `InsuranceCompanies`, `Contracts`, `Facilities`, `CollectionAgencies`
- Konsistentes Soft-Delete, einheitliche Response-Envelope, Validierung über `zod`
- API-Versionierung strukturell angelegt (`/api/v2` könnte später parallel laufen)

**DoD:** Alle fünf Entitäten sind per REST vollständig CRUD-fähig, inkl. Rechteprüfung (account-scoped bei `Accounts`/`Contracts`).

## Slice 5 — Rechnungs-Workflow-API
**Ziel:** Der komplette "Loop" aus 1.1.1 ist über die API abbildbar.
- `Invoices`, `Submissions`, `ServiceBillings`, `Allocations` nach dem Modell aus 2.3
- Batch-Einreichung mehrerer Rechnungen zu einer `Submission` (transaktional, wie im Vorgänger bereits gelöst, siehe `eunomia-description.md` §6)
- Zuordnung von `ServiceBillings` zu `Allocations`, beschränkt auf Rechnungen derselben `Submission`
- Berechnungslogik "lohnt sich Einreichung?" (Selbstbeteiligung/Bonus-Schwelle aus 1.1, plus die Erstattungs-Obergrenze `cap` aus 2.3) als eigener, testbarer Service statt in einer Sub-Query versteckt

**DoD:** Ein Testfall bildet den vollständigen Loop ab (Rechnung anlegen → einreichen → Abrechnung erfassen → zuordnen → als bezahlt markieren); die Selbstbeteiligungs-Berechnung hat Unit-Tests für die Grenzfälle aus 1.1.

## Slice 6 — Frontend-Grundgerüst (SPA-Shell)
**Ziel:** Vue-SPA mit Login und Navigation, ohne Reload zwischen Bereichen (löst 1.3.3).
- Vite + Vue 3 + vue-router + pinia, Auth-Store hält Access Token im Speicher (nicht `localStorage`)
- API-Client mit automatischem Refresh-Retry (Pendant zu `sendRequest`/`tryRefresh` aus dem Vorgänger, siehe `eunomia-description.md` §8)
- Layout-Shell (Sidebar, Header, Footer) aufgebaut aus den Komponenten des Design-Systems (Slice 1) nach dem in 2.7 fixierten Navigationskonzept: alle Haupt-Nav-Einträge stehen als Platzhalter-Routen bereits fest
- Footer zeigt die aktuelle Backend-Version an, abgefragt vom Versions-Endpoint aus Slice 0

**DoD:** Login im Browser, Navigation zwischen zwei Platzhalter-Seiten ohne Full-Page-Reload, Token-Refresh im Hintergrund sichtbar in den Devtools, vollständige Nav-Struktur aus 2.7 sichtbar (auch wenn einzelne Zielseiten noch Platzhalter sind), Light/Dark-Mode und Tastaturbedienung funktionieren bereits auf Shell-Ebene, Footer zeigt die vom Backend gelieferte Version.

## Slice 7 — Frontend Stammdaten-Verwaltung
**Ziel:** Die im Vorgänger fehlenden Seiten (`/accounts`, `/companies`, `/contracts`, `/facilities`, `/agencies`) existieren.
- Je eine Listen- + Formular-Ansicht pro Entität aus Slice 4, aufgebaut aus den Design-System-Komponenten (Slice 1)

**DoD:** Jede Stammdaten-Entität ist im Browser anlegbar, änderbar, löschbar.

## Slice 8 — Frontend Rechnungs-Workflow
**Ziel:** Das Herzstück — die Rechnungstabelle pro Account/Jahr mit Zusammenfassung.
- Rechnungstabelle mit Status-Badges, Filtern, Jahres-/Behandlungsjahr-Tabs (Pendant zu `invoices.js`, aber komponentenbasiert)
- Zusammenfassungs-Box: Ausgabenstand, Selbstbeteiligungs-/Bonus-Fortschritt, "lohnt sich Einreichen?"-Hinweis aus Slice 5
- Dialoge: Rechnung anlegen, Sammeleinreichung, Leistungsabrechnung anlegen/zuordnen

**DoD:** Der komplette Loop aus 1.1.1 ist im Browser durchführbar, mobil nutzbar (responsiv), in Light und Dark Mode geprüft.

**Backlog (spätere Slice, aus der Slice-8-Durchsicht):**
- **Zahlungsstatus-Ampel** in der Rechnungstabelle: ein Ampelpunkt, der zeigt, ob der Nutzer noch überweisen muss und wie dringend — vier Zustände: bereits bezahlt (inkl. Direkt-/Barzahlung), Zahlungsziel > 1 Woche in der Zukunft, innerhalb von 7 Tagen, erreicht/überschritten. Klick auf den Punkt öffnet eine kleine Popup-Blase mit den Zahlungsinformationen (Betrag, Kontonummer/IBAN des Inkassos, Verwendungszweck). Der Verwendungszweck (`transferSubject`) lebt dort, nicht als eigene Tabellenspalte.
- **Sammel-Abrechnung** (eine Leistungsabrechnung, mehrere Rechnungen einer Einreichung auf einmal zuordnen) — in Slice 8 ist die Abrechnung pro Rechnung umgesetzt.
- **Widerspruch-Status für fehlerhafte Leistungsabrechnungen**: eine Abrechnung als fehlerhaft/beanstandet markieren können ("Widerspruch"), um nachzuhalten, ob die Versicherung noch etwas offen hat. Da es zu einer Rechnung mehrere Leistungsabrechnungen geben kann (in der Regel wegen Korrekturen), ist das vermutlich ein neuer Status auf der `ServiceBilling` (nicht auf der Rechnung/Einreichung) — offen/erledigt vs. im Widerspruch. Fließt in die abgeleitete `workflowStatus`-Logik und ggf. die Reimbursement-Analyse ein.
- **Dialog-Layout überarbeiten**: die Formular-Dialoge sind aktuell schmal und hoch (mit Scroll). Mehr Seitenbreite nutzen und flexibler anordnen (mehrspaltig statt einspaltig), damit weniger gescrollt werden muss.
- **Näher an den Stil der Referenz-App** herangehen (visuelle Anmutung/Feinschliff über das bisherige Design-System hinaus).

## Slice 9 — Rechte-Verwaltung UI
**Ziel:** Admins können Rollen und Rechte ohne SQL vergeben.
- Nutzerverwaltung, Rollenverwaltung, Zuordnung Nutzer↔Account-Rechte (UI zu Slice 3/2.4)

**DoD:** Ein Admin kann über die UI einen neuen Nutzer anlegen und ihm Zugriff auf genau einen Account geben; dieser Nutzer sieht dann auch nur diesen Account.

## Slice 10 — Dokumenten-Link & Betriebsreife
**Ziel:** Produktionsreif für Homelab-Betrieb (siehe 2.1).
- `documentLink`-Feld an Invoice/ServiceBilling, UI-seitig als Link auf Paperless/Nextcloud
- Backup/Restore-Skript + einfache Bedienung (`docker exec`-Ansatz aus 2.1), Healthchecks
- Rate Limiting hinter Reverse Proxy, finale `.env.example`/Doku, `docker compose up -d` ohne Zusatzflags

**DoD:** Checkliste aus 2.1 vollständig erfüllt; ein Backup lässt sich erzeugen und in eine frische Instanz zurückspielen (inkl. Migration auf den aktuellen Schema-Stand).

**Nach Slice 10 zusätzlich umgesetzt (Backlog/ad-hoc, nicht als nummerierte Slices):**
Zahlungsstatus-Ampel + Zahlungsinfo-Popover; Setup-Token-Warnung für Admins; Widerspruch-Status auf ServiceBillings; Leistungsabrechnungen-Seite (Vertrags-Picker → Liste, Widerspruch, Anlegen/Bearbeiten/Löschen); klick-Sortierung in allen Daten-Tabellen; Logo-/Close-Button-/Überschriften-Politur.

---

# Dialog-Design & Politur (aus Notes/dialog-design.md)

Abgeleitet aus `Notes/dialog-design.md` + Referenz-Screenshots (`Rechnungsdetails.png`,
`Rechnungen_Verknüpfen.png`, `Leistungsabrechnung auswählen.png`). Reihenfolge nach Abhängigkeit:
risikoarme, wiederverwendbare Bausteine (11–14) zuerst, dann der View/Edit-Umbau (15). Die
Feature-Slices zum Einreichen/Verknüpfen (jetzt 21–22) setzen das Datenmodell v3 (Slices 16–20) voraus.

## Slice 11 — Tabellen-Politur
**Ziel:** Tabellen ruhiger und besser lesbar.
- Aktionen-Spalte nur so breit wie ihr Inhalt (shrink-to-fit); die Datenspalten teilen sich den Rest — der Header steht nicht mehr weit weg von den Icons.
- Eurobeträge **rechtsbündig und untereinander** (tabellarische Ziffern, `font-variant-numeric: tabular-nums`), Kopf entsprechend rechtsbündig.
- Gilt für alle Daten-Tabellen (ResourceView, InvoiceWorkspace, BillingsView, UsersView).

**DoD:** Aktionen-Spalte bündig; €-Spalten rechtsbündig, Nachkommastellen fluchten.

## Slice 12 — EuDialog-Struktur (Höhe & Scroll)
**Ziel:** Dialoge nehmen nie mehr als ~90 % der Bildschirmhöhe ein.
- EuDialog: `max-height: 90vh`, Layout mit **fixem Header + Footer**, nur der **Body** hat `overflow-y` — kein Scrollen des gesamten Dialogs.
- Bestehende Dialog-Inhalte bleiben unverändert.

**DoD:** Ein überlanger Dialog scrollt intern; Titelzeile und Buttons bleiben sichtbar.

## Slice 13 — EuCurrencyField
**Ziel:** Schöne, formatierte Währungseingabe.
- Neues Feld-Component: Tausender-Trennung, Komma-Dezimal, €-Symbol; liefert intern einen sauberen `number`-Wert.
- Einsatz zunächst bei Rechnungsbetrag und Erstattung.
- Offene Entscheidung: externe Lib (`vue-currency-input`) vs. selbst gebaut (Default: schlank selbst).

**DoD:** Beträge werden bei Eingabe/Verlassen korrekt formatiert; der übermittelte Wert ist numerisch korrekt.

## Slice 14 — EuEntityPicker (Typeahead + Ad-hoc-Create)
**Ziel:** Relationen per Typeahead statt Dropdown (skaliert mit wachsenden Listen).
- Vorschlagsliste mit den zur Identifikation sinnvollen Spalten; speichert die UID, zeigt eine treffende Bezeichnung.
- Action-Items am Feld: Clear (`fa-xmark`), optional Search (`fa-magnifying-glass`) + Add (`fa-plus`).
- **Ad-hoc-Create:** ist kein eindeutiger Treffer vorhanden, oben „'xyz' hinzufügen" → Create-Subdialog (mit der Eingabe vorbefüllt); nach Speichern Wert übernehmen, bei Abbruch Feld leeren/zurücksetzen. **Ausnahme: Versicherte** werden so nie angelegt.
- Vorerst client-seitige Filterung (Entscheidung: später Backend-Such-Endpunkte, wenn Listen groß werden).
- Einsatz: Vertrag, Leistungserbringer, Inkasso-Firma, Versicherung; später Leistungsabrechnung.

**DoD:** In mindestens einem Formular ersetzt der Picker das Dropdown inkl. funktionierendem Ad-hoc-Create.

## Slice 15 — View/Edit-Modus als 3-Spalten-Anzeigemaske (Pilot: Rechnung)
**Ziel:** Ansehen/Bearbeiten klar getrennt vom Anlegen (Referenz `Rechnungsdetails.png`).
- Struktur: Zeilen **Label | Wert | Action-Items**, kompakt, Input-Rahmen erst bei Hover/Focus, Dialog etwas breiter.
- Pro Feld **Clear/Reset** mit Regeln: Pflichtfeld → Clear vorhanden aber deaktiviert; Wert geändert → Reset aktiv (setzt auf zuletzt gespeicherten Wert); abgeleitetes/nicht-änderbares Feld (z. B. IBAN aus gewählter Inkasso-Firma) → keine Action-Items.
- Create-Modus bleibt das klassische Formular; Action-Items dort **im Feld rechts eingebettet**, nicht daneben.
- Pilot an der Rechnung; Ausrollen auf weitere Entitäten in Folge-Slices.

**DoD:** Eine Rechnung lässt sich in der neuen Maske ansehen und punktuell editieren; Reset/Clear verhalten sich regelkonform.

# Datenmodell v3: Policen, Mehrfach-Einreichung, Erstattungs-Optimierung

Löst 1.3.7, Modell siehe 2.3 "Datenmodell v3". Jeder Slice ist eine vollständige Scheibe (Migration + API + UI). Slice 16 hat Vorrang, weil er die Erfassung der Echtdaten blockiert.

## Slice 16 — Police & Beitragsstände (inkl. Altdaten-Export)
**Ziel:** Eine Police erscheint genau einmal; Beitragsanpassungen und Konditionen sind Einträge unter ihr.
- Migration: `Contracts` → stabile Police (`contractKind`, `bonusForfeitRule`, `claimFreeYearsAtStart`, `claimFreeCountingFromYear`), neue Tabellen `ContractPremiums`, `ContractTerms` (SB, Obergrenze, Satz; ab Jahr) — die Staffel folgt in Slice 18.
- **Altdaten:** Keine automatische Zusammenführung — der Autor ordnet neu zu. Stammdaten (Versicherte, Versicherungen, Leistungserbringer, Abrechnungsdienstleister) und Rechnungen bleiben erhalten; die Migration entfernt die bisherigen `Contracts`, `Submissions`, `ServiceBillings` und `Allocations`, Rechnungen gelten danach wieder als nicht eingereicht und werden neu zugeordnet. **Kein Legacy-Code in der App:** Stattdessen ein einmaliges Export-Skript (`scripts/export-legacy-contracts.sh`), das **vor dem Update** über `docker compose exec db mariadb --batch` direkt gegen die laufende (alte) DB zwei lesbare CSVs erzeugt — Policen (Nummer, Versicherung, Versicherter, Zeitraum, SB, Beitrag, Bonus) und Einreichungen (mit Rechnungen, Leistungsabrechnungen, Erstattungen) — als Vorlage für die Neuerfassung. Unabhängig von der App-Version, da es nur den DB-Container nutzt. Update-Anleitung: 1. Backup (Slice-10-Skript) als Rückfallebene, 2. Export-Skript, 3. neue Version starten.
- API: CRUD für Beitragsstände und Konditionen unter der Police; Police-Response enthält aktuellen Beitrag und aktuelle Konditionen.
- UI: Policen-Liste mit einer Zeile pro Police (Nummer, Versicherter, Versicherung, Art, aktueller Beitrag, SB, Laufzeit); Detailansicht (Anzeigemaske aus Slice 15) mit Beitragsverlauf (gültig von–bis) und Konditionen je Jahr, Aktionen "Beitragsanpassung erfassen" / "Konditionen ab Jahr erfassen". Einreichen/Picker wählen nur noch die Police.

**DoD:** Eine Police mit drei unterjährigen Beitragsständen erscheint einmal in Liste und Picker, der Verlauf zeigt die Gültigkeitszeiträume; die SB ist über das Jahr eine Größe; das Export-Skript erzeugt auf einer Kopie der Prod-Daten vollständige CSVs; die Migration läuft auf dieser Kopie durch, Rechnungen und Stammdaten bleiben erhalten.

**Umgesetzt (2026-09-21).** Entscheidungen beim Bau:
- Das Export-Skript läuft auf dem Prod-Host über `docker compose exec -T api … mariadb` (Zugangsdaten wie `backup.sh`); per `EXPORT_SQL_RUNNER` auch gegen andere DBs (z. B. Dev) nutzbar. Update-Anleitung im README ("Updating to the policy model").
- Migration `006-contract-policy-model`; Beiträge und Konditionen teilen sich einen generischen History-Router (`domain/contract-history.ts`), `validTo`/`validToYear` werden abgeleitet, nicht gespeichert. Anlegen einer Police nimmt optionale Startwerte (erster Beitrag, erste Konditionen) in einer Transaktion.
- Bis Slice 18 ist der Bonus in der Analyse **0** und als `bonusPending` gekennzeichnet; die Zusammenfassung zeigt "noch nicht erfasst" und gibt keine Einreichungs-Empfehlung.
- Detailansicht als **breiter Dialog** aus der Policen-Liste (`ResourceConfig.detailDialog`); Anlegen bleibt das klassische Formular.
- Nebenbei behoben: im Dark Mode hatte Akzentblau als **Textfarbe** (Sekundär-Buttons, aktiver Tab, Sortier-Header …) nur 3,45:1 Kontrast — neues Token `--eu-color-accent-text` (siehe `CONTRAST.md`).

## Slice 16a — Code-Formatierung durchsetzen (Zwischen-Slice, vor Slice 17)
**Anlass:** In Slice 16 hat ein Prettier-Lauf 53 nicht betroffene Dateien umformatiert (30 `apps/web`, 22 `apps/api`, README). Ursache: Die CI prüft die Formatierung nicht — `ci.yml` führt nur lint/typecheck/test/build aus, `format:check` existiert als Skript, läuft aber nirgends. Das Zurückdrehen der Formatierung in Slice 16 war die falsche Lösung. **Festlegung des Autors: Der Code ist immer Prettier-formatiert (`.prettierrc`); Abweichungen werden behoben, nicht umgangen.**
- **Einmal alles formatieren** (`npm run format`) als eigener Commit ohne Logikänderung; der Commit-Hash kommt in `.git-blame-ignore-revs`.
- **ESLint-Konflikt im Code lösen:** Prettier bricht in `EuDetailField.vue` einen `||`-Ausdruck so um, dass `vue/no-deprecated-filter` ihn als Vue-2-Filter meldet — Ausdruck z. B. in eine `computed` auslagern, nicht die Regel abschalten und nicht die Datei unformatiert lassen.
- **CI:** `npm run format:check` als Schritt in `.github/workflows/ci.yml`.
- **Arbeitsablauf:** `format`/`format:check` gehört ab jetzt in die Verifikation jeder Slice; Formatierungs-Drift wird als eigener Commit behoben.
- `Notes/` bleibt in `.prettierignore`.

**Entscheidung (Planmodus):** ja, Pre-Commit-Hook mit husky + lint-staged, der auf den gestagten Dateien `eslint --fix` und `prettier --write` ausführt.

**DoD:** `npm run format:check` ist grün im ganzen Repo; `npm run lint`/`typecheck`/`test` bleiben grün; die CI schlägt bei unformatiertem Code fehl.

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Der Konflikt lag nicht am `||`, sondern an den Template-Casts `(modelValue as number | null)`: Prettier entfernt die Klammern, danach liest `vue/no-deprecated-filter` das `|` des Union-Typs als Filter. Die Casts stehen jetzt in `computed`s (`numberValue`/`stringValue`/`booleanValue`).
- Das `prepare`-Skript importiert husky per `node -e` und überspringt ihn stillschweigend, wenn husky fehlt: Das Docker-Image führt `npm ci --omit=dev` aus und kopiert dabei nur die `package.json`, deshalb würden `"prepare": "husky"` oder eine Skriptdatei den Build brechen.
- CI: `format:check` läuft vor `lint`. Der Formatierungs-Commit steht in `.git-blame-ignore-revs`, und DEV.md beschreibt den Hook.

## Slice 17 — Mehrfach-Einreichung
**Ziel:** Eine Rechnung kann bei mehreren Policen eingereicht werden, bei derselben Police aber nur einmal.
- Migration: `SubmissionInvoices` mit `UNIQUE (invoiceUID, contractUID)`, `Invoices.submissionUID` entfällt; `InvoiceExclusions`.
- Validierung: Summe der Allocations je Rechnung ≤ Rechnungsbetrag; keine Einreichung bei Policen mit Ausschluss-Markierung.
- Abgeleiteter Status je Einreichung + Gesamtstatus und Restbetrag je Rechnung; Workspace-Tabelle zeigt, bei welchen Policen eine Rechnung liegt.
- UI: Einreichen-Dialog bietet nur Policen an, bei denen die Rechnung noch nicht liegt; Aktion "Rest bei weiterer Police einreichen"; Markierung "nicht erstattungsfähig bei …" am Rechnungs-Detail.

**DoD:** Rechnung bei x einreichen → abrechnen (Teilerstattung) → Rest bei y einreichen → abrechnen; zweite Einreichung bei x wird abgelehnt; Überschreitung des Rechnungsbetrags wird abgelehnt.

**Entscheidungen (Planmodus):**
- Gesamtstatus in fünf Stufen mit neuem `teilabgerechnet` und der Markierung „als abgerechnet“ (`Invoices.reimbursementClosed`), siehe 2.3 „Abgeleiteter Status“.
- **Abweichung vom Slice-Text:** Die Workspace-Tabelle zeigt nur den Gesamtstatus, **keine Policen-Spalte**. Den Status je Einreichung zeigt der Rechnungs-Detaildialog.
- Eine Einreichung kann **zurückgezogen** werden, solange sie keine Leistungsabrechnung hat (z. B. versehentlich bei der falschen Police eingereicht).

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Migration `007-multi-submission`: In `SubmissionInvoices` sichert ein zusammengesetzter Fremdschlüssel `(submissionUID, contractUID)` auf `Submissions`, dass die denormalisierte Police nie von der Einreichung abweicht; `UNIQUE (invoiceUID, contractUID)` erzwingt „einmal je Police“. Verknüpfungstabellen (auch `InvoiceExclusions`) haben keine eigene UID und keinen Status, sie werden hart gelöscht. `down` ist verlustbehaftet (behält je Rechnung die Einreichung mit der kleinsten UID).
- Status-Ableitung als reine Funktion `domain/invoice-status.ts` (Beträge in Cent verglichen). Eine Erstattung von 0 € zählt als Antwort der Versicherung, die Rechnung ist dann `teilabgerechnet`.
- Bereicherungsverbot beim Zuordnen einer Erstattung und beim Senken des Rechnungsbetrags, jeweils in einer Transaktion mit Sperre auf die Rechnung (`db/transaction.ts`); der Abrechnen-Dialog prüft zusätzlich vorab, damit keine leere Leistungsabrechnung zurückbleibt.
- Einreichen ist gesperrt bei ausgeschlossener, schon belieferter oder „als abgerechnet“ markierter Rechnung. Das Zurückziehen der letzten Einreichung hebt die Markierung wieder auf, und eine leere Einreichung wird gelöscht.
- Die Analyse je Police (bis Slice 19) zählt nur noch die eigenen Erstattungen der Police und lässt dort ausgeschlossene Rechnungen weg.
- UI: Zeilenaktionen „Bei weiterer Police einreichen“ und „Als abgerechnet markieren“; der Einreichen-Dialog bietet nur Policen an, die für alle gewählten Rechnungen noch in Frage kommen (`invoices/eligibility.ts`); im Abrechnen-Dialog wird die Police gewählt; der Widerspruch-Dialog sammelt die Abrechnungen aller Policen. Neuer Badge-Ton `partial` (Violett) für „Teilabgerechnet“.

## Slice 18 — Bonus-Staffel & Leistungsfreiheit
**Ziel:** Der erwartete Bonus ergibt sich aus Staffel und gezählten leistungsfreien Jahren.
- `ContractBonusTiers` (absolute Beträge je Stufe, an `ContractTerms` = Versicherungsjahr gebunden), "vom Vorjahr übernehmen", Kennzeichnung geerbter Staffeln als "nicht aktualisiert".
- `ServiceBillings.forfeitsBonus` (Abfrage bei Erfassung der Erstattung, Default aus `bonusForfeitRule`), `ContractYears` (tatsächliche Rückerstattung, Override "verwirkt").
- Service: leistungsfreie Serie je Police und Jahr, erwarteter Bonus; Unit-Tests für Serienbruch, Startwert, Override, beide Verwirk-Regeln.
- UI: Staffel und Jahresverlauf (leistungsfrei ja/nein, erwartet vs. tatsächlich erhalten) in der Policen-Detailansicht.

**DoD:** Für eine Police mit Startwert und mehreren Jahren stimmt die gezählte Serie; ein Jahr mit Erstattung setzt sie zurück; eine erfasste tatsächliche Rückerstattung überschreibt die Prognose.

**Entscheidungen (Planmodus):**
- Beim Erfassen der Erstattung ein **Schalter „Diese Abrechnung verwirkt den Bonus“**, vorbelegt aus der Regel der Police (und bei „erst durch Erstattung“ aus dem Betrag > 0). Gespeichert wird immer ein fester Wert; `NULL` bleibt nur für Abrechnungen ohne diese Abfrage und folgt der Regel.
- Die Jahres-Zusammenfassung der Rechnungsübersicht bleibt bis Slice 19 unverändert (`bonusPending`) — in Slice 19 auf den Erstattungsplan umgestellt.

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Migration `008-bonus-scale`: `ContractBonusTiers` (PK `termsUID` + Jahre, als Menge ersetzt, ohne UID/Status), `ContractYears` (PK Police + Jahr, hart gelöscht, sobald alle Felder leer sind), `ServiceBillings.forfeitsBonus` (nullable).
- Reine Funktion `domain/bonus-timeline.ts`. Regeln: Jede Erstattung einer Rechnung wird einzeln bewertet (`forfeitsBonus` der Abrechnung, sonst die Regel; bei „erst durch Erstattung“ verwirkt eine 0-€-Erstattung nicht). Eine eingereichte Rechnung ohne Erstattung verwirkt bei „schon durch Einreichen“ sofort, sonst zählt sie als „in Gefahr“. Der Override je Jahr schlägt alles. Die Serie **schließt das Jahr selbst ein** (erstes leistungsfreies Jahr → Stufe „1 Jahr“), über der obersten Stufe gilt deren Betrag. Gezählt wird ab dem Zählbeginn bis zum laufenden Jahr bzw. Vertragsende; ein angebrochenes erstes Jahr lässt man über den Zählbeginn aus.
- Die Staffel hängt an den Konditionen (`bonusTiers` in POST/PATCH `…/terms`, in einer Transaktion). „Vom Vorjahr übernehmen“: Neue Konditionen starten als Kopie der geltenden (inkl. Staffel). Aus dem Jahresverlauf lassen sie sich für ein Jahr mit geerbter Staffel direkt anlegen.
- „Nicht aktualisiert“ erscheint nur, solange die Prognose zählt: nicht bei verwirkten Jahren und nicht, wenn die tatsächliche Rückerstattung erfasst ist.
- Der Jahresverlauf ist Teil von `GET /contracts/:uid` (`years`); `PUT/DELETE /contracts/:uid/years/:year` speichert tatsächliche Rückerstattung, Override und Notiz.
- Schalter in „Abrechnung zuordnen“ (bei einer bestehenden Abrechnung zählt deren bisherige Erstattung mit, und ein gespeichertes „nein“ wird bei „erst durch Erstattung“ und Betrag > 0 als „ja“ vorgeschlagen), „Neue Leistungsabrechnung“ und „Abrechnung bearbeiten“.

## Slice 19 — Erstattungs-Optimierer
**Ziel:** Berechnung "wo lohnt sich Einreichen?" über alle Policen eines Versicherten.
- Reiner Service nach 2.3 (Strategie-Enumeration, Vollversicherung vor Zusatz, Rest-Logik, Ausschlüsse, verwirkte Boni), ausführlich dokumentiert (2.8).
- Endpoint `GET /api/v1/accounts/:accountUID/reimbursement-plan?year=` ersetzt `GET /contracts/:uid/reimbursement-analysis`.
- Tests: die drei Beispieljahre aus 2.3 wörtlich, dazu Grenzfälle (keine Zusatzversicherung, Obergrenze < Bonus, Bonus bereits verwirkt, alle Rechnungen ausgeschlossen, Erstattungssatz < 100 %).

**DoD:** Alle Beispieljahre liefern die erwartete Empfehlung; der Endpoint liefert Strategie, Schwellen und Empfehlung je Rechnung.

**Entscheidungen (Planmodus):**
- **Realität hat Vorrang:** Erfasste Einreichungen, Erstattungen, verwirkte Boni und tatsächlich erhaltene Rückerstattungen gehen fest ein; modelliert wird nur, was noch offen ist.
- Verglichen wird nur der Bonus des betrachteten Jahres; dass ein verwirktes Jahr auch die Serie der Folgejahre zurücksetzt, wird als Hinweis angezeigt, aber nicht in € eingerechnet.
- Der alte Endpoint entfällt; die Zusammenfassung der Rechnungsübersicht wird minimal auf den Plan umgestellt. Der Neuentwurf mit Alternativen-Vergleich und Badges je Rechnung bleibt Slice 20.

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Reine Funktion `domain/reimbursement-optimizer.ts` (Cent-Arithmetik), Loader und Endpoint in `domain/reimbursement-plan.ts`; `reimbursement.ts` und `reimbursement-analysis.ts` sind entfernt.
- Bonus-Modus je Police aus dem Jahr der Slice-18-Timeline: `choice` (Bonus erwartet, nicht verwirkt) wird enumeriert; `forfeited` (verwirkt, keine Staffel oder Jahr außerhalb der Zählung) wird immer genutzt; `paid` (tatsächliche Rückerstattung erfasst) wird immer geschont.
- Reihenfolge: Vollversicherungen vor Zusatzversicherungen (dann nach Vertragsnummer), Rechnungen nach Behandlungsdatum. SB und Obergrenze einer Police werden zuerst von den schon abgerechneten Rechnungen verbraucht (verbrauchte SB ≈ Betrag − Erstattung/Satz), dann von den modellierten. Basis einer Rechnung ist ihr noch offener Betrag, deshalb gilt das Bereicherungsverbot auch im Modell.
- Bei Gleichstand gewinnt die Strategie, die mehr Policen schont.
- Schwelle `worthUsingAbove` nur für geschonte Policen mit Bonus im Spiel: weitere Kosten (hypothetische, überall erstattungsfähige Rechnung), ab denen das Nutzen mit dem Schonen gleichzieht; `null`, wenn das nie passiert (z. B. Obergrenze < Bonus). Gesucht in 10-€-Schritten, dann per Bisektion auf den Cent.
- Empfehlung je Rechnung und Police: `answered`, `submitted`, `submit`, `withdraw` (liegt ohne Abrechnung bei einer geschonten Police), `excluded`, `none`; daraus die Gesamtaktion `submit`/`withdraw`/`hold`/`done`/`not-reimbursable`. Eine genutzte Police wird auch unterhalb der SB empfohlen, weil die Rechnung dort auf die SB zählt; eine Zusatzversicherung mit ausgeschöpfter Obergrenze nicht mehr.
- **Nachgeschärft nach Review des Autors:** Je Police ein Handlungs-Status statt nur „nutzen/schonen“:
  - **Schonen**: Der Bonus ist (noch) mehr wert als das Einreichen.
  - **Einreichen**: jetzt einreichen — bei der Vollversicherung alles, bei der Zusatzversicherung, was die Vollversicherung nicht erstattet.
  - **Abwarten**: Zusatzversicherung im laufenden Jahr (oder später), solange eine vorgelagerte, geschonte Police durch weitere Kosten noch kippen kann (Schwelle ≠ `null`). Sonst würde sie jetzt Anteile zahlen, die später die Vollversicherung trägt.
  - **Erschöpft**: Die Obergrenze der Zusatzversicherung ist erreicht und dort ist nichts mehr einzureichen. Wird die Obergrenze nur im Modell durch noch nicht eingereichte Rechnungen erreicht, bleibt es bei „Einreichen“.
  - Je Rechnung gibt es dazu die Aktion `wait`. Abgeschlossene Jahre kennen kein „Abwarten“.

## Slice 20 — Übersicht & Empfehlungen
**Ziel:** In der Rechnungsübersicht ist auf einen Blick klar, wo welche Rechnung eingereicht werden sollte.
- Zusammenfassung pro Versichertem/Jahr neu: je Police SB-Fortschritt, Bonus (sicher / in Gefahr / verwirkt, erwartete Höhe), Ausschöpfung der Zusatz-Obergrenze; empfohlene Strategie mit Vergleich der Alternativen (Ersparnis in €).
- Empfehlungs-Badge je Rechnung in der Tabelle (Text + Icon, nicht nur Farbe — 2.7).

**DoD:** Für die Beispieljahre zeigt die Übersicht die richtige Empfehlung inkl. Betragsvergleich; responsiv, Light/Dark, axe ohne kritische Findings.

**Entscheidungen (Planmodus):**
- Das Badge je Rechnung ist **möglichst schmal** (kompaktes Badge: Farbe + Icon + ein Wort), die Details stehen im Tooltip. Es gibt **keine neue Spalte**, das Badge sitzt in der Status-Zelle.
- Rechnungen ohne Handlungsbedarf (`done`) bekommen kein Badge.
- Die Zusammenfassung bleibt unter der Tabelle.

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Der Optimizer liefert je Police zusätzlich `deductibleUsed` (von beantworteten und modellierten Rechnungen gefüllte SB) und `eligibleCosts`. Bei einer geschonten Police wird die SB so gezählt, als würde sie zusätzlich genutzt, damit der Fortschritt zeigt, wie nah die Kosten schon an der SB sind.
- Reine Anzeigelogik in `invoices/recommendation.ts` (Badge je Rechnung, Bonuslage, Strategie-Beschriftung, Hinweistexte), unit-getestet mit den Beispieljahren. Badges: Einreichen / Rest (erste Police hat schon geantwortet) / Zurückziehen / Abwarten / Zurückhalten / Nicht erstattbar.
- Bonuslage: **Sicher** (im Spiel, geschont, nichts offen), **In Gefahr** (die Empfehlung nutzt die Police, oder eine Einreichung dort ist noch unbeantwortet), **Verwirkt**, **Erhalten**, **Kein Bonus**.
- Karte je Police mit Balken für SB und Obergrenze (bei der Obergrenze: tatsächlich erstattet voll, erwartet schraffiert). Die Balken sind rein visuell, die Werte stehen immer als Text daneben. Der Vergleich der Alternativen ist eine aufklappbare Tabelle (Erstattungen, Boni, Gesamt, Differenz), die empfohlene Zeile ist mit „Empfohlen“ + Icon markiert.
- `EuBadge` hat ein `compact`-Prop, `EuTooltip` ein `plain`-Prop (ohne Unterstreichung) und positioniert jetzt `fixed` mit Umbruch, damit Tabellen-Wrapper mit `overflow` den Tooltip nicht abschneiden.

---

## Slice 21 — Rechnungs-Detaildialog mit Einreichungs-/Abrechnungs-Block (bisher Slice 16)
**Ziel:** Einreichungen und darauf erfolgte Leistungsabrechnungen direkt am Rechnungs-Detail verwalten.
- Kartenblock (wie Referenz „Zuordnung") mit Action-Items: einreichen, Leistungsabrechnung verknüpfen, Erstattung erfassen — **Karten nach Police gruppiert**, mit Restbetrag und Empfehlung aus Slice 19/20.
- Reorganisiert die heutigen Workspace-Zeilenaktionen und Einzeldialoge.
- Das Mapping Rechnung→Einreichung→ServiceBilling→Allocation ist durch das Datenmodell v3 geklärt; die vorherige Modell-Design-Runde entfällt.

**DoD:** Von der Rechnung aus einreichen/abrechnen/erstatten — auch bei einer zweiten Police — ohne Umweg über getrennte Zeilenaktionen.

**Entscheidungen (Planmodus):**
- Karten nur für **genutzte** Policen (bestehende Einreichungen und Markierungen), dazu ＋-Aktionen im Blockkopf — wie in der Referenz-App. Kein Kartenraster über alle Policen der Person.
- Zeilenaktionen im Workspace bleiben schlank: Dokument öffnen, Einreichen (nur bei Status `offen`), Bezahlt markieren, Details, Löschen. Weg: bei weiterer Police einreichen, Abrechnung zuordnen, Als abgerechnet markieren, Widerspruch — alles davon steckt jetzt im Detaildialog. Bulk-Einreichen/-Löschen in der Toolbar bleiben.

**Umgesetzt (2026-09-22).** Entscheidungen beim Bau:
- Die Rechnungs-API liefert je Einreichung zusätzlich `allocations` (Abrechnungsnummer, -datum, Belegnummer, Betrag, offener Widerspruch). Eine gebatchte Abfrage in `invoices.ts`, gruppiert nach Rechnung **und** Einreichung — eine Einreichung bündelt mehrere Rechnungen, die Einreichung allein wäre kein eindeutiger Schlüssel.
- Block „Zuordnung" mit `SubmissionCard.vue` je Einreichung (Status, Empfehlungs-Badge aus dem Plan, Abrechnungsliste mit Widerspruchs-Marker, Aktionen: Abrechnung erfassen / Widerspruch / Zurückziehen / einzelne Erstattung entfernen) und gedämpften Karten für die „nicht erstattungsfähig"-Markierungen.
- `SubmitDialog`, `BillingDialog` und `ObjectionDialog` hängen jetzt am Detaildialog und rufen die API selbst auf; die zusammengesetzte Speicherlogik (Abrechnung anlegen → Erstattung buchen → Bonus-Flag) liegt in `billing-actions.ts`. `BillingDialog` bekam `presetSubmission` für die Vorbelegung aus der Karte.
- Erstattungen werden über `DELETE /allocations/:uid` entfernt (die Leistungsabrechnung bleibt); `policyActionBadge()` in `recommendation.ts` übersetzt die Plan-Aktion je Police in ein Badge.
- **Achtung für Tests:** Die API-Integrationstests löschen alle Daten. Sie laufen nur gegen eine separate Datenbank (`eunomia_test`), nie gegen die Dev-DB `eunomia`.

## Slice 21a — Dev-Datenbestand & Reset (Zwischen-Slice, umgesetzt 2026-09-22)
**Anlass:** Die API-Integrationstests löschen alle Daten; einmal versehentlich gegen die Dev-DB gelaufen, war der Dev-Bestand weg. Daraus die Konsequenz: ein Seed, der den Dev-Bestand jederzeit reproduzierbar neu aufbaut, und eine klare Trennung der Testdatenbank.
- `npm run dev:seed` / `npm run dev:reset` (`scripts/dev-seed.sh`, `--reset` löscht vorher alles); im API-Workspace `seed`/`seed:reset`. Beide verweigern `NODE_ENV=production`.
- Seed-Datensatz deckt bewusst Edge Cases ab: jeder Workflow-Status, beide Zahlungs-Ampeln (überfällig / bald fällig), Barzahlung, Rechnung bei zwei Policen, offener Widerspruch, Nachkorrektur über eine zweite Leistungsabrechnung, nicht aktualisierte Bonus-Staffel, Ausschluss-Markierung, Versicherter ohne Police.
- `seed/example-years.ts` bildet die drei Beispieljahre des Autors (§2.3) als echte Daten ab (Clara, X-1/Y-1). Im laufenden System liefert der Optimierer: 450 € (nur Y), 650 € gegen 640 € (nur Y), 1000 € (X + Rest bei Y) — also genau die Referenztabelle.
- Behandlungsjahre sind relativ zu heute, damit das aktuelle Jahr immer Daten hat.
- **Nachgetragen (2026-09-23), `seed/family-policy.ts`:** der Familienfall — Mutter mit Hauptvertrag, Kind (`Mia`) mit eigener Mitglieds-Police `PKV-2020-0001/02` unter demselben Vertrag und derselben Versicherung. Beide reichen im selben Jahr getrennt ein; **eine** Leistungsabrechnung der Versicherung wird zu **zwei** `ServiceBillings`-Zeilen mit gleicher Nummer und gleichem Datum — je eine pro Einreichung. Das ist keine Notlösung: SB, Obergrenze und Bonus hängen an der Police, die Beträge müssen also ohnehin je Police geführt werden. Kollidiert mit keinem UNIQUE (nur `billingUID` ist eindeutig, `billingNumber` nicht). Mutter-Seite ist gebucht, Kind-Seite bewusst offen, damit der zweite, getrennte Zuordnungslauf im laufenden System durchklickbar ist.
- **Dabei gefunden und behoben:** `seedId()` bildete Indizes ab 32 auf Kleinbuchstaben ab. Die UID-Spalten nutzen eine case-insensitive Collation (`utf8mb4_uca1400_ai_ci`), `iSEEDaaaaaaa` fällt also mit `iSEEDAAAAAAA` zusammen — `seedRow`s `ON DUPLICATE KEY UPDATE` verschluckte die Zeile kommentarlos. `seedId` nutzt jetzt nur noch Ziffern und Großbuchstaben (0–31) und wirft außerhalb; abgesichert in `seed/helpers.test.ts`.
- **Regel:** API-Integrationstests nur mit `DB_NAME=eunomia_test`, nie gegen `eunomia`. In DEV.md dokumentiert.

## Slice 22 — Verknüpfen-Dialog + Such-Subdialog + Bulk (bisher Slice 17)
**Ziel:** Leistungsabrechnung bequem finden/anlegen/verknüpfen, auch in Masse (Referenz `Rechnungen_Verknüpfen.png`, `Leistungsabrechnung auswählen.png`).
- Auswahlfeld mit Search (🔍 → Filter-Subdialog: Nummer/Freitext, Zeitraum, „unverknüpft", Erstattungs-Range) und Add (＋ → Create).
- Backend: Such-/Filter-Endpunkt für ServiceBillings.
- **Bulk-Verarbeitung** fürs Einreichen und Verknüpfen mit **Kompatibilitätsprüfung** (Einreichen: Rechnungen noch nicht bei dieser Police und nicht ausgeschlossen; Verknüpfen: Rechnungen derselben Einreichung).

**DoD:** Mehrere kompatible Rechnungen in einem Zug verknüpfen; die Suche filtert korrekt.

**Umgesetzt (2026-09-23).** Entscheidungen beim Bau:
- **Bulk-Einreichen war schon da** (Slice 17: `POST /submissions` mit `invoiceUIDs[]`, `commonSubmittableContracts()`, serverseitig `assertInvoicesSubmittable`). Diese Scheibe baut nur das fehlende Gegenstück: Bulk-**Verknüpfen**.
- `GET /billings` bekam die Filter `q` (Freitext über Abrechnungs-, Vertrags-, Personen- und **Rechnungsnummern**), `from`/`to`, `unlinked`, `minReimbursement`/`maxReimbursement`, `limit` — kein eigener `/search`-Pfad, wie schon bei `GET /invoices`. Die Rechnungsnummern werden über ein eigenes `EXISTS` gematcht, nicht über einen weiteren Join, sonst vervielfachen sich `reimbursedTotal` und `invoiceCount`.
- Neu als Konvention: `parseQuery(req, schema)` in `crud/params.ts` validiert Query-Parameter per zod und antwortet mit einem 400, das den Parameter nennt — Bodies bleiben bei `schema.parse()` mit der ZodError-Antwort „Invalid request body".
- **`POST /billings/:uid/allocations`** (`entries[]`, transaktional) ersetzt das Einzel-`POST /allocations`. Die Prüfungen laufen gebündelt wie `assertInvoicesSubmittable` und nennen alle betroffenen **Rechnungsnummern**: unbekannt/inaktiv (400), nicht in der Einreichung der Abrechnung (400), Erstattungen über dem Rechnungsbetrag (409). Die Einreichung folgt aus der Abrechnung, der Client wiederholt sie nicht je Eintrag. `GET`/`DELETE /allocations` bleiben.
- `EuEntityPicker` hat jetzt `allowSearch` + `search`-Emit; die In-Feld-Aktionen sind 🔍 ＋ ✕ in dieser Reihenfolge (＋ öffnet den Create-Dialog jetzt auch direkt am Feld, nicht nur über die Listenzeile).
- `BillingDialog` arbeitet auf **N Rechnungen** (`invoices[]` statt `invoice`), mit einer Karte je Rechnung (eigener Betrag, Belegnummer, Entfernen), einem Picker zum Nachladen weiterer Rechnungen derselben Einreichung und ohne die alte Radio-Gruppe „bestehende/neue Abrechnung" — neu anlegen läuft über ＋. Der Einzelfall aus dem Detaildialog ist derselbe Dialog mit einer Karte.
- Neu: `BillingSearchDialog` („Leistungsabrechnung auswählen", serverseitig gesucht, auf die Einreichung gescoped) und `BillingFormDialog` (schlankes Anlegen unter bekannter Einreichung). Entprellt über `lib/debounce.ts`.
- `commonSubmissions()` in `eligibility.ts` ist die Kompatibilitätsprüfung fürs Verknüpfen; im Workspace hängt daran der Toolbar-Button „Abrechnung zuordnen (n)".
- `BillingsView` filtert über denselben Endpunkt (Filterleiste über der Tabelle).
- **Nachgezogen:** Dialoge, die auf eine Auswahl wirken, nennen nicht mehr nur eine Anzahl. `InvoiceBriefList` listet Nummer, Leistungserbringer, Datum und Betrag je Rechnung — im Einreichen-Dialog, in der Löschen-Bestätigung und (als Teil der Karten) beim Zuordnen. Die Namen kommen als `facilityUID → Name` von der jeweiligen Sicht.
- **Offen gewesen:** `NewBillingDialog` (Anlegen mit Betragsraster aus der Vertragssicht) und der erweiterte `BillingDialog` überschnitten sich inhaltlich — zusammengeführt in Slice 27.

## Slice 23 — Anzeigemaske für die Stammdaten (Rollout aus Slice 15)
**Ziel:** Ansehen/Bearbeiten ist überall die 3-Spalten-Maske, Anlegen überall das klassische Formular.
- Generischer, aus `ResourceConfig.fields` gespeister Detaildialog für Versicherte, Versicherungen, Leistungserbringer und Abrechnungsdienstleister (Rechnung und Police haben ihre eigenen Masken).
- Clear/Reset je Feld nach den Regeln aus `dialog-design.md`; abgeleitete/nicht änderbare Felder ohne Action-Items.

**DoD:** Jede Stammdaten-Ressource lässt sich in der Maske ansehen und punktuell editieren; Clear eines optionalen Feldes wird auch gespeichert; „Neu" öffnet weiterhin das Formular.

**Entscheidungen (Planmodus):**
- Die offene Entscheidung aus Slice 15 ist beantwortet: **alle Entitäten**, nicht nur der Rechnungs-Pilot.
- **Nicht dabei:** Benutzerverwaltung (Rollen-/Berechtigungs-Fieldsets passen nicht ins Label|Wert|Aktionen-Raster) und „Abrechnung bearbeiten" in der Leistungsabrechnungs-Liste (eigener Dialog ohne `ResourceConfig`).
- Fehler bleiben **eine** Meldung unter dem Raster (Pflichtfelder clientseitig, Formatfehler vom Server) — kein Feld-Fehler-Mapping.

**Umgesetzt (2026-09-23).** Entscheidungen beim Bau:
- `ResourceDetailDialog.vue` ist wie `ResourceFormDialog` **dumm**: Es sammelt nur Werte, die Requests bleiben in `ResourceView` (`onSubmit` entscheidet weiter PATCH vs. POST). Dadurch teilen Formular und Maske eine Speicherlogik.
- **Unterschied im Payload:** Das Create-Formular lässt leere Optionale weg (Server-Default), die Maske schickt sie als `null` — sonst käme ein geleertes Feld nie beim Server an. Die zod-Schemata der Stammdaten sind bei allen optionalen Feldern `.nullish()`, das passt ohne API-Änderung.
- `ResourceFormDialog` ist damit reiner Create-Dialog (`editing`-Prop und der `immutable`-Zweig sind raus); der Ad-hoc-Create aus `InvoiceFormDialog` nutzt ihn unverändert weiter.
- Das Raster steckt jetzt in `EuDetailMask.vue`; Rechnungs- und Policen-Dialog nutzen es statt je einer eigenen Kopie der Grid-CSS.
- `EuDetailField` kennt zusätzlich `number` (mit `step`, leer = `null`) für die Entfernung des Leistungserbringers und `email`.
- Neu `ResourceConfig.detailTitle`: Die Maske nennt den Datensatz („Versicherung: Beispiel Krankenversicherung AG") statt „… bearbeiten".
- `EuDialog.is-wide` hat jetzt auch eine **Mindestbreite** (38rem): Ohne sie war eine Maske mit zwei kurzen Feldern exakt so breit wie das Create-Formular, der vom Design gewollte Breitenunterschied fehlte.
- Im laufenden System geprüft (Playwright, Light/Dark, 390 px): Clear auf Pflichtfeldern deaktiviert, Reset erst nach Änderung, geleerte Entfernung ist nach dem Speichern wirklich leer, PLZ-Fehler der API erscheint unter dem Raster.
- **Aufgefallen, nicht in dieser Scheibe behoben:** Validierungsmeldungen der API sind englisch („Expected a 5-digit postal code") — betrifft Formular und Maske gleichermaßen.

## Slice 24 — Fehlermeldungen: in der UI durchgängig deutsch
**Anlass:** In Slice 23 quittierte eine falsche PLZ die Stammdaten-Maske mit „Expected a 5-digit postal code". Kein Einzelfall: Auch „Record is still referenced by other records" oder „Invoice not found" landeten wörtlich in deutschen Dialogen, und fünf Stellen zeigten `err.message` sogar ganz ohne `describeError`.

**Festlegung des Autors:** Was der Nutzer in der UI sieht, ist deutsch; Konsolen-Logs und die API-Antworten selbst bleiben englisch. Fehler**codes** sind maschinenlesbar, keine Sprache — die API darf also präzisere Codes bekommen, ohne ihre Texte zu ändern.

**DoD:** Jede Meldung, die ein Dialog oder eine Liste anzeigt, ist ein deutscher Satz — auch der Fallback für einen (noch) nicht übersetzten Code.

**Umgesetzt (2026-09-23).** Entscheidungen beim Bau:
- Neu `apps/api/src/lib/error-codes.ts` als **Vertrag mit der UI**: ~35 Codes statt der bisherigen Sammelcodes `CONFLICT`/`BAD_REQUEST`. `ApiError` trägt jetzt optionale `details`, die der Error-Handler mitserialisiert — Daten, die bisher nur im Satz standen (betroffene Rechnungsnummern, Ressourcenname, `kind: premium|terms`), sind damit maschinenlesbar.
- Die englischen Messages blieben, wo Tests sie prüfen. **Eine Ausnahme mit Absicht:** Die Einreichungs-Prüfung nannte Rechnungen bisher per UID, jetzt per Nummer (wie der Allocations-Pfad es schon tat) — die UID sagt dem Nutzer nichts.
- Die beiden einzigen deutschen Sätze in der API (Nutzerverwaltung) sind jetzt englisch mit Code; Deutsch steht nur noch im Web.
- Web: `lib/field-labels.ts` (Payload-Key → Label + Formathinweis für Regex-Regeln) und `lib/error-messages.ts` (zod-Issue → Satz über `code`/`validation`, Code → Satz mit Interpolation aus `details`). `describeError` setzt beides zusammen.
- **Kein englischer Fallback mehr:** Ein unbekannter Code ergibt „Die Aktion ist fehlgeschlagen." und einen `console.error` mit dem Original.
- `conflictMessage` bleibt als kontextabhängige Übersteuerung (Rechnungsbetrag senken vs. Erstattung buchen); die vier Aufrufer, deren Text der Code jetzt genauer sagt, geben ihn ab.
- Nachgezogen: `BillingsView`, `ObjectionDialog`, `NewBillingDialog` und `InvoiceFormDialog` rendern nicht mehr `err.message`.
- Geprüft im laufenden System: PLZ- und URL-Regel, doppelter Beitragsstand (409) und — in zwei Sitzungen — das Speichern einer inzwischen gelöschten Leistungsabrechnung (404).
- **Am Rande festgestellt:** Stammdaten werden soft-deleted, `STILL_REFERENCED` kann dort also gar nicht auftreten; der Satz gilt nur für harte Löschungen.


## Slice 25 — Update-Check gegen das neueste GitHub-Release
**Ziel:** Eine laufende Instanz sagt Admins, wenn es eine neuere Version gibt — der Backlog-Punkt aus 2.5, aufgesetzt auf dem Versions-Endpunkt aus Slice 0.

**DoD:** Ein Admin sieht im Footer neben „Backend v0.9.0" einen Link auf die Release-Notes, sobald das neueste Release neuer ist als die laufende Version; in jeder anderen Lage sieht er nichts.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:
- **Quelle ist `…/releases/latest`**, nicht die Tags-API: Prereleases und Entwürfe fallen ohne eigene Sortierlogik heraus, und es gibt eine Seite, auf die der Hinweis verlinken kann. Preis: Ohne GitHub-Release gibt es nichts zu finden — ab 0.9.0 gehört zu jedem Tag ein Release.
- **Das Repo ist privat**, anonym antwortet GitHub mit 404. Darum ein *optionaler* `UPDATE_CHECK_TOKEN` (fine-grained, read-only `Contents`): ohne ihn fragt die Instanz anonym und bleibt schlicht still. Kein Zwang zur Veröffentlichung, und wenn das Repo einmal öffentlich wird, funktioniert der Check ohne Konfigurationsänderung.
- **Kein Fehlerpfad in der UI:** Der Endpunkt antwortet immer 200 mit `status: ok | disabled | unavailable`. 404, Timeout, Rate-Limit, kaputter Tag — alles wird zu `unavailable`, und der Footer zeigt dann gar nichts. Ein Update-Check darf nie wie eine Störung aussehen.
- **Cache im Closure** von `createUpdateChecker`, nicht als Modul-Global: Erfolg 6 h (`UPDATE_CHECK_TTL_SECONDS`), Misserfolg nur 15 min, und gleichzeitige Anfragen teilen sich über eine gemerkte Promise **einen** GitHub-Aufruf. Der Footer fragt bei jedem Seitenaufruf — ohne das wäre das ein Dauerfeuer gegen api.github.com.
- `lib/semver.ts` statt einer Abhängigkeit (~70 Zeilen inkl. Prerelease-Ordnung). `isNewerVersion` gibt bei unlesbarer Eingabe `false` zurück: lieber kein Hinweis als ein falscher.
- Der `createRequire`-Trick zum Lesen der `package.json` ist als `lib/app-version.ts` herausgezogen, weil ihn jetzt Versions-Route und Update-Check brauchen.
- **Guard `MANAGE_SETTINGS`** (seit Migration 002 im Katalog, bei Admin dabei) statt `MANAGE_USERS`: Die Aussage passt, und die Antwort verrät die laufende Version.
- Web: Der Footer wartet per `watch` auf `auth.isAdmin` statt `onMounted` — er hängt im `DefaultLayout` und steht schon, während `/me` noch unterwegs ist.
- Im laufenden System geprüft: gegen ein öffentliches Repo mit Releases (Link, Light/Dark, 390 px, Tastaturfokus — Ring vollständig, 28 px Luft zum Rand) und gegen das echte private Repo ohne Token (Footer still, eine Warnung im Server-Log, keine zusätzliche Fehlermeldung im Browser).
- **Am Rande festgestellt:** Beim Kaltstart quittiert `/auth/refresh` ohne Cookie mit 401 und schreibt eine Konsolen-Fehlermeldung im Browser — harmlos, aber unschön; kein Teil dieser Scheibe.

**Nachtrag (2026-09-24), Fehler in der ersten Fassung:** Die vier `UPDATE_CHECK_*`-Variablen standen in `.env.example`, im Config-Loader und im README — aber nicht in `docker-compose.yml`. Dort wird **jede** Variable einzeln unter `environment:` durchgereicht; was dort fehlt, erreicht den Container nicht, egal was in der `.env` steht. In Produktion lief der Check deshalb anonym gegen das private Repo und meldete 404. Beim Nachziehen fiel auf, dass `TRUST_PROXY` und die vier `RATE_LIMIT_*` denselben Defekt seit Slice 10 haben — auch sie waren dokumentiert, aber wirkungslos. Alle neun sind jetzt als `${VAR:-}` ergänzt: Ein leerer Wert gilt in `config/env.ts` als „nicht gesetzt", sodass der Anwendungs-Default greift und die Defaults nicht doppelt gepflegt werden. **Regel für künftige Slices: Eine neue Umgebungsvariable ist erst fertig, wenn sie in `.env.example`, im Loader, im README *und* in `docker-compose.yml` steht.** Das Image musste dafür nicht neu gebaut werden — die Compose-Datei liegt auf dem Host, nicht im Image.

## Slice 26 — Versionierungs-Mechanik (umgesetzt 2026-09-24)

**Ziel:** Die Regeln aus 2.9 bekommen den Ablauf, für den sie geschrieben sind: ein Befehl bumpt die Version, ein Tag-Push erzeugt Image **und** passendes (Pre-)Release, und die CI verhindert Drift.

**DoD:** `npm run version:next -- slice` setzt die Version in allen vier `package.json` und im Lockfile; `npm run version:check` ist grün und schlägt bei jeder Abweichung mit Nennung der Datei fehl; ein Tag mit `-slice.N` erzeugt Image + Prerelease und lässt `:latest` unberührt, ein finales Tag bewegt `:latest` und erzeugt ein volles Release aus der `CHANGELOG.md`.

**Entscheidungen (Planmodus):**

- **Release-Notes aus einer handgepflegten `CHANGELOG.md`** statt aus Commit-Subjects oder GitHub-Auto-Notes: der Autor schreibt, was Betreiber lesen sollen. Fehlt der Abschnitt zur Version, schlägt der Release-Job fehl — lieber laut als ein leeres Release. `version:check` fängt das schon beim Push auf main.
- **Tags legt der Autor an, nicht der Assistent.** Das Bump-Skript gibt den fertigen Tag-Befehl aus; Tag, Release und Push bleiben beim Autor (siehe die Arbeitsweise pro Slice).
- **Ein Workflow, Release nach dem Image:** der `release`-Job hängt per `needs: image` am Build und läuft nur auf `refs/tags/v*`. Die Release-Seite ist das Ziel des Update-Check-Links im Footer — sie darf nicht existieren, bevor das Image dazu in der GHCR liegt. Der Workflow heißt deshalb jetzt „Image & release", die Datei bleibt `docker.yml`. Rechte: workflow-weit `contents: read` + `packages: write`, nur der Release-Job hebt auf `contents: write`.
- **`flavor: latest=false` plus explizite `latest`-Regel** (`startsWith(github.ref, 'refs/tags/v') && !contains(github.ref, '-')`). `docker/metadata-action` schließt mit dem Default `latest=auto` Prereleases zwar von sich aus aus — aber die bisherige `type=raw,value=latest,enable=startsWith(…)`-Zeile erzwang `latest` für **jedes** `v*`-Tag. Die Absicht steht jetzt explizit in der Datei, statt vom Verhalten einer fremden Action abzuhängen. Der Kommentar dazu steht **über** dem Step: Zeilen innerhalb des `tags: |`-Blocks sind Werte, keine Kommentare.
- **`scripts/version.ts` und `scripts/changelog.ts` sind TypeScript ohne Build-Schritt** — Node 24 strippt Typen selbst, und so kann `version.ts` `parseVersion`/`compareVersions` aus `apps/api/src/lib/semver.ts` wiederverwenden statt einen zweiten Versions-Parser im Repo zu haben. Preis: `scripts/` liegt in keinem `tsconfig`-`include`, wird also von `npm run typecheck` nicht erfasst (ESLint und Prettier greifen); der Release-Job pinnt darum `actions/setup-node` auf 24.
- **Lockfile wird geparst und neu geschrieben**, nicht per Textersatz: `"version": "0.9.0"` kommt auch als Version einer Abhängigkeit vor. Geprüft, dass `JSON.stringify(…, null, 2)` die Datei byte-identisch reproduziert — der Bump ist damit ein Diff von fünf Zeilen.
- `version:next patch` verweigert den Sprung aus einem Prerelease heraus, und `set` verweigert eine Version, die nicht neuer ist als die laufende (`--force` hebt es auf): beides Fälle, in denen die Nummer sonst leise falsch wird.
- **Diese Scheibe selbst bekommt `0.10.0-slice.1`**, obwohl 2.9 reine Build-Commits von der Zählung ausnimmt: sie ändert die Veröffentlichung selbst, bringt eine betreiberseitige `CHANGELOG.md` mit, und der erste echte Durchlauf der neuen Mechanik ist ihr eigenes Tag — schlägt er fehl, betrifft es nur ein Prerelease und nicht `:latest`.

## Slice 27 — Abrechnungs-Dialoge zusammenführen (umgesetzt 2026-09-24)

**Anlass:** Der Ausblick-Punkt aus Slice 22. Die vier Felder einer Leistungsabrechnung — Nummer, Datum, Dokument-Link, Bonus-Toggle samt Regelhinweis — standen an drei Stellen im Repo: `NewBillingDialog` (Vertragssicht), `BillingFormDialog` (Subdialog am ＋ des Abrechnungs-Pickers) und das Inline-Formular „Abrechnung bearbeiten" in `BillingsView`. `NewBillingDialog` hatte dazu ein zweites, schwächeres Betragsraster: rohes `<input type="number">` statt `EuCurrencyField`, keine Belegnummer, keine Prüfung gegen den offenen Restbetrag — alles Dinge, die `BillingDialog` seit Slice 22 kann. Wer über die Vertragssicht buchte, bekam also weniger Hilfe als wer über den Arbeitsbereich buchte.

**DoD:** Der Feldsatz steht genau einmal im Repo, aus der Vertragssicht wird mit demselben Raster gebucht wie überall sonst, `NewBillingDialog` ist gelöscht.

**Entscheidungen (Planmodus):**

- **„Neu" bleibt ein Ein-Schritt-Ablauf, aber aus zwei Dialogen:** anlegen (mit Einreichungs-Auswahl), dann direkt `BillingDialog` mit den offenen Rechnungen dieser Einreichung. Die Alternative „Neu legt nur an, gebucht wird im Arbeitsbereich" wäre weniger Code, nimmt der Vertragssicht aber ihren Zweck.
- **„Abrechnung bearbeiten" zieht mit** — sonst bliebe nach dem Merge weiter eine Kopie des Feldsatzes übrig.
- **Kein Backend-Eingriff:** `GET /submissions` bleibt ungefiltert, gefiltert wird clientseitig auf den Vertrag, wie `NewBillingDialog` es schon tat.
- **Optische Politur Richtung Referenz-App ist nicht Teil dieser Scheibe** (siehe Backlog aus Slice 8); sie bekommt eine eigene, nach einer Gegenüberstellung mit den Referenz-Screenshots.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:

- `BillingFormDialog` ist der eine Dialog für die Abrechnung selbst: Anlegen **und** Bearbeiten, mit Einreichungs-Picker nur dann, wenn die Einreichung nicht feststeht — die Einreichung einer bestehenden Abrechnung wird nicht verschoben. Emit `created` → `saved`.
- Er **speichert weiter selbst** (`createBilling`/`updateBilling`), die Sicht lädt nur neu. Die „dummen" Dialoge aus Slice 23 sind die `ResourceConfig`-Masken; hier teilen sich zwei Aufrufer denselben Request, eine Auslagerung hätte ihn nur verdoppelt.
- `BillingDialog` bekam als einzige Änderung `presetBilling`, angewendet **nur** im `open`-Watcher: nach einem Policenwechsel im offenen Dialog darf die Vorauswahl nicht zurückkommen. Ohne sie bliebe die frisch angelegte Abrechnung in einer Einreichung mit mehreren Abrechnungen unausgewählt.
- `BillingsView` lädt jetzt auch Einreichungen, die Rechnungen des Kontos und die Leistungserbringer-Namen. Die Rechnungen kommen aus `load()` (das nach jeder Änderung läuft), damit die Karten nie einen Restbetrag zeigen, den eine Buchung dazwischen schon verbraucht hat.
- **Altfehler gefunden und behoben:** `EuDialog` öffnete sich nie, wenn die Komponente bereits mit `open=true` gemountet wurde — der Fall, den ein `v-if` erzeugt, dessen Bedingung und `open` im selben Tick wahr werden. Der `immediate`-Watcher lief vor dem Template-Ref und traf `null`. `flush: 'post'` hilft nicht (Vue führt den Erstlauf eines `immediate`-Watchers synchron aus, egal welcher Flush); die Synchronisierung hängt jetzt zusätzlich an `onMounted`. Regressionstest in `EuDialog.test.ts`.
- Dazu neu ein Vitest-Setup (`apps/web/src/test/setup.ts`): jsdom rendert `<dialog>`, kennt aber `showModal()`/`close()` nicht. Vorher fiel das nicht auf, weil der Watcher ohnehin nichts tat — die Dialog-Tests liefen also an einem nie geöffneten Dialog.
- **Im laufenden System geprüft** (Playwright, Light/Dark, 390 px): Anlegen → Buchen-Kette mit Karten je Rechnung, ein Betrag über dem Restbetrag wird vor dem Request abgelehnt und nennt die Rechnung, die Zeile zeigt danach die Summe und beide Rechnungsnummern, der Bearbeiten-Dialog ist vorbelegt (inkl. gespeichertem Bonus-Toggle), und der ＋-Subdialog im Buchen-Dialog übernimmt die getippte Nummer und wird nach dem Anlegen ausgewählt. Fokusring im scrollenden Dialogkörper nicht abgeschnitten.
- **Aufgefallen, nicht in dieser Scheibe behoben:** Im Buchen-Dialog stehen Erstattung und Belegnummer auch bei 390 px nebeneinander, wodurch die Labels dreizeilig brechen — ein Punkt für die Politur-Scheibe.

## Slice 28 — GiroCode (EPC-QR) in den Zahlungsinformationen (umgesetzt 2026-09-24)

**Anlass:** Wunsch des Autors (2026-09-24). Wer eine Rechnung überweist, tippt IBAN, Betrag und Verwendungszweck aus dem Zahlungsinfo-Popover in die Banking-App ab. Ein **GiroCode** (EPC-QR nach EPC069-12) nimmt ihm das ab.

**DoD:** Bei einer offenen Rechnung mit Abrechnungsdienstleister führt ein Klick neben der IBAN zu einem Code, den die Banking-App mit Empfänger, IBAN, Betrag und Verwendungszweck übernimmt — in Light und Dark Mode, ohne dass Zahlungsdaten das Gerät verlassen.

**Format:** Datensatz `BCD` / Version `002` / UTF-8 (`1`) / `SCT`, danach BIC (bei Version 002 im EWR optional, hier leer), Empfängername (≤ 70), IBAN, Betrag als `EUR12.34`, Purpose-Code, strukturierter und unstrukturierter Verwendungszweck (≤ 140). Nutzlast ≤ 331 Byte, Fehlerkorrektur-Level M.

**Entscheidungen (Planmodus):**

- **Leistungserbringer bekommen keine Bankverbindung.** Die offene Entscheidung aus der Ausblick-Notiz ist damit gegen die Migration gefallen: `CollectionAgencies.bankAccount` bleibt die einzige IBAN im Datenmodell, der GiroCode erscheint nur bei Rechnungen mit Abrechnungsdienstleister. Ohne Dienstleister zahlt man direkt an die Praxis — dafür führt die App gar keine Kontodaten, und ein Feld dafür wäre ein Slice mit Migration, Zod-Schema und Stammdaten-Maske für einen Fall, den es im Bestand nicht gibt.
- **Nicht dauerhaft sichtbar, sondern hinter einem `fa-qrcode`-Icon** in der IBAN-Zeile, das ein eigenes kleines Popover öffnet — an beiden Orten, an denen die IBAN schon steht: Zahlungsinfo-Popover und Rechnungs-Detaildialog. Ein dauerhaft eingeblendeter Code würde die kompakte Bubble sprengen.
- **Erzeugt wird lokal mit `qrcode`**, nicht über einen Web-Dienst: IBAN und Betrag gehen an keinen fremden QR-Generator.
- **Die EPC-Zeichenkette bauen wir selbst**, nicht mit `eu-payment-qr` (MIT, existiert, aber ein einziges Release 1.0.0 vom 2026-01-03 von einem Maintainer). Sie ist ein festes Textblock-Format; das Interessante daran sind die Kürzungs- und Ablehnregeln, und die sind eine Entscheidung dieser App und gehören zu ihren Tests, nicht in ein frisches Paket im Zahlungspfad.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:

- `girocode.ts` neben `payment.ts` liefert `{ ok: true, payload } | { ok: false, reason }` — `reason` ist ein fertiger deutscher Satz, der im Popover **an die Stelle** des Codes tritt, statt einen kaputten QR zu zeigen. Abgelehnt wird ohne IBAN, ohne Empfänger, bei einem Betrag außerhalb 0,01 … 999.999.999,99 und bei einer Nutzlast über 331 **Byte**; gekürzt werden Name (70) und Zweck (140). Die Byte-Grenze ist der Grund, warum Umlaute im Empfängernamen einen sonst passenden Datensatz kippen können — eigener Testfall.
- **Sichtbarkeit** hängt an der Zahlungs-Ampel, nicht an einer zweiten Regel: im Popover `calcPaymentState(invoice) !== 'paid'` (bezahlt oder bar bezahlt = nichts zu überweisen). Im Detaildialog dieselbe Regel, aber gegen die **Maskenwerte** formuliert — die IBAN-Zeile daneben zeigt ohnehin den gerade gewählten Dienstleister, und gescannt werden soll, was man sieht.
- **Gerendert als SVG, nicht als `toDataURL()`**: der SVG-Renderer der Lib ist reines JS, der Data-URL-Renderer braucht ein Canvas — das jsdom nicht hat, der Komponententest liefe also ins Leere (dieselbe Falle wie `showModal()` in Slice 27). Das SVG hängt als Data-URL an einem `<img>` mit beschreibendem `alt` — der erste bedeutungstragende `<img>` der App; die Daten stehen daneben weiterhin als Text. Eigene weiße Fläche unter dem Code, damit er im Dark Mode nicht auf der dunklen Popover-Fläche liegt.
- Der Code wird **beim ersten Öffnen** erzeugt, nicht beim Mounten: pro Tabellenzeile existiert eine dieser Komponenten.
- **Altfehler gefunden und behoben:** `EuPopover` setzte `aria-expanded`/`aria-controls` auf das umschließende `<span>` — auf einem `<span>` ohne Rolle sind sie nicht erlaubt (axe `aria-allowed-attr`, WCAG 4.1.2, „critical"). Der Zustand wird jetzt an den `#trigger`-Slot durchgereicht und von den auslösenden Buttons getragen (Ampel im Arbeitsbereich, QR-Icon). Dazu wurde der Popover-Kopf von `<header>` zu `<div>`: ein `<header>` auf dieser Ebene ist eine zweite Banner-Landmark neben der Kopfzeile der App. Beides fiel auf, weil der neue Komponententest als erster einen geöffneten `EuPopover` durch axe schickt.
- **Im laufenden System geprüft** (Playwright, Light/Dark, 390 px und Desktop): Code im Popover und im Detaildialog, das äußere Zahlungsinfo-Popover bleibt beim Öffnen des inneren offen, Barzahlungs-Rechnung bietet keinen Code, ein eingetragenes Zahlungsdatum oder der Barzahlungs-Schalter lassen das Icon sofort verschwinden, Fokusring im scrollenden Dialogkörper nicht abgeschnitten.
- **Aufgefallen, nicht in dieser Scheibe behoben:** Bei 390 px ist die Wertespalte der Anzeigemaske so schmal, dass **alle** Werte abgeschnitten werden („Hau…", „Beis…"); die IBAN wird dort jetzt mit Ellipse gekappt, damit sie nicht über das QR-Icon läuft. Die Maske als Ganzes braucht Breite — Punkt für die Politur-Scheibe (Slice-8-Backlog „Dialog-Layout überarbeiten").

## Slice 29 — Politur: Anzeigemaske, Tabellen, Verläufe (umgesetzt 2026-09-24)

**Anlass:** Die beiden vorangegangenen Scheiben haben je einen optischen Mangel notiert statt behoben („Punkt für die Politur-Scheibe"), und der Slice-8-Backlog führt „Dialog-Layout überarbeiten" und „Näher an den Stil der Referenz-App" seit Slice 8. Vorgeschaltet war die dort versprochene **Gegenüberstellung** mit den Referenz-Screenshots (`Rechnungsdetails.png`, `Rechnungen_Verknüpfen.png`, `Leistungsabrechnung auswählen.png`), im laufenden System mit Playwright aufgenommen.

**Ergebnis der Gegenüberstellung:** Das Raster der Referenz ist übernommen, funktional liegen die Dialoge über ihr (Typeahead statt leerem Feld, Karten je Rechnung, Prüfung gegen den Restbetrag, GiroCode). Abweichungen waren die fehlenden Doppelpunkte hinter den Labels, rechtsbündige Beträge mitten unter linksbündigen Werten und unsichtbare Leerfelder. Dazu drei gemessene Defekte auf eigenen Flächen: Maske bei 390 px unlesbar (Wertspalte ~60 px), Rechnungstabelle bei 1440 px 60 px zu breit, Policen-Dialog 1395 px Inhalt in 726 px Körper.

**DoD:** Die Maske ist auf dem Telefon lesbar, die Rechnungstabelle passt am 1440er in ihre Karte, der Policen-Dialog zeigt je Verlauf nur den geltenden Eintrag, und die Referenz-Abweichungen sind nachgezogen.

**Entscheidungen (Planmodus):**

- **Notizen als Sprechblase über `EuIconLabel`, nicht über `title`** (Abweichung von der Vorgabe des Autors, im Plan benannt und dort freigegeben): `title` erscheint bei Tastaturfokus nie und auf dem Telefon gar nicht; `EuIconLabel` + `EuTooltip` gibt es bereits und wird in den Zahlungsinformationen schon so benutzt.
- **Kein `<details>` für die Verläufe:** Es darf nicht zwischen `<tbody>` und `<tr>` stehen. Stattdessen eine Schaltzeile mit `aria-expanded` und die weiteren Zeilen per `v-if`.
- **Alle drei Verläufe neueste zuerst.** Beitragsverlauf und Konditionen kommen von der API aufsteigend; ohne das Drehen stünde der sichtbare Eintrag unten und die Aufklappung darüber. Der Jahresverlauf war schon so sortiert.
- **Media Query, keine Container Query,** für den Maskenumbruch: `container-type: inline-size` nähme dem Raster die inhaltsabhängige Spaltenbreite, und der Dialog ist unterhalb 46 rem ohnehin viewport-breit — die Bildschirmbreite ist ein exakter Stellvertreter.
- **Tabellen-CSS nicht zusammengeführt:** Sieben Dateien halten je eine Kopie der `border-collapse`/`th`/`td`-Regeln. Das ist ein Refactoring mit Regressionsrisiko in sieben Ansichten, keine Politur — Backlog.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:

- `showOlder` steht **oben** bei den übrigen Zuständen, nicht bei den Verlaufs-Helfern: Der `immediate`-Watcher setzt es beim Öffnen zurück und läuft noch während des Setups — weiter unten deklariert liefe er in die temporale Totzone. (Beim Bau genau einmal passiert.)
- Die Sprechblase steckt in einem `<span class="eu-contract__note">`: `EuIconLabel` hat zwei Wurzelknoten (Auslöser + Blase), eine Klasse an der Komponente selbst landet also nirgends.
- **Fokusring:** `outline: none` in `EuDetailField` ersatzlos entfernt (die globale `:focus-visible`-Regel greift dann wieder); Picker und Währungsfeld tragen ihn über `:has(:focus-visible)` am Control, damit er außen um das Feld liegt und nicht innen um das randlose `<input>`. Die drei waren die einzigen Stellen der App ohne den Ring — gemessen `outline-style: none` am tastaturfokussierten Feld.
- **Betrag in der Maske:** Das Feld wird über `ch` auf seinen Inhalt bemessen, statt die Spalte zu füllen — sonst klebt das € am rechten Rand statt am Betrag. Ein `ch` ist die Breite der Null und überschätzt Komma und Punkt, daher die Zeichenzahl plus ein halbes Zeichen für den Cursor.
- `.eu-ws__table-wrap` hat jetzt `eu-scroll-focus-safe`, nach der Regel in `global.css`: an **jeden** Scroll-Container, nicht nur an die, wo heute zufällig ein Feld am Rand sitzt.
- **Im laufenden System geprüft** (Playwright, Light/Dark, 390 px und 1440 px): kein einziger Wert der Maske bei 390 px mehr abgeschnitten (gemessen `scrollWidth` gegen `clientWidth` über alle Felder), Rechnungstabelle bei 1440 px ohne Überhang und mit sichtbarer Aktionen-Spalte, Sprechblase bei Hover **und** Tastaturfokus, Fokusring der Schaltzeile per Tab-Taste aufgenommen und vollständig (die Ringkappung sieht keine DOM-Messung).
- **Nicht vollständig erreicht:** Der Policen-Dialog ist von 1395 px auf 1000 px Inhalt geschrumpft (bei 724 px Sichthöhe) — deutlich weniger, aber immer noch nicht eine Bildschirmhöhe. Und die Rechnungstabelle passt erst ab etwa 1400 px; bei 1280 px bleiben 119 px Überhang, den der `overflow-x` des Wrappers auffängt (die Spalten sind dort schmaler als vorher, der Überhang also kleiner — aber eben nicht weg). Neun Spalten mit Status-Badges und vier Aktionsknöpfen passen dort nicht ohne Spaltenverzicht — das wäre eine eigene Entscheidung, keine Politur.
- **Am Rande behoben:** `BonusYearDto.note` wurde gespeichert, aber in keiner Ansicht ausgegeben; die Notiz eines Jahres war nach dem Erfassen unsichtbar.
- **Nachgezogen nach Rückmeldung des Autors:** Der GiroCode-Knopf neben der IBAN war ein ausgewachsener Icon-Button (1 rem, `aspect-ratio: 1`, 40 × 40 px) in einer Zeile von 20 px. Er machte die IBAN-Zeile im Zahlungs-Popover doppelt so hoch wie alle anderen, schob sie aus dem Rhythmus der Liste und hob das Label-Icon links auf eine andere Höhe als den Wert. Er nimmt jetzt die Größe der Zeile, in der er steht (`font-size: inherit`, ohne erzwungenes Quadrat) — gemessen 20,2 px Zeilenhöhe wie überall sonst, und das QR-Icon ist so groß wie die übrigen Zeilen-Icons. Gleicher Effekt in der Rechnungsmaske, wo derselbe Knopf steht. Dazu die Breitenschätzung des Betragsfelds verfeinert: Ziffern sind mit `tabular-nums` genau ein `ch`, Komma und Punkt nur etwa 0,4 — mit der reinen Zeichenzahl blieb ein sichtbares Loch vor dem €.

**Backlog aus dieser Scheibe:**

- **Startseite mit Inhalt:** Sie ist reine Kachel-Navigation. Offene Rechnungen, fällige Zahlungen und die Empfehlung des Optimierers gehören dorthin — ein Feature, keine Politur.
- **Tabellen-CSS zusammenführen** (siehe Entscheidungen oben).
- **Rechnungstabelle unter einer bestimmten Bildschirmbreite auf Karten umstellen** (Festlegung des Autors, 2026-09-24): Statt die neun Spalten weiter zu quetschen oder seitlich zu scrollen, wechselt die Liste unterhalb der Schwelle vom Tabellen- ins **Karten-Layout** — eine Karte je Rechnung, die nur die wichtigsten Daten direkt zeigt und sich für den Rest (weitere Felder, die Aktionsknöpfe) aufklappen lässt. Damit erledigen sich der Überhang bei 1280 px und die gequetschte Tabelle auf dem Telefon in einem Zug. Die Schwelle und die Auswahl der „wichtigsten Daten" gehören in die Planung dieser Scheibe.

## Slice 30 — System-Einstellungen: E-Mail-Versand, Secrets-Verschlüsselung, Version (umgesetzt 2026-09-24)

**Anlass:** `/system/settings` stand seit Slice 6 in der Navigation und zeigte den `PlaceholderView`. Damit fehlte die Infrastruktur aus 2.6, von der mehreres abhängt: die E-Mail-Benachrichtigungen (2.5) brauchen eine gepflegte SMTP-Konfiguration, und deren Passwort darf nicht im Klartext in der DB liegen. Dazu kam eine Beobachtung des Autors: Trotz Release 0.10.0 zeigte die Fußzeile keinen Hinweis. **Kein Fehler, zwei Gründe:** Das Repository ist privat, `releases/latest` antwortet ohne Token mit 404 → `status: unavailable`, und die Fußzeile schweigt bei allem außer `ok` bewusst; außerdem lief die Instanz selbst auf 0.10.0. Die Prüfung ist zudem kein Polling — das Frontend fragt einmal pro Seitenladung, der Server cacht 6 h (Erfolg) bzw. 15 min (Fehlschlag).

**DoD:** Ein Admin richtet den Mailserver im Browser ein, beweist ihn mit einer Testmail, sieht den Stand des letzten Versands, findet einen Fehlschlag mit einem Filter im Docker-Log wieder — und erfährt auf derselben Seite, welche Version läuft und warum die Update-Prüfung gegebenenfalls nichts sagen kann.

**Entscheidungen (Planmodus):**

- **Zwei Secrets** wandern in die verschlüsselten Einstellungen: SMTP-Passwort **und** `UPDATE_CHECK_TOKEN`. Die `.env` bleibt für den Token gültiger Fallback, der DB-Wert gewinnt — so ist er ohne Neustart wechselbar.
- **Die Testmail geht immer an die Adresse des angemeldeten Admins**, kein Empfängerfeld: eine Instanz mit fremdem Mailserver soll nicht als Versender an Dritte taugen.
- **XOAUTH2 vorbereitet, nicht gebaut.** Nodemailer beherrscht es; der Aufwand liegt im OAuth-Consent-Flow des Anbieters (App-Registrierung, Callback-Route, Refresh-Token-Haltung) und ist ohne registrierte App nicht verifizierbar. Es gibt deshalb `mail.authMethod` mit heute genau einem Wert (`PASSWORD`) — der Rest kommt später ohne Migration dazu.
- **Nodemailer** (`^10.0.10`, MIT-0, null Laufzeitabhängigkeiten, eigene Typdefinitionen) statt Eigenbau: SMTP mit STARTTLS und AUTH ist eine Protokoll-Implementierung, kein Textformat wie der EPC-Block aus Slice 28.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:

- **Selbstbeschreibendes Chiffrat** `aes-256-gcm$<iv>$<tag>$<ciphertext>` in `lib/secret-box.ts`, nach dem Vorbild der Passwort-Hashes (`scrypt$…`). Ein verschlüsselter Wert ist damit in der Tabelle als solcher erkennbar, und ein späterer Algorithmuswechsel kann alte Werte weiterlesen. Deshalb hat `SystemSettings` **keine** `isSecret`-Spalte: was ein Secret ist, sagt die Registry im Code, ob ein Wert verschlüsselt ist, sagt der Umschlag — eine zweite Quelle könnte abdriften.
- **`CONFIG_ENCRYPTION_KEY` ist optional.** Fehlt er, startet die App normal und alles außer den beiden Secrets funktioniert; die Seite benennt den Grund. Eine Instanz ohne Mail soll nicht an einem Schlüssel scheitern, den sie nicht braucht. Ein *gesetzter, aber falsch formatierter* Schlüssel ist dagegen ein Startfehler wie bei den übrigen Werten.
- **Kein Cache für die Einstellungen.** Sie werden beim Öffnen der Seite, beim Versand und bei der Update-Prüfung gelesen — selten genug, dass eine Abfrage billiger ist als eine Invalidierung, die falsch laufen kann („funktioniert erst nach einem Neustart" ist genau die Fehlerklasse, die hier nicht entstehen soll).
- **Drei unterscheidbare Schreibfälle je Secret**, im Zod-Schema festgehalten: Feld fehlt = unverändert, `null` = löschen, Wert = setzen. Ein leerer String zählt als „löschen" — und genau daran hing ein **beim Bau gefundener Fehler**: Das Token-Formular schickte bei leerem Feld `''`, ein Enter im leeren Feld hätte also das hinterlegte Token gelöscht. Der Komponententest hat es aufgedeckt; `saveToken` bricht jetzt bei leerem Feld ab, Entfernen ist der eigene Knopf daneben.
- **Der Mailer kennt die Datenbank nicht.** Er spricht mit einem `MailSettingsStore` (`mail/store.ts` ist die DB-Fassung), weshalb seine Tests weder Datenbank noch Socket brauchen — dieselbe Linie wie der eingespritzte `fetch` im Update-Check.
- **Statuswerte schreibt die Anwendung, nicht der Client:** `mail.lastSend*` sind in der Registry als `readonly` markiert, ein Schreibversuch über die API ist ein 400. Eine unvollständige Konfiguration überschreibt den Status **nicht** — es wurde ja nichts versucht, und ein rot gefärbter Status wäre gelogen.
- **Ein Zeilenformat fürs Log** (`lib/log.ts`): `eunomia event=MAIL_SEND_FAILED level=error to=… host=… code=EAUTH message="…"`. Fester Präfix, `event=` als Filterschlüssel, mehrzeilige Servermeldungen werden auf eine Zeile gezwungen, Secrets stehen nie in einem Feld. Die vier bisherigen Update-Check-Warnungen sind auf dasselbe Format gezogen.
- **Die Update-Prüfung nennt jetzt einen Grund** (`no_token_private`, `not_found`, `unauthorized`, `rate_limited`, `network`, `no_release`) und kennt `force` — die Fußzeile schweigt weiter, die Einstellungsseite sagt den Grund, und „Jetzt prüfen" umgeht den 6-Stunden-Cache.
- **Kein `<details>` für die Abschnitte**, sondern `EuCollapsibleSection` mit `aria-expanded`/`aria-controls`: die Kopfzeile trägt neben dem Titel einen Status (Version, Ampel des letzten Versands), und wie weit sich ein `<summary>` gestalten lässt, ist je Browser verschieden. Der Zustand wird nicht gespeichert.
- **Fokusring-Kappung wieder aufgetreten und behoben:** `.eu-section` hatte `overflow: hidden`, um die Ecken zu runden. Der Kopfzeilen-Knopf sitzt 1 px innerhalb, sein Ring wird 5 px außerhalb gezeichnet — vom Ring blieb im tastaturfokussierten Screenshot nur die untere Kante übrig. Gemessen (`outlineWidth + outlineOffset` gegen den Abstand zum Abschnittsrand) und durch Entfernen des Clips behoben; kein Kind malt seinen Hintergrund in die Ecken, der Clip war entbehrlich.
- **Im laufenden System geprüft** (Playwright, Light/Dark, 390 px und 1440 px): kein Überhang und kein abgeschnittener Wert in allen vier Kombinationen, Abschnitte per Tastatur auf- und zuklappbar (`aria-expanded` gemessen), Ring nach der Korrektur rundum vollständig. Der Versand lief gegen einen Wegwerf-SMTP-Server: angenommene Mail (Empfänger, Absender, Betreff am Fänger geprüft, `MAIL_SEND_OK` im Log), abgelehnte Anmeldung (535 → roter Status, **eine** `MAIL_SEND_FAILED`-Zeile mit `code=EAUTH`), und ein Server, der nie antwortet (nach 10,01 s ein sauberer Fehler statt eines hängenden Requests). In der DB steht das Passwort als `aes-256-gcm$…`, die API gibt nur `isSet: true` zurück.
- **Am Rande behoben:** Die Seite hatte eine eigene `<h1>`, obwohl `AppHeader` den Routentitel schon als `<h1>` rendert — zwei gleichlautende Hauptüberschriften. Die Seite überlässt sie jetzt der Kopfzeile, wie `BillingsView`.

**Backlog aus dieser Scheibe:**

- **Token-Verfahren (XOAUTH2)** für Mailserver, die kein Passwort mehr akzeptieren (Microsoft 365, Gmail): OAuth-Consent-Flow, Callback-Route, Refresh-Token in den verschlüsselten Einstellungen, `mail.authMethod` um den Wert erweitern.
- **`JWT_SECRET` in die DB** — die Randnotiz aus 2.6 ist mit dem Mechanismus jetzt machbar.
- **Eigene/selbstsignierte Zertifikate zulassen** (`tls.rejectUnauthorized`) für Mailserver im eigenen Netz.
- **Ratenbegrenzung für den Testversand** — heute deckt nur das globale Limit den Knopf ab.
- **Testkonfiguration der Integrationstests zusammenführen:** `testConfig` steht in sechs Testdateien als Kopie; jedes neue Feld in `AppConfig` muss in allen sechs nachgezogen werden (in dieser Scheibe geschehen).

## Slice 31 — Zahlungserinnerungen per E-Mail (umgesetzt 2026-09-24)

**Anlass:** Slice 30 hat die Mail-Infrastruktur gebaut und ausdrücklich für diesen Verbraucher zugeschnitten (`mail/mailer.ts`), der Verbraucher fehlte aber. Fachlich geht es um die **Geldseite**, nicht um die Erstattung: Eine Rechnung hat ein Zahlungsziel, und wer es verpasst, bekommt eine Mahnung. Bisher sah man das **nur beim Öffnen der App** — die Ampel `calcPaymentState` lief ausschließlich im Browser. Genau im wichtigsten Fall, wenn wochenlang niemand hineinschaut, schwieg Eunomia.

**DoD:** Eine laufende Instanz meldet sich von selbst, wenn eine Zahlung fällig wird oder überfällig ist — je Nutzer, nur über das, was er sehen darf, ohne täglich dasselbe zu wiederholen; ein Admin kann den Lauf vorher gefahrlos ansehen und von Hand auslösen.

**Entscheidungen (Planmodus):**

- **Timer im Prozess** statt „am Request, wie der Update-Check": Letzteres schweigt genau dann, wenn niemand die App öffnet. Externes Cron wäre eine Betriebsaufgabe und ein zweiter Secret-Pfad mehr. Damit ist das **das erste Stück Hintergrundarbeit im Backend überhaupt** — vorher hing alles an einem eingehenden Request (einziger Timer-Treffer war die Retry-Schleife in `db/pool.ts`).
- **Empfänger sind die Nutzer, die die Rechnung ohnehin sehen dürfen** (`VIEW_INVOICES`, global oder über `UserAccountRoles`, nur `userStatus = 1`). Jeder bekommt **einen** Digest über genau seine Rechnungen — kein Sammelpostfach und keine Daten an eine Adresse, die niemandem in der App gehört.
- **Kadenz in Stufen je Rechnung:** einmal beim Eintritt ins Fälligkeitsfenster, einmal beim Überfälligwerden, danach alle `reminders.repeatDays` Tage. **Nur `overdue` wiederholt sich** — eine Rechnung ohne Zahlungsziel gilt per Definition als fällig und würde sonst für immer nachfassen.
- **Nur Zahlungsziele.** Unbeantwortete Einreichungen und der Bonus-Hinweis wären je eine zweite Erinnerungsart mit eigener Schwelle und eigener Kadenz — eigene Scheiben.

**Umgesetzt (2026-09-24).** Entscheidungen beim Bau:

- **Das Fälligkeitsfenster (10 Tage) ist bewusst keine Einstellung.** Was „fällig" heißt, definiert die Ampel in der Rechnungsliste; eine zweite, editierbare Zahl könnte davon abweichen („die Ampel ist gelb, aber es kam keine Mail"), und die Einstellungsseite ist für Nutzer ohne `MANAGE_SETTINGS` nicht einmal lesbar. Konfigurierbar ist nur der Wiederholungsabstand.
- **Die Regel steht serverseitig neu** (`reminders/payment.ts`) als bewusste Zweitschrift zu `apps/web/src/invoices/payment.ts`, mit gegenseitigem Kommentarverweis und derselben Schwelle in beiden Testdateien. Das einzige echte Zuhause wäre ein geteiltes Paket — `packages/shared-types` ist bis heute ein leerer Platzhalter, den keine App importiert, und der erste app-übergreifende Import samt Build-Reihenfolge, Vite-Alias und Dockerfile wäre ein Nebenbau. → Backlog.
- **Alles ist Kalenderarithmetik, keine Zeitstempel.** `InvoiceReminders.sentOn` ist ein `DATE`, der „heutige Tag" eines Laufs ist das Datum in der eingestellten Zone, und `daysUntil` rechnet auf `YYYY-MM-DD`. Damit kann weder die Zone des Servers noch die Sommerzeit ein Zahlungsziel um einen Tag verschieben. Die Zonenrechnung selbst macht `Intl` (`reminders/schedule.ts`) — die Zonendatenbank liegt der Laufzeit bei, eine Bibliothek wäre dafür zu viel.
- **`reminders.lastRunAt` ist Status *und* Wasserstandsmarke** des Timers, damit es nicht zwei Werte gibt, die sich widersprechen können. Der Tick (alle 5 min, `unref()`, jeder Durchlauf in `try/catch`) fragt nur: Ist die Stunde in der Zone erreicht und war der letzte Lauf an einem früheren Tag? Ein verpasstes Fenster (Rechner war um 7:00 aus) wird dadurch **nachgeholt** statt übersprungen.
- **Gestempelt wird erst nach angenommener Mail.** Ein Fehlschlag hinterlässt keine Zeile, wird also beim nächsten Lauf erneut versucht; ein Fehler bei einem Empfänger bricht den Lauf nicht ab. Im laufenden System geprüft.
- **Der Runner kennt die Datenbank nicht** (`ReminderStore`, wie `MailSettingsStore` in Slice 30) — seine Tests brauchen weder DB noch Socket, und die gesamte SQL liegt an einer Stelle.
- **Kein roter Status ohne Versuch:** Ist der Mailversand aus, protokolliert der Lauf `REMINDERS_SKIPPED` und lässt den Status unberührt — dieselbe Linie wie beim Mailer.
- **Der Knopf „Jetzt ausführen" ist bei ausgeschaltetem Hauptschalter ein 409** (`REMINDERS_DISABLED`) statt eines stillen Nichtstuns: Ein Knopf, der bei „aus" echte Mails an alle Nutzer schickt, wäre eine böse Überraschung — dieselbe Vorsicht wie beim fehlenden Empfängerfeld der Testmail. Daneben steht **Vorschau** (`dryRun`): rechnet alles, rendert die Mails, verschickt nichts, stempelt nichts, schreibt keinen Status.
- **Kein eigenes Statusfeld am Snapshot:** Die `reminders.lastRun*`-Schlüssel stehen als readonly-Einträge ohnehin in `getPublicSettings`; der separate `mailStatus` ist insofern die Ausnahme, nicht das Vorbild.
- **Beim Bau gefunden:** `listUsersWithAccess` ist die Umkehrung von `getAccessibleAccounts` und steht bewusst daneben — eine Änderung am Rechtemodell muss beide erreichen. Ein globaler Grant hebt die Kontenliste auf, statt sie zu ergänzen.
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 390 px und 1440 px): kein Überhang, Abschnitt per Tastatur auf- und zuklappbar (`aria-expanded` gemessen), Fokusring im tastaturfokussierten Screenshot rundum vollständig. Versand gegen einen Wegwerf-SMTP-Server: Vorschau ohne Mail und ohne Zeile in `InvoiceReminders`; echter Lauf mit einer Mail, vier gestempelten Zeilen und `REMINDERS_RUN … sent=1` im Log; direkt danach ein zweiter Lauf ohne Mail; nach Rückdatierung um `repeatDays` eine erneute Mail, die **nur die zwei überfälligen** Rechnungen nennt — die zwei fälligen bleiben einmalig angekündigt.
- **Am Rande behoben:** Zwei deutsche Sätze der Seite waren falsch gebeugt („1 Empfänger würden", „1 Erinnerung(en)"). Die Seite beugt jetzt richtig, statt die Klammerform zu benutzen.

**Backlog aus dieser Scheibe:**

- **Geteiltes Paket für die Fälligkeitsregel:** `calcPaymentState` und `DUE_SOON_DAYS` stehen in zwei Dateien. `packages/shared-types` (heute ein leerer Platzhalter) wäre das Zuhause — dafür braucht es Build-Reihenfolge, Vite-Alias und Dockerfile-Anpassung, also eine eigene Scheibe.
- **Erinnerung an unbeantwortete Einreichungen** („seit über N Tagen eingereicht, keine Erstattung zugeordnet") — zweite Erinnerungsart mit eigener Schwelle und Kadenz.
- **Abmeldelink je Nutzer:** Heute schaltet nur ein Admin die Erinnerungen ganz ab; ein einzelner Nutzer kann sich nicht abmelden.
- **HTML-Teil der Mail** — heute reiner Text, was für eine Liste genügt, aber in manchen Clients spröde aussieht.
- **Eigene Ratenbegrenzung für „Jetzt ausführen"** — heute deckt nur das globale Limit den Knopf ab (wie beim Testversand).

## Slice 32 — Ad-hoc-Anlegen in der Rechnungsmaske, frische Auswahllisten (umgesetzt 2026-09-25)

**Anlass:** Zwei Rückmeldungen des Autors aus der Produktion (2026-09-24), beide beim Erfassen echter Rechnungen. (1) Legt man beim Anlegen einer Rechnung einen Leistungserbringer oder Abrechnungsdienstleister ad hoc mit an, bleibt die Spalte „Leistungserbringer" in der Liste leer und die gerade angelegte Rechnung zeigt das Feld in der Maske leer — erst `F5` bringt beides. (2) In der Änderungsansicht einer Rechnung fehlt das „+" ganz, dort lässt sich nichts ad hoc anlegen.

**Befund:** Zwei getrennte Ursachen.

- `InvoiceWorkspaceView.loadStatic()` lud Leistungserbringer und Dienstleister **einmal** beim Öffnen; `afterMutation()` holte nur Jahre und Rechnungen nach. Der ad hoc angelegte Eintrag lebte deshalb nur in der lokalen Optionskopie des Anlegen-Dialogs und war der Tabelle, der Maske und der IBAN-Karte unbekannt. Gespeichert war die Rechnung korrekt — es war reine Anzeige.
- Die Maske rendert ihre Picker über `EuDetailField type="select"`. Das kannte `allowCreate` gar nicht, und `EuEntityPicker` blendet im `bare`-Modus alle **eingebetteten** Feld-Aktionen aus. Damit fehlten dort beide Wege: der Knopf und die Listenzeile „‚X' als … hinzufügen".

**DoD:** Leistungserbringer und Abrechnungsdienstleister lassen sich aus beiden Dialogen heraus anlegen, und Tabelle, Maske und IBAN stimmen sofort — ohne Neuladen der Seite.

**Entscheidungen (Planmodus):**

- **Umfang nach Rückfrage:** Ad-hoc-Anlegen überall, wo Leistungserbringer, Abrechnungsdienstleister, Rechnungen oder Leistungsabrechnungen ausgewählt werden — **nicht** bei Versicherung und Versichertem („da hängt zu viel dran", deckt sich mit `dialog-design.md`). Die Bestandsaufnahme ergab genau eine Lücke, die Rechnungsmaske: der Anlegen-Dialog und der Abrechnungs-Dialog (Leistungsabrechnung, Slice 22/27) konnten es bereits.
- **Ausnahme „Weitere Rechnung dieser Einreichung"** (`BillingDialog`): Dort bekommt das Rechnungsfeld **kein** Ad-hoc-Anlegen. Buchbar sind nur Rechnungen, die dieser Einreichung bereits angehören; eine frisch angelegte gehört keiner an und wäre sofort wieder unbuchbar.
- **Das „+" der Maske steht in der Aktionsspalte, nicht im Feld** — `dialog-design.md` legt genau das für den View/Edit-Modus fest (im Feld eingebettet ist die Lösung des Create-Modus). Reihenfolge Add → Clear → Reset, wie die Icon-Liste dort.
- **Ein Ereignis statt eines Dauer-Nachladens:** Beide Dialoge melden `entityCreated`, die Ansicht lädt daraufhin ihre Auswahllisten neu. `afterMutation()` bei jedem Speichern mitzuladen wäre zwei Requests pro Aktion und würde den Abbruch-Fall („angelegt, dann Rechnung verworfen") trotzdem nicht erwischen.

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Die Ad-hoc-Logik liegt jetzt einmal** in `invoices/entity-create.ts` (`CREATE_KINDS`, `useEntityCreate`) statt zweimal in den Dialogen; der Anlegen-Dialog benutzt dieselbe Composable wie die Maske. Das Nomen für Knopf und Titel kommt aus `ResourceConfig.singular` — das frühere zusätzliche `noun` war eine wortgleiche Zweitschrift.
- **`loadLookups()` ist aus `loadStatic()` herausgelöst** und die einzige Stelle, die die beiden Listen füllt (inklusive `facilityNameById` und `agencyById`, also auch der IBAN-Karte).
- **Der „+"-Knopf braucht den getippten Text:** Er steht außerhalb des Pickers, deshalb meldet `EuEntityPicker` seine Eingabe jetzt als `update:query` nach außen, und `EuDetailField` gibt sie beim Anlegen als Vorbelegung weiter — die Maske verhält sich damit wie die Listenzeile im Formular.
- **Der Wert wird wie jede Maskenänderung erst mit „Speichern" geschrieben.** Der Eintrag selbst existiert sofort (eigener Request), der Zurücksetzen-Pfeil führt bis zum Speichern auf den gespeicherten Wert zurück.
- **Verworfen: die Sucheingabe nach dem Anlegen leeren.** Naheliegend, weil der Picker den alten Suchtext beim nächsten Fokus wieder zeigt — aber dann klappt beim Fokus-Rücksprung aus dem Subdialog die **ungefilterte** Liste auf und legt sich über die Dialog-Fußzeile (im Browser gemessen: der Speichern-Knopf war nicht mehr klickbar). Das ist eine Entscheidung über die Fokus-/Öffnen-Regel des Pickers, keine Beifang-Änderung. → Backlog.
- **Tests:** `EuDetailField.test.ts` (Knopf nur mit `allowCreate`, trägt den getippten Text, aus mit der Zeile), `entity-create.spec.ts` (Vorbelegung, zurückgegebene Option, deutsche Fehlermeldung), Maskentest (Subdialog vorbelegt, Wert sofort gesetzt, `entityCreated`) und `InvoiceWorkspaceView.test.ts` (auf `entityCreated` werden beide Listen neu geladen — ohne die Verdrahtung schlägt er fehl, gegengeprüft).
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 390 px und 1440 px): Rechnung mit ad hoc angelegtem Leistungserbringer **und** Dienstleister — Tabellenspalte, Maske und IBAN des neuen Dienstleisters stimmen ohne Neuladen; in der Maske beide Wege (Knopf mit übernommenem Text, Listenzeile), Abbrechen lässt das Feld unverändert, nach Speichern und Wiederöffnen stehen beide Werte; bei Barzahlung ist die Dienstleister-Zeile samt „+" deaktiviert; Fokusring am tastaturfokussierten „+" im Screenshot rundum vollständig. Die Testzeilen sind danach wieder aus der Dev-Datenbank entfernt.

**Backlog aus dieser Scheibe:**

- **Alter Suchtext im Picker:** Nach Auswahl oder Anlegen bleibt die getippte Suche erhalten und erscheint beim nächsten Fokus wieder. Zusammen mit der Regel „Fokus öffnet die Liste" gehört das als Ganzes entschieden (siehe oben).
- **Der Schalter „Direkt-/Barzahlung" in der Maske hat keinen zugänglichen Namen:** `EuDetailField` reicht `label=""` an `EuToggle` durch, weil die Beschriftung in der linken Spalte steht — für die Maus richtig, für den Screenreader ein namenloses Kontrollkästchen. `EuToggle` bräuchte dafür einen `aria-label`-Weg.

# Findings aus der Produktion 0.9.0 (Slices 33–39, Weg zu 0.12.0)

Der Autor hat am 2026-09-24/25 mit dem in der Produktion laufenden Stand 0.9.0 weiter Echtdaten
erfasst und dabei zwölf Punkte gesammelt, strukturiert erfasst in [Notes/issues.md](issues.md).
Alle zwölf wurden gegen den Entwicklungsstand `0.11.0-slice.4` nachgeprüft — keiner hatte sich
zwischenzeitlich erledigt.

**Festlegung zur Version (2026-09-25):** Diese Punkte gehen **nicht** mehr in 0.11.0, sondern auf
den Weg zu 0.12.0. 0.11.0 (System-Einstellungen, Secrets, Mail, Zahlungserinnerungen, Ad-hoc-Anlegen)
ist thematisch abgeschlossen und wird als volles Release veröffentlicht, bevor hier gebaut wird.
Gründe: §2.9 bindet einen Minor an *ein* abgeschlossenes Feature; die Produktion hängt sonst weiter
auf 0.9.0 und damit zwei Minors zurück; die Patch-Spur (`0.11.1`) bleibt für einen Hotfix auf das
frei, was tatsächlich läuft; und die Migrationen kommen in kleinen, prüfbaren Schritten in der
Produktion an statt als ein Sprung samt Datenmodell-Umbau. Soll ein fertiger Slice vor 0.12.0 in die
Produktion, geht das über sein Prerelease-Image (§2.9), ohne am Releaseplan zu drehen.

**Reihenfolge:** erst die Punkte, die jede einzelne Eingabe behindern oder falsche Daten zulassen
(33–36), dann der eigentliche Umbau (37), dann die beiden größeren Ausbauten (38–39). 37 steht vor
38/39, weil er einen Arbeitsablauf blockiert, den es heute gar nicht gibt.

## Slice 33 — Eingabe-Politur: Tab im Picker, Datum einfügen
**Ziel:** Die beiden Fehler, die bei jeder einzelnen Erfassung stören, sind weg (issues.md 1 und 11).
- **Tab übernimmt die Auswahl** (issues.md 1): `EuEntityPicker.onKeydown` kennt nur ↑↓/Enter/Escape;
  Tab löst `@blur` → `open = false` aus und die Markierung verfällt, der Fokus wandert weiter zum
  „+". Tab soll erst übernehmen, dann weiterwandern (ohne den Fokus zusätzlich zu verlieren, wie es
  `select()` über `inputRef.blur()` tut).
- **Achtung, `highlight` startet bei 0:** Ein nur durchtabbter Picker darf nicht die erste Option
  übernehmen. Es braucht eine Unterscheidung „der Nutzer hat wirklich gewählt" (getippt oder mit den
  Pfeiltasten bewegt) gegenüber „die Liste stand nur offen".
- **Datum einfügen** (issues.md 11): Datumsfelder sind überall nativ (`EuDetailField type="date"`,
  `EuTextField type="date"`); ein `DD.MM.YYYY` aus der Zwischenablage nehmen die nicht an. Ein
  eigenes Feld fängt `paste` ab und wandelt die deutsche Schreibweise nach ISO. Rollout überall, wo
  Daten erfasst werden, nicht nur an einer Stelle.
- **Mit erledigt, weil es dieselbe Entscheidung ist — der Backlog aus Slice 32:** der im Picker
  stehenbleibende Suchtext gehört mit der Regel „Fokus öffnet die Liste" zusammen entschieden, und
  `EuToggle` braucht einen `aria-label`-Weg für die Maske.

**DoD:** Im Picker gewählt + Tab → der Wert steht im Feld; ein durchtabbter Picker ändert nichts.
Ein aus Excel kopiertes `24.09.2026` landet in jedem Datumsfeld der App.

## Slice 34 — Erstattung und Belegnummer nachträglich ändern
**Ziel:** Eine gebuchte Zuordnung ist korrigierbar, ohne sie zu löschen (issues.md 9 und 8).
- **PATCH auf `/allocations/:uid`** (issues.md 9): heute gibt es nur GET und DELETE. Der einzige Weg
  zu einer korrigierten Belegnummer ist, die Zuordnung zu löschen und neu zu buchen.
- Die Prüfung aus `assertEntriesBookable` gilt weiter, insbesondere das **Bereicherungsverbot** —
  beim Ändern gegen die Summe *ohne* die eigene Zuordnung gerechnet, sonst blockiert sie sich selbst.
- **Label ohne Rechnungsnummer** (issues.md 8, Screenshot `Screenshot 2026-09-24 203348.png`):
  `BillingDialog` baut die Nummer in beide Labels („Erstattung (33611/201806/00164)"), das bricht um
  und „Erstattung" und „Belegnummer" stehen nicht mehr auf einer Höhe. Die Nummer steht ohnehin schon
  in der Kopfzeile der Karte.
- **Zu entscheiden:** Wie die beiden Felder ohne die Nummer im Label zugänglich bleiben — je Karte
  eine Gruppe mit der Rechnungsnummer als Bezeichnung ist sauberer als ein abweichendes `aria-label`.

**DoD:** Erstattungsbetrag und Belegnummer sind an einer gebuchten Zuordnung änderbar; die beiden
Felder fluchten auch bei langer Rechnungsnummer.

## Slice 35 — Police-Auswahl im Versicherungszeitraum
**Ziel:** Beim Einreichen stehen die Policen oben, die zum Behandlungszeitraum passen (issues.md 12).
- Heute vergleicht weder `eligibility.ts` noch `assertInvoicesSubmittable` das `treatmentDate` mit
  `contractBegin`/`contractEnd` — der Dialog bietet Policen an, die damals noch nicht oder nicht mehr
  liefen.
- **Festlegung des Autors (2026-09-25): gefiltert wird in der UI, nicht serverseitig gesperrt.** Ein
  Schalter blendet die übrigen Policen wieder ein. Damit bleibt die Liste im Normalfall kurz und
  eindeutig, ohne den Sonderfall auszusperren (eine Versicherung nimmt eine Behandlung vor
  Vertragsbeginn durchaus an). Serverseitig bleibt es deshalb bewusst ungeprüft.
- Der Schalter wirkt **symmetrisch**: er zeigt auch bereits beendete Policen, nicht nur später
  beginnende — derselbe Sonderfall in die andere Richtung.
- **Bulk:** Maßgeblich ist die Spanne vom frühesten bis zum spätesten Behandlungsdatum der Auswahl.

**DoD:** Der Einreichen-Dialog zeigt ohne Schalter nur Policen, die den Behandlungszeitraum abdecken;
mit Schalter alle, die auch heute schon angeboten würden.

## Slice 36 — Suchen und Finden
**Ziel:** Wachsende Listen bleiben durchsuchbar (issues.md 2, 3 und 6).
- **Filterfeld in `ResourceView`** (issues.md 2 und 3): die Ansicht kann sortieren, aber nicht
  filtern. Eine Änderung dort wirkt für alle fünf Stammdatenlisten, nicht nur für Leistungserbringer
  und Abrechnungsdienstleister. Client-seitig über die geladenen Zeilen genügt in dieser Größe.
- **Rechnungsnummer-Suche** (issues.md 6): `GET /invoices` filtert nur nach `accountUID` und `year`,
  die Arbeitsfläche ist damit auf Versicherten **und** Behandlungsjahr eingeschnürt. Kennt man nur
  die Nummer, findet man die Rechnung nicht.
- Vorbild für den Server-Endpunkt ist `searchBillings` (`service-billings.ts`) samt seiner
  Rechte-Einschränkung; Einstieg in der UI über die Rechnungs-Auswahlseite, von dort direkt in die
  richtige Arbeitsfläche und die gefundene Rechnung.

**DoD:** Eine Rechnung ist allein über ihre Nummer auffindbar, ohne Versicherten und Jahr zu wissen;
jede Stammdatenliste hat ein Filterfeld.

## Slice 37 — Leistungsabrechnung über mehrere Einreichungen
**Ziel:** Rechnungen aus verschiedenen Einreichungen derselben Police lassen sich auf einer
Leistungsabrechnung zusammenfassen (issues.md 7). Der größte Punkt der Liste und der einzige echte
Umbau; sinnvoll in zwei Scheiben, Modell + API und danach UI.

**Befund:** `ServiceBillings.submissionUID` ist ein harter 1:n-Schlüssel auf die Einreichung, und
`assertEntriesBookable` prüft „die Rechnung gehört zur Einreichung dieser Abrechnung"
(`allocations.ts`). Damit ist genau der Fall ausgeschlossen, den die Versicherung laufend erzeugt.
`submissionUID` kommt an 189 Stellen in 29 Dateien vor.

- **Kern:** Eine `ServiceBilling` hängt künftig am **Vertrag**, nicht an der Einreichung. Welche
  Einreichungen sie berührt, ergibt sich aus ihren `Allocations`. Damit fallen alle sechs in
  issues.md 7 aufgezählten Fälle von selbst heraus, einschließlich mehrerer Behandlungsjahre auf
  einer Abrechnung; die Regel „ein Versicherter je Abrechnung" bleibt über den Vertrag erhalten.
- Die Buchungsregel wandert von „gehört zur Einreichung" auf „ist bei dieser Police eingereicht"
  (über `SubmissionInvoices`). Das Bereicherungsverbot bleibt unverändert.
- **UNIQUE auf der Abrechnungsnummer** (ausdrücklicher Wunsch des Autors): `UNIQUE (contractUID,
  billingNumber)` verträgt sich nicht mit dem Soft-Delete — eine gelöschte Abrechnung würde ihre
  Nummer für immer blockieren, und MariaDB kennt keinen partiellen Index. **Lösung aus dem
  Parallelprojekt Hyperion (Festlegung des Autors, 2026-09-25):** eine Generated Column, die bei
  `billingStatus = -1` NULL liefert; NULL greift bei UNIQUE nie. Das Projekt nutzt Generated Columns
  bereits (`002-auth-schema.ts`, Textform der UUIDs), allerdings nirgends indiziert — im Slice ist zu
  prüfen, ob der Unique-Index unter InnoDB auf einer VIRTUAL-Spalte trägt oder sie PERSISTENT sein
  muss.
- **UI-Folgen:** `BillingDialog`, `SubmissionCard`, `BillingSearchDialog` (heute auf eine Einreichung
  eingeschnürt) und `eligibility.commonSubmissions` bilden alle die alte Regel ab und werden
  nachgezogen.

**DoD:** Rechnungen, die zu verschiedenen Zeitpunkten bei derselben Police eingereicht wurden, lassen
sich auf einer Leistungsabrechnung buchen; dieselbe Abrechnungsnummer ein zweites Mal im selben
Vertrag weist die Datenbank ab, eine gelöschte gibt ihre Nummer wieder frei.

## Slice 38 — Kontoverbindungen mit Gültigkeitsdatum, BIC und Empfänger
**Ziel:** Ein Abrechnungsdienstleister behält seine Identität, wenn er die Bankverbindung wechselt
(issues.md 5), und der GiroCode bekommt die Felder, die ihm fehlen (issues.md 4).
- **Zusammengelegt (Festlegung des Autors, 2026-09-25):** issues.md 4 war als eigene, frühere Scheibe
  vorgeschlagen. Der Autor hat es hierher gezogen, weil beides Komfort ist und nichts blockiert —
  Version 002 lässt die BIC im EWR weg, deutsche IBANs erzeugen auch ohne sie gültige GiroCodes.
  Getrennt gebaut kämen `bic` und `recipientName` erst auf `CollectionAgencies` und wanderten hier
  gleich wieder in die Historientabelle.
- `CollectionAgencies` hat heute nur `agencyName` und `bankAccount`. Künftig eine Historientabelle je
  Dienstleister mit `validFrom`, IBAN, BIC, Empfänger und Notiz — Muster und UI-Vorbild sind
  `ContractPremiums` und die Historienblöcke im Policen-Dialog.
- **Empfänger** überschreibt, wo gesetzt, den Namen des Dienstleisters im GiroCode und in den
  Zahlungsdetails; es gibt Fälle, in denen beide auseinanderfallen. Betrifft auch die
  Zahlungserinnerung, die heute `agencyName` als Zahlungsempfänger nimmt (`reminders/store.ts`).
- **Auflösungsdatum (Festlegung des Autors, 2026-09-25): maßgeblich ist der Zeitpunkt der Zahlung.**
  Ist `transferDate` gesetzt, wird das zu diesem Datum gültige Konto gezeigt (einschließlich
  GiroCode, der dann fachlich nicht mehr gebraucht wird); ohne `transferDate` gilt heute, also das
  aktuell gültige Konto. Damit erzählt eine bezahlte Rechnung weiter, wohin sie tatsächlich ging.
- `girocode.ts` vermerkt im Kommentar noch „this application has no BIC to offer" — der fällt weg.

**DoD:** Ein Dienstleister mit gewechseltem Konto bleibt ein Eintrag; eine bezahlte Rechnung zeigt das
Konto von damals, eine offene das heutige; BIC und Empfänger stehen im GiroCode.

## Slice 39 — Papierkorb
**Ziel:** Gelöschtes ist sichtbar, wiederherstellbar und endgültig entfernbar (issues.md 10).
- `softDeleteRow` setzt nur `status = -1`; es gibt weder eine Liste der gelöschten Einträge noch
  Wiederherstellen noch endgültiges Löschen. Gelöschtes ist damit unsichtbar, aber für immer da.
- **Es fehlt ein `deletedAt`:** ohne Zeitstempel lässt sich der Papierkorb weder nach Löschzeitpunkt
  sortieren noch je eine Aufräumfrist bilden. Gehört in dieselbe Migration.
- **Endgültiges Löschen scheitert am Fremdschlüssel** (überall `ON DELETE RESTRICT`) — das braucht
  eine verständliche deutsche Meldung, die sagt, *was* noch daran hängt, statt eines SQL-Fehlers.
- **Zu entscheiden:** was beim Wiederherstellen eines Eintrags gilt, dessen übergeordneter Eintrag
  gelöscht ist, und ob der Papierkorb eine Ansicht über alle Entitäten ist oder je Liste eine.
- Bestätigungsabfrage vor dem endgültigen Löschen, wie vom Autor gewünscht.

**DoD:** Ein gelöschter Eintrag ist im Papierkorb zu finden, kommt zurück oder verschwindet
endgültig; ein noch referenzierter Eintrag erklärt, warum er nicht endgültig gelöscht werden kann.

## Backlog aus der Produktionsnutzung

- **Bonus-Staffel aus einer Faktoren-Regel der Versicherung ableiten** (Rückmeldung des Autors, 2026-09-24, nach der ersten Eingabe echter Staffeln in der Produktion — die Maske aus Slice 18/29 hat dabei gut funktioniert, das hier ist eine Erleichterung, keine Korrektur): In allen bisher erfassten Fällen ist die Staffel keine Liste freier Beträge, sondern eine **feste Regel der Versicherung**, ausgedrückt in Monatsbeiträgen statt in Euro — z. B. Jahr 1–2: 1 Monatsbeitrag, Jahr 3–4: 1,5, Jahr 5: 2, Jahr 6: 2,5, Jahr 7: 3, Jahr 8: 3,5, Jahr 9: 4. Die Regel unterscheidet sich je Versicherung, nicht je Police.
  - **Faktoren-Staffel optional an `InsuranceCompanies`** (leistungsfreie Jahre → Faktor). Eine Police nimmt entweder automatisch die Staffel ihrer Versicherung und rechnet sie mit dem Monatsbeitrag in Euro um, oder man überschreibt einzelne Jahre weiterhin mit eigenen absoluten Werten. Die manuelle Eingabe bleibt also der Rückfallweg, nicht der Normalfall.
  - **Bezugsgröße ist nur der Hauptbestandteil des Tarifs**, nicht der gesamte Monatsbeitrag. Der Autor schlägt vor, das bestehende Feld dafür **umzuwidmen** statt ein zweites anzulegen: `ContractPremiums.monthlyRate` wird in der Verwaltung ohnehin nur für die Bonusrechnung gebraucht, die Änderung wäre heute eine reine Umbenennung in der UI (etwa „rückerstattungsrelevanter Monatsbeitrag"). Zu prüfen bei der Planung: ob der Beitragsverlauf als Kostenübersicht (Jahreskosten) dann noch stimmt oder ob beide Größen doch getrennt gehören.
  - **Achtung, das kehrt eine Festlegung aus 2.3 um:** Dort sind die `ContractPremiums` ausdrücklich „rein informativ — **kein** Einfluss auf Selbstbeteiligung oder Bonus". Mit der Faktoren-Staffel wird der Monatsbeitrag zur Rechengröße der Bonusprognose und damit des Erstattungs-Optimierers (Slice 19). Die Scheibe muss deshalb klären, was passiert, wenn für ein Jahr kein Beitragsstand erfasst ist, und wie sich eine Beitragsanpassung mitten im Jahr auf den Faktor auswirkt (der Bonus ist eine Jahresgröße, der Beitrag gilt ab Datum).

## Ausblick (nicht Teil dieser Slices)
Paperless-Push-API, TOTP-Versand per Mail, ggf. weitere Ausbaustufen — siehe 2.5. (Die E-Mail-Benachrichtigungen samt Einstellungs-UI und Verschlüsselung aus 2.6 sind mit Slice 30/31 erledigt.)
