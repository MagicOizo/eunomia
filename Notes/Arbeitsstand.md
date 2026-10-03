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
- [x] **3 — Ein Name für die Kontoverbindung.** CR-20 (★). Mechanisch, quer durch beide Apps,
      ohne Migration. Muss vor den größeren Umbauten liegen, sonst kollidiert sie mit ihnen.
      Umgesetzt mit v0.16.0-slice.4 (Slice 53) — als `paymentDetail` statt `bankAccount`, auf
      Wunsch des Autors ein möglichst anderes Wort. Die Spalten und API-Felder bleiben; das
      Vokabular steht jetzt in §2.8 des Plans.
- [x] **4 — Die Helfer durchsetzen.** CR-08, CR-09, CR-10, CR-11, CR-23 (★).
      Umgesetzt mit v0.16.0-slice.5 (Slice 54). Zwei Dinge gingen über den Review hinaus: der Review
      hat bei CR-10 nur die Routen gezählt — `setGlobalRoles` und `setAccountRoles` in
      `auth/admin-repository.ts` rollten dieselbe Transaktion auch von Hand, sie gingen mit, und
      jetzt steht `getConnection()` nur noch in `db/transaction.ts`. Und `ERROR_CODES.INVALID_YEAR`
      hatte genau einen Werfer, die handgeschriebene Jahresprüfung aus CR-11; mit dem zod-Schema ist
      der Code tot und samt seinem deutschen Satz entfallen. `requireEntityAccount` aus CR-36 hat
      damit Aufrufer.
- [x] **5 — Das geteilte Paket.** CR-01, CR-02, CR-03, CR-04 (★), CR-05 (★).
      Umgesetzt mit v0.16.0-slice.6 (Slice 55). Das Paket heißt jetzt `@eunomia/shared` statt
      `shared-types`, weil es Regeln trägt und nicht nur Typen; `euro()` heißt im Web
      `germanMoney()` wie sein Zwilling. Zwei Dinge gingen über den Review hinaus: die Fehlersatz-Tabelle des Webs
      ist jetzt auf die Fehlercode-Liste getypt (ein Code ohne deutschen Satz bricht den Build), und
      fünf Datumsfelder nahmen ihr „heute“ aus `toISOString()`, also den UTC-Tag — in Berlin bis
      2 Uhr morgens der Vortag. Sie nehmen es jetzt aus `todayIso()`, demselben Tag, den die Ampel
      liest. Nicht ins Paket gewandert sind die ~20 nachgeschriebenen DTO-Formen; sie bleiben, wie
      der Review empfiehlt, Material für nach 1.0.

### Block II — Sitzung und Sichtbarkeit (Release 0.17.0)

- [x] **6 — Der Client hält die Sitzung.** CR-24, CR-25. **Vor Scheibe 7.**
      Umgesetzt mit v0.17.0-slice.1 (Slice 56). Der Single-Flight allein deckt nur die gleichzeitige
      401 ab; eine 401, die eintrifft, nachdem ein Geschwister den Token schon erneuert hat, hätte
      weiter eine zweite Rotation gestartet. `apiFetch` merkt sich darum den Token, mit dem es
      losgelaufen ist, und wiederholt bei geändertem Token direkt — heute unsichtbar, aber Scheibe 7
      baut auf das Zählen der Rotationen einen Alarm. `lib/api.ts` und `stores/auth.ts` hatten
      keinen Test; beide haben jetzt einen, und der Fehler aus CR-24 ist als Regressionstest
      festgehalten (gegen den alten Stand rot geprüft).
- [x] **7 — Anmeldung und Sitzungen.** SEC-05, SEC-06, SEC-07, SEC-08.
      Umgesetzt mit v0.17.0-slice.2 (Slice 57). Der eigene Passwortwechsel bekam auf Wunsch des
      Autors eine eigene Seite (`/profile`, „Mein Konto") statt eines Dialogs, und das eigene
      Passwort lässt sich in der Nutzerverwaltung nicht mehr setzen — es wird immer mit dem alten
      bestätigt. Drei Dinge gingen über den Review hinaus: (1) SEC-05/06 und SEC-07 stießen
      zusammen — eine absichtlich beendete Sitzung darf nicht widerrufen, sondern muss gelöscht
      werden, sonst liest die Reuse-Erkennung die Rückkehr des anderen Browsers als Diebstahl und
      beendet genau die Sitzung, die der Wechsel verschonen sollte (rot geprüft). (2) Das Aufräumen
      hängt nicht am Erinnerungs-Tick, der bei abgeschalteten Erinnerungen sofort aussteigt,
      sondern an einem eigenen Timer. (3) Ein neuer Fehlercode `INVALID_CURRENT_PASSWORD` antwortet
      403 statt 401, damit `apiFetch` nicht eine sinnlose Rotation darauf verwendet.
- [x] **8 — Kontotrennung an einem Ort.** CR-07, SEC-03, SEC-04.
      Umgesetzt mit v0.17.0-slice.3 (Slice 58). SEC-04 ist mit einer Festlegung geschlossen statt mit
      Code, auf Wunsch des Autors: `MANAGE_TRASH` ist ein instanzweites Administratorrecht, der
      Papierkorb bleibt kontoübergreifend und steht jetzt als benannte Ausnahme zu I-2 in §2.4 des
      Plans — vier der elf Papierkorb-Entitäten haben überhaupt kein Konto. Der Helfer aus CR-07
      (`accountFilter`) gibt die vorhandene `Filter`-Form zurück, bei globalem Grant mit `TRUE` und
      bei keinem Grant `null`; damit sind aus drei Fällen zwei geworden und alle sieben Stellen
      lesen dieselben drei Zeilen. Zwei Dinge gingen über den Review hinaus: die Vorschau der
      Erinnerungen zählt die zurückgehaltenen Empfänger (`previewHidden`) statt sie zu verschweigen,
      damit eine fehlende Mail nicht wie ein Fehler aussieht; und `/submissions`, `/allocations` und
      `/billings` hatten überhaupt keine Zusicherung zur Kontotrennung — die sieben Listen haben
      jetzt einen gemeinsamen Test, samt der Anmeldung ohne jeden Grant.

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
