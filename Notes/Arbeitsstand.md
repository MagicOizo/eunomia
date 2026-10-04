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

- [x] **9 — `invoices.ts` schneiden.** CR-15. **Vor Scheibe 10.**
      Umgesetzt mit v0.18.0-slice.1 (Slice 59). Flach geschnitten statt ins Unterverzeichnis, auf
      Entscheidung des Autors: `invoice-rules.ts` (177 Zeilen) und `invoice-queries.ts` (381) neben
      `invoices.ts` (434, nur noch Schemata und Router) — ein Unterverzeichnis gäbe es in
      `src/domain/` sonst nirgends, und `invoice-status.ts` ist bereits genau so ein
      herausgelöstes Geschwister. Die Abhängigkeit läuft in eine Richtung:
      Router → Queries → Regeln. Zwei Dinge gingen über den Review hinaus: `invoicesTable.columns`
      und `INVOICE_COLUMNS` standen zweimal untereinander in derselben Datei und mussten von Hand
      in Schritt gehalten werden — die zweite Liste leitet sich jetzt aus der ersten ab (der
      erzeugte String wurde gegen den alten verglichen, zeichengleich); und `notCoveredOf` ist bei
      den Queries gelandet statt bei den Regeln, weil es eine `InvoiceRow` liest und
      `invoice-rules.ts` sonst nicht mehr frei von der Datenbankschicht wäre. Der Ertrag ist
      `invoice-rules.test.ts`: 33 Fälle ohne Datenbank, die ersten Tests im Projekt für diese fünf
      Regeln. Kein Integrationstest musste angefasst werden.
- [x] **10 — Grenzen an den Eingängen.** SEC-01, SEC-11, CR-18.
      Umgesetzt mit v0.18.0-slice.2 (Slice 60). Die Bestandsdaten gehen auf Entscheidung des
      Autors nicht in die Oberfläche, sondern weg: Migration 017 setzt jeden Dokument-Link, dem ein
      Browser nicht folgen darf, auf NULL und nennt dabei die betroffenen Datensätze — ein
      ungültiger Link hat in der Produktion nichts verloren. Der Prüfer `isHttpUrl` steht in
      `@eunomia/shared` und wird von den beiden Schemata, der Migration und den drei Senken im Web
      gelesen. Vier Dinge gingen über den Review hinaus: (1) `submissions.invoiceUIDs` hat der
      Review nicht gezählt, ist aber dieselbe Form und bekam dieselbe Grenze; (2) `setGlobalRoles`
      und `setAccountRoles` rollten die Schleife aus CR-18 ebenfalls — sie gingen mit, brauchten
      dafür aber eine eigene Auflösung von Rollen-UID zu Rollen-ID, weil das Bulk-Protokoll von
      `conn.batch` kein `INSERT … SELECT` trägt (Fehler 1295, rot gesehen); (3) ein `.refine()`
      meldet zod als `custom`, was im Web „Die Angabe … ist nicht zulässig“ ergab — ein
      `custom`-Befund liest jetzt das Format des Feldes, wo eines hinterlegt ist, und sonst weiter
      den allgemeinen Satz; (4) `insertManyRows` nimmt die Spalten als Vereinigung über alle
      Zeilen, nicht aus der ersten — sonst fiele eine Belegnummer, die nur der zweite Eintrag
      trägt, lautlos weg (als Test festgehalten). Offen geblieben ist die dritte Schreibweise aus
      CR-18 in `reminders/store.ts`: dort ist die eingefügte Zeile nicht der Rückgabewert, der
      Umbau wäre ein anderer Schnitt.
