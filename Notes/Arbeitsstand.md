# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Findings aus der Produktion 0.12.0 → 0.13.0

Neun offene Punkte aus [issues.md](issues.md): die drei aus 0.11.0, die beim Paket davor liegen
geblieben sind, die drei aus 0.12.0 und die drei, die beim Arbeiten mit 0.12.0 dazugekommen sind.
Geplant als Slices 40–43 in [eunomia-plan.md](eunomia-plan.md); Scheibe 43a ist der zuletzt
dazugekommene Punkt, vor den großen Brocken gezogen, und Slice 44 steht hier erst als Merkposten.

| ✓   | Slice | Inhalt                                    | issues.md            | Version        |
| --- | ----- | ----------------------------------------- | -------------------- | -------------- |
| ☑   | 40    | Politur: Dialog-Scroll, Vorschläge, Label | 0.12.0-1, 0.11.0-2/3 | 0.13.0-slice.1 |
| ☑   | 41a   | Mehrere Behandlungstage — Modell + API    | 0.11.0-1             | 0.13.0-slice.2 |
| ☑   | 41b   | Mehrere Behandlungstage — UI              | 0.11.0-1             | 0.13.0-slice.3 |
| ☑   | 42    | Nicht gedeckte Rechnungen                 | 0.12.0-2             | 0.13.0-slice.4 |
| ☑   | 43    | Zahlungsdatum bei Direktzahlung           | 0.12.0-3             | 0.13.0-slice.5 |
| ☑   | 43a   | Nicht vollständig erstattete Rechnungen   | 0.12.0-6             | 0.13.0-slice.6 |
| ☐   | 44    | Konten je Leistungserbringer, Rechnungen je Dienstleister | 0.12.0-4/5 |    |

### Slice 40 — Politur: Dialog-Scroll, Browservorschläge, Label

**Der Scroll-Glitch ist gefunden und nachgemessen** (issues.md 0.12.0-1). Er liegt nicht am Dialog
und nicht am Zuordnen-Formular, sondern an `EuToggle`: `.eu-toggle__input` ist `position: absolute`,
aber `.eu-toggle` ist `static`. Damit ist der nächste positionierte Vorfahr das `<dialog>` selbst
(Chromium gibt ihm `position: fixed`) — nicht der Schalter. Das versteckte 1×1-Input landet deshalb
auf seiner statischen Position _gemessen vom Dialog_, also tief innerhalb des gescrollten
`.eu-dialog__body`. Im nachgestellten Fall: 1212 px bei einem Dialog von 810 px Höhe. Zwei Folgen,
genau die im Screenshot:

- Der Dialog wird dadurch selbst scrollbar (`scrollHeight` 1212 statt 810) — der zweite Scrollbalken
  und der Weißraum unter den Schaltflächen.
- Beim Klick auf den Schalter fokussiert das Label das versteckte Input, Chromium scrollt es in den
  Blick und schiebt den Dialog um 402 px — deshalb ist die Kopfzeile im Screenshot verschwunden.

Fix: `position: relative` auf `.eu-toggle`. Nachgemessen: `scrollHeight` wieder gleich
`clientHeight`, `offsetParent` des Inputs wird der Schalter. Eine Zeile — aber `EuToggle` steckt in
neun Komponenten, unter anderem in der Rechnungsmaske, also überall dieselbe Falle.

Dasselbe Muster ein zweites Mal: `.eu-icon-label__text` in `EuIconLabel` ist absolut positioniert,
`.eu-tooltip-trigger` ist es nicht. Mit verankern — die Komponente sitzt in `ContractDetailDialog`,
`AgencyDetailDialog` und `PaymentInfoPopover`, alle drei mit scrollendem Dialogkörper.

**Browservorschläge unterdrücken** (issues.md 0.11.0-2). Die Eingabefelder liegen an vier Stellen
zusammen, `EuEntityPicker` hat `autocomplete="off"` schon:

- `EuTextField` bekommt eine `autocomplete`-Prop mit Default `'off'`. `LoginView` übergibt dort
  `email` bzw. `current-password`, damit der Passwortmanager beim Anmelden weiter greift — das ist
  die eine Stelle, an der der Vorschlag erwünscht ist.
- `EuCurrencyField` und die drei Inputs in `EuDetailField` (text/email/date, number) bekommen
  `autocomplete="off"`.
