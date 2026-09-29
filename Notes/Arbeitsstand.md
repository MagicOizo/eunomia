# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Die zwei Reviews auf dem Weg zu 1.0.0

Zwei Prüfungen nacheinander, dann die Befunde in Scheiben abarbeiten, dann 1.0.0.

- [x] **Meilenstein A — Sicherheits-Review.** 17 Befunde, dokumentiert in
      [Sicherheits-Review.md](Sicherheits-Review.md) und als Punkte in `issues.md` unter
      `0.16.0-slice.1`. Nichts heute Ausnutzbares, also keine vorgezogene Hotfix-Scheibe.
- [x] **Meilenstein B — Code-Review.** 37 Befunde, dokumentiert in [Code-Review.md](Code-Review.md)
      und als Punkte in `issues.md` unter `0.16.0-slice.2`. Je Befund Aufwand, Risiko des Eingriffs
      und eine Empfehlung „vor 1.0" / „nach 1.0" (21 vor, 16 nach) — die Auswahl trifft der Autor.
      Ein einziger Befund ist für einen Nutzer heute spürbar (CR-24, der Sitzungsabbruch bei
      parallelen Anfragen); alles andere ist Wartbarkeit.
- [ ] **Scheiben schneiden.** Aus den ausgewählten Befunden beider Reviews, hier als Liste.
      Ein Vorschlag für die Gruppierung steht in Abschnitt 7 des Code-Reviews; die Reihenfolge
      zwischen SEC- und CR-Befunden ist dort mitgedacht (CR-15 vor SEC-01/SEC-11, CR-24 vor SEC-07,
      CR-07 mit SEC-04, CR-33 mit SEC-17).
- [ ] **Delta-Nachprüfung** der Invarianten I-1 bis I-13 auf allem, was Meilenstein B angefasst hat
      (Abschnitt 8 des Sicherheits-Reviews).
- [ ] **1.0.0 bumpen.**
