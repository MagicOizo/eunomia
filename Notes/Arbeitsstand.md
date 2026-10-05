# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Die letzten sieben Befunde vor 1.0.0

Das vorige Paket („Die zwei Reviews auf dem Weg zu 1.0.0", Scheiben 51–69) ist durchgearbeitet; wo
es nachzulesen ist, steht in [eunomia-plan.md](eunomia-plan.md) unter „Slices 52–69 — Die
Review-Arbeit". Offen sind die sieben Punkte, die in [issues.md](issues.md) unter `0.15.0`,
`0.18.0` und `0.19.0` keinen Vermerk tragen. Sie fallen alle vor 1.0.0.

Vier Entscheidungen des Autors (04.10.2026) prägen den Schnitt: die Review-Arbeit bekommt jetzt ihr
volles Release **0.19.0** und die sieben Befunde laufen als **0.20.0-slice.N**; der Export verlangt
zusätzlich `VIEW_INVOICES` und `VIEW_CONTRACTS`; die typischen Zahlungsziele bleiben ein Vorschlag
in der Oberfläche ohne Datenmodell; und das Dashboard **ersetzt** die Bereichs-Karten der
Startseite.

Die Reihenfolge ist bindend: Scheibe 1 steht vor dem Tag `v0.19.0`, weil genau ein Tag ohne
Bindestrich dreimal unbemerkt das Docker-`:latest` verschoben hat. 5a steht vor 5b.

- [x] **1 — Die letzten drei Befunde der Review-Arbeit** (`0.19.0-slice.6`). Die Tag-Prüfung vor dem
      Push (`issues.md` 0.18.0-1), das Export-Recht (0.19.0-1, SEC-Review §8 B-3) und die zwei
      flackernden Web-Tests (0.19.0-2). Danach ist von der Review-Arbeit nichts offen.
      Umgesetzt mit v0.19.0-slice.6 (Slice 70). Drei Dinge gingen über die Punkte hinaus: (1) `scripts/` war
      von keinem Test-Glob erfasst — das Skript, das jedes Release bewacht, war nie außerhalb eines
      Releases gelaufen; es gibt jetzt `npm run test:scripts` und `scripts/version.test.ts`, und
      `check` wirft statt `process.exit` zu rufen, damit es überhaupt prüfbar ist. (2) Die
      Berechtigung einer `rowActions`-Aktion war nicht ausdrückbar (`RowActionConfig` kannte kein
      Recht), so dass der Export-Knopf ohne die Rechte ins Leere gelaufen wäre statt deaktiviert zu
      sein — die CR-26-Regel gilt jetzt auch für Zeilen-Aktionen. (3) Die Ursache des Flackerns ist
      gefunden und nicht umgangen: `EuDialog` schiebt nach dem Öffnen mit `nextTick` ein `focus()`
      auf das erste Feld im Körper nach — bei `SubmitDialog` den Schalter —, und landet dieser
      Fokus mitten in einem Fall, schließt er die gerade geöffnete Liste.
      Gewarnt sei vor der Stelle, die zwei Reviews überlebt hat: `clickFooter` zuckte bei einem
      fehlenden Knopf nur mit den Achseln (`?.trigger`). Daraus wurde eine irreführende Zusicherung
      drei Zeilen später — „nichts emittiert, keine Fehlermeldung", weil nichts geklickt worden war.
      Ein Helfer, der stillschweigend nichts tut, verbirgt genau den Befund, den er zeigen müsste.
- [x] **Release 0.19.0.** Eigener Commit, keine Slice-Nummer. Der Abschnitt im `CHANGELOG.md` zieht
      die Scheiben 1–6 zusammen; Tag und Push macht der Autor
      (`git tag -a v0.19.0 -m "v0.19.0"`).
- [x] **2 — Eingabe-Politur** (`0.20.0-slice.1`). IBAN mit Leerzeichen (0.15.0-1) und typische
      Zahlungsziele (0.15.0-2). Umgesetzt mit v0.20.0-slice.1 (Slice 71). Beide Punkte sind an einer
      Stelle gelandet, an der sie weiterwirken: die IBAN-Schreibweise wird in der **Prüfung** abgeräumt
      (`ibanField`/`bicField`), nicht im Dialog, und das Zahlungsziel bekommt mit `EuSuggestedDateField`
      ein Datumsfeld mit Vorschlagsliste, das jedes andere Datum auch haben kann.
      Zwei Dinge sind beim Nachfahren am laufenden Programm aufgefallen und stehen deshalb in
      `issues.md`: ein `<input type="date">` verbraucht Tab zuerst für seine drei eigenen Felder, die
      Liste ist also der vierte Tab-Druck (der erste außerhalb des Feldes) — die Entscheidung „Tab
      statt Pfeiltasten" bleibt richtig, aber sie heißt nicht „ein Tastendruck". Und die IBAN-Spalte
      der Liste war die letzte Stelle, die die Nummer roh druckte, während Maske und Picker sie
      gruppieren; eine Zeile, aber genau die Inkonsequenz, von der der Punkt sprach.
      Gewarnt sei vor `z.preprocess`: dass `bicField.nullish()` „kein BIC" nicht plötzlich als
      Fehler liest, hängt daran, dass zod Nullable/Optional **vor** dem Effect auswertet. Das ist im
      Unit-Test festgenagelt, damit es beim nächsten zod-Sprung nicht stillschweigend kippt.
- [x] **3 — Abgerechnet schon bei der Zuordnung** (`0.20.0-slice.2`). 0.15.0-4.
      Umgesetzt mit v0.20.0-slice.2 (Slice 72). Ein Schalter je Karte im Zuordnen-Dialog; die
      Markierung reist mit ihrem Eintrag und wird in derselben Transaktion geschrieben wie die
      Beträge. Ist das Offene gedeckt, steht der Schalter an und gesperrt und wird nicht geschickt.
      Gewarnt sei vor der README: ihre Endpunkt-Tabelle nannte `POST /api/v1/allocations`, einen
      Weg, den es seit dem Umbau auf billing-gebundene Buchung nicht mehr gibt — nachgezogen, aber
      die Tabelle ist von keinem Test gedeckt und kann wieder still veralten.
- [x] **4 — Leistungsabrechnungen finden** (`0.20.0-slice.3`). 0.15.0-5; reines Web, die API kann es
      schon. Umgesetzt mit v0.20.0-slice.3 (Slice 73). Die Suche sitzt über den Vertrags-Kacheln von
      `/billings`, gebaut wie die Rechnungssuche; Freitext + „Nur ohne Zuordnung“, Treffer führt
      auf die Policen-Seite mit markierter Zeile, der Zurück-Pfeil holt die Suche zurück.
      Der Schalter hieß an zwei Stellen „unverknüpft“ — jetzt überall „Nur ohne Zuordnung“.
      Gewarnt sei vor den Dev-Daten: der Seed enthält **keine** Abrechnung ohne Zuordnung, der
      Schalter zeigt dort also nur „keine“. Zum Nachfahren liegen in den Dev-Daten jetzt
      `LA-2026-901` (PKV-2020-0001) und `LA-2026-902` (ZV-2022-0042), angelegt über die Oberfläche;
      `npm run dev:reset` räumt sie wieder ab.
- [x] **5a — Das Dashboard: die Zahlen** (`0.20.0-slice.4`). 0.15.0-3, API-Hälfte.
      Umgesetzt mit v0.20.0-slice.4 (Slice 74). `GET /api/v1/dashboard` — Gesamt seit der ersten
      Rechnung, Jahresreihe nach Behandlungsjahr (inkl. reiner Bonus-Jahre), je Person unbezahlt
      (Ampel-Regel der Erinnerungen, deren Zeitzone) und Erstattungsweg offen, je laufender Police
      Rest-Selbstbeteiligung und Bonus — aus `loadReimbursementPlan`, dem herausgezogenen Lader des
      Erstattungsplans, damit beide dasselbe sagen. Jeder Block unter seinem eigenen Recht; Policen
      je Person nur mit `VIEW_INVOICES` **und** `VIEW_CONTRACTS`.
      Für 5b: die Antwort hat `since`, `totals`, `years[]` (aufsteigend, mit `bonusPaid`) und
      `accounts[]` mit `payment`, `workflow`, `year`, `policies[]`; Beträge in Euro als Zahl.
      Gewarnt sei vor der README: sie nannte `GET /contracts/:uid/reimbursement-analysis`, das es
      nicht gibt — nachgezogen auf den Erstattungsplan; wie die Endpunkt-Tabelle aus Slice 72 von
      keinem Test gedeckt.
- [x] **5b — Das Dashboard: die Seite** (`0.20.0-slice.5`). 0.15.0-3, Web-Hälfte.
      Umgesetzt mit v0.20.0-slice.5 (Slice 75). Die Startseite zeigt Kacheln (jede nur mit ihrem
      Recht), eine Jahresgrafik als eigenes Inline-SVG (Erstattet + Eigenanteil gestapelt, Bonus
      daneben; Tooltip beim Überfahren, dieselben Zahlen als Tabelle darunter) und je Person eine
      Karte mit Zahlungsampel, laufenden Erstattungen und den Policen des Jahres. Die
      Bereichs-Karten sind weg. Die Grafik hat eigene Farb-Token `--eu-color-chart-1..3`, nicht die
      Status-Skala; das helle Aqua liegt unter 3:1 auf Weiß, deshalb gibt es immer Legende und
      Tabelle (`CONTRAST.md`).
      Über den Punkt hinaus: die Dashboard-Antwort trug `pendingClaims`, `tiersInherited` und
      `hasTerms` nicht — ohne sie hätte der Bonus „Sicher“ gesagt, während eine Einreichung noch
      unbeantwortet ist. Die drei reichen jetzt aus dem Plan durch, und `bonusView` nimmt nur noch,
      was es braucht.
      Gewarnt sei vor der schmalen Ansicht: bei mehr Jahren als in die Breite passen, scrollt die
      Grafik in ihrer Karte und öffnet bei den neuesten Jahren — die Achsenbeschriftung links ist
      dann aus dem Bild. Die Tabelle trägt dieselben Zahlen.
- [ ] **Release 0.20.0**, danach die Entscheidung zu 1.0.0 (§2.9: eine Entscheidung des Autors am
      Produktionsstand).