- [x] **11 — Dialoge und große Ansichten.** CR-29 (★), CR-30 (★). Bereitet Scheibe 12 vor.
      Umgesetzt mit v0.18.0-slice.3 (Slice 61). Alle 14 Dialoge auf einmal statt schrittweise, auf
      Entscheidung des Autors: eine zweite Form im Bestand hätte Scheibe 12 doppelte Arbeit gemacht.
      Drei Dinge gingen über den Review hinaus: (1) die Wirt-Seite bekam das Gegenstück
      (`useDialogAction()` — busy, Fehler, Schließen, Nachladen standen fünfzehnmal in acht Dateien
      von Hand); (2) `.eu-form`, `.eu-form__error` und `.eu-form__note` standen zeichengleich in 15
      Dateien und stehen jetzt in `global.css`; (3) `BillingFormDialog` schreibt selbst und hat
      beide Hälften bekommen. Ausdrücklich nicht umgestellt — je mit einem Satz im Code: die Lader,
      `ObjectionDialog` (busy je Zeile), `InvoiceDetailDialog.runBlock` (mehrere Fehlerkanäle, kein
      Schließen), `ProfileView` (kein Schließen, kein Nachladen) und das Füllen in
      `ResourceFormDialog`, das absichtlich auch bei geschlossenem Dialog läuft. Eine einzige
      Verhaltensänderung: ein Nicht-HTTP-Fehler heißt in `BillingsView` jetzt „Unerwarteter Fehler."
      statt „Aktion fehlgeschlagen.". `InvoiceDetailDialog` und `ContractDetailDialog` bleiben
      ungeteilt, wie der Review empfiehlt.
- [x] **12 — Die Oberfläche lernt das Rechtemodell.** CR-26.
      Umgesetzt mit v0.18.0-slice.4 (Slice 62). Vier Festlegungen des Autors prägen das Ergebnis:
      Aktionen ohne Recht bleiben sichtbar und deaktiviert, mit „Dazu fehlt dir die Berechtigung."
      als Hinweis; Anzeigemasken öffnen nur-lesend statt gar nicht; Konto-Auswahlen beim Anlegen
      zeigen nur verwaltbare Konten; und die zwölf Rechtenamen stehen samt der Einteilung
      instanzweit/kontobezogen in `@eunomia/shared`, die API liest sie von dort (25 Dateien). Die
      Regeln stehen jetzt in §2.4 des Plans. Drei Dinge gingen über den Review hinaus: (1) der
      Update-Status in der Fußzeile hing an `MANAGE_USERS`, sein Endpunkt verlangt aber
      `MANAGE_SETTINGS` — zwei Rollen, die ihn nie oder vergeblich abgefragt hätten; (2) der
      Nur-Lesen-Modus sitzt in `EuDetailMask` und wird an die Zeilen durchgereicht, die dabei
      gelernt haben, Datum, Betrag, Schalter und Relation ohne ihren Editor deutsch zu schreiben;
      (3) der Testlauf hat seither eine Festlegung — jeder Test ist ein globaler Administrator,
      solange er nichts anderes sagt. Von Hand geprüft: ein Nutzer mit der Rolle „Nutzer" an genau
      einem Konto sieht keinen System-Bereich, nur seinen Versicherten, kann dessen Rechnungen
      schreiben und dessen Stammdaten nur lesen; `/system/trash` und das Konto eines anderen führen
      auf die Startseite.
