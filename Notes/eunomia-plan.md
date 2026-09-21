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
- **Abgeleiteter Status:** Der Workflow-Status (`eingereicht`/`abgerechnet`) wird je Einreichung bestimmt; die Rechnung erhält einen Gesamtstatus plus den **nicht erstatteten Restbetrag** als Kandidat für die nächste Police.

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

- **E-Mail-Benachrichtigungen** (Zahlungserinnerungen, ggf. TOTP-Versand) — Vorgaben für die spätere Umsetzung siehe 2.6.
- **Paperless/Nextcloud API-Push-Integration** (Paperless schiebt aktiv eine neue Rechnung in Eunomia) — laut 1.1 ohnehin "später einmal"; v1 bietet nur den reinen Link auf das externe Dokument.
- **Mehrmandantenfähigkeit** (mehrere unabhängige Haushalte in einer Instanz).
- **Aktive Update-Prüfung gegen das Git-Repository** (Abgleich der laufenden Backend-Version mit dem neuesten Release/Tag im Repo, Hinweis in der UI bei verfügbarer Aktualisierung) — Backlog-Punkt, baut auf dem Versions-Endpoint aus Slice 0 auf (siehe dort und 3).

## 2.6 System-Konfiguration & Verschlüsselung (Vorgaben für spätere Umsetzung)

Der E-Mail-Versand bleibt spätere Ausbaustufe (siehe 2.5), aber der Autor legt jetzt schon fest, **wie** er umzusetzen ist, damit die Infrastruktur nicht nachträglich umgebaut werden muss:

- Konfiguration (z.B. SMTP-Host, -Port, -Nutzer, -Passwort, Absenderadresse) wird **nicht** allein über `.env`-Variablen gepflegt, sondern über eine **System-Einstellungen-UI** für Admins, die Werte in der Datenbank ablegt (Tabelle `SystemSettings`, key-value-artig).
- Sensible Werte (z.B. das SMTP-Passwort) werden **verschlüsselt** in der DB gespeichert, nicht im Klartext. Symmetrische Verschlüsselung (z.B. AES-256-GCM) mit einem Schlüssel, der ausschließlich in der `.env` liegt (`CONFIG_ENCRYPTION_KEY`) und nie in die DB gelangt — ein DB-Dump allein reicht dann nicht, um die Secrets zu lesen.
- Nur die `Admin`-Rolle (siehe 2.4) darf System-Einstellungen lesen/ändern.
- Dieser Mechanismus wird generisch gebaut (nicht E-Mail-spezifisch), damit er später auch für andere Secrets taugt — z.B. für die im alten `todo.md` skizzierte Idee, `JWT_SECRET` aus der `.env` in die DB zu verlagern (siehe `future-dev-environment.md` §8). Das ist aber kein Ziel dieser Iteration, nur eine Randnotiz zur Wiederverwendbarkeit.
- Wird zusammen mit dem E-Mail-Feature gebaut (siehe "Ausblick" in Abschnitt 3), nicht vorab — vermeidet eine Abstraktion ohne aktuellen Verwendungszweck.

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
- **Selbsterklärender Code hat Vorrang vor Kommentaren:** sprechende Namen für Variablen, Funktionen/Methoden und deren Parameter sind die primäre Form der Dokumentation. Ein Kommentar ist kein Ersatz für einen schlechten Namen.
- **Kommentare dort, wo der Name nicht reicht:** explizite Kommentare/TSDoc-Blöcke für nicht offensichtliche Zusammenhänge — versteckte Invarianten, den Grund für eine unübliche Lösung, Randfälle, die beim Lesen überraschen würden. Kein Kommentar, der nur wiederholt, was der Code bereits zeigt.
- **Priorität für ausführlichere Dokumentation:** Business-Logik mit Rechenregeln, die nicht aus dem Code allein ersichtlich sind — insbesondere die Selbstbeteiligungs-/Bonus-Berechnung (Slice 5) und die Rechte-Auflösung global vs. account-scoped (2.4/Slice 3).
- Gilt für Backend und Frontend gleichermaßen, wird in Slice 0 in die ESLint-Konfiguration (z.B. `eslint-plugin-jsdoc` für öffentliche Funktionen der API- und Service-Schicht) aufgenommen, damit die Konvention nicht nur dokumentiert, sondern auch geprüft wird.

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

**Offene Entscheidung (im Planmodus klären):** zusätzlich ein Pre-Commit-Hook (z. B. husky + lint-staged), der geänderte Dateien vor jedem Commit formatiert — fängt Drift früher ab, kostet eine Dev-Abhängigkeit.

**DoD:** `npm run format:check` ist grün im ganzen Repo; `npm run lint`/`typecheck`/`test` bleiben grün; die CI schlägt bei unformatiertem Code fehl.

## Slice 17 — Mehrfach-Einreichung
**Ziel:** Eine Rechnung kann bei mehreren Policen eingereicht werden, bei derselben Police aber nur einmal.
- Migration: `SubmissionInvoices` mit `UNIQUE (invoiceUID, contractUID)`, `Invoices.submissionUID` entfällt; `InvoiceExclusions`.
- Validierung: Summe der Allocations je Rechnung ≤ Rechnungsbetrag; keine Einreichung bei Policen mit Ausschluss-Markierung.
- Abgeleiteter Status je Einreichung + Gesamtstatus und Restbetrag je Rechnung; Workspace-Tabelle zeigt, bei welchen Policen eine Rechnung liegt.
- UI: Einreichen-Dialog bietet nur Policen an, bei denen die Rechnung noch nicht liegt; Aktion "Rest bei weiterer Police einreichen"; Markierung "nicht erstattungsfähig bei …" am Rechnungs-Detail.

