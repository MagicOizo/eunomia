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

- [ ] **1 — Die letzten drei Befunde der Review-Arbeit** (`0.19.0-slice.6`). Die Tag-Prüfung vor dem
      Push (`issues.md` 0.18.0-1), das Export-Recht (0.19.0-1, SEC-Review §8 B-3) und die zwei
      flackernden Web-Tests (0.19.0-2). Danach ist von der Review-Arbeit nichts offen.
- [ ] **Release 0.19.0.** Eigener Commit, keine Slice-Nummer.
- [ ] **2 — Eingabe-Politur** (`0.20.0-slice.1`). IBAN mit Leerzeichen (0.15.0-1) und typische
      Zahlungsziele (0.15.0-2).
- [ ] **3 — Abgerechnet schon bei der Zuordnung** (`0.20.0-slice.2`). 0.15.0-4.
- [ ] **4 — Leistungsabrechnungen finden** (`0.20.0-slice.3`). 0.15.0-5; reines Web, die API kann es
      schon.
- [ ] **5a — Das Dashboard: die Zahlen** (`0.20.0-slice.4`). 0.15.0-3, API-Hälfte.
- [ ] **5b — Das Dashboard: die Seite** (`0.20.0-slice.5`). 0.15.0-3, Web-Hälfte.
- [ ] **Release 0.20.0**, danach die Entscheidung zu 1.0.0 (§2.9: eine Entscheidung des Autors am
      Produktionsstand).