- [x] **13 — Weniger Fragen an die Datenbank.** CR-16, CR-17, CR-27.
      Umgesetzt mit v0.18.0-slice.5 (Slice 63). Zwei Festlegungen des Autors prägen das Ergebnis:
      die lesende Hälfte des Papierkorbs bekam ein eigenes Geschwister (`trash-tree.ts`; `trash.ts`
      schrumpft von 440 auf 274 Zeilen), und der Platzhalter-Helfer `placeholders()` wurde über
      alle 14 Bestandsstellen durchgesetzt statt nur an den neuen. Der Ertrag ist in Zahlen
      messbar: der Erstattungsplan kostet auf den Entwicklungsdaten 11 Abfragen statt 22, und zwei
      Integrationstests zählen die Abfragen mit einem `Proxy` um den Pool — eine zweite Police und
      zwei weitere Papierkorb-Einträge kosten keine einzige weitere. Vier Dinge gingen über den
      Review hinaus: (1) `termsForYear` ist ersatzlos entfallen, weil `termsInForce` dieselbe Frage
      schon als private Funktion in `bonus-timeline.ts` beantwortete — sie wurde nur exportiert und
      über die Zeile generisch gemacht; (2) `listTermsWithValidity` ist in eine Abfrage
      (`loadTermsWithTiers`) und eine reine Funktion (`withValidity`) zerfallen, womit die
      Detailroute `GET /contracts/:uid` die Konditionen einmal statt zweimal liest und der doppelte
      Cast aus CR-19 von selbst verschwindet (der Rest von CR-19 bleibt Scheibe 14); (3) `lib/group.ts`
      (`addTo`, `groupBy`) samt Test, weil die Gruppierung im Speicher die andere Hälfte jeder
      gebündelten Abfrage ist und viermal von Hand dastand; (4) `BATCH_OF` ist nicht mehr
      exportiert, weil der Löschstapel jetzt im Speicher gefiltert wird — und genau dort liegt die
      Falle, die festgehalten gehört: `DATE_FORMAT(…) = NULL` ist in SQL nie wahr, `null === null`
      im Speicher aber schon, also darf eine Zeile ohne `deletedAt` keinen Stapel bekommen. Die
      Zahl der Abfragen ist fest in der Zahl der Einträge, nicht in der Tiefe des Baums: eine
      Ebene mehr kostet weiter ihre Abfragen. Von Hand geprüft: alle elf Antworten der angefassten
      Endpunkte (Plan für drei Jahre, Policenliste, sechs Police-Details, die ganze
      Papierkorb-Seite) sind gegen die Entwicklungsdatenbank vor und nach dem Umbau zeichengleich;
      dazu Arbeitsbereich, Jahreswechsel, Erstattungsplan und Papierkorb im Browser.
- [x] **14 — Typen statt Zusicherungen.** CR-19.
      Umgesetzt mit v0.18.0-slice.6 (Slice 64). Weiter als der Review empfiehlt, auf Entscheidung
      des Autors: kein Helfer `rowAs<T>()`, sondern Typen an der Quelle, Enum-Spalten beim Lesen
      geprüft und die Settings-Kette mit. Von 45 Zusicherungen sind 11 geblieben, jede an einer
      Fremd-API-Grenze (Express `res.locals`, `promisify`, nodemailer, `require` der package.json,
      zod über `ZodObject<ZodRawShape>`, der Akkumulator in `getSettings`) und jede mit einem Satz,
      warum. Der Ertrag ist nicht die Zahl, sondern die Prüfung: die Spaltenliste einer Tabelle
      läuft gegen `keyof R`, ein Tippfehler darin und eine einseitig umbenannte Spalte brechen den
      Build (beides rot geprüft). Gewarnt sei vor der Stelle, an der der Zeilentyp hängt — er steht
      als Feld `row?: R` in der Beschreibung und nicht als `keyof R` in `columns`, weil `keyof`
      `CrudTable<R>` kontravariant macht und eine getypte Tabelle dann keine `CrudTable<Row>` mehr
      wäre; der Papierkorb hält alle elf in einer Liste. Vier Dinge gingen über den Review hinaus:
      (1) `present()` behält keine `Record<string, unknown>`-Annotation, sein DTO-Typ wird inferiert
      (`PresentedInvoice`), womit der Status-Cast in der Listenroute von selbst entfiel;
      (2) `isSqlError` ist aus `lib/error-handler.ts` exportiert, weil `trash.ts` denselben
      errno-Wächter nachgebaut hatte; (3) `nextTreatmentDays` hat eine Overload für den
      Anlege-Pfad, wo das Schema `treatmentDate` verpflichtend macht; (4) ein unbekanntes
      `contractKind` antwortet jetzt 500 mit greppbarem Log statt lautlos falsch zu rechnen — die
      einzige Verhaltensänderung der Scheibe, von Hand geprüft. Gegengeprobt: 53 Antworten der
      Entwicklungsdatenbank vor und nach dem Umbau zeichengleich, dazu alle Schreibwege von Hand
      (Rechnung, Einreichung, Abrechnung, Papierkorb, Nutzerverwaltung, Passwortwechsel,
      Einstellungen) und 321 Integrationstests gegen `eunomia_test`. Im Browser: Arbeitsbereich mit
      Jahreswechsel und Erstattungsplan, Rechnungsliste, Policen, Papierkorb und die
      Einstellungsseite samt Mail- und Erinnerungsstatus und dem Testmail-Pfad ohne Konfiguration
      (409, derselbe deutsche Satz) — ohne eine einzige Fehlermeldung in der Konsole.