- Die Checkboxen in `InvoiceWorkspaceView` sind nicht betroffen.

Die Felder tragen kein `name`-Attribut; das ist schon der halbe Grund, warum Chrome sich meist
zurückhält. Falls ein Feld trotzdem vorbelegt wird, ist der Ausweg ein Unsinn-Token
(`autocomplete="one-time-code"`) an genau diesem Feld, nicht global.

**Label kürzen** (issues.md 0.11.0-3): `field-labels.ts:132`, `'reminders.appUrl'` auf
`'URL dieser Instanz (für den Link in der Mail)'`.

Prüfen im echten Browser mit Screenshot: Zuordnen-Dialog mit gescrolltem Körper, Schalter geklickt —
kein zweiter Scrollbalken, Kopfzeile bleibt stehen.

### Slice 41 — Mehrere Behandlungstage je Rechnung

Entschieden (Autor, 2026-09-28): **nur die Tage, keine Beträge je Behandlung.** Rechnungen schlüsseln
ihre Einzelpositionen auf Behandlungstage, bilden dort aber keine Summen — Beträge je Tag zu
erfassen wäre umständlich und brächte kaum Informationsgewinn. Ebenso bleibt es dabei, dass eine
Rechnung in _einem_ Kalenderjahr liegt; Jahresübergreifendes wird weiter auf zwei Rechnungen
aufgeteilt. Damit bleibt jeder `YEAR(treatmentDate)`-Drehpunkt — Vertragsjahre, Bonus-Timeline,
Erstattungsoptimierer, Erstattungsplan — unangetastet.

Zur Frage aus der Erfassung: **es gibt keinen UNIQUE-Constraint auf `invoiceNumber`** und auch keine
Dublettenprüfung in der API. Dieselbe Rechnungsnummer darf also zweimal stehen — die Aufteilung, zu
der die Fehlermeldung rät, ist heute schon möglich und muss nicht erst freigeräumt werden.

#### 41a — Modell + API

- Migration `014-invoice-treatment-days.ts`: Tabelle `InvoiceTreatmentDays` mit
  `treatmentDayUID`, `invoiceUID` (FK auf `Invoices`, RESTRICT), `treatmentDate`, dazu
  `UNIQUE (invoiceUID, treatmentDate)` — derselbe Tag zweimal ist kein Datum, sondern ein Vertipper.
- Datenmigration: für jede vorhandene Rechnung eine Zeile aus ihrem heutigen `treatmentDate`,
  gelöschte eingeschlossen (wie in 012). Die Kindtabelle ist damit von Anfang an die _vollständige_
  Liste, nicht nur „die weiteren Tage" — sonst gäbe es überall einen Sonderfall für den ersten.
- `Invoices.treatmentDate` bleibt und bleibt NOT NULL: der führende Tag und der Anker für alle
  `YEAR()`-Auswertungen. Die API hält ihn bei jedem Schreiben auf dem frühesten Tag, damit „erster"
  und „frühester" nicht auseinanderlaufen. Der gespiegelte Wert ist hier unbedenklich, anders als bei
  der Kontoverbindung in 012: durch die Ein-Jahres-Regel liefert jeder Tag dasselbe `YEAR()`.
- Regel „alle Tage im selben Kalenderjahr" in der API beim Anlegen und Ändern, mit deutscher
  Fehlermeldung, die auf das Aufteilen in eine zweite Rechnung für das andere Jahr hinweist.
- `invoices.ts`: Tage mit der Rechnung lesen, beim Schreiben transaktional ersetzen, im DTO als
  `treatmentDates: string[]` (sortiert) führen. `treatmentDate` bleibt im DTO als erster Eintrag.
- Papierkorb: **nichts zu registrieren.** `purgeEntry` leitet die mitzulöschenden Link-Tabellen aus
  den Fremdschlüsseln der `information_schema` ab und räumt RESTRICT-Links, die nicht selbst Entität
  sind — die neue Tabelle fällt genau darunter. Im Trash-Integrationstest nachweisen statt annehmen.
- Tests: Anlegen mit mehreren Tagen, Ändern, Ablehnung bei fremdem Jahr, Hard-Delete.

#### 41b — UI