**DoD:** Rechnung bei x einreichen → abrechnen (Teilerstattung) → Rest bei y einreichen → abrechnen; zweite Einreichung bei x wird abgelehnt; Überschreitung des Rechnungsbetrags wird abgelehnt.

## Slice 18 — Bonus-Staffel & Leistungsfreiheit
**Ziel:** Der erwartete Bonus ergibt sich aus Staffel und gezählten leistungsfreien Jahren.
- `ContractBonusTiers` (absolute Beträge je Stufe, an `ContractTerms` = Versicherungsjahr gebunden), "vom Vorjahr übernehmen", Kennzeichnung geerbter Staffeln als "nicht aktualisiert".
- `ServiceBillings.forfeitsBonus` (Abfrage bei Erfassung der Erstattung, Default aus `bonusForfeitRule`), `ContractYears` (tatsächliche Rückerstattung, Override "verwirkt").
- Service: leistungsfreie Serie je Police und Jahr, erwarteter Bonus; Unit-Tests für Serienbruch, Startwert, Override, beide Verwirk-Regeln.
- UI: Staffel und Jahresverlauf (leistungsfrei ja/nein, erwartet vs. tatsächlich erhalten) in der Policen-Detailansicht.

**DoD:** Für eine Police mit Startwert und mehreren Jahren stimmt die gezählte Serie; ein Jahr mit Erstattung setzt sie zurück; eine erfasste tatsächliche Rückerstattung überschreibt die Prognose.

## Slice 19 — Erstattungs-Optimierer
**Ziel:** Berechnung "wo lohnt sich Einreichen?" über alle Policen eines Versicherten.
- Reiner Service nach 2.3 (Strategie-Enumeration, Vollversicherung vor Zusatz, Rest-Logik, Ausschlüsse, verwirkte Boni), ausführlich dokumentiert (2.8).
- Endpoint `GET /api/v1/accounts/:accountUID/reimbursement-plan?year=` ersetzt `GET /contracts/:uid/reimbursement-analysis`.
- Tests: die drei Beispieljahre aus 2.3 wörtlich, dazu Grenzfälle (keine Zusatzversicherung, Obergrenze < Bonus, Bonus bereits verwirkt, alle Rechnungen ausgeschlossen, Erstattungssatz < 100 %).

**DoD:** Alle Beispieljahre liefern die erwartete Empfehlung; der Endpoint liefert Strategie, Schwellen und Empfehlung je Rechnung.

## Slice 20 — Übersicht & Empfehlungen
**Ziel:** In der Rechnungsübersicht ist auf einen Blick klar, wo welche Rechnung eingereicht werden sollte.
- Zusammenfassung pro Versichertem/Jahr neu: je Police SB-Fortschritt, Bonus (sicher / in Gefahr / verwirkt, erwartete Höhe), Ausschöpfung der Zusatz-Obergrenze; empfohlene Strategie mit Vergleich der Alternativen (Ersparnis in €).
- Empfehlungs-Badge je Rechnung in der Tabelle (Text + Icon, nicht nur Farbe — 2.7).

**DoD:** Für die Beispieljahre zeigt die Übersicht die richtige Empfehlung inkl. Betragsvergleich; responsiv, Light/Dark, axe ohne kritische Findings.

---

## Slice 21 — Rechnungs-Detaildialog mit Einreichungs-/Abrechnungs-Block (bisher Slice 16)
**Ziel:** Einreichungen und darauf erfolgte Leistungsabrechnungen direkt am Rechnungs-Detail verwalten.
- Kartenblock (wie Referenz „Zuordnung") mit Action-Items: einreichen, Leistungsabrechnung verknüpfen, Erstattung erfassen — **Karten nach Police gruppiert**, mit Restbetrag und Empfehlung aus Slice 19/20.
- Reorganisiert die heutigen Workspace-Zeilenaktionen und Einzeldialoge.
- Das Mapping Rechnung→Einreichung→ServiceBilling→Allocation ist durch das Datenmodell v3 geklärt; die vorherige Modell-Design-Runde entfällt.

**DoD:** Von der Rechnung aus einreichen/abrechnen/erstatten — auch bei einer zweiten Police — ohne Umweg über getrennte Zeilenaktionen.

## Slice 22 — Verknüpfen-Dialog + Such-Subdialog + Bulk (bisher Slice 17)
**Ziel:** Leistungsabrechnung bequem finden/anlegen/verknüpfen, auch in Masse (Referenz `Rechnungen_Verknüpfen.png`, `Leistungsabrechnung auswählen.png`).
- Auswahlfeld mit Search (🔍 → Filter-Subdialog: Nummer/Freitext, Zeitraum, „unverknüpft", Erstattungs-Range) und Add (＋ → Create).
- Backend: Such-/Filter-Endpunkt für ServiceBillings.
- **Bulk-Verarbeitung** fürs Einreichen und Verknüpfen mit **Kompatibilitätsprüfung** (Einreichen: Rechnungen noch nicht bei dieser Police und nicht ausgeschlossen; Verknüpfen: Rechnungen derselben Einreichung).

**DoD:** Mehrere kompatible Rechnungen in einem Zug verknüpfen; die Suche filtert korrekt.

**Offene Entscheidungen (vor Bau der jeweiligen Slice zu klären):** Währungs-Lib vs. custom (13); Typeahead client- vs. serverseitig (14); View/Edit-Umstieg nur Rechnung-Pilot vs. alle Entitäten (15).

## Ausblick (nicht Teil dieser Slices)
E-Mail-Benachrichtigungen (inkl. System-Einstellungen-UI und Verschlüsselungs-Infrastruktur aus 2.6), Paperless-Push-API, ggf. weitere Ausbaustufen — siehe 2.5.