### Block IV — Betrieb und Nachweis (Release 0.19.0)

- [x] **15 — Header, Image, Abhängigkeiten.** SEC-02, SEC-10, SEC-13, SEC-14, CR-37.
      Umgesetzt mit v0.19.0-slice.1 (Slice 65). Vier Festlegungen des Autors prägen das Ergebnis:
      `helmet` statt eigener Middleware, die Backup-Verschlüsselung bleibt auf dem Host (das Skript
      kennt keinen Schlüssel, die Passphrase kommt nie in den Container), der Port bindet auf
      `127.0.0.1` mit `BIND_ADDRESS` als ausdrücklichem Ausweg, und die Migrationen laufen unter
      `GET_LOCK` statt nur unter einer Annahme in der README. Die CSP steht ausgeschrieben statt aus
      helmets Vorgabe genommen: Skripte auf `'self'`, ohne `unsafe-inline` und ohne `unsafe-eval`,
      und genau zwei benannte Lockerungen — `img-src data:` für den GiroCode,
      `style-src 'unsafe-inline'` für Vues `:style` und FontAwesomes eigenen `<style>`-Block.
      Fünf Dinge gingen über den Review hinaus: (1) `upgrade-insecure-requests` ist ausdrücklich
      abgeschaltet — helmets Vorgabe enthält es, und auf der dokumentierten http-Instanz hübe es die
      eigenen Subresourcen auf https, wo nichts antwortet (als Prüfung festgehalten, damit es keine
      spätere Hand wieder hereinnimmt); (2) das Laufzeit-Image installiert nur noch die
      Abhängigkeiten der API — es trug vue, pinia, vue-router, @fortawesome/* und qrcode mit, obwohl
      die SPA ein statisches Bündel ist, und mit vue kamen zwei der drei Produktionsbefunde (postcss,
      nanoid) überhaupt erst herein: 408 MB wurden 357 MB; (3) `PORT` ging in den Container, die
      Port-Abbildung nannte auf der Container-Seite aber fest 3000 — mit einem anderen `PORT` zeigte
      der veröffentlichte Port ins Leere (im Smoke-Test rot gesehen); (4) `backup.sh` und
      `restore.sh` setzen `pipefail`, weil ein gescheiterter `mariadb-dump` durch das nachgeschaltete
      `gzip` hindurch Erfolg meldete — ein abgeschnittenes Backup, das wie ein gutes aussieht — und
      ein versehentlich verschlüsselt eingespeistes Archiv „Restore complete“ sagte, ohne eine Zeile
      zu schreiben; (5) `withConnection()` steht neben `withTransaction()`, damit die Sperre eine
      eigene Sitzung bekommt, ohne dass `getConnection()` wieder aus `db/transaction.ts` ausbricht.
      Geprüft gegen das echte Produktionsimage in einem eigenen Compose-Projekt (read-only, ohne
      Capabilities, Grenzen und Loopback-Bindung in `docker inspect` nachgesehen, Backup und Restore
      im gehärteten Container gefahren) und im Browser gegen die gebaute SPA: Anmeldung,
      Arbeitsbereich, Rechnungen samt GiroCode-Popover, Policen, Papierkorb, Einstellungen, Nutzer
      und Profil — null CSP-Verstöße.
- [x] **16 — Prüfbar statt dokumentiert.** SEC-17, CR-32, CR-33, CR-34.
      Umgesetzt mit v0.19.0-slice.2 (Slice 66). Vier Festlegungen des Autors prägen das Ergebnis:
      die Mounts stehen als Daten in `app.ts` (`API_MOUNTS`), die Kontoseite von SEC-17 wird als
      Inventarliste mit benannten Ausnahmen geprüft statt als 403-Durchgang mit Fixtures, der
      Vorbau der zehn Integrationstests wandert in einen gemeinsamen `src/test/harness.ts`, und die
      Abdeckung wird gemessen statt begrenzt. Der Umbau in `app.ts` war keine Wahl: Express 5
      behält den Mount-Pfad eines Routers nicht (kein `regexp`, kein `path` — der Matcher schließt
      das Muster ein), die Routentabelle ist aus dem gebauten App also nicht rekonstruierbar, wie
      der Review annimmt. Innerhalb eines Routers ist die Wirkung eines
      `router.use('/users', requireAuth)` dagegen feststellbar, indem man seinen Matcher mit dem
      Routenpfad **aufruft** — `/users/:uuid` trifft, `/roles` nicht; darauf steht die Erkennung der
      beiden `use`-bewachten Router. Fünf Dinge gingen über den Review hinaus: (1) jeder in
      `src/domain|auth|routes|settings` deklarierte Router muss in `API_MOUNTS` stehen — die Liste
      wird aus den Quelldateien gelesen, nicht aus einem zweiten Verzeichnis, weil eine Liste sich
      selbst nicht fehlen kann; (2) kein Wächter prüft ein instanzweites Recht kontobezogen, womit
      die Zusage aus SEC-04 zweimal gehalten wird — strukturell im Routentest und gegen die
      Datenbank im Rechtemodell-Test; (3) `GUARD`, ein Symbol-Deskriptor auf den beiden
      Middleware-Fabriken, weil `router.use` nichts hinterlässt, woran ein Test den Wächter
      erkennen könnte; (4) `resetData` ist aus zehn Varianten eine geworden — es waren zehnmal
      dieselbe Liste mit verschiedenen Auslassungen, und eine davon trug schon einen Vermerk über
      Reste aus dem Lauf einer anderen Suite; (5) `reminders.integration.test.ts` hätte bei der
      Zusammenlegung lautlos seinen `configEncryptionKey` verloren (die Lint-Warnung über das
      unbenutzte `randomBytes` hat es verraten). Gemessene Abdeckung: `packages/shared` 100 %,
      API 97,72 / 90,04 / 93,69 (Zeilen/Zweige/Funktionen), Web 68,33 / 68,65 / 56,99 — ohne
      Schwelle, mit der Grenze in DEV.md, dass `node --test` nur geladene Dateien zählt. Rot
      geprüft: eine Route ohne `requireAuth` (drei Prüfungen fallen), ein Router aus `API_MOUNTS`
      entfernt (zwei), `MANAGE_TRASH` kontobezogen geprüft (eine), ein veralteter Listeneintrag
      (eine), `if (mail.password !== '')` entfernt (eine), die Schreibreihenfolge in
      `saveBillingAllocations` vertauscht (zwei). Beobachtet und nicht angefasst:
      `InvoicePickerView.test.ts` ist beim ersten, kalten Abdeckungslauf einmal rot geworden
      (`.eu-picker__refs` leer), in fünf weiteren Läufen nicht mehr — die Datei gehört nicht zu
      dieser Scheibe, aber der langsamere CI-Schritt kann es wieder sichtbar machen.
- [x] **17 — Audit-Trail.** SEC-09.
      Umgesetzt mit v0.19.0-slice.3 (Slice 67). Vier Festlegungen des Autors prägen das Ergebnis:
      die fehlgeschlagene Anmeldung nennt IP **und** versuchte E-Mail, geloggt wird nur das
      Unroutinierte (jede 403, eine 401 nur bei gefälschtem Token oder unbekanntem/deaktiviertem
      Nutzer — ein abgelaufener Access-Token schweigt), die Ereignisse stehen als getypter Katalog
      in `lib/audit.ts` statt als `logEvent`-Aufrufe an den Fundstellen, und vier Ereignisse kamen
      über den Review hinaus dazu (`AUTH_SETUP_COMPLETED`, `AUTH_PASSWORD_CHANGED`,
      `TRASH_RESTORED`, `AUTH_LOGOUT`). Aus den sieben vorgeschlagenen wurden so vierzehn.
      Drei Dinge gingen darüber hinaus: (1) 401 und 403 werden an **einer** Stelle geschrieben, im
      `error-handler` — die einzige, durch die auch die 37 Routen kommen, die erst im Handler
      prüfen; dafür tragen `UnauthenticatedError` und `ForbiddenError` Grund bzw. fehlendes Recht
      als Feld mit, ausdrücklich nicht in `details`, so dass die Antwort an den Client um kein
      Zeichen abweicht. (2) `AUTH_REFRESH_REUSE` aus Scheibe 7 ist in den Katalog gewandert — ein
      dokumentiertes Ereignis außerhalb der Liste ist eines, das der Dokumentationstest nicht
      halten kann. (3) `captureLog` stand lokal im Mailer-Test und liegt jetzt in
      `src/test/log-capture.ts`. Abweichend vom Plan sind die Nachweise **nicht** in die vier
      bestehenden Integrationssuiten gestreut, sondern in eine eigene
      (`lib/audit.integration.test.ts`), die die Spur in zehn Schritten einmal durchläuft — ein
      Befund, der quer durch die App liegt, liest sich als ein Weg besser denn als zehn Zusätze in
      Suiten, die von etwas anderem handeln. Gewarnt sei vor der Stelle, die den Test zuerst rot
      gemacht hat: `updateUser` endet auf `AND userStatus <> -1`, ein deaktivierter Nutzer kommt
      über die Admin-API also nicht zurück — die Deaktivierung muss im Durchlauf zuletzt stehen.
      Rot geprüft: ein Ereignis aus `DEV.md` entfernt (fällt), ein erfundenes ergänzt (fällt), die
      Ausnahme für den abgelaufenen Token entfernt (die Nicht-Zusicherung fällt). Von Hand gegen
      eine eigene Instanz auf `eunomia_test` (die Entwicklungsdaten blieben unberührt): alle
      vierzehn Zeilen gesehen, ein echt abgelaufener Token schreibt keine, und die Ausgabe des
      ganzen Laufs enthält keines der durchgereichten Passwörter und kein einziges Label.
- [x] **18 — Aufbewahrung, Löschung, Auskunft.** SEC-15.
      Umgesetzt mit v0.19.0-slice.4 (Slice 68). Vier Festlegungen des Autors prägen das Ergebnis:
      die Frist ist ein eigener Abschnitt der Einstellungen (Schalter, Vorgabe **aus**, und Tage,
      Vorgabe 90) mit Statusfeldern wie bei den Erinnerungen; sie gilt für den Papierkorb und
      gelöschte Nutzer und **nie** für aktive Daten; Nutzer werden in der Nutzerverwaltung
      endgültig gelöscht statt im Papierkorb; und der Export je Versicherter gehört in diese
      Scheibe. Die Regeln stehen jetzt in §2.11 des Plans.
      Die Abweichung vom Review (Nutzer **nicht** in den Papierkorb) hat drei Gründe, die beim
      Lesen des Codes entstanden sind: ein Restore dort gäbe einem `MANAGE_TRASH`-Inhaber die
      Wiederherstellung einer **Anmeldung** in die Hand, obwohl Zugang zu vergeben `MANAGE_USERS`
      ist; die Papierkorb-Mechanik leitet Kinder, Blocker und Anhänge aus Fremdschlüsseln ab, die
      bei `Users` auf `userID` zeigen und nicht auf `uuidText` — sie liefe leer und täuschte eine
      Prüfung nur vor; und `entityOfUid` löst die Art über ein Präfix auf, das eine UUID nicht hat
      (`a`, `b`, `c`, `e`, `f` kollidieren). Migration 018 gibt `Users` trotzdem ein `deletedAt`,
      weil Maske und Frist einen Zeitpunkt brauchen; Migration 013 hatte das ausdrücklich
      ausgeschlossen, der Kommentar der neuen sagt, was sich geändert hat. Wiederherstellen bringt
      den Nutzer **deaktiviert** zurück, nie aktiv.
      Fünf Dinge gingen über den Review hinaus: (1) `purgeEntry` ist aus `trash.ts` in ein
      Geschwister `trash-purge.ts` gewandert, das die Route **und** der Lauf lesen — ein
      unbeaufsichtigtes Löschen darf keine eigenen Regeln entwickeln; (2) die Einstellungsseite hat
      einen Probelauf, der zählt und nichts anfasst und auch bei abgeschalteter Frist läuft, weil
      genau das die Entscheidung zum Einschalten trägt (der echte Lauf antwortet abgeschaltet 409
      wie die Erinnerungen); (3) seine Antwort nennt Zahlen je Art und kein Label — die Lehre aus
      SEC-03, denn `MANAGE_SETTINGS` sagt nichts über das Lesen von Rechnungen; (4) der
      Audit-Katalog kennt jetzt `actor=system` als dokumentiertes Wort für alles, was ein Timer
      tut, dazu `USER_RESTORED`, `USER_PURGED` und `RETENTION_SWEPT`; (5) die Vollständigkeit des
      Exports wird geprüft statt behauptet (Inventarliste aller 27 Tabellen gegen
      `information_schema`, je Tabelle ein Platz im Export oder ein Satz, warum nicht, dazu der
      Nachweis, dass jede beanspruchte Tabelle im Dokument wirklich ankommt).
      Gewarnt sei vor zwei Stellen: `InvoiceReminders` trägt den Empfänger als `userID`, weshalb
      dieser eine Zweig des Exports seine Spalten namentlich wählt statt `SELECT *`; und die
      `RETENTION_SWEPT`-Zeile wird nur geschrieben, wenn wirklich etwas ging — ein zurückgehaltener
      Eintrag ist nicht jeden Tag eine Nachricht. Rot geprüft: `deletedAt IS NOT NULL` aus dem
      Kandidaten-SQL entfernt (undatierte Einträge gingen mit, drei Prüfungen fallen), die
      Statusbedingung des endgültigen Löschens entfernt (eine), eine Tabelle aus der
      Export-Inventarliste gestrichen (eine), `SELECT *` im Erinnerungs-Zweig (eine), ein
      Audit-Ereignis aus `DEV.md` entfernt (eine).
      Von Hand gegen die Entwicklungsinstanz: der Export einer Versicherten gegen die Datenbank
      gezählt — zwölf Zweige, jede Zahl gleich (3 Policen, 14 Rechnungen, 6 Beitragsstände, 4
      Konditionen, 6 Staffelstufen, 3 Jahre, 4 Einreichungen mit 9 Rechnungen, 5 Abrechnungen mit 8
      Erstattungen, 16 Behandlungstage, 1 Ausschluss); Probelauf und Lauf mit einer Frist von einem
      Tag (2 Einträge gingen, einer blieb, weil eine aktive Rechnung auf ihn zeigt); und der ganze
      Weg eines Nutzers — löschen, im Abschnitt wiederfinden, wiederherstellen (kommt **inaktiv**
      zurück), erneut löschen, endgültig löschen. Danach `npm run dev:reset`. Beobachtet und nicht
      angefasst: `SubmitDialog.a11y.test.ts` ist einmal im vollen Lauf rot geworden und in den
      Läufen davor und danach nicht — dieselbe Art Flackern wie bei `InvoicePickerView.test.ts` in
      Scheibe 16.