- `InvoiceFormDialog`: „Behandlungsdatum" bleibt als erster Tag Pflicht, darunter „Weitere
  Behandlungstage" als wiederholbare Datumszeilen mit Hinzufügen/Entfernen, alle optional. Beim
  Speichern werden die Tage sortiert, der früheste wird `treatmentDate`. Die Jahresprüfung schon im
  Dialog, mit derselben Formulierung wie die API.
- `InvoiceDetailDialog`: die Tage anzeigen, bei mehreren den Zeitraum.
- `InvoiceWorkspaceView` und `InvoicePickerView`: in der Behandlungsspalte den Zeitraum
  (`03.02.–17.02.2020`) statt eines einzelnen Datums, sobald es mehrere sind.
- `eligibility.ts`, `treatmentPeriod()`: Minimum und Maximum über **alle** Tage bilden, nicht nur
  über `treatmentDate`. Sonst beurteilt der Einreichen-Dialog die Police an einem zu kurzen
  Zeitraum — der einzige Ort, an dem die weiteren Tage fachlich wirken. `eligibility.spec.ts`
  entsprechend erweitern.
- Die a11y-Tests, die Rechnungs-Fixtures bauen, ziehen das neue Feld nach.

### Slice 42 — Nicht gedeckte Rechnungen

**Die halbe Miete steht schon.** Der Dialog „Nicht erstattungsfähig markieren" (`ExclusionDialog`)
setzt eine Markierung samt Notiz, `InvoiceExclusions` hält sie, und der Erstattungsoptimierer rechnet
so markierte Rechnungen bereits aus `eligibleCosts` und aus der Selbstbeteiligung heraus; sind sie
bei allen Policen markiert, steht die Rechnung auf `not-reimbursable`. Es fehlt nur genau **eine**
Markierung statt einer je Police.

Entschieden (Autor, 2026-09-28): **ein eigenes Kennzeichen an der Rechnung**, nicht ein Sammelschreiben
der vorhandenen Policen-Markierungen. Eine später angelegte Police wäre sonst nicht erfasst, und dort
zählte die Rechnung wieder in die Selbstbeteiligung — „wird niemals eingereicht" ist eine Eigenschaft
der Rechnung, nicht eines Paares aus Rechnung und Police.

- Migration (Nummer im Anschluss an 41a): `notCovered TINYINT(1) NOT NULL DEFAULT 0` und
  `notCoveredReason VARCHAR(255) DEFAULT NULL` an `Invoices`. `down` nimmt beide wieder weg, mit
  `ALGORITHM=COPY` — die Lehre aus 012 zum reservierten Zeilenplatz.
- API: Felder im DTO und beim Anlegen/Ändern. Die Begründung ist Pflicht, sobald das Kennzeichen
  gesetzt ist — sie ist der ganze Zweck der Markierung. Das Einreichen einer so markierten Rechnung
  wird abgelehnt; der Wächter passt in die Reihe in `submissions.ts` (Zeile 78–106), wo „unbekannt",
  „schon eingereicht" und „schon abgerechnet" bereits beieinanderstehen.
- Optimierer: `OptimizerInvoice` bekommt `notCovered` und behandelt es wie „bei jeder Police
  ausgeschlossen". Damit fällt die Gesamtempfehlung von selbst auf das vorhandene
  `not-reimbursable` — kein neuer Status, keine neue Anzeige-Logik.
- UI: Schalter samt Begründung in der Rechnungsmaske und in der Anzeigemaske; im Arbeitsbereich ein
  Kennzeichen in der Zeile, die Einreichen-Aktion entfällt für sie.
- Tests: Optimierer (eine nicht gedeckte Rechnung verschiebt die Selbstbeteiligung nicht), API
  (Begründung verlangt, Einreichen abgelehnt).

### Slice 43 — Zahlungsdatum bei Direktzahlung

Bei Direktzahlung sollen Zahlungsziel und Zahlungsdatum automatisch das Rechnungsdatum bekommen.

**Die Regel gehört in die API, nicht ins Formular.** Beide Wege schreiben `directPayment`: die
Rechnungsmaske (`InvoiceFormDialog`, die die beiden Felder heute ausdrücklich auf `null` setzt) und
die Anzeigemaske (`InvoiceDetailDialog`, die `transferUntilDate` und `transferDate` einzeln
bearbeitbar hält). Läge die Regel nur im Formular, liefen die beiden auseinander.

