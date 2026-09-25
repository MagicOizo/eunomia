# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit v0.12.0-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Findings aus der Produktion 0.9.0 → 0.12.0

Dreizehn Punkte aus der Produktionsnutzung, erfasst in [issues.md](issues.md), geplant als Slices 33–39
in [eunomia-plan.md](eunomia-plan.md). 0.11.0 ist davor als volles Release abgeschlossen.

| ✓ | Slice | Inhalt | issues.md | Version |
| --- | --- | --- | --- | --- |
| ☑ | 33 | Eingabe-Politur: Tab im Picker, Datum einfügen | 1, 11 | 0.12.0-slice.1 |
| ☑ | 33a | Dialoge öffnen oben, nicht im alten Scrollzustand | 13 | 0.12.0-slice.2 |
| ☑ | 34 | Erstattung und Belegnummer nachträglich ändern | 9, 8 | 0.12.0-slice.3 |
| ☑ | 35 | Police-Auswahl im Versicherungszeitraum | 12 | 0.12.0-slice.4 |
| ☑ | 36 | Suchen und Finden | 2, 3, 6 | 0.12.0-slice.5 |
| ☑ | 37a | Abrechnung über mehrere Einreichungen — Modell + API | 7 | 0.12.0-slice.6 |
| ☐ | 37b | Abrechnung über mehrere Einreichungen — UI | 7 | |
| ☐ | 38 | Kontoverbindungen mit Gültigkeitsdatum, BIC und Empfänger | 5, 4 | |
| ☐ | 39 | Papierkorb | 10 | |

Mitgenommen in Slice 33, weil es dieselbe Entscheidung ist — der Backlog aus Slice 32: der im Picker
stehenbleibende Suchtext (gehört mit der Regel „Fokus öffnet die Liste" zusammen) und der fehlende
zugängliche Name des Schalters „Direkt-/Barzahlung" in der Maske.
