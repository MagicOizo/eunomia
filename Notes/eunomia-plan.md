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
- **Genau ein API-Container** (festgelegt mit Scheibe 15, SEC-13/CR-37). Horizontale Skalierung ist
  kein Ziel; damit die Annahme nicht nur dasteht, sind die Migrationen seit v0.19.0-slice.1 durch
  eine Datenbanksperre (`GET_LOCK('eunomia:migrate')`) serialisiert — eine zweite Instanz wartet und
  findet danach nichts mehr zu tun, statt dieselbe Migration parallel anzuwenden.
- **Der Port gehört ans Loopback.** Die Abbildung bindet standardmäßig auf `127.0.0.1`, weil der
  Reverse Proxy auf demselben Host steht; ein Port auf einer anderen Schnittstelle wäre am Proxy und
  damit an dessen TLS und Zugriffsregeln vorbei erreichbar. `BIND_ADDRESS` ist der ausdrückliche
  Ausweg für den Betrieb ohne Proxy. Der API-Container läuft außerdem mit schreibgeschütztem
  Dateisystem, ohne Capabilities, mit `no-new-privileges` und mit Speicher-/CPU-Grenzen.
- **Das Backup kennt keinen Schlüssel.** Der Dump ist Klartext mit Art.-9-Daten; verschlüsselt wird
  auf dem Host (`age`/`gpg`), wo der Schlüssel liegt. Die README sagt verbindlich, wohin Backups
  gehören, wie lange sie bleiben und dass sie verschlüsselt sein müssen.

## 2.2 Technologie-Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Repo-Struktur | Monorepo, npm workspaces: `apps/api`, `apps/web`, `packages/shared` | Ein Build, eine Versionsnummer, gemeinsamer Code zwischen API und Web ohne ein separat zu veröffentlichendes Paket. Das Paket (bis Scheibe 5 der Review-Arbeit ein leerer Platzhalter namens `shared-types`, seitdem `@eunomia/shared`) enthält, **was beide Seiten gleich benennen oder gleich entscheiden**: die Status-Namen, die Fehlercodes, die Enum-Werte, die Settings-Schlüssel, die Fälligkeitsregel, die Vorschlagsregel für Kontoverbindungen und die deutschen Zahl-/Datumsformate. Nicht hinein gehört, was eine Seite allein entscheidet (Anzeige, Datenbankzugriff). Es wird kompiliert und zuerst gebaut; die API importiert sein `dist` zur Laufzeit |
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

Bewährtes aus dem Vorgängerprojekt wird übernommen: NanoID-basierte öffentliche IDs mit Entitäts-Präfix (siehe `database.md` / `eunomia-description.md` §5), Soft-Delete über eine `status`-Spalte (`1`=aktiv, `0`=inaktiv, `-1`=gelöscht — künftig **konsistent für alle** Entitäten, ohne die Ausnahmen, die `ServiceBillings`/`Assignment` im Vorgänger hatten), Geldbeträge als `DECIMAL`, Datumsfelder als `DATE`. Seit Slice 39 trägt jede weich löschbare Tabelle zusätzlich ein `deletedAt DATETIME(6)`: es sortiert den Papierkorb, trägt später eine Aufräumfrist — und identifiziert vor allem **einen Löschvorgang**, weil eine Kaskade denselben exakten Wert in alle betroffenen Zeilen schreibt und das Wiederherstellen genau diesen Vorgang umkehrt. Vor 0.12.0 gelöschte Zeilen haben `NULL` und zeigen „unbekannt".

### Kern-Fix für Problem 1.3.1: `Submissions` als eigene Entität

Statt eine Rechnung direkt (n:n) mit Leistungsabrechnungen zu verknüpfen, wird eine **Einreichung** (`Submission`) zur eigenständigen Entität:

```
Contracts ──1:n──→ Submissions ──1:n──→ Invoices
                        │
                        └──1:n──→ ServiceBillings ──1:n──→ Allocations ──n:1──→ Invoices
```

> **Revidiert durch Datenmodell v3 (siehe unten):** Die Regel "nur einmal einreichen" gilt jetzt **pro Police**, `Invoices.submissionUID` wird durch die Tabelle `SubmissionInvoices` ersetzt. **Mit Slice 37a hängt auch die `ServiceBilling` an der Police, nicht mehr an der Einreichung** — die beiden folgenden Punkte dazu gelten nicht mehr, siehe unten.

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
                 ├─1:n→ ContractPremiums   (Beitragsstände, gültig ab Datum — gesamt + bonusrelevant)
                 ├─1:n→ ContractTerms      (Konditionen, gültig ab Kalenderjahr)
                 │         └─1:n→ ContractBonusTiers (Staffel: leistungsfreie Jahre → Betrag in € oder Faktor)
                 ├─1:n→ ContractYears      (Jahresstatus: Bonus verwirkt?, tatsächliche Rückerstattung)
                 ├─1:n→ Submissions ─n:m→ Invoices   (über SubmissionInvoices)
                 └─1:n→ ServiceBillings ─1:n→ Allocations ─n:1→ Invoices
