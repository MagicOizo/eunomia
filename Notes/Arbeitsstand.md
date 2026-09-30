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
      und eine Empfehlung. Ein einziger Befund ist für einen Nutzer heute spürbar (CR-24, der
      Sitzungsabbruch bei parallelen Anfragen); alles andere ist Wartbarkeit.
- [x] **Scheiben schneiden.** Alle 54 Befunde (17 SEC, 37 CR) werden vor 1.0.0 umgesetzt —
      es gibt keine Frist, auf die das Release zuläuft. 18 Scheiben in vier Blöcken, unten.
- [ ] **Delta-Nachprüfung** der Invarianten I-1 bis I-13 auf allem, was die Scheiben angefasst haben
      (Abschnitt 8 des Sicherheits-Reviews).
- [ ] **1.0.0 bumpen.**

## Die 18 Scheiben

(★) sind die Befunde, die der Autor am 29.09. als besonders behebenswert benannt hat. Die
Reihenfolge der Blöcke ist bindend, die innerhalb eines Blocks nicht — außer wo eine Scheibe
ausdrücklich vor einer anderen steht.

### Block I — Ordnung (Release 0.16.0)

- [x] **1 — Tote Pfade und Namen im Kleinen.** CR-28, CR-35, CR-36, CR-31 (★), CR-21.
      Kein Verhalten ändert sich; danach ist die Liste der toten Pfade leer.
      Umgesetzt mit v0.16.0-slice.2 (Slice 51). Offen geblieben ist allein `requireEntityAccount`
      aus CR-36 — es bekommt in Scheibe 4 Aufrufer statt gelöscht zu werden.
- [x] **2 — Kleine Korrekturen an der API.** CR-06, CR-12, CR-13, CR-14, CR-22 (★), SEC-12, SEC-16.
      Umgesetzt mit v0.16.0-slice.3 (Slice 52).
- [ ] **3 — Ein Name für die Kontoverbindung.** CR-20 (★). Mechanisch, quer durch beide Apps,
      ohne Migration. Muss vor den größeren Umbauten liegen, sonst kollidiert sie mit ihnen.
- [ ] **4 — Die Helfer durchsetzen.** CR-08, CR-09, CR-10, CR-11, CR-23 (★).
- [ ] **5 — Das geteilte Paket.** CR-01, CR-02, CR-03, CR-04 (★), CR-05 (★).

### Block II — Sitzung und Sichtbarkeit (Release 0.17.0)

- [ ] **6 — Der Client hält die Sitzung.** CR-24, CR-25. **Vor Scheibe 7.**
- [ ] **7 — Anmeldung und Sitzungen.** SEC-05, SEC-06, SEC-07, SEC-08.
- [ ] **8 — Kontotrennung an einem Ort.** CR-07, SEC-03, SEC-04.

### Block III — Struktur (Release 0.18.0)

- [ ] **9 — `invoices.ts` schneiden.** CR-15. **Vor Scheibe 10.**
- [ ] **10 — Grenzen an den Eingängen.** SEC-01, SEC-11, CR-18.
- [ ] **11 — Dialoge und große Ansichten.** CR-29 (★), CR-30 (★). Bereitet Scheibe 12 vor.
- [ ] **12 — Die Oberfläche lernt das Rechtemodell.** CR-26.
- [ ] **13 — Weniger Fragen an die Datenbank.** CR-16, CR-17, CR-27.
- [ ] **14 — Typen statt Zusicherungen.** CR-19.

### Block IV — Betrieb und Nachweis (Release 0.19.0)

- [ ] **15 — Header, Image, Abhängigkeiten.** SEC-02, SEC-10, SEC-13, SEC-14, CR-37.
- [ ] **16 — Prüfbar statt dokumentiert.** SEC-17, CR-32, CR-33, CR-34.
- [ ] **17 — Audit-Trail.** SEC-09.
- [ ] **18 — Aufbewahrung, Löschung, Auskunft.** SEC-15.