- `invoices.ts`: Beim Anlegen und Ändern gilt — ist `directPayment` gesetzt, bekommen
  `transferUntilDate` und `transferDate` das Rechnungsdatum. Damit ist die Rechnung sofort als
  bezahlt geführt, was der Sache entspricht: Sie wurde ja bar beglichen.
- `InvoiceFormDialog`: die Zeile, die die beiden Felder bei Direktzahlung leert, entfällt.
- `InvoiceDetailDialog`: Der Watcher auf `values.directPayment` leert heute schon
  Abrechnungsdienstleister und Verwendungszweck, wenn umgeschaltet wird — dort gehören die beiden
  Daten dazu. Die Felder bleiben gesperrt, solange Direktzahlung an ist.
- Der GiroCode verschwindet dadurch nicht doppelt: `showQr` hängt ohnehin schon an
  `!directPayment`, das gesetzte `transferDate` bestätigt es nur.
- Test: Anlegen und Ändern mit Direktzahlung setzen beide Daten; wird sie abgewählt, sind sie wieder
  frei.

### Scheibe 43a — Nicht vollständig erstattete Rechnungen

issues.md 0.12.0-6, beim Arbeiten mit 0.12.0 dazugekommen und auf Wunsch des Autors vor Scheibe 44
gezogen: Führen tarifliche Eigenbeteiligung oder Selbstbeteiligung dazu, dass nicht die volle
Rechnungssumme ersetzt wurde, soll die Erstattungssumme in der Übersicht auffallen. **Rein in der
Oberfläche** — `reimbursedTotal`, `remainingAmount` und `workflowStatus` stehen im DTO schon.

Zwei Stufen, vom Autor entschieden (2026-09-28):

- **rot** bei `abgerechnet`/`erledigt` mit Restbetrag: der Fall ist abgeschlossen, von Hand „als
  abgerechnet markiert", und was bleibt, ist Eigenanteil.
- **orange** bei `teilabgerechnet`: eine Leistungsabrechnung ist da, aber es kann noch etwas kommen
  — genau die Lage, in der der Optimierer eine zweite Police vorschlägt.
- `offen` und `eingereicht` bleiben unauffällig; dort ist die Null keine Nachricht. Eine nicht
  gedeckte Rechnung steht auf `offen` und ist damit von selbst nicht betroffen.

Die Regel als reines Modul mit Test (`reimbursement-gap.ts`, wie `not-covered.ts` daneben), die
Farbe als Token neben `--eu-color-error-fg`, beide Paarungen in `CONTRAST.md` nachgerechnet. Farbe
allein trägt keine Bedeutung: derselbe Satz steht im Titel und für Vorleseprogramme in der Zelle.

### Slice 44 — Konten je Leistungserbringer, Rechnungen je Dienstleister

**Merkposten, noch nicht geplant** (Aufnahme auf Anweisung des Autors, 2026-09-28): Die Detailplanung
kommt, wenn Slice 43 steht — hier stehen nur die beiden Punkte und die Frage, die sie aufwerfen.

- **Konten je Leistungserbringer** (issues.md 0.12.0-4): Es gibt zwei Arten von
  Abrechnungsdienstleistern — solche mit einem eigenen Konto für alle ihre Leistungserbringer und
  solche, die je Leistungserbringer auf ein anderes Konto verweisen. Heute hängt die Kontoverbindung
  allein am Dienstleister (`AgencyBankAccounts`, Slice 38), die zweite Art hat also keinen Platz.
- **Zu klären, bevor irgendetwas gebaut wird:** der Autor stellt in derselben Notiz die Umkehrung zur
  Debatte — das Konto am Leistungserbringer zu führen und den Dienstleister nur als Vorbelegung
  wirken zu lassen. Das rührt an den Grund, aus dem es Abrechnungsdienstleister überhaupt gibt
  (Vermeidung doppelter Pflege), und entscheidet über die Form der ganzen Scheibe.
- **Rechnungsliste je Abrechnungsdienstleister** (issues.md 0.12.0-5): Es fehlt die Sicht darauf,
  welche Rechnungen über einen bestimmten Dienstleister laufen. Beim Schreiben der Notiz zu 0.12.0-4
  aufgefallen und vermutlich der kleinere Teil.