Invoices ─n:m→ Contracts über InvoiceExclusions ("nicht erstattungsfähig bei dieser Police")
```

- **`Contracts` = stabile Police.** Tabellenname und `/api/v1/contracts` bleiben (weniger Umbau), die UI spricht von "Police". Felder: Nummer, Versicherung, Versicherter, Beginn/Ende, neu `contractKind` (`FULL` = Vollversicherung / `SUPPLEMENTARY` = Zusatzversicherung), `bonusForfeitRule` (`ON_SUBMISSION` = schon das Einreichen verwirkt den Bonus / `ON_REIMBURSEMENT` = erst eine tatsächliche Erstattung), sowie der Startwert der Leistungsfreiheit `claimFreeYearsAtStart` + `claimFreeCountingFromYear` (Default: 0 bzw. Beginnjahr — für neu abgeschlossene Policen passt der Default, für ältere trägt man die bisherigen leistungsfreien Jahre ein). Eine neue Police entsteht nur noch bei echtem Vertragswechsel.
- **`ContractPremiums`**: `validFrom` (DATE), Monatsbeitrag gesamt, bonusrelevanter Monatsbeitrag, Notiz (z. B. "Beitragsanpassung 01/2026"). `validTo` wird aus dem Folgeeintrag abgeleitet, nicht gespeichert. Beide Beträge sind optional, mindestens einer ist gesetzt. Der Gesamtbeitrag ist rein informativ (Beitragsverlauf, Jahreskosten). **Seit Slice 76 (1.1.0) ist der bonusrelevante Beitrag eine Rechengröße:** Faktor-Stufen der Staffel multiplizieren seinen Jahresdurchschnitt (siehe `ContractBonusTiers`). Das hebt die ursprüngliche Festlegung „kein Einfluss auf den Bonus" auf. Eine weitere Aufteilung in Tarif-Bestandteile gibt es weiterhin nicht.
- **`ContractTerms`**: gültig ab `validFromYear` bis zum nächsten Eintrag (ein Jahr ohne eigenen Eintrag erbt den vorherigen). Felder: Selbstbeteiligung (jährlich), Jahres-Erstattungsobergrenze (nullable), Erstattungssatz in % (Default 100). Unterjährige Änderungen gibt es hier nicht — die Selbstbeteiligung ist immer eine Jahresgröße der Police.
- **`ContractBonusTiers`**: gehört zu einem `ContractTerms`-Eintrag, also fest zu einem (ab-)Versicherungsjahr (= Kalenderjahr). Pro Stufe: Mindestzahl leistungsfreier Jahre → **entweder ein Betrag in € oder ein Faktor in Monatsbeiträgen** (seit Slice 76; vorher nur €). Beispiel in €: 1 → 300 €, 2 → 450 €, 4 → 600 €; als Faktor: Jahr 1–2 → 1, 3–4 → 1,5, 5 → 2. Beide Arten dürfen in einer Staffel gemischt sein.
  - **Faktor:** Bonus = Faktor × Durchschnitt des bonusrelevanten Monatsbeitrags im Bonusjahr, auf Cent gerundet. Der Durchschnitt läuft über die Monate, in denen die Police im Jahr läuft (unterjähriger Beginn/Ende). Jeder Monat zählt mit dem Beitragsstand, der an seinem ersten laufenden Tag gilt, so wirkt eine Anpassung mitten im Jahr anteilig. Fehlt für einen laufenden Monat der bonusrelevante Beitrag, gibt es **keine Prognose** („Beitrag fehlt"), und der Optimierer rechnet für das Jahr mit 0 € Bonus. Ein Faktor ist eine feste Regel der Versicherung, deshalb gilt er ohne Hinweis weiter, auch wenn er aus einem früheren Konditionen-Eintrag stammt.
  - **Betrag:** Ändern sich die Werte, werden sie mit einem neuen `ContractTerms`-Eintrag neu eingegeben (UI bietet "vom Vorjahr übernehmen" an). Ist für ein Jahr keine eigene Staffel erfasst, gilt der geerbte Betrag als Prognose und wird in der UI als "nicht aktualisiert" gekennzeichnet.
- **Leistungsfreiheit wird gezählt, nicht gepflegt:** Ein Jahr ist für eine Police leistungsfrei, wenn der Bonus darin nicht verwirkt ist. Verwirkt ist er — je nach `bonusForfeitRule` — durch eine Einreichung bzw. eine Erstattung > 0 bei dieser Police in dem Behandlungsjahr; übersteuerbar pro Leistungsabrechnung (`ServiceBillings.forfeitsBonus`, nullable = Regel der Police folgen; wird bei Erfassung der Erstattung abgefragt) und pro Jahr (`ContractYears`). Die Serie leistungsfreier Jahre = `claimFreeYearsAtStart` + ununterbrochen leistungsfreie Jahre ab `claimFreeCountingFromYear`; ein verwirktes Jahr setzt sie auf 0.
- **`ContractYears`** (optional pro Police und Jahr): tatsächlich erhaltene Beitragsrückerstattung laut Schreiben der Versicherung (überschreibt die Prognose) und manueller Override "Bonus verwirkt ja/nein".
- **`SubmissionInvoices`** (`submissionUID`, `invoiceUID`, `contractUID` denormalisiert) ersetzt `Invoices.submissionUID`. `UNIQUE (invoiceUID, contractUID)`: **eine Rechnung höchstens einmal pro Police** — die Doppel-Einreichung bei derselben Versicherung bleibt strukturell ausgeschlossen, bei verschiedenen Policen ist sie erlaubt.
- **`ServiceBillings` hängen an der Police** (`contractUID`, seit Slice 37a; vorher an der Einreichung). Welche Einreichungen eine Leistungsabrechnung beantwortet, ergibt sich aus ihren `Allocations` — ein Brief der Versicherung erstattet regelmäßig Rechnungen, die an verschiedenen Tagen eingereicht wurden. Buchbar ist, was **bei dieser Police eingereicht** ist (über `SubmissionInvoices`); "ein Versicherter je Abrechnung" trägt der Vertrag. `UNIQUE (contractUID, billingNumber)` über die Generated Column `activeBillingNumber` (NULL bei `billingStatus = -1`, damit eine gelöschte Abrechnung ihre Nummer wieder freigibt — MariaDB kennt keinen partiellen Index). Dieselbe Nummer bei **zwei** Policen bleibt erlaubt: ein Brief kann zwei Policen abrechnen (Familienfall, `seed/family-policy.ts`).
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
- **Instanzweite Rechte (festgelegt 2026-10-03, Scheibe 8 der Review-Arbeit, schließt SEC-04):** Ein Teil der Rechte wird grundsätzlich **ohne** `accountUID` geprüft, also nur aus `UserRoles` beantwortet: `MANAGE_USERS`, `MANAGE_SETTINGS`, `MANAGE_TRASH`, `MANAGE_FACILITIES`, `MANAGE_COMPANIES`, `MANAGE_AGENCIES`. Sie gehören zu Dingen, die keinen Versicherten haben — Anmeldungen, Systemeinstellungen, Stammdaten, der Papierkorb. Dieselbe Rolle über `UserAccountRoles` an ein einzelnes Konto gebunden trägt diese Rechte deshalb **wirkungslos** mit; wer sie haben soll, bekommt sie global.
  - **Der Papierkorb ist damit ausdrücklich kontoübergreifend** und das Gegenstück zu I-2: `MANAGE_TRASH` sieht und löscht die gelöschten Datensätze aller Versicherten. Gründe: endgültiges Löschen ist ein administrativer Akt; der Verweis eines gelöschten Eintrags auf seinen Versicherten kann selbst gelöscht sein, dann bliebe nichts, woran zu scopen wäre; und vier der elf Papierkorb-Entitäten (Versicherer, Leistungserbringer, Abrechnungsdienstleister, Kontoverbindung) haben überhaupt kein Konto. Das Recht gehört darum nur an Administratoren — es ist kein Recht für eine Aufräum-Rolle mit begrenztem Blick. Die Prüfung dieser Zusage im Code (eine kontobezogene Vergabe instanzweiter Rechte ablehnen) ist Teil von SEC-17 (Scheibe 16), die Sichtbarkeit in der Oberfläche Teil von CR-26 (Scheibe 12).
- **Die Oberfläche spiegelt dieselben Regeln (festgelegt 2026-10-03, Scheibe 12, schließt CR-26):** Der Client fragt mit `can(permission, accountUID?)` genau das, was die API mit `hasPermission()` beantwortet — global schlägt kontobezogen, instanzweite Rechte zählen nur global. Daraus folgt, was eine angemeldete Person sieht:
  - **Bereiche verschwinden.** Ein Navigationseintrag und seine Route hängen am Recht ihrer Seite (`/system/trash` an `MANAGE_TRASH`, nicht mehr an `MANAGE_USERS`); fehlt es, ist der Eintrag weg und die Route führt auf die Startseite. Stammdaten-Listen (Versicherungen, Leistungserbringer, Abrechnungsdienstleister) bleiben für jede angemeldete Person sichtbar — die API gibt sie jedem zu lesen.
  - **Aktionen bleiben stehen und sind deaktiviert**, mit „Dazu fehlt dir die Berechtigung." als Hinweis. Sie zu verstecken würde verschweigen, dass es die Aktion gibt; der Satz ist derselbe, den die API bei `FORBIDDEN` antwortet.
  - **Anzeigemasken öffnen nur-lesend**, statt verschlossen zu bleiben: wer lesen darf, soll lesen können. Jede Zeile steht als Text, es gibt kein „Speichern".
  - **Konto-Auswahlen beim Anlegen sind gefiltert** auf die Konten, für die das Schreibrecht gilt — eine Police lässt sich nicht für einen Versicherten beginnen, bei dem das Absenden am 403 scheitern würde.


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
- **Alles, was mit dem Repo nach außen geht, ist englisch** (beschlossen 2026-09-24): `CHANGELOG.md` und damit die Titel und Texte der GitHub-Releases, `README.md`, `DEV.md`, Commit-Meldungen. Grund: Wenn das Repo irgendwann veröffentlicht wird, entscheidet die Sprache über die Reichweite — und nachträglich umzuschreiben wäre teurer als es von Anfang an so zu halten. Deutsch bleibt bei den **UI-Texten**, den Fachbegriffen im Datenmodell (`Rechnung`, `Einreichung`, …), den Fehlermeldungen in der App (Slice 24) und den Planungsnotizen in `Notes/` — die sind das Arbeitsmaterial des Autors, nicht Teil der Veröffentlichung. **Ab dem Paket Lokalisierung (Slices 77–83, 1.2.0)** stehen die UI-Texte nicht mehr im Code, sondern im Katalog (`apps/web/src/locales/*.json`); Deutsch ist die Quellsprache und das Schema, Englisch die zweite Sprache.
- **Ein Wort, eine Bedeutung — die drei „Konten" (festgelegt 2026-09-30, Scheibe 3 der Review-Arbeit):** `account` ist im Code **ausschließlich der Versicherte** (Tabelle `Accounts`, ID-Präfix `a`, `accountUID`). Die **Kontoverbindung eines Abrechnungsdienstleisters** heißt `paymentDetail` / `paymentDetails` — bewusst ein ganz anderes Wort, damit eine Suche nach `account` sie nicht mehr trifft. Die **Anmeldung** heißt `user` (`userId`), nie `account`. Ausnahme und Grund: Tabelle (`AgencyBankAccounts`), Spalten (`agencyAccountUID`, `agencyAccountStatus`, `bankAccount`), die Routen `/agencies/:uid/accounts` und das Antwortfeld `accounts` stammen aus der Zeit vor dieser Festlegung und bleiben — sie umzubenennen hieße Migration **und** neue API-Version, weil `agencyAccountUID` in `Invoices` steht und in jeder Rechnungsantwort. Die Grenze läuft also am Rand des Codes: innen `paymentDetail`, auf der Leitung der alte Name.
- **Typen statt Zusicherungen (festgelegt 2026-10-03, Scheibe 14 der Review-Arbeit):** Der Treiber antwortet `Record<string, unknown>`, und `pool.query<T>` ist generisch mit `T = any` — ein `as` darauf ist eine Prüfung, die der Compiler ab dann nicht mehr macht. Regel: Die Form einer Zeile wird **einmal** behauptet, nämlich in der Tabellenbeschreibung (`crudTable<InvoiceColumns>({…})`), wo die Spaltenliste gegen `keyof R` geprüft wird; Zeilentypen sind deshalb Typ-Aliase und keine Interfaces (nur ein Alias erfüllt `Row`). Ein Zeilentyp nennt, was die **Datenbank** garantiert (`VARCHAR`/`DATE` → `string`, `DEFAULT NULL` → `| null`) — eine engere Zusage, etwa ein Enum über einem `VARCHAR`, wird beim Lesen geprüft (`lib/one-of.ts`) und nicht deklariert. Eine Tabelle, deren Zeilen niemand feldweise liest, bleibt beim untypisierten `Row`. Bleiben darf ein `as` nur an der Grenze zu einer Fremd-API, die es anders nicht hergibt (Express `res.locals`, `promisify`, nodemailer, `require` der `package.json`, zod über `ZodObject<ZodRawShape>`) — dann mit einem Satz, der sagt, warum.
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
- **Eine Minor-Nummer darf übersprungen werden (festgelegt 2026-10-03):** `0.16.0` ist nie erschienen. Block I und Block II der Review-Arbeit liefen als `0.16.0-slice.1…6` und `0.17.0-slice.1…3` durch, ohne dass dazwischen ein volles Release stand; nachträglich ließe es sich nur durch das Umschreiben gepushter Historie einfügen, und das ist eine unbenutzte Nummer nicht wert. Beide Serien sind zusammen als `0.17.0` veröffentlicht, und der Changelog-Abschnitt sagt das ausdrücklich. Die Regel bleibt „ein Minor je abgeschlossenem Feature"; dass eine Nummer in der Folge fehlt, ist erlaubt, eine *rückwirkend* erfundene wäre es nicht.
  - **Woran es lag, und was daraus folgt:** Der Bump gehört in den Release-Commit. Er unterblieb, das Tag `v0.17.0` wurde trotzdem auf den slice.3-Commit gesetzt, und `version:check --tag` hat den Release-Job korrekt abgewiesen (`tag v0.17.0 does not match the version 0.17.0-slice.3`) — der Job `image` davor war aber schon durchgelaufen und hatte `:latest` verschoben. Ein Tag ohne Bindestrich bewegt also das Docker-`:latest`, *bevor* irgendetwas die Version prüft. Dasselbe ist vorher zweimal passiert (`v0.16.0-slice.3`, `v0.16.0-slice.7`), jedes Mal unbemerkt, weil der Fehlschlag nur in den Actions steht. Eine lokale Prüfung vor dem Tag-Push ist als Punkt in `issues.md` vorgemerkt.

- **1.0.0 (entschieden 2026-10-05):** nach dem Release 0.20.0 und dessen Lauf in der Produktion hat der Autor den Stand zur ersten Major erklärt. Der Code ist derselbe wie in `0.20.0`; das Release macht die Zusage. Davor waren alle Befunde aus der Nutzung (`issues.md`) und alle 54 Befunde der beiden Reviews abgearbeitet. Was danach kommt, ist Ausbau, kein Nachholen: als erstes die Faktoren-Staffel aus dem Backlog unten, als **1.1.0**.

**Warum die Slices nicht einfach `0.9.1`, `0.9.2`, … heißen** (die naheliegende Variante, verworfen):

- Ein `0.9.1` nach dem Release `0.9.0` sieht von außen wie ein Bugfix-Release aus, ist aber eine Vorschau auf `0.10.0`.
- Es verbraucht genau die Nummern, die ein echter Hotfix auf `0.9.0` bräuchte. Eine laufende Vorschau `0.9.3` hielte das Hotfix-Release `0.9.1` für älter und würde den Update-Hinweis nicht anzeigen.
- `lib/semver.ts` ordnet Prereleases bereits korrekt (`0.10.0-slice.3 < 0.10.0`), und `releases/latest` filtert Prereleases ohnehin heraus — die Prerelease-Schreibweise braucht also keine neue Logik im Update-Check.

**Mechanik dazu:** in Slice 26 umgesetzt (Bump-Skript `scripts/version.ts`, `latest`-Guard und Release-Job in `.github/workflows/docker.yml`, `CHANGELOG.md` als Quelle der Release-Notes, `npm run version:check` in der CI). Der Alltagsablauf steht in [DEV.md](../DEV.md) unter „Versioning a change".

## 2.10 Sicherheit (erstmals geprüft 2026-09-29, vor 1.0.0)

Die Sicherheitsakte des Projekts ist ein eigenes Dokument: [Sicherheits-Review.md](Sicherheits-Review.md).
Dort stehen das Bedrohungsmodell, die **Sicherheits-Invarianten I-1 bis I-13** und die Befunde mit
Nachweis und Fundstelle. Hier steht nur, was das für die Planung bedeutet:

- **Die Invarianten sind Vorgabe, nicht Beschreibung.** Jede Scheibe wird gegen sie geprüft. Wer eine
  brechen will, ändert sie zuerst dort — begründet.
- Der Maßstab ist die geplante Internet-Exposition, nicht der heutige LAN-Betrieb. Jeder Befund trägt
  deshalb zwei Risikonoten. Eine Version 1.0 soll exponierbar sein.
- Die Befunde sind als Punkte in [issues.md](issues.md) unter `0.16.0-slice.1` eingetragen und werden
  wie jeder andere Befund in Scheiben abgearbeitet.
- Schwerpunkt des ersten Durchgangs: SEC-01 (ausführbare Schemata im Dokument-Link), SEC-02 (keine
  Security-Header/CSP) und SEC-09 (kein Audit-Trail). Der Rest ist geordnet, aber nachrangig.
- **Die Nachprüfung vor 1.0.0 ist erledigt** (04.10.2026, Scheibe 69; Abschnitt 8 des Reviews).
  Geplant war ein Delta auf den berührten Dateien, durchgeführt wurde ein vollständiger Durchgang je
  Invariante — bei 266 angefassten Dateien *ist* das Delta der ganze Code. Alle dreizehn gelten.
  Was für die Planung daraus folgt: I-1, I-2, I-3, I-8 und I-13 sind jetzt maschinell gesichert,
  I-6, I-11 und I-12 durch vorhandene Prüfungen mitgedeckt; **I-4, I-5, I-7 und I-10 bleiben
  gelesen, nicht geprüft** — eine Scheibe, die SQL baut, Spalten whitelistet, loggt oder eine
  Berechtigung auflöst, hat dafür keinen Test als Netz und muss von Hand gegen die Regel gelesen
  werden.
- **Die Header sind Sache der App, nicht des Proxys** (Scheibe 15, SEC-02). `helmet` sitzt vor allen
  Routern, die CSP steht ausgeschrieben in `app.ts` und wird von `app.test.ts` geprüft. Zwei
  Lockerungen sind benannt und begründet: `img-src data:` für den GiroCode und
  `style-src 'unsafe-inline'` für Vues `:style`-Bindings und FontAwesome. Skripte bleiben auf
  `'self'`, ohne `unsafe-inline` und ohne `unsafe-eval`. `upgrade-insecure-requests` ist
  ausdrücklich nicht gesetzt — es würde die eigene http-Instanz zerlegen. Eine Instanz ohne fremde
  Proxy-Konfiguration ist damit nicht ungeschützt.
- **Der Audit-Trail ist eine Liste, keine Gewohnheit** (Scheibe 17, SEC-09). Die vierzehn
  Ereignisse stehen als Katalog in `lib/audit.ts`; ein Name lässt sich dort nicht vertippen und ein
  Feld nicht erfinden. Zwei Regeln sind dabei nicht verhandelbar und werden dort auch geprüft: eine
  Zeile trägt UIDs und nie ein Label (I-7 — ein Papierkorb-Eintrag heißt mit Rechnungsnummer und
  dem Namen der behandelten Person), und `SETTINGS_CHANGED` nennt Schlüssel und nie Werte. Die
  einzige personenbezogene Ausnahme ist die E-Mail-Adresse bei einer fehlgeschlagenen Anmeldung,
  ohne die sich ein gezielter Angriff nicht von einem Spray unterscheiden lässt. 401 und 403 werden
  an einer Stelle geschrieben, im `error-handler` — auch die 37 Routen, die erst im Handler prüfen,
  kommen dort vorbei. Ein **abgelaufener** Access-Token schweigt: er ist der Normalfall jedes
  offenen Browser-Tabs, und eine Zeile dafür begrübe die übrigen. `DEV.md` listet alle vierzehn,
  und der Test hält die Liste in beide Richtungen.
- **Abhängigkeiten sind ein CI-Schritt, kein Review-Thema**: `npm audit --omit=dev
  --audit-level=high` läuft bei jedem Push (SEC-10). Im Laufzeit-Image stecken seit Scheibe 15 nur
  noch die Abhängigkeiten der API — die SPA ist ein statisches Bündel und braucht ihre eigenen nicht
  mehr.

Der Datenbestand fällt unter Art. 9 DSGVO. Das ist keine Formalie, sondern der Grund, warum
Nachvollziehbarkeit (SEC-09), Löschfristen (SEC-15) und Backup-Verschlüsselung (SEC-14) in diesem
Projekt Befunde sind und nicht Komfortwünsche. Was aus der Löschfrist und der Auskunft geworden
ist, steht in 2.11.

## 2.11 Aufbewahrung, Löschung, Auskunft (festgelegt 2026-10-04, Scheibe 18, schließt SEC-15)

Drei Lücken im Umgang mit Art.-9-Daten hingen zusammen: der Papierkorb hielt gelöschte Datensätze
unbegrenzt, ein gelöschter Nutzer blieb mit Name und Adresse für immer stehen, und es gab keinen
Weg, die zu einer Person gespeicherten Daten auszugeben. Die Antworten darauf sind Regeln und
gehören deshalb hierher, nicht nur in den Code.

**Die Aufbewahrungsfrist.** Eine Systemeinstellung (`retention.enabled`, `retention.trashDays`), ein
täglicher Lauf (`apps/api/src/retention/sweep.ts`), und vier Festlegungen:

- **Die Vorgabe ist aus**, die Frist selbst 90 Tage. Eine Instanz, die in diese Version
  hineinaktualisiert, darf nicht zu löschen beginnen, weil niemand den Changelog gelesen hat.
  Einschalten ist eine Entscheidung; die Einstellungsseite bietet vorher einen Probelauf, der zählt
  und nichts anfasst.
- **Die Frist gilt für den Papierkorb und für gelöschte Nutzer, nie für aktive Daten.** Eine Frist
  auf Rechnungen oder Policen wäre eine fachliche Entscheidung über Falldaten; SEC-15 verlangt sie
  nicht, und dieses Projekt trifft sie nicht nebenbei.
- **Gelöscht wird mit derselben Mechanik wie von Hand** (`domain/trash-purge.ts`, von der Route und
  vom Lauf gelesen): was unter einem Eintrag hängt und selbst gelöscht ist, geht mit — auch wenn es
  jünger als die Frist ist; ein Eintrag, auf den noch etwas Aktives zeigt, bleibt stehen und wird
  beim nächsten Lauf wieder versucht. Es gibt keinen zweiten Löschweg mit eigenen Regeln.
- **Ohne Löschdatum keine Frist.** Einträge aus der Zeit vor dem Papierkorb (Slice 39) und Nutzer,
  die vor Migration 018 gelöscht wurden, tragen kein `deletedAt`; sie altern nie. Eine Frist darf
  nicht auf einen Zeitpunkt löschen, den niemand aufgeschrieben hat — dieselbe Haltung wie bei der
  undatierten Kontoverbindung aus Slice 38.

Der Lauf hat **keine Uhrzeit-Einstellung**, anders als die Erinnerungen: ein DELETE interessiert
nicht, wann es läuft, eine Mail kommt bei einem Menschen an. Für den Audit-Trail selbst gibt es
keine Frist — er geht nach stdout und ist damit Sache des Betreibers, wie die Aufbewahrung der
Backups (README, Scheibe 15).

**Nutzer löschen — in der Nutzerverwaltung, nicht im Papierkorb.** Der Sicherheits-Review empfiehlt,
Nutzer in den Papierkorb aufzunehmen; der Autor hat dagegen entschieden, aus drei Gründen:

- Ein Restore im Papierkorb gäbe einem Inhaber von `MANAGE_TRASH` die Wiederherstellung einer
  **Anmeldung** in die Hand. Zugang zu vergeben ist `MANAGE_USERS` (2.4).
- Die Papierkorb-Mechanik leitet Kinder, Blocker und Anhänge aus den Fremdschlüsseln ab. Die zeigen
  bei `Users` auf `userID` und nicht auf `uuidText`; für Nutzer liefe sie leer und täuschte eine
  Prüfung nur vor.
- `entityOfUid` löst die Art eines Datensatzes über ein Präfix auf, das eine UUID nicht hat — `a`,
  `b`, `c`, `e`, `f` kollidieren mit bestehenden Präfixen.

Stattdessen: Migration 018 gibt `Users` ein `deletedAt`, die Liste zeigt die gelöschten Nutzer in
einem eigenen Abschnitt, und zwei Aktionen stehen dort. **Wiederherstellen bringt den Nutzer
deaktiviert zurück** (Status 0), nie aktiv — eine zurückkehrende Anmeldung darf nicht überraschend
funktionieren. **Endgültig löschen** entfernt die Zeile; was daran hängt, räumt die Datenbank selbst:
Rollen, Konto-Zugriffe, Sitzungen und Erinnerungs-Vermerke kaskadieren,
`SystemSettings.updatedByUserID` wird NULL — wer eine Einstellung zuletzt angefasst hat, überlebt das
Konto absichtlich (Migrationen 002, 009, 010).

**Die Auskunft.** `GET /accounts/:uid/export` gibt alles, was zu einem Versicherten gespeichert ist,
als ein JSON-Dokument; in der Liste der Versicherten lädt ein Knopf die Datei herunter.

Die Rechte sind **`VIEW_ACCOUNTS`, `VIEW_INVOICES` und `VIEW_CONTRACTS`, alle drei auf genau dieses
Konto** (korrigiert am 04.10.2026). Zunächst stand hier `VIEW_ACCOUNTS` allein, mit dem Satz „wer
den Datensatz lesen darf, darf lesen, was zu ihm gespeichert ist". Die Nachprüfung der Invarianten
hat das als Befund B-3 vorgelegt (§8 des Sicherheits-Reviews): das Dokument trägt Rechnungen,
Einreichungen, Abrechnungen und Buchungen, und jeder andere Weg zu diesen verlangt sein eigenes
Recht — ein Export mit nur einem wäre die einzige Tür mit dem schwächeren Schloss. Mit den beiden
Systemrollen war der Unterschied ohne Wirkung; eine Rolle, die in der Datenbank anders
zusammengesetzt wird, hätte ihn gehabt. „Den Datensatz lesen dürfen" heißt deshalb **nicht** „alles
über die Person lesen dürfen", und I-2 führt den Export nicht mehr als Ausnahme. In der Oberfläche
bleibt der Knopf ohne die Rechte sichtbar und deaktiviert, wie jede andere Aktion seit CR-26.

Drei weitere Festlegungen:

- **Gelöschte Zeilen sind dabei**, mit Status und Löschdatum. Eine Auskunft über gespeicherte Daten,
  die einen Teil des Gespeicherten verschweigt, wäre keine.
- **Werte wie gespeichert**, nicht wie die Oberfläche sie zeigt (ISO-Datum, Zahl statt „120,00 €“).
  Das Dokument ist ein Datenbestand und soll sich mit der Datenbank vergleichen lassen.
- **Keine Daten anderer Personen.** Eine Zahlungserinnerung erscheint mit Stufe und Tag, nicht mit
  ihrem Empfänger; die Rechte-Zuweisungen zu diesem Konto bleiben außen vor; `leadAccountUID` bleibt
  eine UID, der Export zieht keine Familie mit sich.

Die Vollständigkeit ist geprüft, nicht behauptet: `account-export.integration.test.ts` hält eine
Inventarliste aller Tabellen des Schemas gegen `information_schema` — jede Tabelle ist entweder im
Export, mit der Stelle, an der sie erscheint, oder sie trägt einen Satz, warum nicht. Eine neue
Tabelle mit Personenbezug bricht den Test, bis jemand sie einordnet.

---

# 3 Umsetzungsplanung (Slices)

Jeder Slice ist für sich lauffähig/überprüfbar (App startet, Tests laufen, sichtbarer Fortschritt im Browser oder per REST-Call) — kein Slice hinterlässt einen halbfertigen Zwischenzustand ohne Definition-of-Done. Die Reihenfolge ist eine Abhängigkeitskette, keine Zeitschätzung.

## Slice 0 — Projekt-Grundgerüst
**Ziel:** Monorepo steht, alle Werkzeuge sind lauffähig, noch ohne Fachlogik.
- npm workspaces (`apps/api`, `apps/web`, `packages/shared` — damals `shared-types`)
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
- **Die Regel steht serverseitig neu** (`reminders/payment.ts`) als bewusste Zweitschrift zu `apps/web/src/invoices/payment.ts`, mit gegenseitigem Kommentarverweis und derselben Schwelle in beiden Testdateien. Das einzige echte Zuhause wäre ein geteiltes Paket — `packages/shared-types` ist bis heute ein leerer Platzhalter, den keine App importiert, und der erste app-übergreifende Import samt Build-Reihenfolge, Vite-Alias und Dockerfile wäre ein Nebenbau. → Backlog. **Nachtrag:** mit Scheibe 5 der Review-Arbeit (v0.16.0-slice.6) in `@eunomia/shared` zusammengelegt — und die beiden Datumsrechnungen waren da schon auseinandergelaufen (CR-02).
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

- ~~**Geteiltes Paket für die Fälligkeitsregel:** `calcPaymentState` und `DUE_SOON_DAYS` stehen in zwei Dateien. `packages/shared-types` (heute ein leerer Platzhalter) wäre das Zuhause — dafür braucht es Build-Reihenfolge, Vite-Alias und Dockerfile-Anpassung, also eine eigene Scheibe.~~ — umgesetzt mit v0.16.0-slice.6 (Scheibe 5 der Review-Arbeit).
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

## Slice 33 — Eingabe-Politur: Tab im Picker, Datum einfügen (umgesetzt 2026-09-25)
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

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Tab verhält sich wie Enter:** Die Markierung zählt, egal ob sie durchs Tippen (erster Treffer)
  oder mit den Pfeiltasten entstanden ist. Ein Picker mit geschlossener Liste ändert nichts.
- **Auf der Zeile „‚X' als … hinzufügen" löst Tab nichts aus** — ein Subdialog, der beim Weitertabben
  aufspringt, wäre eine Überraschung. Praktische Folge in den Feldern mit Ad-hoc-Anlegen: nach dem
  bloßen Tippen steht die Anlegen-Zeile oben, der Eintrag wird also mit ↓ gewählt (oder der Name
  ausgeschrieben, dann verschwindet die Zeile) — genau der Ablauf aus issues.md 1.
- **Fokus öffnet die Liste nicht mehr**, nur Klick, Tippen und ↓. Damit sind beide Hälften des
  Slice-32-Backlogs erledigt: kein alter Suchtext beim nächsten Fokus (er wird dort zurückgesetzt)
  und keine volle Liste über der Dialog-Fußzeile beim Rücksprung aus einem Subdialog.
- **Datum nur mit vierstelligem Jahr.** `24.09.26` wird abgelehnt: beim Geburtsdatum (`15.03.57`)
  wäre das Jahrhundert geraten.

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Der Picker hat jetzt zwei Zustände statt einem:** `focused` („zeigt seinen Suchtext") neben
  `open` („zeigt seine Liste"), und `highlight` ist `number | null` — `null` heißt „der Nutzer hat
  nichts gewählt". Ohne diese Unterscheidung übernähme ein nur durchtabbter Picker die erste Option,
  weil die Markierung bei 0 startete.
- **`select()` ist in `commit()` + `blur()` zerlegt.** Tab benutzt nur `commit()`: Der Fokus muss
  regulär weiterwandern, ein `blur()` im Keydown würde ihn stattdessen verlieren.
- **Der Suchtext wird beim Fokus zurückgesetzt, nicht beim Verlassen.** Andersherum stünde das „+"
  der Anzeigemaske ohne Text da — es liegt außerhalb des Pickers und wird erst angeklickt, wenn der
  Fokus das Feld schon verlassen hat (Slice 32).
- **Escape gehörte dem Dialog, nicht dem Picker** (im Browser gefunden): Ein natives `<dialog>`
  schließt auf die Taste selbst, also nahm das Wegklicken der Vorschlagsliste das ganze Formular mit.
  Escape wird jetzt bei offener Liste mit `preventDefault()` abgefangen und schließt nur sie; bei
  geschlossener Liste bleibt es die Schließen-Geste des Dialogs. Nicht geplant, aber dieselbe
  Tastenbehandlung und derselbe Fehlertyp.
- **`aria-activedescendant` und Options-IDs** sind mitgekommen, weil genau diese Stelle umgebaut
  wurde: Die Markierung war für Screenreader bisher unsichtbar.
- **Das Datum liegt in `lib/date-input.ts`** (`isoFromGerman`, `pastedIsoDate`) — reine Funktionen
  neben `germanDate()`, das die Gegenrichtung macht. Angeschlossen an `EuTextField` (Formulare und
  die generische Stammdaten-Maske) und `EuDetailField` (Anzeigemasken); das sind alle Datumsfelder
  der App.
- **Vorher im Browser nachgemessen**, ob der Weg überhaupt trägt: Das native `<input type="date">`
  feuert `paste` mit lesbarem Text und verwirft die deutsche Schreibweise — ein eigenes Textfeld
  wäre also unnötig gewesen.
- **`EuToggle` bekommt `bare`** wie Picker und Währungsfeld: sichtbare Beschriftung weg, `aria-label`
  gesetzt. `EuDetailField` reicht statt `label=""` jetzt `bare :label` durch.
- **Tests:** `EuEntityPicker.test.ts` (neu: Öffnen-Regel, Tab in allen vier Lagen, Escape, Enter),
  `date-input.spec.ts` (auch `31.02.2026` und zweistellige Jahre), Paste-Tests an beiden Feldern und
  der zugängliche Name des Schalters. Die beiden Tab-Tests wurden gegengeprüft — ohne die neue
  Tastenbehandlung schlagen sie fehl.
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 390 px und 1440 px): Tippen + Tab, ↓ +
  Tab, durchtabbt ohne Liste, Tab auf der Anlegen-Zeile, Einfügen von `24.09.2026` und `4.9.2026` im
  Formular und in der Maske, unpassender Text ändert nichts, Zurücksetzen-Pfeil, „+" mit getipptem
  Text samt Abbruch des Subdialogs (Liste bleibt zu, „Speichern" bleibt klickbar), zugänglicher Name
  des Schalters, Fokusring am tastaturfokussierten Picker rundum vollständig. Nichts gespeichert,
  also keine Testzeilen in der Dev-Datenbank.

## Slice 33a — Dialoge öffnen oben, nicht im alten Scrollzustand
**Anlass:** issues.md 13, aus der Produktionsnutzung (2026-09-25). Wird mehrmals hintereinander eine
Rechnung angelegt und das Formular dabei von oben nach unten durchgearbeitet, steht der nächste
Dialog gleich unten: Der Scrollzustand des Dialogkörpers bleibt erhalten, während der Fokus wieder
oben im ersten Feld liegt. Man tippt also in ein Feld, das man nicht sieht.

**Ziel:** Ein Dialog beginnt immer oben. Zu klären ist dabei, ob das für jedes Öffnen gilt oder nur
für einen frisch gefüllten Dialog, und wo es hingehört: `EuDialog` öffnet als einziger Ort
(`showModal()`, Fokus ins erste Feld) und ist damit der naheliegende Platz — der scrollende Bereich
ist der Dialogkörper aus Slice 12.

**DoD:** Zweimal hintereinander „Neue Rechnung" öffnen zeigt beim zweiten Mal denselben Anblick wie
beim ersten; Fokus und sichtbarer Ausschnitt gehören wieder zusammen. Eine eigene Scheibe, weil es
eine Regel für alle Dialoge der App ist.

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Zuerst nachgemessen, und der Fund war ein anderer als erwartet:** In Chromium lässt sich der
  Fehler nicht herstellen. Vier Wege probiert — Formular zweimal öffnen, mit Tab bis unten
  durchgearbeitet und mit Escape geschlossen, zwei Rechnungen hintereinander wirklich gespeichert,
  Anzeigemaske auf und zu — der Körper stand jedes Mal wieder auf 0. Der geschlossene `<dialog>` ist
  `display: none`, und Chromium wirft den Scrolloffset dabei weg.
- **Also ist es eine Frage der Engine.** Gecko stellt den Offset eines wieder eingeblendeten
  Scrollbereichs zurück, Chromium nicht. Der Fund stammt demnach aus einem anderen Browser als dem,
  in dem hier geprüft wird — was die Scheibe nicht ändert, sondern begründet: Dass ein Dialog oben
  beginnt, darf keine Eigenschaft sein, die eine Engine zufällig mitbringt.
- **Der Fokus ist kein Ersatz.** Er zieht nur das erste Eingabefeld in den Blick, nicht die
  Beschriftung darüber — und die Löschen-Bestätigung hat überhaupt kein Eingabefeld im Körper, dort
  wird nie fokussiert. Nachgemessen: Bei ihr bleibt der Fokus auf dem Schließen-Knopf der Kopfzeile.
- **Zweimal zurückgesetzt, mit Absicht:** einmal direkt nach `showModal()` (vorher hat das Element
  als `display: none` keine Layout-Box, der Schreibvorgang verpufft), und einmal im vorhandenen
  `nextTick` vor dem Fokussieren — die Eltern füllen ihr Formular in derselben Runde, die Höhe des
  Körpers ändert sich also noch.
- **Der Rücksprung aus einem Subdialog bleibt unberührt**, weil der Reset an den Öffnen-Übergang
  gebunden ist: Der darunterliegende Dialog wird nicht neu geöffnet, sein Ausschnitt bleibt stehen
  (im Browser gegengeprüft: 325 px vor und nach dem Subdialog).
- **Nicht angefasst:** die Trefferliste in `BillingSearchDialog`. Die Regel gilt dem Dialogkörper aus
  Slice 12; ein pauschales Zurücksetzen aller Scrollbereiche wäre über das Ziel hinaus.
- **Test:** `EuDialog.test.ts` — geöffnet montieren, Körper scrollen, zu und wieder auf. jsdom hält
  `scrollTop` über das Schließen hinweg, verhält sich hier also wie Gecko und bildet genau den Fall
  ab, den Chromium verbirgt. Gegengeprüft: ohne die Änderung schlägt er fehl (240 statt 0).
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 1440 px und 390 px): Anlegen-Formular
  zweimal hintereinander, Anzeigemaske auf und zu, Löschen-Bestätigung, und der Subdialog, der das
  Formular darunter nicht verschieben darf. Die Testrechnungen aus der Messung sind mit
  `npm run dev:reset` wieder aus der Dev-Datenbank verschwunden.

## Slice 34 — Erstattung und Belegnummer nachträglich ändern (umgesetzt 2026-09-25)
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

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Korrigieren, nicht verschieben:** `PATCH /allocations/:uid` nimmt nur `reimbursement` und
  `receiptNumber`. Rechnung und Leistungsabrechnung sind die Zuordnung selbst; sie umzuhängen bleibt
  Löschen und neu Buchen. Damit braucht der Patch auch keine Einreichungsprüfung von vorn.
- **Das Bereicherungsverbot gegen die anderen, nicht gegen sich selbst.** Die Kandidatenabfrage aus
  `createAllocationsForBilling` ist zu `loadCandidates` herausgezogen und lässt beim Ändern über
  `ignoreAllocationUID` die eigene Buchung aus der Summe. Ohne das blockiert sich jede Zuordnung
  selbst: 100 € von 200 € auf 150 € zu heben wäre „übersteigt den Rechnungsbetrag". Gegengeprüft —
  ohne den Ausschluss antwortet genau dieser Fall im Integrationstest mit 409 statt 200.
- **Geprüft wird mit demselben `assertEntriesBookable`** wie beim Buchen, mit einer einzigen Position
  und der Rechnung unter `FOR UPDATE`. Gleiche Regeln, gleiche Fehlercodes, gleiche Übersetzung in
  der Oberfläche — kein zweiter Prüfpfad, der auseinanderlaufen kann.
- **Ein eigener kleiner Dialog** (`AllocationDialog`) statt des Zuordnen-Dialogs: der bucht neu, für
  mehrere Rechnungen, mit Policen- und Abrechnungswahl. Zum Korrigieren zweier Felder wäre das der
  falsche Hebel. Die Obergrenze im Dialog ist „noch offen + der eigene bisherige Betrag", also
  dieselbe Rechnung wie auf dem Server.
- **Die Nummer bezeichnet die Gruppe, nicht jedes Label.** Der Feldblock jeder Karte ist eine
  `role="group"` mit `aria-labelledby` auf die Rechnungsnummer in der Kopfzeile. Ein abweichendes
  `aria-label` hätte vorgelesen, was nicht dasteht.
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 1440 px und 390 px): Erstattung von
  120 € auf 500 € gehoben (die Rechnung folgt von „Teilabgerechnet" auf „Abgerechnet"), 500,01 €
  abgewiesen, Belegnummer geändert, der Stift über die Tastatur erreichbar, und der Zuordnen-Dialog
  mit der langen Nummer aus dem Screenshot (`33611/201806/00164`): beide Beschriftungen einzeilig
  und auf gleicher Höhe. Die Dev-Daten stehen danach wieder auf den Seed-Werten.

## Slice 35 — Police-Auswahl im Versicherungszeitraum (umgesetzt 2026-09-25)
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

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Eine Regel neben den Regeln, nicht in ihnen.** `contractsCoveringPeriod` und `treatmentPeriod`
  stehen in `eligibility.ts` neben `submittableContracts`, werden aber nacheinander angewandt und
  nicht vermischt: die alten Funktionen bilden ab, was die API *ablehnen würde*, die neue nur, was
  die Oberfläche *vorschlägt*. Wer beides in einen Filter zöge, verlöre genau die Unterscheidung,
  auf der der Schalter beruht.
- **Die Vertragsdaten waren schon da.** `GET /contracts` liefert `contractBegin`/`contractEnd`
  (`LIST_SELECT`); die Rechnungs-Arbeitsfläche hat sie beim Bauen der Picker-Optionen nur
  weggeworfen. Statt einer zweiten Abfrage tragen die Optionen die beiden Felder jetzt mit
  (`ContractOption = SelectOption & ContractPeriod`) — die vorhandene Generik von
  `commonSubmittableContracts` reicht sie unverändert durch.
- **Deckt keine Police die Spanne ab, bleibt die Liste leer** (Festlegung des Autors): der Hinweis
  nennt den Zeitraum, der Schalter bleibt bedienbar, der Einreichen-Knopf ist inaktiv. Automatisch
  alle einzublenden würde die Aussage „hier passt nichts" gerade wieder verwischen.
- **Bei mehreren Rechnungen muss die Police die ganze Spanne decken**, nicht nur überlappen
  (Festlegung des Autors). Eine Auswahl über einen Policenwechsel hinweg hat keine richtige
  Antwort — sie soll das sagen, statt eine der beiden Policen plausibel aussehen zu lassen.
- **Jede Police nennt ihren Vertragszeitraum** als Zusatzzeile im Picker („ab 01.07.2024" bzw.
  „01.01.2018 – 30.06.2024"); `EuEntityPicker` hat das `hint`-Feld schon und durchsucht es mit.
- **Der Schalter steht über dem Feld, nicht darunter.** Darunter platziert verdeckte ihn die
  geöffnete Vorschlagsliste — derselbe Effekt, der in Slice 33 schon den Speichern-Knopf getroffen
  hat. Beim Bau in der laufenden App aufgefallen, nicht in den Unit-Tests.
- **Serverseitig unverändert:** keine Migration, kein neuer Endpunkt, keine Prüfung in
  `assertInvoicesSubmittable`. Eine Versicherung nimmt eine Behandlung von außerhalb des
  Vertragszeitraums durchaus an; das bleibt erlaubt.

## Slice 36 — Suchen und Finden (umgesetzt 2026-09-25)
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

**Umgesetzt (2026-09-25).** Entscheidungen beim Bau:

- **Gesucht wird, was dasteht.** Das Filterfeld in `ResourceView` vergleicht den Suchtext mit dem
  *gerenderten* Zellinhalt (`cell()`), nicht mit den Rohwerten. Damit findet „Muster" eine Police
  über den Namen des Versicherten, obwohl in der Spalte eine UID steht, und ein Datum lässt sich so
  suchen, wie es in der Tabelle geschrieben ist. Gefiltert wird vor dem Sortieren; `useTableSort`
  bekommt die gefilterte Liste und bleibt unverändert.
- **Zwei Leermeldungen, nicht eine.** „Noch keine … erfasst." und „Kein Eintrag passt zu dieser
  Suche." sagen Verschiedenes; die zweite ist eine `role="status"`, damit ein Screenreader das
  Schrumpfen der Liste mitbekommt. Der Filter wird beim Wechsel der Liste geleert, überlebt aber das
  Neuladen nach Anlegen und Löschen — sonst verliert man beim Pflegen einer gefundenen Zeile jedes
  Mal den Filter.
- **Kein neuer Endpunkt für die Rechnungssuche** (Festlegung beim Bau): `GET /invoices` kennt
  `accountUID` und `year` schon und hat die richtige Rechte-Einschränkung
  (`getAccessibleAccounts`) bereits im Handler — die Suche ist dort ein `q` mehr. Die Query-Parameter
  des Handlers wandern dabei geschlossen in ein zod-Schema (`parseQuery`, Vorbild `searchBillings`):
  `?year=abc` beantwortet die API jetzt mit einer benannten 400 statt den Filter stillschweigend zu
  verwerfen.
- **Nur die Rechnungsnummer** (Festlegung des Autors): `q` trifft `invoiceNumber` und sonst nichts.
  Das ist genau issues.md 6 — die Nummer in der Hand, das Jahr vergessen. Eine Freitextsuche über
  Person und Verwendungszweck hätte die Trefferliste unscharf gemacht, ohne die Frage zu beantworten.
- **Der Treffer springt hin und markiert** (Festlegung des Autors), er öffnet keinen Dialog. `year`
  und `invoice` reisen als Query-Parameter mit und werden vom Router als Props übergeben — die
  Arbeitsfläche bleibt damit ohne `useRoute()` testbar. Die markierte Zeile trägt `aria-current`,
  bekommt `tabindex="-1"` und den Fokus: die Tastatur landet dort, wo das Auge hinschaut. Die
  Markierung erlischt beim Jahrwechsel und nach jeder Änderung — sie beantwortet eine Suche, sie ist
  kein Zustand.
- **`scrollIntoView` hat den Fokusring gefressen.** Bei 390 px ist eine Tabellenzeile breiter als
  ihr Scrollcontainer; `scrollIntoView` schiebt dann auch seitwärts, die Zeile liegt bündig an der
  Kante — genau in dem Raum, den `.eu-scroll-focus-safe` für den Ring reserviert. `markFound` merkt
  sich deshalb `scrollLeft`, fokussiert mit `preventScroll` und stellt die waagerechte Position
  danach wieder her. Gemessen (`scrollLeft` 5 → 0) und im tastaturfokussierten Screenshot geprüft.
- **Erst rendern, dann markieren:** solange `loading` läuft, zeigt die Ansicht ihren Platzhalter und
  es gibt keine Zeile — `markFound()` steht deshalb hinter dem `finally`, nicht darin. Im ersten
  Durchlauf lief es davor und traf ins Leere; im Browser zu sehen, im Unit-Test nicht.
- **Im laufenden System geprüft** (Playwright, hell/dunkel, 1440 px und 390 px): Leistungserbringer
  und Abrechnungsdienstleister gefiltert (Sortierung bleibt, Leermeldung stimmt, Wechsel der Liste
  setzt zurück, Kopfzeile ohne Überhang und bei 390 px umbrechend); „2024-100" auf der
  Rechnungs-Auswahlseite ohne Person und Jahr getippt → ein Treffer mit Person, Behandlungsdatum,
  Betrag und Status → per Tab und Enter geöffnet → Jahr 2025 aktiv (die Nummer trägt „2024", das
  Behandlungsjahr ist ein anderes — genau der Fall aus issues.md 6), Zeile markiert, im Bild, mit
  vollständigem Fokusring; axe-core ohne Verstöße auf allen drei Seiten. Nur lesend, der
  Dev-Datenbestand blieb unverändert.

## Slice 37 — Leistungsabrechnung über mehrere Einreichungen
**Umgesetzt 2026-09-25 (37a Modell + API, 37b UI).**

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

### 37a — Modell + API (umgesetzt 2026-09-25)

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Zurückziehen sperrt je Rechnung, nicht je Einreichung.** Die alte Regel („die Einreichung hat
  eine Leistungsabrechnung") gibt es nach dem Umbau gar nicht mehr, weil eine Abrechnung über
  Einreichungen hinweggeht. An ihre Stelle tritt die genauere: gesperrt ist, was für **diese
  Rechnung bei dieser Police** schon erstattet wurde. Eine noch unbeantwortete Schwesterrechnung
  derselben Einreichung lässt sich damit zurückziehen, was vorher verboten war.
- **37a hält die App lauffähig.** Die Oberfläche wird mechanisch nachgezogen (Abrechnung an der
  Police), kann aber noch genau so viel wie vorher; das Buchen über mehrere Einreichungen in einem
  Zug ist 37b. Kein Commit, der nichts Lauffähiges hinterlässt.
- **Altdaten werden nicht automatisch zusammengeführt.** Der Autor prüft vor dem Produktions-Update
  mit einem lesenden SQL-Befehl, ob es doppelte Abrechnungsnummern je Police überhaupt gibt (im
  Dev-Bestand gibt es keine). Die Migration zählt sie zuerst selbst und **bricht mit Vertrag, Nummer
  und Anzahl ab**, statt am `ALTER TABLE` mit einem SQL-Fehler zu scheitern oder stillschweigend
  Daten des Autors umzuschreiben.

**Befunde beim Bauen:**

- **Der Unique-Index trägt auf einer `VIRTUAL`-Spalte** — vor dem Schreiben der Migration gegen
  MariaDB 11 / InnoDB nachgemessen (Einfügen, Soft-Delete, erneutes Einfügen, Kollision mit 1062).
  `PERSISTENT` war also nicht nötig. Die offene Frage aus der Planung ist damit beantwortet.
- **„Je Einreichung" und „je Police" sind derselbe Eimer.** Durch `UNIQUE (invoiceUID, contractUID)`
  aus Migration 007 erreicht eine Rechnung jede Police höchstens einmal. Die Karten im
  Rechnungsdialog bleiben deshalb unverändert richtig, obwohl die Erstattungen jetzt über den
  Vertrag gruppiert werden — im Code als Kommentar festgehalten, weil daran einiges hängt.
- **Zwei Fehlercodes waren nach dem Umbau gelogen** und heißen jetzt nach der Regel, die wirklich
  gilt: `INVOICES_NOT_IN_SUBMISSION` → `INVOICES_NOT_SUBMITTED_HERE`, `SUBMISSION_HAS_BILLINGS` →
  `INVOICE_HAS_REIMBURSEMENT`. Neu dazu `BILLING_NUMBER_TAKEN`: eine Vorprüfung vor dem Insert
  liefert den brauchbaren deutschen Satz, den das allgemeine `DUPLICATE_VALUE` nicht hergibt; der
  Unique-Index bleibt der Rückhalt.
- **Die Leistungsabrechnungen-Seite fragt nicht mehr nach der Einreichung.** Sie ist ohnehin
  vertragsbezogen, also entfällt beim Anlegen die Rückfrage ersatzlos — und mit ihr das Laden der
  Einreichungen auf dieser Seite.

**Nachgeprüft (2026-09-25):** 218 API-Tests, 190 Web-Tests, Lint, Typecheck, Prettier. Neue
Integrationsfälle: eine Abrechnung erstattet Rechnungen aus zwei getrennten Einreichungen derselben
Police; eine bei einer anderen Police eingereichte Rechnung wird abgewiesen; dieselbe Nummer im
selben Vertrag 409, in einem anderen Vertrag 201; eine gelöschte Abrechnung gibt ihre Nummer frei;
Zurückziehen je Rechnung. Migration 011 up **und** down mit eigenem Fall. Im Browser durchgeklickt:
Abrechnung anlegen (ohne Einreichungs-Rückfrage), doppelte Nummer → „Die Leistungsabrechnung
LA-2024-500 gibt es bei dieser Police schon.", Erstattung gebucht — die Karte der Rechnung zeigt
danach **zwei** Abrechnungen, darunter eine, die ohne diesen Umbau gar nicht hätte buchen können.

### 37b — UI (umgesetzt 2026-09-25)

Der eigentliche Gewinn: `eligibility.commonSubmissions` ist `commonPolicies` geworden, damit
`BillingDialog` Rechnungen aus verschiedenen Einreichungen in einem Zug annimmt. Der Hinweis „keine
gemeinsame Einreichung" heißt jetzt „keine gemeinsame Police" und ist keine Einschränkung mehr,
sondern die Regel.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Jede Karte nennt ihren Einreichungstag.** Eine Buchung mischt jetzt Einreichungen, also muss
  sichtbar sein, was da zusammengefasst wird; der Police-Picker sagt „an mehreren Tagen eingereicht",
  wo die Tage auseinanderfallen.
- **Der Buchungsdialog startet leer, wenn er von der Leistungsabrechnungen-Seite kommt.** Vorher kam
  je offener Rechnung der Police eine Karte, die einzeln wieder herausgeworfen werden musste — und
  seit 37a blockierte dieser Weg ganz, sobald die offenen Rechnungen aus zwei Einreichungen kamen.
  Die Police kommt in diesem Fall über ein eigenes Prop, nicht aus den Rechnungen; die letzte Karte
  lässt sich nur dann entfernen, weil der Dialog sonst die Police verlöre, aus der er seine
  Kandidaten zieht.

**Befunde beim Bauen:**

- **Ein Prop aus 37a war verwaist.** `InvoiceDetailDialog` übergab weiter `:preset-submission`, das
  es seit der Umbenennung in `presetContract` nicht mehr gibt. Vue meldet das nicht, weil unbekannte
  Attribute als Fallthrough durchgehen, und Typecheck sieht es deshalb auch nicht — die Vorauswahl
  aus der Einreichungskarte fiel still auf die Rückfallregel zurück. Im Browser nachgewiesen und
  behoben: die PKV-Karte öffnet auf PKV, die Zusatz-Karte auf der Zusatzpolice.
- **Der Prod-Bestand enthält genau einen Dublettenfall** — und zwar den, für den die Scheibe gebaut
  ist: ein Brief vom 25.10.2018, zweimal erfasst, weil er zwei Einreichungen beantwortete. Migration
  011 würde daran abbrechen. Der Ablauf zum Zusammenführen steht jetzt in der README.
- **Welcher der beiden Briefe bleibt, entscheidet `forfeitsBonus`, nicht das Datum.** Der Bonus wird
  je Behandlungsjahr gebildet und jeder verwirkende Posten verwirkt das Jahr
  (`bonus-timeline.ts`) — bliebe der Brief mit `forfeitsBonus = 0`, hörte 2018 still auf zu
  verwirken. Das ist als Regel in der README festgehalten, samt des Falls, dass die Rechnungen der
  beiden Briefe in verschiedenen Jahren liegen.

**Nachgeprüft (2026-09-25):** 218 API-Tests, 196 Web-Tests, Lint, Typecheck, Prettier. Im Browser
gegen den Dev-Bestand: eine Abrechnung über zwei Rechnungen aus den Einreichungen vom 17.07. und
11.08.2026 derselben Police gebucht (in der Datenbank nachgesehen — vor diesem Umbau nicht möglich);
der Leerstart bietet die Rechnungen aller drei Einreichungen der Police an und weist das Speichern
ohne Karte ab; eine nicht eingereichte Rechnung dazugewählt sperrt „Abrechnung zuordnen"; die
Police-Vorauswahl je Einreichungskarte stimmt wieder. Fokusring im Dialog per Tastatur-Screenshot
geprüft, an keiner Kante beschnitten.

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

**Festlegungen beim Planen (Autor, 2026-09-26):**

- **`validFrom` ist NULL-fähig, NULL heißt „gilt grundsätzlich".** Der Eintrag, mit dem ein
  Dienstleister anfängt, bekommt kein Datum — erst eine zweite Fassung trägt eins und gilt von da
  an. Damit muss weder die Migration noch das Anlegen ein Datum erfinden, das niemand kennt, und
  eine vor Jahren bezahlte Rechnung löst trotzdem auf. Je Dienstleister ist höchstens ein
  datumsloser Eintrag erlaubt; das prüft die API, weil MariaDB NULL in einem UNIQUE mehrfach zulässt.
- **In den Zahlungsinformationen steht, wo gesetzt, nur der Empfänger** — „überschreibt" wörtlich
  genommen. Die Zeile heißt ohnehin schon „Abrechnungsdienstleister / Empfänger".
- **Das Create-Formular fragt nicht nach „gültig ab"** (folgt aus der NULL-Regel): Name, IBAN, BIC,
  Empfänger.

**Befunde beim Bauen:**

- **Die Seed-ID des ersten Kontos fällt mit der zusammen, die Migration 012 ableitet.** Die
  Migration baut die UID der übernommenen Kontoverbindung als `'g'` + Rumpf der Dienstleister-UID;
  für den Seed-Dienstleister mit Index 0 ist das genau `seedId('agencyAccount', 0)`. Zuerst war das
  ein stiller Fehler — das zweite Konto wurde nie angelegt, weil `seedRow` es als Dublette ansah —,
  jetzt ist es die gewollte Eigenschaft: `npm run dev:seed` ohne `--reset` über eine schon
  migrierte Datenbank aktualisiert diese Zeile, statt ein zweites datumsloses Konto anzulegen. Der
  Kontowechsel liegt deshalb auf Index 1. Steht als Kommentar im Seed.
- **`overflow-wrap: anywhere` hätte die IBAN-Spalte kaputtgemacht.** Die Historientabelle war 705 px
  breit in einem 672 px schmalen Dialog, die Aktionsschalter lagen hinter der Kante. `anywhere` löst
  das, schrumpft die Spalte aber zusätzlich auf min-content, wodurch die IBAN auch dann umbrach,
  wenn Platz war; `break-word` bricht nur im Notfall. BIC steht jetzt gedämpft unter der IBAN in
  derselben Zelle — so muss keins von beiden mitten im Wort brechen.
- **`DROP COLUMN` hätte die Migration auf einer gewachsenen Datenbank zerlegt.** MariaDB löscht eine
  Spalte standardmäßig „instant": sie gilt als weg, ihr Platz in der Zeile bleibt für immer
  reserviert. Nach genügend ADD/DROP COLUMN überschreitet allein dieser Ballast InnoDBs
  Zeilengrenze, und dann scheitert `ALTER TABLE CollectionAgencies DROP COLUMN bankAccount` mit
  „Row size too large" — mitten in 012, also mit angelegter `AgencyBankAccounts` und ohne Eintrag
  im Migrationslog. Jeder weitere Lauf bricht danach mit „Table already exists" ab. Lokal beim
  wiederholten Testen aufgetreten (jeder Testlauf fährt 006 und 012 einmal hin und zurück), aber es
  wäre derselbe Fehler auf einer lange gepflegten Produktionsdatenbank. 012 baut die Tabelle
  deshalb mit `ALGORITHM=COPY` neu auf, in `up` wie in `down`; sechs Testläufe hintereinander gegen
  dieselbe Datenbank laufen seitdem grün.
- **Auflösen passiert in TypeScript, nicht in SQL.** `accountInForce` gibt es je einmal in
  `apps/api/src/domain/agency-accounts.ts` und `apps/web/src/agencies/accounts.ts`, mit denselben
  Testfällen auf beiden Seiten. Der Erinnerungsversand lädt die Konten und löst damit auf, statt die
  Regel ein drittes Mal als Unterabfrage zu formulieren — dieselbe Entscheidung wie bei
  `calcPaymentState` (siehe `reminders/payment.ts`).

**Nachgeprüft (2026-09-26):** 228 API-Tests, 213 Web-Tests, Lint, Typecheck, Prettier. Im Browser
gegen den Dev-Bestand: die Maske zeigt beide Kontoverbindungen, ein doppelt vergebenes Datum wird
mit deutschem Satz abgewiesen; die im Vorjahr bezahlte Rechnung zeigt die alte IBAN samt Hinweis
„Kontoverbindung zum Überweisungsdatum" und die alte BIC, die offene Rechnung die heutige IBAN, BIC
und den abweichenden Empfänger; ein in die Maske getipptes Zahlungsdatum aus dem Vorjahr schaltet
IBAN und GiroCode sofort auf das alte Konto um. GiroCode-Payload aus dem Browser-Modul geprüft:
Zeile 5 BIC, Zeile 6 Empfänger. Probelauf der Zahlungserinnerung nennt den Empfänger der gültigen
Kontoverbindung. Fokusring im neuen Dialog per Tastatur-Screenshot an jedem Schalter des
Historienblocks geprüft, an keiner Kante beschnitten.

## Slice 39 — Papierkorb (umgesetzt 2026-09-26)
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

**Festlegungen beim Planen (Autor, 2026-09-26):**

- **Eine Seite im Systembereich** (`/system/trash`), nach Entität gruppiert, hinter dem neuen Recht
  `MANAGE_TRASH` — das nur die Rolle `Admin` trägt. **Kein Account-Scoping:** endgültiges Löschen ist
  ein administrativer Akt, und der Verweis eines gelöschten Eintrags auf seinen Versicherten kann
  selbst gelöscht sein — dann bliebe nichts, woran zu scopen wäre.
- **Wiederherstellen wird abgelehnt, wenn ein Pflicht-Vorfahre im Papierkorb liegt**, und die
  Meldung nennt ihn. Nur NOT-NULL-Verweise blockieren; ein gelöschter Leistungserbringer an einer
  Rechnung ist ein Zustand, den die App heute schon verträgt.
- **Endgültig löschen nimmt mit, was daran hängt und selbst im Papierkorb liegt** (rekursiv), die
  Abfrage nennt es. Abgelehnt wird nur, wenn noch etwas **Aktives** daran hängt. Symmetrisch dazu:
  **Wiederherstellen holt die im selben Zug gelöschten Kinder mit zurück**, erkannt am gleichen
  `deletedAt`.
- **Gelöschte Einreichungen stehen im Papierkorb, aber ohne Wiederherstellen.** Eine Einreichung
  verschwindet erst, wenn ihre letzte Rechnung zurückgezogen ist — was im Papierkorb liegt, ist
  immer eine leere Hülle. Sie bleibt sichtbar, damit der Bestand aufräumbar ist.
- **Wiederherstellen ist immer eine Transaktion — alles oder nichts.** Scheitert ein Kind des
  Batches, kommt auch der Vorfahre nicht zurück. Keine Zwischenzustände.
- **Widerspricht eine Wiederherstellung einer Eindeutigkeits- oder Fachregel, scheitert sie.** Der
  Papierkorb erzeugt nie einen Zustand, den die Masken selbst verboten hätten.
- **Jede fehlgeschlagene Wiederherstellung erklärt sich auf Deutsch** am konkreten Eintrag — auch
  wenn es ein Kind im Batch war — und sagt, dass nichts geändert wurde.
- Keine automatische Aufräumfrist in dieser Scheibe: `deletedAt` macht sie möglich, die DoD verlangt
  sie nicht.

**Befunde beim Bauen:**

- **Der Batch-Zeitstempel braucht Mikrosekunden.** Mit `DATETIME` auf Sekunden galten zwei
  unabhängige Löschungen in derselben Sekunde als ein Batch — im Test sofort sichtbar: das
  Wiederherstellen einer Police holte den Sekundenbruchteile vorher gelöschten Beitragsstand
  ungefragt mit. `deletedAt` ist deshalb `DATETIME(6)`, und `deletionTimestamp` liest `NOW(6)` einmal
  aus, damit eine Kaskade denselben exakten Wert in alle Zeilen schreibt. Der Zeitstempel ist eine
  **Identität**, kein Anzeigewert; angezeigt wird er auf Minuten gerundet.
- **Die Beziehungen kommen aus `information_schema`, nicht aus einer Liste.** Wer an wem hängt,
  steht in den Fremdschlüsseln; eine handgeschriebene Liste wäre eine zweite Wahrheit, die beim
  nächsten Modellwechsel leise falsch wird. `trash-references.ts` liest sie einmal je Prozess und
  cacht sie. Daraus folgen alle drei Regeln: Blocker (aktive Zeile mit `RESTRICT`), „geht mit"
  (gelöschte Zeile oder Verknüpfungszeile) und Pflicht-Vorfahre (NOT-NULL-Spalte).
- **Verknüpfungstabellen sind keine Einträge.** `SubmissionInvoices`, `InvoiceExclusions`,
  `ContractBonusTiers` und `ContractYears` haben keine Status-Spalte — Migration 007 hält fest, dass
  eine Verknüpfung einfach gelöscht wird. Beim endgültigen Löschen gehen sie deshalb mit, statt zu
  blockieren; die Abfrage benennt sie, weil ein Versicherungsjahr von Hand erfasste Arbeit ist.
  Verliert eine Einreichung dabei ihre letzte Rechnung, wird sie weich gelöscht — dieselbe Regel wie
  beim Zurückziehen von Hand.
- **Die Prüfungen der Masken werden wiederverwendet, nicht nachgebaut.** `assertValidityFree`,
  `assertStartFree` und `assertBillingNumberFree` gab es schon; sie sind nur exportiert und laufen
  jetzt auch vor einem Wiederherstellen. Neu ist allein das Bereicherungsverbot für eine einzelne
  Erstattung. Ein trotzdem durchschlagender 1062 wird als `RESTORE_CONFLICT` übersetzt, damit nie
  ein Treiberfehler nach außen dringt.
- **Die Begründung „nicht wiederherstellbar" gehört in die Zusammenhang-Spalte.** In der
  Aktionen-Spalte drängte sie den verbleibenden Schalter über die Kante des Scroll-Containers — im
  Screenshot sofort sichtbar, in keiner DOM-Messung.
- **Eine Sortierung für die ganze Seite, nicht eine je Gruppe.** Alle Gruppen zeigen dieselben drei
  Spalten; die Zeilen werden als eine flache Liste sortiert und zum Rendern wieder aufgeteilt. Der
  erste Versuch (ein `useTableSort` je Gruppe, in einem `computed` erzeugt) hätte den Sortierzustand
  bei jedem Tastendruck in der Suche verloren.

**Nachgeprüft (2026-09-26):** 245 API-Tests, 222 Web-Tests, Lint, Typecheck, Prettier. Migration 013
viermal hintereinander hoch und runter gegen dieselbe Datenbank (`ALGORITHM=COPY` beim Droppen der
zwölf Spalten). Im Browser gegen den Dev-Bestand: die Seite zeigt Beitragsstände, Leistungserbringer
und Rechnungen mit Löschzeitpunkt; eine gelöschte Leistungsabrechnung steht „samt 3 Erstattungen"
da und kommt mit einem Klick vollständig zurück; das endgültige Löschen des gelöschten
Leistungserbringers wird mit „Daran hängt noch: 1 Rechnung." abgewiesen; ein Wiederherstellen gegen
eine inzwischen belegte Beitrags-Startzeit antwortet „Beitragsstand ‚ab 01.07.2023': für dieses
Datum gibt es bereits einen Beitragsstand. Es wurde nichts wiederhergestellt."; eine leergezogene
Einreichung zeigt statt des Schalters ihren Grund; die gelöschte Rechnung verschwindet nach der
Abfrage endgültig. Fokusring per Tastatur-Screenshot an allen vier Schaltern geprüft, auch bei 420 px
mit waagerecht gescrollter Tabelle — an keiner Kante beschnitten.

## Slice 40 — Politur: Dialog-Scroll, Browservorschläge, Label (umgesetzt 2026-09-28)
**Anlass:** issues.md 0.12.0-1 sowie 0.11.0-2 und 0.11.0-3, aus der Produktionsnutzung. Beim
Zuordnen von Rechnungen entstehen nach dem Klick auf „Diese Abrechnung verwirkt den Bonus" ein
zweiter Scrollbalken und Weißraum unter den Schaltflächen, während die Kopfzeile verschwindet. Dazu
zwei liegengebliebene Kleinigkeiten: Der Browser belegt Eingabefelder mit eigenen Vorschlägen vor,
und das Label `reminders.appUrl` bricht um und schiebt sein Feld gegenüber dem Zeitzone-Feld nach
unten.

**Ziel:** Ein Dialog behält beim Schalten seine Kopfzeile und seinen einen Scrollbalken, die Felder
bleiben leer, bis jemand tippt — außer beim Anmelden, wo der Passwortmanager greifen soll —, und die
Einstellungsseite steht in einer Linie.

**DoD:** Im Zuordnen-Dialog mit gescrolltem Körper schaltet der Bonus-Schalter, ohne dass der Dialog
selbst scrollbar wird; `scrollHeight` bleibt gleich `clientHeight`, `scrollTop` bleibt 0. Kein Feld
der App außer den beiden Anmeldefeldern bietet noch Browservorschläge an. Die Felder „Zeitzone" und
„URL dieser Instanz" stehen auf einer Höhe.

**Umgesetzt (2026-09-28).** Entscheidungen beim Bau:

- **Der Fehler lag nicht dort, wo er auftrat.** Weder `EuDialog` noch das Zuordnen-Formular sind
  schuld, sondern `EuToggle`: `.eu-toggle__input` ist `position: absolute`, `.eu-toggle` war
  `static`. Damit war der nächste positionierte Vorfahr das `<dialog>` selbst, dem Chromium
  `position: fixed` gibt. Das versteckte 1×1-Input nahm seine statische Position tief im gescrollten
  `.eu-dialog__body` ein — gemessen aber vom Dialog aus, also jenseits seiner Unterkante.
- **Nachgemessen, nicht vermutet, und zwar zweimal.** Zuerst isoliert im Headless-Chromium mit der
  echten CSS (1212 px Scrollhöhe bei 810 px Dialoghöhe), dann in der laufenden App im gemeldeten
  Dialog selbst: 764 px gegen 682 px, und der Klick aufs Label schob den Dialog um 82 px — genau der
  Weißraum und die fehlende Kopfzeile aus dem Screenshot des Fundes.
- **A/B in derselben Sitzung.** Der Vorzustand wurde zur Gegenprobe per eingespeister Regel
  (`.eu-toggle { position: static !important }`) wiederhergestellt, damit beide Messungen aus
  demselben Dialog mit denselben Daten stammen. Ohne Fix ist `offsetParent` des Inputs `.eu-dialog`,
  mit Fix `.eu-toggle`.
- **Dasselbe Muster ein zweites Mal gefunden:** `.eu-icon-label__text` in `EuIconLabel` ist absolut
  positioniert, sein Träger `.eu-tooltip-trigger` war es nicht. Der Anker gehört nach `EuTooltip`,
  weil die Scoped-CSS von `EuIconLabel` den Trigger der Kindkomponente nicht erreicht. Die
  Sprechblase bleibt unberührt: Sie ist ein Geschwister, kein Kind, und liegt per
  `strategy: 'fixed'` ohnehin am Viewport.
- **Kein jsdom-Test für den Scroll-Fall.** jsdom rechnet kein Layout und wendet Scoped-CSS nicht an;
  ein Test dort wäre eine Attrappe gewesen. Der Nachweis läuft über die Messung im echten Browser,
  wie in Slice 33a.
- **Die Vorschläge sind zentral abgeschaltet,** nicht Feld für Feld: `EuTextField` bekommt eine
  `autocomplete`-Prop mit Default `off`, `EuCurrencyField` und die beiden Inputs in `EuDetailField`
  setzen es fest; `EuEntityPicker` hatte es schon. Die Prop existiert für die eine Stelle, an der der
  Vorschlag erwünscht ist: Das Anmeldeformular fragt `username` und `current-password` ausdrücklich
  an, sonst hätte der Default den Passwortmanager ausgesperrt.
- **Im laufenden System geprüft** (Headless-Chromium über CDP, hell und dunkel, 1440 px und 390 px):
  Zuordnen-Dialog, Rechnungsmaske (alle sieben Felder melden `off`), Anzeigemaske des
  Abrechnungsdienstleisters mit `EuIconLabel`, und die Einstellungsseite — beide Labels einzeilig
  (19 px), beide Eingabefelder auf derselben Höhe. Es wurde nichts gespeichert, der Dev-Datenbestand
  blieb unangetastet.

## Slice 41 — Mehrere Behandlungstage je Rechnung
**Anlass:** issues.md 0.11.0-1. Eine Rechnung der Praxis deckt oft mehrere Termine ab; `Invoices`
hält aber genau ein `treatmentDate`, so dass einer der Tage eingetragen wird und die übrigen
verlorengehen.

**Festlegung (Autor, 2026-09-28):** **nur die Tage, keine Beträge je Behandlung** — Beträge je Tag
zu erfassen wäre umständlich und brächte kaum Informationsgewinn. Und eine Rechnung bleibt in
**einem** Kalenderjahr; Jahresübergreifendes wird weiter auf zwei Rechnungen aufgeteilt. Damit
bleibt jeder `YEAR(treatmentDate)`-Drehpunkt — Vertragsjahre, Bonus-Timeline, Erstattungsoptimierer,
Erstattungsplan — unangetastet. Das Aufteilen ist heute schon möglich: Auf `invoiceNumber` liegt
weder ein UNIQUE noch eine Dublettenprüfung, dieselbe Nummer darf also zweimal stehen.

**Ziel:** Die Rechnung führt die vollständige Liste ihrer Behandlungstage, die Oberfläche zeigt und
pflegt sie, und der Einreichen-Dialog beurteilt die Police am ganzen Zeitraum. Zwei Scheiben:
Modell + API, danach UI.

**DoD:** Eine Rechnung mit drei Behandlungstagen lässt sich anlegen, ändern und wieder lesen; der
gespeicherte `treatmentDate` ist immer der früheste Tag; ein Tag aus einem anderen Kalenderjahr wird
mit einem deutschen Satz abgewiesen, der auf die zweite Rechnung hinweist.

### 41a — Modell + API (umgesetzt 2026-09-28)

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Die Kindtabelle ist die _vollständige_ Liste, nicht „die weiteren Tage".** Migration 014 legt für
  **jede** vorhandene Rechnung eine Zeile aus ihrem heutigen `treatmentDate` an, gelöschte
  eingeschlossen (wie in 012). Andernfalls bräuchte jeder Leser einen Sonderfall für den ersten Tag.
- **Kein `treatmentDayUID`** — Abweichung von der ersten Skizze. `InvoiceTreatmentDays` ist ein
  Anhängsel, keine Entität: Primärschlüssel `(invoiceUID, treatmentDate)`, der zugleich der
  geforderte UNIQUE ist („derselbe Tag zweimal ist kein Datum, sondern ein Vertipper"). Dieselbe Form
  wie `SubmissionInvoices`, `InvoiceExclusions`, `ContractBonusTiers`, `ContractYears`; kein neues
  Präfix in `lib/ids.ts`, keine ID-Erzeugung, denn die Zeilen werden nie einzeln adressiert — die API
  ersetzt die Liste immer als Ganzes.
- **`Invoices.treatmentDate` bleibt und bleibt NOT NULL:** der führende Tag und der Anker aller
  `YEAR()`-Auswertungen. Die API hält ihn bei jedem Schreiben auf dem frühesten Tag, damit „erster"
  und „frühester" nicht auseinanderlaufen. Der gespiegelte Wert ist hier unbedenklich, anders als bei
  der Kontoverbindung in 012: Durch die Ein-Jahres-Regel liefert jeder Tag dasselbe `YEAR()`.
- **Ein PATCH, das nur `treatmentDate` schickt, verschiebt den führenden Tag** — der bisher früheste
  wird ersetzt, die übrigen bleiben stehen. Bei einer Ein-Tages-Rechnung ist das genau das bisherige
  Verhalten; entscheidend ist der andere Fall: Beide vorhandenen Masken schicken `treatmentDate` bei
  **jedem** Speichern mit, auch wenn nur das Zahlungsdatum geändert wurde. Mit der naheliegenderen
  Regel „`treatmentDate` allein heißt: genau dieser eine Tag" hätte ein solches Speichern die
  weiteren Tage stillschweigend gelöscht. Im laufenden System nachgestellt: Die Anzeigemaske
  speichert die dreitägige Seed-Rechnung, alle drei Tage stehen danach noch.
- **Papierkorb: nichts zu registrieren, aber nachgewiesen.** `purgeEntry` leitet die mitzulöschenden
  Link-Tabellen aus den Fremdschlüsseln der `information_schema` ab und räumt RESTRICT-Links, die
  nicht selbst Entität sind; `blockers()` zählt nur Entitätstabellen. Die neue Tabelle fällt genau
  darunter — der Trash-Integrationstest zeigt es an einer Rechnung mit zwei Tagen, statt es
  anzunehmen.
- **Der Seed spiegelt die Tage in einem Schritt** (er schreibt seine Zeilen per SQL, nicht über die
  API) und gibt einer Rechnung zwei weitere Tage, damit der Entwicklungsbestand den Fall zeigt, um
  den es geht. `clearData` und die `resetData`-Listen der Integrationstests räumen die neue Tabelle
  vor `Invoices` — sonst hält der RESTRICT-Fremdschlüssel dagegen, und aus demselben Grund löschen
  die Aufräumblöcke der Migrationstests 006/007/011 jetzt erst die Tage.

**Geprüft:** 250 API-Tests gegen `eunomia_test`, darunter Anlegen mit mehreren Tagen, Ersetzen der
Liste, Wandern des führenden Tags, Abweisen eines fremden Jahres beim Anlegen und beim Ändern
(mitsamt Rollback) und das Hard-Delete über den Papierkorb. Dazu im laufenden Dev-System über die
API durchgespielt und der Bestand anschließend neu aufgebaut.

### 41b — UI (umgesetzt 2026-09-28)

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Die Tage sind in _beiden_ Masken pflegbar** — Abweichung von der ersten Skizze, die dem
  Anzeigedialog nur das Anzeigen zugedacht hatte. Beim Nachsehen zeigte sich, dass
  `InvoiceWorkspaceView.openEdit` die Anzeigemaske öffnet und das Anlege-Formular nur zum Anlegen
  benutzt wird: Ein Vertipper im dritten Tag wäre nie mehr zu korrigieren gewesen. Der Autor hat
  entschieden, beide Masken zu bedienen.
- **Eine neue Maskenzeile `EuDetailDays` statt eines neuen `type` an `EuDetailField`.** Dessen
  `DetailValue` ist ein einzelner Skalar, und die `values`-Records aller drei Anzeigemasken
  (Rechnung, Police, Abrechnungsdienstleister) sind darauf typisiert; eine Liste dort hinein hätte
  sich durch alle drei gezogen. Die neue Zeile löst sich mit `display: contents` genauso in das
  Maskenraster auf und trägt dieselbe Aktionsreihe (Hinzufügen, Leeren, Zurücksetzen).
- **Die Zeile umschließt ihr Datum, statt die Wertspalte zu füllen.** Gestreckt saß das ✕ der Zeile
  unmittelbar neben dem ✕ der Aktionsspalte — zwei gleiche Symbole nebeneinander, die Verschiedenes
  tun (einen Tag entfernen / die ganze Liste leeren). Im Browser gesehen und geändert.
- **Ein Ort für den Satz zur Jahresregel.** Beide Masken prüfen vor dem Speichern und holen den
  deutschen Satz über `describeCode('TREATMENT_DAYS_DIFFERENT_YEARS')` aus `lib/error-messages.ts` —
  dieselbe Formulierung, gleich ob der Dialog oder die API sie auslöst.
- **`treatmentPeriod()` rechnet über alle Tage**, nicht mehr über den führenden allein. Das ist der
  einzige Ort, an dem die weiteren Tage fachlich wirken: Der Einreichen-Dialog beurteilte die Police
  sonst an einem zu kurzen Zeitraum. In den Listen steht der Zeitraum (`11.02.–18.02.2025`), die
  vollständige Liste im Titel der Zelle — der Zeitraum sagt nicht, welche Tage dazwischen abgerechnet
  wurden. Sortiert wird weiter nach dem führenden Tag.

**Geprüft:** Vitest (Web) mit neuen Tests für die Tagesregeln, das Anlege-Formular und den
erweiterten Zeitraum; dazu im laufenden Browser an der dreitägigen Seed-Rechnung: Zeitraum und
Titel in der Liste, Tag ändern/entfernen/hinzufügen in der Anzeigemaske samt Wandern des führenden
Tags nach dem Speichern, Abweisen eines Tags aus dem Vorjahr mit dem Satz der API, Anlegen einer
Rechnung mit drei Tagen und der Tastaturfokus auf den neuen Schaltflächen. Der Bestand wurde
anschließend neu aufgebaut.

## Slice 42 — Nicht gedeckte Rechnungen (umgesetzt 2026-09-28)
**Anlass:** issues.md 0.12.0-2. Manche Behandlungen sind von der Versicherung nicht gedeckt. Ist das
bekannt, wird die Rechnung nie eingereicht — und sie darf dann auch nicht in die Berechnung eingehen,
vor allem nicht in die Selbstbeteiligung. Zur Markierung gehört eine kurze Begründung, damit später
nachvollziehbar bleibt, warum.

**Ausgangslage:** Die halbe Miete stand schon. `InvoiceExclusions` und der Dialog „Nicht
erstattungsfähig markieren" kennzeichnen eine Rechnung **bei einer Police**, und der Optimierer
rechnet sie dort bereits aus `eligibleCosts` und aus der Selbstbeteiligung heraus. Es fehlte genau
_eine_ Markierung statt einer je Police.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Ein eigenes Kennzeichen an der Rechnung**, kein Sammelschreiben der vorhandenen
  Policen-Markierungen. Eine später angelegte Police wäre sonst nicht erfasst, und dort zählte die
  Rechnung wieder in die Selbstbeteiligung — „wird niemals eingereicht" ist eine Eigenschaft der
  Rechnung, nicht eines Paares aus Rechnung und Police.
- **Die Begründung ist Pflicht, solange das Kennzeichen steht**, und fällt mit ihm weg. Sie ist der
  ganze Zweck der Markierung; eine Begründung ohne Kennzeichen wäre eine Karteileiche, die die
  Masken trotzdem anzeigen müssten. Beide Regeln liegen in `nextNotCovered()` in `invoices.ts`, also
  an einer Stelle für jeden Schreibweg.
- **Markiert wird nur, was nirgends eingereicht ist** (Autor, 2026-09-28). Dieselbe Linie zieht die
  Policen-Markierung schon (`INVOICE_ALREADY_SUBMITTED`), und die Spiegelregel zu „als abgerechnet
  markiert" (`INVOICE_NOT_SUBMITTED`) steht daneben. Wer nach einer Absage nachträglich markieren
  will, zieht zuerst zurück oder markiert bei der einzelnen Police. So kann keine „nicht erstattbare"
  Rechnung mit Einreichung oder gebuchtem Geld entstehen.
- **Kein neuer Status.** Der Optimierer behandelt das Kennzeichen wie „bei jeder Police
  ausgeschlossen", womit die Gesamtempfehlung von selbst auf das vorhandene `not-reimbursable`
  fällt. Nur die Herleitung geht am `invoiceAction()`-Umweg vorbei: Ein Versicherter ohne Police hat
  eine leere Aktionsliste, und die fiele sonst auf `hold` zurück.
- **`invoiceTotal` behält die Rechnung.** Sie wurde gestellt und bezahlt; erstattungsfähig ist sie
  nicht, und das sagen die `eligibleCosts` je Police.
- **Eine Regel, eine Quelle in der UI.** `submittableContracts()` gibt bei einer markierten Rechnung
  `[]` zurück — damit verschwindet die Einreichen-Aktion in der Zeile, im Detaildialog und in der
  Sammelaktion an einer Stelle, und die Oberfläche spiegelt wieder genau die API. Ebenso sperrt sich
  die Policen-Markierung von selbst, weil `markableContracts` leer ist.
- **Nebenbefund, mitgenommen:** Die Anzeigemaske gab `runDialog()` einen pauschalen 409-Satz
  („Der Rechnungsbetrag kann nicht unter die bereits erstatteten Beträge sinken.") mit, der in
  `describeError()` jeden anderen Konfliktcode überdeckte — schon vorher den zu „nur eine
  eingereichte Rechnung kann als abgerechnet markiert werden". Der Satz ist über den Code ohnehin
  übersetzt; der Hinweis entfällt, und jede Ablehnung sagt wieder, was wirklich war. Im Browser an
  beiden Fällen nachgewiesen.

**Umsetzung:** Migration 015 hängt `notCovered`/`notCoveredReason` an `Invoices` (Default 0, keine
Datenmigration — markiert war bisher nichts, es gab nichts zum Markieren; `down` mit `ALGORITHM=COPY`,
die Lehre aus 012). Die API führt beide Felder im DTO und beim Schreiben, `submissions.ts` weist eine
markierte Rechnung vor allen policenbezogenen Prüfungen ab (`INVOICES_NOT_COVERED`). Der Optimierer
kennt `notCovered` an `OptimizerInvoice`. In der Oberfläche tragen Anlege- und Anzeigemaske Schalter
und Begründung, der Arbeitsbereich ein Kennzeichen mit der Begründung im Titel — das
Empfehlungs-Badge „Nicht erstattbar" wird daneben unterdrückt, es sagte dasselbe zweimal. Der Seed
legt eine nicht gedeckte Rechnung an, damit der Entwicklungsbestand den Fall zeigt.

**Geprüft:** 257 API-Tests gegen `eunomia_test` (Anlegen und Ändern mit Kennzeichen, Begründung
verlangt beim Anlegen wie beim Ändern, Begründung fällt mit dem Kennzeichen weg, Einreichen
abgewiesen, Markieren einer eingereichten Rechnung abgewiesen, Migration 015 hin und zurück) und 243
Web-Tests. Dazu im laufenden Browser: die geseedete Rechnung mit Kennzeichen und Begründung im
Tooltip, ohne Einreichen-Aktion; Kennzeichen aus → Begründung geleert, Zeile wieder mit
Einreichen-Aktion, erstattungsfähige Kosten des Jahres von 1.540 auf 1.690 € (Rechnungssumme
unverändert 1.690 €), Kennzeichen wieder an → zurück auf 1.540 €; Speichern ohne Begründung mit dem
Satz der API abgewiesen; Markieren der eingereichten Rechnung mit dem richtigen Satz abgewiesen;
Anlegen einer markierten Rechnung über das Formular; Tastaturfokus auf dem neuen Schalter in beiden
Masken mit vollständigem Fokusring. Der Bestand wurde anschließend neu aufgebaut.

## Slice 43 — Zahlungsdatum bei Direktzahlung (umgesetzt 2026-09-28)
**Anlass:** issues.md 0.12.0-3. Bei Direktzahlung — bar an der Theke, Karte in der Praxis — soll
das Rechnungsdatum automatisch Zahlungsziel und Zahlungsdatum werden. Bisher blieben beide leer:
eine längst beglichene Rechnung stand als unbezahlt da und konnte den Status „Erledigt" nie
erreichen, so vollständig sie auch erstattet war (`deriveInvoiceStatus()` hängt ihn an
`transferDate`).

**Entscheidungen (Planmodus):**

- **Die Regel gehört in die API, nicht in die Masken.** Rechnungsmaske und Anzeigemaske schreiben
  beide `directPayment`, und die Anzeigemaske hält die zwei Daten einzeln bearbeitbar. Läge die
  Regel in einer von beiden, liefen sie auseinander. `nextPaymentDates()` in `invoices.ts` steht
  deshalb neben `nextNotCovered()` aus Slice 42 — dasselbe Muster, eine Stelle für jeden
  Schreibweg.
- **Maßgeblich ist, was der Schreibvorgang hinterlässt**, nicht was er mitschickt: Steht das
  Kennzeichen danach, _sind_ beide Daten das Rechnungsdatum — auch wenn derselbe Aufruf etwas
  anderes mitgibt, und auch wenn nur das Rechnungsdatum korrigiert wird, das die beiden dann
  mitnimmt.
- **Das Abwählen leert beide Daten**, sofern der Aufruf nicht selbst welche mitschickt. Ein stehen
  gebliebenes „bezahlt am Rechnungsdatum" wäre eine Aussage, die niemand gemacht hat. Rechnungen,
  die nie Direktzahlung waren, rührt die Regel nicht an.
- **Die Maske zeigt, was gespeichert wird.** In der Anzeigemaske tragen die beiden Felder das
  Rechnungsdatum, solange das Kennzeichen steht, und sind dabei gesperrt — dieselbe Linie, die der
  GiroCode dort schon fährt. Ein `seeding`-Merker hält die Regel beim Öffnen zurück: eine alte
  Direktzahlungs-Rechnung ohne Daten sähe sonst beim bloßen Öffnen „bearbeitet" aus.

**Gewollte Nebenwirkung:** Eine voll erstattete Direktzahlungs-Rechnung erreicht damit erstmals
„Erledigt". Zahlungs-Ampel (`payment.ts`) und Erinnerungsversand (`reminders/store.ts`) klammern
`directPayment` ohnehin schon aus; dort ändert sich nichts.

**Geprüft:** 259 API-Tests gegen `eunomia_test` (Anlegen setzt beide Daten und überschreibt ein
mitgeschicktes Zahlungsziel, korrigiertes Rechnungsdatum zieht sie nach, Abwählen leert sie,
mitgeschickte Daten beim Abwählen gewinnen, gewöhnliche Rechnungen bleiben unberührt) und 248
Web-Tests, darunter die neue `InvoiceDetailDialog.test.ts`. Dazu im laufenden Browser: Rechnung mit
Direktzahlung angelegt — Zahlungsziel und Zahlungsdatum tragen das Rechnungsdatum und sind
gesperrt, die Ampel steht auf „Bereits bezahlt"; Kennzeichen aus → beide leer und frei, wieder an
→ beide zurück auf das Rechnungsdatum. Die Testrechnung wurde anschließend über den Papierkorb
endgültig gelöscht, der Bestand steht also wie vorher.

## Slice 43a — Nicht vollständig erstattete Rechnungen (umgesetzt 2026-09-28)
**Anlass:** issues.md 0.12.0-6, beim Arbeiten mit 0.12.0 dazugekommen und auf Wunsch des Autors vor
den großen Brocken von Slice 44 gezogen. Tarifliche Eigenbeteiligung und Selbstbeteiligung lassen
einen Teil der Rechnung beim Versicherten; dieser Unterschied war bisher nur aus zwei Spalten zu
erschließen.

**Rein in der Oberfläche:** `reimbursedTotal`, `remainingAmount` und `workflowStatus` stehen im DTO
seit Slice 17. Weder Migration noch API-Änderung.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Zwei Stufen statt einer.** Rot bei `abgerechnet`/`erledigt` mit Restbetrag: von Hand „als
  abgerechnet markiert", obwohl das Geld nicht reicht — der Rest bleibt beim Versicherten und
  ändert sich nicht mehr. Orange bei `teilabgerechnet`: auch zu wenig, aber eine Zusatzpolice kann
  noch antworten, und genau das schlägt der Optimierer dort vor. Rot an dieser Stelle wäre ein
  Fehlalarm.
- **`offen` und `eingereicht` bleiben unauffällig.** Dort ist noch nichts gebucht, und eine Null,
  die niemand beantwortet hat, ist keine Nachricht. Eine nicht gedeckte Rechnung (Slice 42) steht
  auf `offen` und fällt damit von selbst heraus.
- **Farbe trägt nichts allein** (WCAG 1.4.1). Derselbe Satz samt Betrag ist Titel der Zelle und
  steht für Vorleseprogramme vor der Zahl; dafür gibt es jetzt `.eu-visually-hidden` in
  `global.css`, die es bisher nicht gab.

**Umsetzung:** Die Regel als reines Modul `reimbursement-gap.ts` mit Spec — wie `not-covered.ts`
daneben —, damit Wortlaut und Regel an einer Stelle liegen und der Vergleich in Cent statt in
Gleitkomma stattfindet. Rot ist das vorhandene `--eu-color-error-fg`; für Orange kommt
`--eu-color-warning-fg` in die Feedback-Gruppe (`#6b4e00` hell, `#ffd873` dunkel, die Töne der
Statusfarbe „Eingereicht"). Beide Paare stehen erstmals als Text auf der Kartenfläche, sind also in
`CONTRAST.md` nachgerechnet: 8,68:1 und 7,74:1 hell, 9,84:1 und 12,30:1 dunkel.

**Geprüft:** 254 Web-Tests, darunter `reimbursement-gap.spec.ts` und zwei neue Fälle im
Arbeitsbereich (Klasse und Titel je Stufe, der verborgene Satz nur dort, wo es etwas zu sagen gibt).
Im laufenden Browser am geseedeten Jahr 2025 von Anna Muster, hell und dunkel: „Abgerechnet" mit
0,00 € von 90,00 € rot, „Teilabgerechnet" mit 150,00 € von 200,00 € orange, „Erledigt" mit voller
Erstattung sowie „Offen" und „Eingereicht" unverändert.

## Slice 44 — Mehrere Kontoverbindungen je Abrechnungsdienstleister (umgesetzt 2026-09-28)
**Anlass:** issues.md 0.12.0-4. Die Praxis zeigt: ein Abrechnungsdienstleister hat mehrere gültige
Konten gleichzeitig. Im auslösenden Fall nannte derselbe Dienstleister auf einer älteren Rechnung
drei Konten — genutzt wurde immer das erste — und auf der Rechnung eines anderen Leistungserbringers
nur noch das zweite davon. Kein Kontowechsel, sondern eine Auswahl je Rechnung.

Damit trägt die Annahme aus Slice 38 nicht mehr: dort war das Konto eine Historie
(`AgencyBankAccounts.validFrom`, höchstens ein Eintrag je Startdatum, genau ein Konto zu jedem
Zeitpunkt gültig, aufgelöst über `accountInForce()` gegen das Überweisungsdatum).

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Die Gültigkeit entfällt ganz.** `validFrom` und das abgeleitete `validTo` fallen weg, Konten
  sind eine schlichte, geordnete Menge je Dienstleister. Mit ihnen verschwindet die ganze
  Auflösungsmechanik (`accountInForce`, `withValidity`, `assertStartFree`, der `agencyAccount`-Zweig
  von `HISTORY_START_EXISTS`, das `assertRestorable` des Papierkorbs): Die Rechnung sagt jetzt
  selbst, welches Konto gilt, also braucht es keine Regel mehr, die es errät.
- **Der Bestand wird eingefroren.** Migration 016 setzt `Invoices.agencyAccountUID` auf genau das
  Konto, das die alte Regel heute liefert (nach `transferDate`, sonst heute). Was in der Oberfläche
  stand, bleibt stehen; ab dann ist jede Rechnung ausdrücklich — auch eine offene, die einem
  späteren Kontowechsel damit nicht mehr folgt.
- **Vorschlag ist das zuerst erfasste Konto.** Ohne Datum braucht die Vorbelegung eine andere Regel;
  die Erfassungsreihenfolge entspricht der Beobachtung des Autors. Eine Standard-Markierung gibt es
  nicht, die Wahl fällt ohnehin je Rechnung. `defaultAccount()` steht deshalb je einmal in
  `apps/api/src/domain/agency-accounts.ts` und `apps/web/src/agencies/accounts.ts`, mit denselben
  Testfällen auf beiden Seiten — wie zuvor `accountInForce`.
- **Erfasste „gültig ab“-Angaben gehen nicht verloren**, sondern wandern in die Notiz des Kontos
  (`… · gültig ab 01.01.2026`). Von Hand Eingetragenes soll eine Migration nicht stillschweigend
  wegwerfen.
- **Die Zuordnungsregel gehört in die API**, neben `nextNotCovered()` (Slice 42) und
  `nextPaymentDates()` (Slice 43) und nach demselben Muster: `nextAgencyAccount()` leert das Konto
  mit dem Dienstleister und bei Direktzahlung, und ein Dienstleisterwechsel ohne mitgeschicktes
  Konto leert es ebenfalls — das alte gehört dem alten Dienstleister. Die Zugehörigkeitsprüfung
  braucht die Datenbank und steht als `assertAccountOfAgency()` daneben; ein fremdes Konto wird mit
  `INVOICE_ACCOUNT_NOT_OF_AGENCY` abgewiesen. Beide Masken spiegeln die Regel nur.

**Befunde beim Bauen:**

- **Der Papierkorb brauchte keine Zeile.** Seine Sperren leitet er aus den Fremdschlüsseln ab
  (Slice 39), also blockiert die neue Spalte das endgültige Löschen eines benutzten Kontos von
  selbst. Ein in den Papierkorb gelegtes Konto bleibt dagegen verweisbar: die Maske fällt dann auf
  das erste Konto zurück — dasselbe Verhalten wie bei einem gelöschten Leistungserbringer.
- **`EuDetailField` bekam einen `after`-Slot.** Die IBAN-Zeile der Anzeigemaske war
  schreibgeschützt und trug den GiroCode über den `value`-Slot; jetzt ist sie ein Picker, und der
  Slot hätte ihn ersetzt statt danebengestellt. `after` hängt etwas neben das Feld, ohne es zu
  ersetzen; die Wertzelle ist dafür eine Flex-Zeile.
- **Der Migrationstest von 012 lief in die eigene Zukunft.** Er fährt auf 012 zurück, dann `up()`
  bis zum Ende — und prüfte danach `validFrom`, das 016 inzwischen entfernt. Er fährt jetzt nur bis
  012 hoch, prüft dort, und geht erst am Schluss ganz nach oben.

**Geprüft:** 257 API-Tests gegen `eunomia_test`, 262 Web-Tests, Lint, Typecheck, Prettier. Migration
016 zusätzlich auf dem Dev-Bestand *mit* echtem Kontowechsel: die 2025 bezahlte Rechnung behielt das
alte Konto, die beiden offenen bekamen das jüngste, das Startdatum steht in der Notiz. Im Browser,
hell und dunkel: die Dienstleister-Liste zeigt „DE02… (+1 weitere)“, der Dialog beide Konten
gleichrangig; beim Anlegen ist die Kontoverbindung erst ab gewähltem Dienstleister da, mit dessen
erstem Konto vorbelegt und umwählbar (Empfänger und Notiz als Zusatzzeile im Picker); ein aus dem
Picker heraus angelegtes drittes Konto ist sofort gewählt; Zahlungsinformationen und GiroCode zeigen
das gewählte Konto; Dienstleister leeren oder Direktzahlung setzen leert und sperrt die Zeile.
Probelauf der Zahlungserinnerung: die Rechnung auf dem ersten Konto nennt den Dienstleister, die auf
dem zweiten dessen Zahlstelle. Fokusring per Tastatur-Screenshot an jedem neuen Schalter geprüft —
Historienblock, Picker und Aktionen —, an keiner Kante beschnitten. Der Dev-Bestand steht
anschließend über `npm run dev:reset` wieder wie geseedet.

## Slice 45 — Rechnungen je Abrechnungsdienstleister und Leistungserbringer (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.12.0-5, aufgefallen beim Bau von Slice 44. Sobald ein Dienstleister mehrere
Konten führt, lässt sich nicht mehr nachsehen, welche Rechnung auf welchem Konto liegt — und beim
Aufräumen eines Kontos sieht man nicht, was daran hängt. Dieselbe Frage stellt sich beim
Leistungserbringer.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Der Ort ist der Rechnungs-Picker, nicht der Dienstleister-Dialog.** Dort wird schon nach
  Rechnungsnummern gesucht; die Filterzeile steht daneben und füllt dieselbe Ergebnisliste. In den
  Stammdatenlisten führt je eine Aktionsschaltfläche (`fa-filter`) dorthin, mit gesetztem Filter.
- **Eine Ergebnisdarstellung für jede Suchart.** Die klickbaren Kartenzeilen bleiben, ergänzt um
  Rechnungsdatum, Leistungserbringer, Dienstleister und IBAN. Damit ist ein weiterer Filter je eine
  Zeile: ein Feld im Schema der API, ein Eintrag in `FIELDS` (Web) und einer in `references` — der
  Leistungserbringer ist in dieser Scheibe gleich der Beweis dafür.
- **Kein eigener Endpunkt**, anders als zunächst notiert: `GET /invoices` bringt die Rechteprüfung je
  Versichertem schon mit (`getAccessibleAccounts`), also bekommt es die Filter. Ein zweiter Endpunkt
  hätte Scoping, Nummernsuche, Limit und `present()` wiederholt.
- **Der Status ist eine Auswahlliste** („Alle", „Nicht erledigt", je Stufe), und er wird **nach**
  `present()` gefiltert, nicht in SQL: Der Status ist abgeleitet und nirgends gespeichert (2.3), die
  Leiter steht genau einmal in `invoice-status.ts`. Das Limit gilt dann für das, was der Filter
  übrig lässt; die Abfrage selbst bleibt über `STATUS_SCAN_CAP` begrenzt.
- **Der Filter steht in der Adresse** — eine gefilterte Liste ist damit merk- und neuladbar — und
  wird zusätzlich im Modul gemerkt, damit der Zurück-Pfeil des Arbeitsbereichs und der Menüpunkt
  nicht auf einer leeren Seite landen. Kein `localStorage`: die App benutzt bewusst keinen.

**Befunde beim Bauen:**

- **Zwei Vokabulare, ein Filter.** Die Adresse sagt `agency`/`account`/`facility`, die API
  `agencyUID`/`agencyAccountUID`/`facilityUID` — denn `accountUID` ist dort der Versicherte, nicht
  die Kontoverbindung. Der erste Wurf schickte die kurzen Namen an die API; zod wirft unbekannte
  Parameter still weg, also kam eine vollständige, ungefilterte Liste zurück. Beide Namen stehen
  jetzt nebeneinander in einer Tabelle (`FIELDS`), und ein Test prüft die API-Namen.
- **Das Leeren eines Kontos gehört in den Bedienweg, nicht in einen Watcher.** Ein Watcher auf den
  Dienstleister löscht die Kontoverbindung auch dann, wenn beide zusammen aus der URL kommen. Jetzt
  räumt der Auswahl-Handler auf: wer den Dienstleister wechselt, verliert das Konto; was gemeinsam
  ankommt, bleibt zusammen.
- **`EuButton` kann jetzt ein Link sein** (`to`), damit die Zeilenaktion im neuen Tab und mit
  Mittelklick funktioniert, statt ein Knopf mit `router.push` zu sein. `ResourceConfig.rowActions`
  ist der allgemeine Weg dorthin; `EuSelectField` bekam ein `emptyLabel`, weil „nichts gewählt" in
  einem Filter „alle" heißt und nicht „keine".

**Geprüft:** 260 API-Tests gegen `eunomia_test`, 277 Web-Tests, Lint, Typecheck, Prettier. Im
laufenden Browser am geseedeten Bestand, hell und dunkel: die Filterschaltfläche beim Dienstleister
führt auf drei Rechnungen, die Kontoverbindung schneidet auf eine zu, „Erledigt" auf keine,
„Nicht erledigt" wieder auf eine; ein Treffer öffnet die Rechnung im Jahr des Versicherten, der
Zurück-Pfeil bringt genau diese Liste zurück; die Schaltfläche beim Leistungserbringer zeigt dessen
zehn Rechnungen. Fokusring per Tastatur-Screenshot an allen vier Filterfeldern und an der
Zeilenaktion am rechten Tabellenrand — nirgends beschnitten.

## Slice 46 — Die Vorschlagsliste erträgt lange Einträge (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.14.0-slice.2-1, aufgefallen beim Test von Slice 44 in der Dev. Die
Kontoverbindung wird durch ihre IBAN bezeichnet, und `EuEntityPicker` zwang seine Liste per
floating-ui `size()` auf exakt die Feldbreite. Die IBAN ist ein einziges unbrechbares Wort, lief
also über, und weil die Liste `overflow-y: auto` trägt, macht der Browser aus `overflow-x`
ebenfalls `auto`: ein horizontaler Scrollbalken, den man nicht einmal greifen kann — der
`mousedown` auf ihm nimmt dem Eingabefeld den Fokus, und `onBlur` schließt die Liste.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Die Liste darf breiter werden als ihr Feld.** Die Feldbreite ist nur noch Mindestbreite, der
  Platz bis zum Fensterrand die Höchstbreite (`availableWidth` aus derselben Middleware). Das ist
  das übliche Verhalten einer Vorschlagsliste und hilft jedem Picker, nicht nur dem mit IBANs.
- **Umbruch als Rückfallebene, nie ein Scrollbalken.** Reicht auch die Höchstbreite nicht (schmales
  Fenster), bricht die Bezeichnung um und der Zusatz rutscht darunter statt daneben.
- **Die IBAN wird in Vierergruppen angezeigt** — die gelesene Form, die nebenbei Umbruchstellen
  schafft. Gespeichert, gesendet und in den GiroCode geschrieben bleibt sie kompakt; die API
  normalisiert ohnehin (`ibanField`).
- **Die Suche vergleicht ohne Leerzeichen.** Sonst fände eine durchgetippte IBAN die gruppierte
  Bezeichnung nicht mehr. Die Regel gilt für alle Picker und kann nur mehr treffen als vorher, nie
  weniger — dieselbe Normalisierung greift bei der Exaktprüfung, damit die Liste nicht
  „‹IBAN› hinzufügen" anbietet, was schon dasteht.

**Befunde beim Bauen:**

- **Ein Formatierer, viele Anzeigeorte.** `iban()` steht bei den übrigen Anzeigeformen
  (`lib/format.ts`), und weil `accountLabel()` ihn aufruft, erben Picker, Filterauswahl und
  IBAN-Spalte der Rechnungsliste die Gruppierung von selbst. Von Hand nachgezogen wurden nur die
  Kontoliste des Dienstleisters, die Zahlungsdetails und die Vorbelegung des Eingabefeldes.
- **Die Formatierung ist Anzeige, kein Wert.** `AgencyAccountFormDialog` strippt beim Speichern
  weiter (die lokale Konstante heißt jetzt `compact`, damit sie den Formatierer nicht verdeckt), und
  der GiroCode bekommt unverändert `account.bankAccount`. Vier bestehende Tests erwarteten die
  kompakte Form im gerenderten Text und wurden auf die gedruckte umgestellt.

**Geprüft:** 260 API-Tests gegen `eunomia_test`, 285 Web-Tests, Lint, Typecheck, Prettier. Im
laufenden Browser am geseedeten Dienstleister mit zwei Konten, hell und dunkel: die Liste misst 651
statt 470 px und zeigt beide IBANs samt Zusatz ohne horizontalen Balken (`scrollWidth ===
clientWidth`), im Anlegen-Dialog wie in der Anzeigemaske; bei 430 px Fensterbreite rutscht der
Zusatz unter die IBAN und wird abgekürzt, die IBAN bleibt ganz. Fokusring per Tastatur am Feld
„Kontoverbindung" — 3 px, unbeschnitten.

## Slice 47 — Der Anlegen-Dialog fragt nur, was eine neue Rechnung braucht (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.13.0-1, -2 und -3, drei Befunde aus der Nutzung von 0.13.0 an ein und
demselben Formular. Es wird häufiger ausgefüllt als jede andere Maske der App, und jede Zeile, die
nur manchmal gebraucht wird, kostet dort dauerhaft Platz und Aufmerksamkeit.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Der Satz zur Direktzahlung entfällt ersatzlos.** „Zahlungsziel und Zahlungsdatum werden auf das
  Rechnungsdatum gesetzt" erschien genau dann, wenn der Schalter umgelegt wurde, und schob den Rest
  des Formulars nach unten. Die Regel selbst steht in der API (`nextDirectPayment()`, Slice 43),
  nicht in diesem Hinweis — und die Felder, von denen er spricht, verschwinden im selben Moment
  ohnehin aus dem Formular.
- **„Nicht gedeckt" fliegt ganz aus dem Anlegen-Dialog, nicht nur hinter ein `v-if`.** Die Marke
  wird einer Rechnung angesehen, nachdem sie existiert; gepflegt wird sie in der Anzeigemaske. Der
  Payload lässt `notCovered`/`notCoveredReason` beim Anlegen weg — beide sind im Create-Schema
  optional (`flag.optional()`), die Spalte hat `DEFAULT 0`. `not-covered.ts` bleibt unverändert:
  Anzeigemaske und Rechnungsliste arbeiten weiter damit.
- **Die weiteren Behandlungstage werden zur leisen Nebensache.** Rahmen, fette `legend`, der
  Hinweissatz bei null Zusatztagen und die formatfüllende Schaltfläche ließen eine Angabe, die rund
  jede zehnte Rechnung betrifft, wie eine Pflicht aussehen. Geblieben ist eine kleine
  Ghost-Schaltfläche dicht unter „Behandlungsdatum"; die Zeilen erscheinen darüber, sobald man sie
  benutzt, und der Jahres-Hinweis erst mit der ersten Zeile.

**Befunde beim Bauen:**

- **Das Formular ist faktisch reines Anlegen.** `editing` ist in `InvoiceWorkspaceView` immer
  `null`, bearbeitet wird in der Anzeigemaske — deshalb war „nur ausblenden" kein Erhalt eines
  Weges, sondern toter Code. Der `editing`-Pfad des Dialogs selbst bleibt unangetastet, er trägt
  nur die drei entfernten Felder nicht mehr.
- **Ein Test hing an der Reihenfolge der Schalter.** Der alte Block prüfte den zweiten
  `.eu-toggle__input`; an seine Stelle treten drei Fälle, die das neue Formular beschreiben: kein
  `notCovered` im Payload, genau ein Schalter, und die Tage ohne Rahmen samt Hinweis erst ab der
  ersten Zeile.

**Geprüft:** 260 API-Tests gegen `eunomia_test`, 285 Web-Tests, Lint, Typecheck, Prettier. Im
laufenden Browser, hell und dunkel: der Anlegen-Dialog zeigt kein `fieldset`, keinen Hinweis und
genau einen Schalter; Direktzahlung umzulegen fügt nichts mehr ein; ein Behandlungstag lässt sich
hinzufügen, füllen und entfernen, und eine Rechnung mit zwei Tagen wurde angelegt (die Probe danach
über Papierkorb → endgültig löschen wieder entfernt). Fokusring per Tastatur auf der leisen
Schaltfläche — 3 px, 2 px Abstand, unbeschnitten.

## Slice 48 — Der Betrag springt mit einem Klick in die Erstattung (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.13.0-4. Beim Zuordnen steht der Betrag, der in „Erstattung" gehört, in den
allermeisten Fällen schon in der Kopfzeile der Karte darüber — und wurde trotzdem abgetippt.

**Entscheidungen (Planmodus, mit dem Autor geklärt):**

- **Beide Beträge sind klickbar, nicht nur einer.** Der Rechnungsbetrag ist der Griff, wenn die
  Police alles erstattet hat; „noch offen" der, wenn eine frühere Leistungsabrechnung schon einen
  Teil getragen hat. Welcher gemeint ist, weiß nur der Brief in der Hand des Nutzers, also bietet
  die Karte beide an.
- **Der Griff sitzt am Betrag selbst, nicht in einem Icon daneben.** Die Zeile bleibt Text; erst
  Hover und Fokus färben und verfestigen die punktierte Unterstreichung. Ein Icon je Betrag hätte
  aus der ruhigen Metazeile eine Werkzeugleiste gemacht.
- **Derselbe Griff in „Erstattung ändern".** Der Dialog nennt den Rechnungsbetrag im Notiztext über
  genau dem Feld, das korrigiert wird (`AllocationDialog`) — dieselbe Handbewegung, dieselbe Optik.
  Was für diese eine Buchung zu viel ist, fängt wie bisher die Prüfung beim Speichern ab, hier wie
  auf dem Server.

**Befunde beim Bauen:**

- **Die Karte füllt nur ihr eigenes Feld.** `takeAmount(invoiceUID, betrag)` greift in `entries`,
  das je Rechnung einen Eintrag hält; ein Test mit zwei Karten sichert, dass der Klick nicht in die
  Nachbarkarte schreibt.
- **Leerzeichen vor dem Komma.** Im Notiztext von „Erstattung ändern" folgt dem Betrag unmittelbar
  ein Komma; ein Zeilenumbruch vor dem Textknoten hätte daraus „260,00 € ," gemacht. Die
  `</button\n>`-Schreibweise (die Prettier selbst erzeugt) hält den Satz zusammen.

**Nachtrag (in der CI aufgefallen):** Das neue Fixture in `AllocationDialog.test.ts` trug
`workflowStatus: 'teilerstattet'` — ein Status, den es nicht gibt (`status.ts` kennt
`teilabgerechnet`). Vitest prüft keine Typen, der Fehler fiel also erst im `vue-tsc`-Lauf der CI und
im Docker-Build auf. Lokal war er sichtbar gewesen: `npm run typecheck` läuft über alle Workspaces
und macht nach einem Fehlschlag mit dem nächsten weiter, sodass die letzten Ausgabezeilen grün
aussehen, während der Exit-Code 2 ist. Seither wird der Exit-Code geprüft, nicht das Ende der
Ausgabe.

**Geprüft:** 290 Web-Tests (fünf neue: Übernahme beider Beträge, die Nachbarkarte bleibt leer, die
aria-Labels, und zwei für „Erstattung ändern"), 260 API-Tests gegen `eunomia_test`, Lint, Typecheck,
Prettier. Im laufenden Browser, hell und dunkel: im Zuordnen-Dialog setzt der Klick auf „260,00 €"
und auf „noch offen 100,00 €" den jeweiligen Wert ins Feld, Tab erreicht beide Griffe, Enter
übernimmt, der Fokusring (3 px) steht frei im Scroll-Container; in „Erstattung ändern" springt der
Betrag von der gebuchten 100,00 € auf die vollen 260,00 €.

## Slice 49 — Der GiroCode gibt seinen Platz nicht her (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.13.0-5. Sobald ein Zahlungsdatum gesetzt wird, gibt es nichts mehr zu
überweisen, und `showQr` wird falsch — der Knopf verschwand per `v-if` ersatzlos. Der
Anzeigemasken-Dialog (`is-wide`) misst sich zwischen 38rem und 44rem am Inhalt, also wurde der ganze
Dialog beim Tippen schmaler.

**Entscheidung (Planmodus, mit dem Autor geklärt):** verborgen statt entfernt, genau der
Unterschied, den der Befund benennt. `PaymentQrPopover` wird immer gerendert, in einem
`<span class="eu-detail__qr">`, der bei `!showQr` `visibility: hidden` trägt. Das nimmt den Knopf aus
der Tabreihenfolge **und** aus dem Accessibility-Baum, hält aber exakt seinen eigenen Platz — kein
geschätztes Maß für einen Platzhalter. `showQr` selbst bleibt, wie es war; falsch war nicht die
Bedingung, sondern ihre Wirkung auf die Geometrie.

**Befunde beim Bauen:**

- **Kosten: keine.** `PaymentQrPopover` erzeugt den Code erst beim ersten Öffnen (`requested`), ein
  unsichtbarer Knopf rechnet also nichts.
- **Der Dev-Datenbestand zeigt den Fehler nicht.** Jede Maske dort bleibt unter der 38rem-Untergrenze
  des Dialogs, die Breite kommt also vom Minimum und nicht vom Inhalt — gemessen: 608 px, vorher wie
  nachher. Der Mechanismus wurde deshalb im laufenden Browser freigelegt, indem die Untergrenze
  kurz aufgehoben wurde: mit Knopf 598,9 px, ohne Knopf (das alte `v-if`) 570,1 px, mit dem neuen
  verborgenen Knopf wieder 598,9 px. Die knapp 29 px sind der Sprung, den der Autor auf 1905 px
  Bildschirmbreite gesehen hat.

**Geprüft:** 292 Web-Tests (zwei neue: der Slot steht mit und ohne Zahlungsdatum, die Klasse
`is-hidden` kommt dazu statt des Knopfes zu verschwinden), 260 API-Tests gegen `eunomia_test`, Lint,
Typecheck, Prettier. Im laufenden Browser bei 1905 px, hell und dunkel: Zahlungsdatum setzen lässt
die Dialogbreite bei 608 px, der Platz des Knopfes bleibt 24,8 px breit, `visibility` wechselt auf
`hidden` und der Knopf ist nicht mehr per Tab erreichbar.

## Slice 50 — Die manuelle Versionsprüfung erreicht die Fußzeile (umgesetzt 2026-09-29)
**Anlass:** issues.md 0.13.0-6. Die Prüfung in System > Einstellungen meldete die neue Version, die
Fußzeile blieb stumm. Nicht der Cache der API: `POST /update-check/refresh` läuft mit `force` und
schreibt in denselben Cache, aus dem `GET /update-check` antwortet. Es lag an der SPA — Fußzeile und
Einstellungsseite hielten je ein eigenes `ref` mit demselben Status, und die Fußzeile fragte genau
einmal, im `watch` auf `auth.isAdmin`. Ohne Reload konnte sie nichts Neues erfahren.

**Entscheidung (Planmodus):** ein geteilter Modulzustand in `apps/web/src/lib/update-status.ts`,
das Geschwister von `app-info.ts` (das die Version zwischen Fußzeile und Browsertitel teilt), nur
reaktiv statt nur memoisiert. Beide Masken lesen dasselbe `computed`; `loadUpdateStatus()` und
`refreshUpdateStatus()` schreiben es. Kein Pinia-Store: der Zustand hat keine Sitzung und keine
Actions. Kein Nachfragen bei jedem Routenwechsel: Requests ohne Anlass, und den Fall „Prüfung auf der
offenen Einstellungsseite" träfe es trotzdem nicht.

**Befunde beim Bauen:**

- **Der Rückweg zählt genauso.** Nach dem Upgrade meldet die Prüfung „aktuell" — auch das muss den
  Hinweis nehmen, nicht nur setzen. Dieselbe Mechanik, ein zweiter Test.
- **Ein Hinweis darf die Sitzung nicht überleben.** Der geteilte Zustand liegt im Modul, nicht in der
  Komponente, also überdauert er eine Abmeldung im selben Tab. `clearUpdateStatus()` hängt deshalb am
  `watch` auf `auth.isAdmin` und zählt eine Epoche hoch, damit auch eine Antwort, die erst danach
  eintrifft, verworfen wird statt den Hinweis wiederzubeleben.
- **Ein Fehlschlag löscht nichts.** Wirft die Anfrage (kein Netz, 403), bleibt die letzte Antwort
  stehen und der Aufrufer meldet die Ursache — die Einstellungsseite benennt sie, die Fußzeile
  schweigt wie bisher.

**Geprüft:** 301 Web-Tests (neun neue: sechs für das Modul, drei für die Fußzeile — Übernahme einer
anderswo gemachten Prüfung, der Rückweg, das Vergessen beim Abmelden), 260 API-Tests gegen
`eunomia_test`, Lint, Typecheck, Prettier, Build. Im laufenden Browser bei 1905 px, hell und dunkel,
gegen eine eigene Instanz mit `UPDATE_CHECK_REPO` auf einem öffentlichen Repository: Fußzeile nach
dem Laden stumm, nach „Jetzt prüfen" steht `v3.5.43 verfügbar` darin — ohne Reload, bei unveränderter
Adresse —, eine zweite Prüfung ohne Fund nimmt ihn wieder weg, und nach dem Abmelden ist er fort.

## Slice 51 — Tote Pfade und Namen im Kleinen (umgesetzt 2026-09-29)
**Anlass:** Erste Scheibe des Pakets „Die zwei Reviews auf dem Weg zu 1.0.0" (Block I des Schnitts
in [Code-Review.md](Code-Review.md) §7), und die kleinste: CR-28, CR-35, CR-36, CR-31 und CR-21. Alle
fünf Befunde haben dieselbe Form — der Code behauptet etwas, das nicht stimmt: eine Sammeldatei, die
keine öffentliche Oberfläche ist; zwei Demo-Endpunkte, die nur noch leben, weil Tests sie benutzen;
exportierte Helfer ohne Aufrufer; ein Dateiname gegen die Konvention; ein Prüfmuster, das mehr
erlaubt als der Generator vergibt.

**Entscheidung (Planmodus):** Kein Verhalten ändern, keine Migration, keine API-Felder. Löschen statt
bewahren, wo der Review beides anbietet — `forgetSchemaLinks()` beschreibt einen Testaufbau, den es
nicht gibt, und ein Aufruf im Migrationstest würde ihn erst erfinden. `entityIdPattern` leitet die
Zeichenklasse aus `ID_ALPHABET` und `ID_BODY_LENGTH` ab, statt sie danebenzuschreiben: so kann sie
nicht wieder auseinanderlaufen. `useTableSort` behält seinen Funktionsnamen, nur die Datei heißt
kebab-case wie ihre Nachbarn. `requireEntityAccount` bleibt liegen — es gehört zu CR-08 in Scheibe 4,
wo es Aufrufer bekommt statt gelöscht zu werden.

**Befunde beim Bauen:**

- **Für den globalen Wächter taugt `/me` nicht.** Der Review empfiehlt, die zwei `/ping`-Testfälle auf
  `GET /me` und `GET /accounts/:uid` umzuschreiben. `/me` hängt aber nur an `requireAuth` und würde
  über eine *globale Berechtigung* nichts beweisen, während der Testfall genau das behauptet
  („passes the global-permission guard"). Stattdessen `GET /users`, global an `MANAGE_USERS` gebunden
  — dieselbe Wache, die `/admin/ping` vorgeführt hat, und dieselbe Route, die
  `user-admin.integration.test.ts` schon für ihren 403 benutzt.
- **Der 403 für das fremde Konto hängt nicht an der Zeile.** Im Auth-Test existiert das zweite Konto
  gar nicht. Das bleibt richtig, weil `createRequirePermission` vor dem Handler antwortet: es fehlt
  die Berechtigung, nicht der Datensatz — 403, nicht 404, genau wie beim gelöschten `/ping`.

**Geprüft:** 261 API-Tests gegen `eunomia_test` (einer neu: das ID-Muster weist `0`, `O`, `1`, `I`
und `l` ab; die drei umgeschriebenen Wächter-Fälle grün), 301 Web-Tests, Lint, Typecheck, Prettier,
Build beider Apps, `version:check`. Kein Browser-Nachweis: keine der fünf Änderungen ist sichtbar —
ein Dateiname, zwei Endpunkte, die kein Client aufruft, zwei `export`-Schlüsselwörter und eine
Zeichenklasse, die strenger wird als das, was je vergeben wurde.

## Slices 52–69 — Die Review-Arbeit (umgesetzt 2026-09-29 bis 2026-10-04)

Ab hier wird die Scheibe nicht mehr hier geplant. Das Paket „Die zwei Reviews auf dem Weg zu 1.0.0"
hatte seinen Schnitt schon: 54 Befunde (17 SEC, 37 CR), geschnitten in 18 Scheiben in vier Blöcken,
nachzulesen in [Code-Review.md](Code-Review.md) §7. Begründung, Fundstelle, Aufwand und Risiko je
Befund stehen in [Code-Review.md](Code-Review.md) bzw. [Sicherheits-Review.md](Sicherheits-Review.md)
unter der CR-/SEC-Nummer; **was daraus geworden ist, steht am Punkt in [issues.md](issues.md)** —
dort trägt jeder Befund den Vermerk `Umgesetzt mit vX.Y.Z-slice.N` und darunter, was abweichend oder
über den Review hinaus entschieden wurde. Der Changelog erzählt dasselbe nach außen.

Die Liste ist deshalb nur eine Landkarte von der Slice-Nummer auf den Befund:

| Slice | Version | Scheibe | Befunde |
| --- | --- | --- | --- |
| 51 | `0.16.0-slice.2` | 1 — Tote Pfade und Namen im Kleinen | CR-21, CR-28, CR-31, CR-35, CR-36 |
| 52 | `0.16.0-slice.3` | 2 — Kleine Korrekturen an der API | CR-06, CR-12, CR-13, CR-14, CR-22, SEC-12, SEC-16 |
| 53 | `0.16.0-slice.4` | 3 — Ein Name für die Kontoverbindung | CR-20 |
| 54 | `0.16.0-slice.5` | 4 — Die Helfer durchsetzen | CR-08, CR-09, CR-10, CR-11, CR-23 |
| 55 | `0.16.0-slice.6` | 5 — Das geteilte Paket | CR-01, CR-02, CR-03, CR-04, CR-05 |
| 56 | `0.17.0-slice.1` | 6 — Der Client hält die Sitzung | CR-24, CR-25 |
| 57 | `0.17.0-slice.2` | 7 — Anmeldung und Sitzungen | SEC-05, SEC-06, SEC-07, SEC-08 |
| 58 | `0.17.0-slice.3` | 8 — Kontotrennung an einem Ort | CR-07, SEC-03, SEC-04 |
| 59 | `0.18.0-slice.1` | 9 — `invoices.ts` schneiden | CR-15 |
| 60 | `0.18.0-slice.2` | 10 — Grenzen an den Eingängen | CR-18, SEC-01, SEC-11 |
| 61 | `0.18.0-slice.3` | 11 — Dialoge und große Ansichten | CR-29, CR-30 |
| 62 | `0.18.0-slice.4` | 12 — Die Oberfläche lernt das Rechtemodell | CR-26 |
| 63 | `0.18.0-slice.5` | 13 — Weniger Fragen an die Datenbank | CR-16, CR-17, CR-27 |
| 64 | `0.18.0-slice.6` | 14 — Typen statt Zusicherungen | CR-19 |
| 65 | `0.19.0-slice.1` | 15 — Header, Image, Abhängigkeiten | CR-37, SEC-02, SEC-10, SEC-13, SEC-14 |
| 66 | `0.19.0-slice.2` | 16 — Prüfbar statt dokumentiert | CR-32, CR-33, CR-34, SEC-17 |
| 67 | `0.19.0-slice.3` | 17 — Audit-Trail | SEC-09 |
| 68 | `0.19.0-slice.4` | 18 — Aufbewahrung, Löschung, Auskunft | SEC-15 |
| 69 | `0.19.0-slice.5` | Nachprüfung der Invarianten I-1 bis I-13 | §8 des Sicherheits-Reviews |

**Was aus dem Paket in diesen Plan gewandert ist** — und damit das ist, was eine spätere Scheibe
lesen muss, statt die Entscheidung neu zu treffen:

- §2.1 — genau ein API-Container (Scheibe 15).
- §2.4 — die zwölf Rechte, ihre Einteilung instanzweit/kontobezogen, die Regeln für die Oberfläche
  (Scheibe 12) und `MANAGE_TRASH` als benannte Ausnahme zur Kontotrennung (Scheibe 8).
- §2.8 — das Vokabular der drei „Konten" (Scheibe 3) und „Typen statt Zusicherungen" (Scheibe 14).
- §2.9 — dass eine Minor-Nummer übersprungen werden darf, und warum `0.16.0` nie erschienen ist.
- §2.10 — Header und CSP als Sache der App (Scheibe 15), der Audit-Katalog (Scheibe 17) und der
  Stand der Invarianten nach der Nachprüfung (Scheibe 69).
- §2.11 — Aufbewahrung, Löschung, Auskunft (Scheibe 18).

## Backlog aus der Produktionsnutzung

- **Bonus-Staffel aus einer Faktoren-Regel der Versicherung ableiten** — **umgesetzt mit Slice 76 (`1.1.0-slice.1`), veröffentlicht als `1.1.0`**. Entscheidungen des Autors vom 2026-10-05, abweichend vom Vorschlag unten: Die Staffel bleibt an den Konditionen der Police, nicht an der Versicherung, weil sie sich innerhalb einer Police bisher nie geändert hat. Faktor oder Betrag sind je Stufe wählbar. Für den bonusrelevanten Beitrag gibt es ein **neues Feld** statt einer Umwidmung, damit die Gesamtkosten in der Prod ihre Bedeutung behalten. Fehlt der relevante Beitrag für einen laufenden Monat, gibt es keine Prognose. Die Regeln stehen in 2.3 unter `ContractPremiums`/`ContractBonusTiers`. Ursprünglicher Eintrag: (Rückmeldung des Autors, 2026-09-24, nach der ersten Eingabe echter Staffeln in der Produktion — die Maske aus Slice 18/29 hat dabei gut funktioniert, das hier ist eine Erleichterung, keine Korrektur): In allen bisher erfassten Fällen ist die Staffel keine Liste freier Beträge, sondern eine **feste Regel der Versicherung**, ausgedrückt in Monatsbeiträgen statt in Euro — z. B. Jahr 1–2: 1 Monatsbeitrag, Jahr 3–4: 1,5, Jahr 5: 2, Jahr 6: 2,5, Jahr 7: 3, Jahr 8: 3,5, Jahr 9: 4. Die Regel unterscheidet sich je Versicherung, nicht je Police.
  - **Faktoren-Staffel optional an `InsuranceCompanies`** (leistungsfreie Jahre → Faktor). Eine Police nimmt entweder automatisch die Staffel ihrer Versicherung und rechnet sie mit dem Monatsbeitrag in Euro um, oder man überschreibt einzelne Jahre weiterhin mit eigenen absoluten Werten. Die manuelle Eingabe bleibt also der Rückfallweg, nicht der Normalfall.
  - **Bezugsgröße ist nur der Hauptbestandteil des Tarifs**, nicht der gesamte Monatsbeitrag. Der Autor schlägt vor, das bestehende Feld dafür **umzuwidmen** statt ein zweites anzulegen: `ContractPremiums.monthlyRate` wird in der Verwaltung ohnehin nur für die Bonusrechnung gebraucht, die Änderung wäre heute eine reine Umbenennung in der UI (etwa „rückerstattungsrelevanter Monatsbeitrag"). Zu prüfen bei der Planung: ob der Beitragsverlauf als Kostenübersicht (Jahreskosten) dann noch stimmt oder ob beide Größen doch getrennt gehören.
  - **Achtung, das kehrt eine Festlegung aus 2.3 um:** Dort sind die `ContractPremiums` ausdrücklich „rein informativ — **kein** Einfluss auf Selbstbeteiligung oder Bonus". Mit der Faktoren-Staffel wird der Monatsbeitrag zur Rechengröße der Bonusprognose und damit des Erstattungs-Optimierers (Slice 19). Die Scheibe muss deshalb klären, was passiert, wenn für ein Jahr kein Beitragsstand erfasst ist, und wie sich eine Beitragsanpassung mitten im Jahr auf den Faktor auswirkt (der Bonus ist eine Jahresgröße, der Beitrag gilt ab Datum).

## Paket Lokalisierung — Slices 77–83 (1.2.0)

Geplant 2026-10-06. Eunomia ist bis 1.1.0 durchgehend deutsch (rund 1.300 UI-Texte, `de-DE` fest an neun Stellen, deutscher Text auf der API-Seite in Erinnerungsmail, Testmail, Papierkorb-Beschriftungen und dem Rate-Limit-Satz). Der Autor selbst braucht keine zweite Sprache — das Paket ist für die Reichweite, falls das Repo veröffentlicht wird (2.8).

**Entscheidungen des Autors (2026-10-06):**
- **Sprachen:** Deutsch + Englisch; die Infrastruktur nimmt weitere auf.
- **Sprachwahl:** am Profil (`Users.locale`, `NULL` = folgen) → Browsersprache → Instanz-Vorgabe in den System-Einstellungen → `de`. Die Profilsprache bestimmt auch die Sprache der Mails.
- **Technik: vue-i18n** (Composition-Modus), Texte als **JSON je Sprache** (`apps/web/src/locales/de.json`, `en.json`). Mein erster Vorschlag war ein eigener typisierter Katalog; auf Nachfrage des Autors korrigiert: Typsicherheit gibt vue-i18n genauso (`de.json` als Schema, ein fehlender Schlüssel in `en` kompiliert nicht), dazu kommen, was ein Eigenbau nachbauen müsste — das ESLint-Plugin (`no-raw-text`, `no-missing-keys`, `no-unused-keys`), `<i18n-t>` für Sätze mit eingebetteten Elementen, benannte Zahlen-/Datumsformate und ein Format, das Werkzeuge und Übersetzer kennen. `@intlify/unplugin-vue-i18n` kompiliert die Texte beim Build vor: kein `eval`, CSP `script-src 'self'` bleibt. Die API bekommt nur für die Mails einen kleinen typisierten Katalog.
- **Format getrennt von der Sprache** (entschieden 2026-10-06, Slice 78): Deutsch (`de-DE`), Britisch (`en-GB`) oder US (`en-US`) wählbar, also auch englische Texte mit deutschen Daten; ohne Wahl entscheidet die Sprache (de → `de-DE`, en → `en-GB`). Gespeichert und gewählt wie die Sprache: Profil + Instanz-Vorgabe in 82, Auswahl in 83.
- **Umfang:** nur Sprache und Formate. Fachlich bleibt es eine deutsche PKV-App — Euro, 5-stellige PLZ, IBAN/GiroCode unverändert.
- Weiter gilt Slice 24: die API antwortet englisch mit Fehlercode, das Web übersetzt.

**Querschnittsregeln:**
- Während der Migration bleibt die Sprache **fest auf `de`**; die Erkennung geht erst in Slice 83 an, damit niemand eine halb übersetzte Oberfläche sieht. Zum Entwickeln ein Dev-Schalter (`?lang=en`, nur im Dev-Build).
- Jede Migrationsscheibe liefert `de` **und** `en` zugleich, die englischen Texte nach dem Glossar aus Slice 77.
- Tests installieren i18n global mit `de` — die Assertions auf deutsche Sätze bleiben gültig; je Bereich eine Stichprobe auf `en`.
- Schlüssel nach Bereich (`invoices.detail.title`), Gemeinsames unter `common`.
- `no-raw-text` läuft ab Slice 77 als Warnung, jede Scheibe macht ihre Verzeichnisse warnungsfrei, Slice 83 schaltet auf Fehler.

| Slice | Version | Scheibe |
| --- | --- | --- |
| 77 | `1.2.0-slice.1` | Fundament + Glossar + Rahmen: vue-i18n, Build-Plugin, Lint-Plugin, `lib/i18n.ts`, `<html lang>`/Titel, englisches Glossar in `apps/web/src/locales/README.md` (vom Autor im Plan-Modus abzunehmen), Layout/Navigation/Login/Router-Titel, Design-System-Komponenten |
| 78 | `1.2.0-slice.2` | Fehlermeldungen (`error-messages.ts`, `field-labels.ts`, weiterhin kompilergeprüft je `ErrorCode`), sprachabhängige Formate statt `germanMoney`/`germanDate`/`germanDateTime`/`plural` und der `de-DE`-Stellen, `EuCurrencyField` parst je Sprache, Datums-Einfügen |
| 79 | `1.2.0-slice.3` | Stammdaten (`resources/`, `ResourceView`, `agencies/`), Verwaltung (`admin/`, `profile/`), Papierkorb — die API liefert dessen Beschriftungen künftig strukturiert, die Sätze bildet das Web |
| 80 | `1.2.0-slice.4` | Policen (`contracts/` inkl. Staffel) und Startseite (`dashboard/`) |
| 81 | `1.2.0-slice.5` | Rechnungen I: Arbeitsfläche, Tabelle, Anlegen-Dialog, Details, Zusammenfassung, Status- und Empfehlungs-Badges, Rechnungssuche |
| 82 | `1.2.0-slice.6` | Rechnungen II (Einreichung, Abrechnungen, Zuordnung, Picker, Abrechnungssuche) + Server: `Users.locale` und `Users.formatRegion`, Einstellungen `general.defaultLocale`/`general.defaultFormat`, Mail-Katalog in der API (Mail in der Sprache des Empfängers), Locale-Parameter für die Formatierer in `shared`, Rate-Limit-Satz englisch mit Code |
| 83 | `1.2.0-slice.7` | Sprachwahl scharf (Profil → Browser → Instanz → `de`), Auswahl von Sprache und Format im Profil und in den System-Einstellungen, `plural()` gelöscht, `no-raw-text` als Fehler, Durchgang EN/DE mit Playwright (Textlängen, schmale Tabellen), „Adding a language" in README/DEV.md → Release `1.2.0` |

Jede Scheibe bekommt beim Start ihren eigenen Plan-Modus; was dabei entschieden wird, steht danach hier unter der Scheibe bzw. in `CHANGELOG.md`.

### Slice 77 — Fundament, Glossar, Rahmen (umgesetzt 2026-10-06, `1.2.0-slice.1`)
- **Glossar** in `apps/web/src/locales/README.md` (englisch, öffentlich), verbindlich für Kataloge und ab 1.2.0 für README/CHANGELOG. Entscheidungen des Autors: Leistungsabrechnung → *service billing* (wie im Code), Abrechnungsdienstleister → *billing agency* (statt „collection agency" — im Englischen meist ein Inkassobüro), Bonus → *no-claims bonus*, Einreichung → *submission*.
- **`no-raw-text` als Fehler über eine wachsende Pfadliste** in `eslint.config.js` statt überall als Warnung (abweichend vom Paketplan): Hunderte Warnungen würden echte verdecken. Jede Scheibe verlängert die Liste, Slice 83 setzt die Regel global. `StyleGuideView` bleibt draußen (Beispieltexte sind dort Inhalt).
- **`no-unused-keys` sieht nur wörtliche `t()`-Aufrufe.** Schlüssel, die als Daten gehalten werden (`titleKey` der Navigation), sind deshalb per Muster ausgenommen; ihr Leser ist gegen das Schema typisiert. Für die datengetriebenen Gruppen der späteren Scheiben (Fehlercodes, Status) gilt dasselbe Muster.
- **Der Dev-Schalter `?lang=en` merkt sich nichts.** Er gilt für die SPA-Sitzung bis zum Neuladen; ein `sessionStorage` hätte die Invariante I-8 gebrochen (keine Browser-Speicher in der SPA, `stores/auth.spec.ts` hat es sofort gemeldet).
- `<i18n-t>` braucht `scope="global"`, sonst warnt vue-i18n bei jedem Rendern („Not found parent scope").
- Bundle: +19 kB gzip (163 → 182 kB); die Warnung über 500 kB gab es schon vorher. Geprüft: das gebaute Bundle rendert unter der CSP der API ohne Message-Compiler.

### Slice 78 — Fehlermeldungen, Feldnamen, Formate (umgesetzt 2026-10-06, `1.2.0-slice.2`)
- **Format als eigene Größe** (Entscheidung des Autors, s. oben): `FORMAT_REGIONS` und `formatMoney`/`formatDate` mit Region-Parameter in `@eunomia/shared` (`german.ts` → `format.ts`; `germanMoney`/`germanDate` bleiben als Hüllen für die API bis Slice 82). Im Web liest `lib/format.ts` die Region beim Aufruf über `activeFormat()` (`lib/i18n.ts`), Templates folgen so einem Wechsel. Dev-Schalter `?format=en-US`.
- **Fehlermeldungen im Katalog** (`errors.*`): `CODE_MESSAGES` bleibt ein `Record` je `ErrorCode` und ruft `t()` wörtlich. `NOT_FOUND` und die Historien-Sätze als ganze Sätze je Ressource bzw. Art (Artikel und Verb hängen am Nomen). `NO_PERMISSION` ist jetzt die Funktion `noPermission()`.
- **Feld- und Einstellungsnamen** unter `fields`, `fieldFormats`, `settingLabels` — datenhaltig, deshalb per Muster aus `no-unused-keys` ausgenommen; `fieldLabel`/`settingLabel` fallen über `te()` auf den Schlüssel zurück.
- **`plural()` bleibt** (Abweichung vom Paketplan): Seine Aufrufer reichen deutsche Wortformen herein, es geht mit den Texten seiner Bereiche und wird in 83 gelöscht.
- **Betragsfeld:** Dezimalzeichen und €-Position aus `Intl…formatToParts`; mit Dezimalkomma bleibt die alte Nachsicht („12.5" ohne Komma = 12,5), mit Dezimalpunkt sind Kommas immer Tausender.
- **Datums-Einfügen:** Punkt-Form immer (Tag zuerst), Schrägstrich-Form nur nach Region (`en-GB` Tag zuerst, `en-US` Monat zuerst, `de-DE` gar nicht). Das native `<input type="date">` zeigt weiter im Browser-Format.
- Die Papierkorb-Nomen in Fehlersätzen kommen noch deutsch von der API (Slice 79).

## Ausblick (nicht Teil dieser Slices)
Paperless-Push-API, TOTP-Versand per Mail, ggf. weitere Ausbaustufen — siehe 2.5. (Die E-Mail-Benachrichtigungen samt Einstellungs-UI und Verschlüsselung aus 2.6 sind mit Slice 30/31 erledigt.)
