# Issue Documentation
## Version 0.9.0
### Date 20260925
1.  Tab im Auswahlfeld — Umgesetzt mit v0.12.0-slice.1
	Wenn man in einem Auswahlfeld (eu-picker__control) einen Eintrag wählt und anschließend TAB drück, dann wird der gewählte Eintrag nicht in das Feld übernommen
	sondern nur der Focus wächselt auf das +-Icon. Beim Shift+TAB wird wieder zurück in die Auswahl gewechselt und der ausgewählte Eintrag ist immer noch gewählt
	und kann mit ENTER übernommen werden. Erwartung wäre, dass der Eintrag erst ins Ffeld übernommen (bestätigt) wird und dann auf das +-Icon geweselt wird.
2.  Suche bei Leistungserbringer — Umgesetzt mit v0.12.0-slice.5
	Es fehlt eine Möglichkeit auf der Seite "Leistungserbringer" nach solchen per Name zu suchen. Es werden schnell mehr und man verliert leicht den Überblick.
3.  Suche bei Abrechnungsdienstleister — Umgesetzt mit v0.12.0-slice.5
	Gleiches wie bei Leistungserbringern (20260925-2) nur für die Seite "Abrechnungsdienstleister"
4.  Zusatzfelder beim Abrechnungsdienstleister — Umgesetzt mit v0.12.0-slice.8
	Es fehlt ein "BIC" Feld sowie ein "Empfänger" Feld. Beide sollen optional sein. Beide sind ggf. wichtig zur GiroCode generierung. Wenn Empfänger gesetzt ist, 
	dann wird dieser Name im GiroCode als Name verwendet (und bei den Zahlungsdetails angezeigt), denn es gibt Fälle, wo sich das vom Namen des Dienstleisters
	unterscheidet.
5.  Versionierung von Kontoinformationen — Umgesetzt mit v0.12.0-slice.8
	Es kommt vor, dass ein Abrechnungsdienstleister seine Kontoinformationen wechselt. Es ist unschön dann einen anderen Dienstleister anzugelegen, da es bei der Auswahl nicht
	naheliegend ist, welcher ausgewählt werden müsste. Schöner wäre, wenn man die neue Information mit einem Gültigkeitsdatum Eintragen könnte und es immer beim
	selbem Dienstleister bleibt.
6.  Suche einer Rechnungsnummer — Umgesetzt mit v0.12.0-slice.5
	Wenn man eine Rechnung hat und nicht mehr weiß in welchem Jahr sie liegt, wäre eine Rechnungsnummersuche gut.
7.  Rechnung aus unterschiedlichen Einreichungen in einer Leistungsabrechnung — Umgesetzt mit v0.12.0-slice.7
	Die Konvention besagt, dass Rechnung unterschiedlicher Versicherter nicht in einer Einreichung liegen dürfen, und dass Einreichungen unterschiedlicher Versicherter
	in einem Leistungsabrechnungsbrief in der App auf zwei Leistungsabrechnungen aufgeteilt werden, da sie sich auf unterschiedliche Verträge beziehen. Aber was
	funktionieren muss ist, dass Rechnungen, die zu unterschiedlichen Daten eingereicht wurden zusammen auf eine Leistungsabrechnung zusammengefasst werden können,
	das geht heute nicht. Genau so kann es sein, dass Leistungsabrechnungen je nach Einreichung, mehrere Behandlungsjahre umfassen. Die Versicherung unterscheidet dann
	zu welchem Beitragsrückerstattungsbonus das passt. Die App soll dafür unkomplizierte Eingabemöglichkeiten bieten, ohne eine Leistungsabrechnung im selben Vertrag zwei
	mal erstellen zu müssen. Letzteres sollte eigentlich sogar durch einen UNIQUE-Constraint in der Datenbank verboten sein.
	Es handelt sich also um eine n:m-Beziehung zwischen Rechnung/Einreichung und Leistungsabrechnung. Folgende Fälle können auftreten:
	- Eine Rechnung wird eingereicht und in genau einer Leistungsabrechnung abschließend behandelt
	- Mehrere Rechnungen werden zusammen eingereicht und in genau einer Leistungsabrechnung abschließend behandelt
	- Mehrere Rechnungen werden zusammen eingereicht und in mehreren Leistungsabrechnungen jeweils abschließend behandelt
	- Mehrere Rechnungen werden zu unterschiedlichen Zeitpunkten eingereicht und in genau einer Leistungsabrechnung abschließend behandelt
	- Mehrere Rechnungen werden zu unterschiedlichen Zeitpunkten eingereicht und in mehreren Leistungsabrechnungen jeweils abschließend behandelt
	- Mehrere Rechnungen werden eingereicht (egal ob zusammen oder getrennt) die aus unterschiedlichen Behandlungszeiträumen stammen und in einer Leistungsabrechnung
	  abschließend behandelt
	- In allen Fällen kann es vorkommen, dass für eine Bearbeitung ein Einspruch erhoben wird und es zur selben Rechnung und zur selben Einreichung eine zweite
	  Leistungsabrechnung gibt
	- In allen Fällen kann es vorkommen, dass eine Rechnung ein zweites mal bei einer Zusatzversicherung eingereicht und erst dann abschließend behandelt wird
8.  Label für Erstattung und Belegnummer — Umgesetzt mit v0.12.0-slice.3
	Siehe Screenshot (Screenshot 2026-09-24 203348.png): Im Label wird die Rechnungsnummer mit abgebildet, das führt unter umständen zu zu langem Text und einem Umbruch, wodurch die Felder für Erstattung 
	und Belegnummer vertikal nicht ausgerichtet sind. Dabei muss im Label die Rechnungsnummer gar nicht stehen, es reicht, wenn sie einmal in der Karte steht.
9.  Ändern einmal zugewiesener Rechnungen — Umgesetzt mit v0.12.0-slice.3
	Wenn eine Rechnung einer Leistungsabrechnung zugeordnet wird, legt man Erstattungsbetrag und Belegnummer fest. Danach sind diese Werte in der UI nicht mehr änderbar.
	Es muss eine Möglichkeit geben, die Werte nachträglich anzupassen. Der einzige Weg ist heute, dass man die Zuordnung für die Rechnung löscht.
10. Es fehlt die Ansicht für den "Papierkorb" — Umgesetzt mit v0.12.0-slice.9
	Die App nutzt heute ein Prinzip des Soft-Delete. Es gibt aber noch keine Möglichkeit in der UI zum Zurückholen der gelöschten Items oder auch zum Hard-Delete, wenn sie
	wirklich nicht mehr benötigt werden (mit einfacher Bestätigungs-Abfrage).
11. Copy&Paste eines Datums — Umgesetzt mit v0.12.0-slice.1
	Wenn ich in einer Externen Quelle (z.B. Excel) ein Datum im Format DD.MM.YYYY ins Clipboard kopiere und in ein Datumsfeld der App einfügen möchte, funktioniert das nicht.
12. Police Auswahl beim Einreichen — Umgesetzt mit v0.12.0-slice.4
	Es werden beim Einreichen Krankenversicherungen/Policen zur auswahl angeboten, die zum Behandlungszeitraum der ausgewählten Rechnungen noch nicht oder nicht mehr Aktiv sind.
13. Default bei geöffenten Dialogen — Umgesetzt mit v0.12.0-slice.2
	Wenn ein Dialog geöffnet wurde, bleibt der letzte Scollzustand bestehen.
	Wenn also mehrmals hintereinander eine neue Rechnung angelegt wird, die von oben bis unten durchgearbeitet wird, dann ist beim nächsten Dialog die Scroll-Position unten, obwohl oben wieder das erste Feld "Rechnungsnummer" im Focus ist.
## Version 0.11.0
### Date 20260925
1.	Rechnung mit mehreren Behandlungstagen — Umgesetzt mit v0.13.0-slice.3
	Eine Rechnung kann mehr als ein Behandlungsdatum haben. Wir sollten uns auf lange sicht überlegen, wie wir das auch in der Oberfläche berücksichtigen können. Idealerweise soll je Behandlung die Kosten angegeben werden. Derzeit würde ich als Workarround nur eine der Behandlungsdaten angeben. Nur wenn die Daten in unterschiedlichen Jahren liegen, würde ich eine eigene Rechnung daraus extrahieren. Wir müssen das unterstützen und für den Nutzer so einfach wie möglich machen.
2.	Browservorschlag in Eingabefeldern unterdrücken — Umgesetzt mit v0.13.0-slice.1
	Es kommt immer wieder vor, dass der Browser einen Vorschlag über seine eigene Vorschlagfunktion für felder macht. Das ist tatsächlich störend und passt nicht recht ins Design. Kann man siede automatischen Vorschläge oder Vorbelegungen unterdrücken?
3.	Instanzadresse in Einstellungen>Zahlungserinnerungen — Umgesetzt mit v0.13.0-slice.1
	Das Feld Label "Adresse dieser Instanz (für den Link in der Mail)" ist zu lang, so dass es umbricht und somid das imput Feld vertikal ggü. des Zeitzone-Feld nach unten drückt. Kürzen z.B. auf "URL dieser Instanz (für den Link in der Mail)"
## Version 0.12.0
### Date 20260926
1.	Scroll Glitch in Rechnungen zuordnen Dialog — Umgesetzt mit v0.13.0-slice.1
	Beim Zuordnen von Rechnungen gab es einen komischen Glitch bei den Scroll-Balken mit unnützem Weißraum unter der den Hauptschaltflächen, nachdem ich bei einer Leistungsabrechnung den Schalter bei "Diese Rechnung verwirkt den Bonus" abgewählt habe. Siehe Screenshot "Rechungen_Zuordnen_Dialog.png"
2.	Nicht gedeckte Rechnungen — Umgesetzt mit v0.13.0-slice.4
	Es gibt Behandlungen, die sind von der Versicherung nicht gedeckt. Wenn das bekannt ist, wird sie niemals eingereicht werden. In diesem Fall soll sie auch nicht in die Berechnung eingehen (z.B. für Erreichnung der  Selbstbeteiligung). Eine Markierung als nicht gedeckt soll auch eine kurze Begründung beinhalten, damit man später nachvollziehen kann, warum man sie so markiert hat.
3.	Zahlungsdatum bei Direktzahlung — Umgesetzt mit v0.13.0-slice.5
	Bei direktzahlung soll atomatisch das Rechnungsdatum als Zahlungsziel und Zahlungsdatum gesetzt werden
4.	Abrechnungsdienstleiter Kontos pro Leistungserbringer — Umgesetzt mit v0.14.0-slice.1
	In der Praxis zeigt sich, dass es zwei Arten von Abrechnungsdienstleistern gibt:
	- Abrechnung und Konto: Der Abrechnungsdienstleister kümmert sich um die Abrechnung und die Zahlungsaufforderungen/Mahnungen und hat ein eigenes Konto, dass für alle Leistungserbringer bei diesem Dienstleister passt
	- Nur Abrechnung: Der Abrechnungsdienstleister kümmert sich um die Abrechnung und die Zahlungsaufforderungen/Mahnungen, er verweist aber je Leistungserbringer auf unterschiedliche Konten
	Das muss im Tool abgebildet werden und macht die gesamte Pflege von Konten und Abrechnungsdienstleistern auch bei Erstellung komplexer.
	Alternativ Pflegen wir ein Konto eher beim Leistungserbringer, und die Wahl des Abrechnungsdienstleisters wirkt nur als "Default"-Konto. Der ursprüngliche Zweck im Design überhaupt Abrechnungsdienstleister zu bauen war, dass der Autor dachte, dass es sonst zur doppelten Pflege kommen würde.
5.	Rechnungsliste je Abrechnungsdienstleister — Umgesetzt mit v0.14.0-slice.2
	Es fehlt eine Möglichkeit zu sehen, welche Rechnungen einen bestimmten Abrechnungsdienstleister nutzen. Das ist im Zuge des Issues 0.12.0-4 aufgefallen
6.	Markierung nicht vollständig ersetzer Leistungen — Umgesetzt mit v0.13.0-slice.6
	Wenn durch Tarifliche Eigenbeteiligung oder Selbstbeteilung nicht die Volle Rechnungssumme ersetzt wurde, soll die Erstattungssumme in der Rechnungsübersicht rot geschrieben werden, damit der Unterschied direkt auffällt.
## Version 0.13.0
### Date 20260928
1.	Unnötige Meldung bei Direktzahlung — Umgesetzt mit v0.15.0-slice.1
	Meldung "Zahlungsziel und Zahlungsdatum werden auf das Rechnungsdatum gesetzt." muss nicht im Dialog stehen, wenn auf Direktzahlung geschaltet wird. Das nimmt nur Platz weg.
2.	"Nicht gedeckt" nicht im Anlegen-Dialog — Umgesetzt mit v0.15.0-slice.1
	"Nicht gedeckt" ist eine Eigenschaft, die erst nach dem Anlegen festgelegt werden muss, sie braucht nicht im Anlegen, sondern nur im Bearbeiten-Dialog eingestellt werden können
3.	Weitere-Behandlungstage nimmt zu viel Raum ein — Umgesetzt mit v0.15.0-slice.1
	Die Funktion kommt nur bei ca. 10% der Rechnungen zum Einsatz. Sie sollte dezenter im Anlegen-Dialog enthalten sein. Der Rahmen mit fettem Label, Beschreibung und riesiger Schaltfläche sieht so aus, als wäre diese Angabe fast immer erforderlich
4.	Betrag Übernehmen bei Zuordnung — Umgesetzt mit v0.15.0-slice.2
	Es wäre eine Erleichterung mit einem einfachen Klicke auf den Betrag in den Rechnungsdetails (oder einer dezenten Icon daneben) bei der Zuordnung diesen Betrag direkt in das Erstattung-Feld zu übernehmen.
5.	GiroCode-Icon ändert Dialogbreite — Umgesetzt mit v0.15.0-slice.3
	Wenn ich eine Rechnung habe und das Zahlungsdatum setze, wo vorher keines gesetzt war, verschwindet das GiroCode Icon. Der Platz wird aber nicht reserviert (Unterschied zwischen hidden und visible), wodurch der ganze Dialog durch das Setzen des Zahlungsdatums schmaler wird. Das ist nicht schön. (Testsystem hat 1905 Displaybreite)
6.	Abweichende Versionskontrolle — Umgesetzt mit v0.16.0-slice.1
	Obwohl die manuell angestoßene Versionsüberprüfung (System>Einstellungen>Version und Aktualisierung) bei 0.13.0 anzeigt, dass es schon 0.15.0 gibt, zeigt die Fußzeile noch keine neuere Version an (weil Timeout noch nicht gelaufen?). Die manuelle Prüfung sollte auch den Status in der Fußzeile beeinflussen.
## Version 0.14.0-slice.2
### Date 20260929
1.	Vorschlagsliste zu schmal für die IBAN — Umgesetzt mit v0.14.0-slice.3
	Bei der Auswahl der Kontoverbindung ist das Vorschlagsfeld nicht lang genug für die IBAN, es entsteht ein horizontaler Scrollbalken. Anklicken lässt er sich nicht, weil das Feld dabei direkt ausgeblendet wird, und schön ist er ohnehin nicht.
## Version 0.16.0-slice.1
### Date 20260929
Befunde aus dem Sicherheits-Review (Meilenstein 1 vor 1.0.0). Begründung, Fundstelle und Nachweis
je Punkt in [Sicherheits-Review.md](Sicherheits-Review.md), dort unter der genannten SEC-Nummer.
1.	Dokument-Link erlaubt ausführbare Schemata (SEC-01)
	Der Dokument-Link wird mit `z.string().url()` geprüft, und das lässt `javascript:`, `data:`, `vbscript:` und `file:` durch — nachgewiesen gegen die installierte zod-Version. In den Zahlungsinformationen landet der Wert in einem `<a href>`; ein Klick führt den Code in der Origin der App aus, wo auch der Access-Token liegt. Der passende Prüfer existiert schon im Projekt (`isHttpUrl` in settings/registry.ts) und muss nur zum gemeinsamen Helfer werden und auf Rechnung und Leistungsabrechnung angewandt werden. Frontend prüft zusätzlich vor dem Öffnen, Bestandsdaten einmalig durchsehen.
2.	Keine Security-Header, keine CSP (SEC-02)
	Die API setzt keinen einzigen Sicherheits-Header: keine Content-Security-Policy, kein nosniff, keine Referrer-Policy, kein Frame-Schutz, kein HSTS; dazu verrät `x-powered-by` den Server. Die CSP ist genau die Schicht, die den Befund SEC-01 von "Token weg" auf "Klick tut nichts" reduziert hätte. helmet vor die Router, CSP passend zur SPA (die GiroCode-QR braucht `img-src data:`).
3.	Kein Audit-Trail (SEC-09)
	Das Ereignis-Log ist gut gebaut, wird aber nur von Mailversand, Erinnerungen und Update-Check benutzt. Es gibt kein Ereignis für Anmeldung (erfolgreich wie fehlgeschlagen), für abgewiesene Berechtigungen, für Anlegen/Ändern/Deaktivieren von Nutzern, für Rollenänderungen, für das endgültige Löschen im Papierkorb und für Änderungen an den Systemeinstellungen. Ein Rateangriff auf ein Passwort wäre heute unsichtbar, und nach einem Vorfall ließe sich nicht feststellen, wer was gesehen oder gelöscht hat. In die Zeile gehören nur UIDs, keine Falldaten.
4.	Vorschau der Zahlungserinnerungen zeigt fremde Konten (SEC-03)
	Der Probelauf der Erinnerungen gibt für jeden Empfänger dessen E-Mail-Adresse und den vollständigen Mailtext zurück — mit Rechnungsnummern, Namen der behandelten Person, Zahlungsempfänger und Beträgen, über alle Konten hinweg. Der Endpunkt hängt an MANAGE_SETTINGS, nicht an VIEW_INVOICES. Der Erinnerungslauf selbst filtert korrekt; nur die Vorschau gibt alles heraus. Sie muss auf das eingeschränkt werden, was der Aufrufer sehen darf.
5.	Passwortänderung beendet bestehende Sitzungen nicht (SEC-05)
	Wird einem Nutzer ein neues Passwort gesetzt, bleiben seine Refresh-Token gültig — bis zu 30 Tage. Das ist genau der Fall, für den man das Passwort wechselt: ein Angreifer mit gestohlenem Token bleibt drin. Die Deaktivierung eines Nutzers wirkt dagegen richtigerweise sofort. Beim Setzen eines neuen Passworts alle Refresh-Token des Nutzers widerrufen.
6.	Kein eigener Passwortwechsel (SEC-06)
	Passwörter kann heute nur ein Administrator über die Benutzerverwaltung ändern; ein Nutzer kann sein eigenes nicht wechseln, und der Administrator kennt danach das neue. Es fehlt ein Endpunkt mit altem und neuem Passwort, der anschließend die übrigen Sitzungen des Nutzers beendet. Gehört mit SEC-05 in eine Scheibe.
7.	Papierkorb wirkt an der Kontotrennung vorbei (SEC-04)
	MANAGE_TRASH wird ohne Konto geprüft und die Papierkorbliste danach nicht gefiltert. Wer die Berechtigung hält, sieht gelöschte Datensätze aller Konten mit Rechnungsnummern, Namen und Beträgen und kann sie wiederherstellen oder endgültig löschen. Entweder nach den zugänglichen Konten filtern, oder im Rechtemodell festschreiben, dass MANAGE_TRASH eine instanzweite Administratorberechtigung ist.
8.	Verwundbare Abhängigkeiten, kein Audit in der CI (SEC-10)
	Im Produktionsimage stecken drei bekannte Schwachstellen; materiell ist davon `qs` über express, das bei jeder Anfrage die Query zerlegt. Für alle gibt es einen Fix. Die CI prüft Abhängigkeiten gar nicht, der nächste Fund fiele also wieder erst bei einem Review auf. `npm audit fix` fahren und einen Audit-Schritt in die CI aufnehmen.
9.	Backup liegt unverschlüsselt (SEC-14)
	Das Backup-Skript schreibt einen vollständigen Klartext-Dump; die dokumentierte Verwendung legt ihn unverschlüsselt im Arbeitsverzeichnis ab. Die Settings-Secrets bleiben darin unlesbar — das funktioniert —, die Gesundheitsdaten liegen aber offen. Ein optionaler Verschlüsselungsschritt im Skript und ein ausdrücklicher Abschnitt in der README: wohin Backups gehören, wie lange sie bleiben, und dass sie verschlüsselt sein müssen.
10.	Keine Löschfrist, kein endgültiges Löschen von Nutzern, keine Auskunft (SEC-15)
	Drei zusammenhängende Lücken bei Art.-9-Daten: der Papierkorb hält gelöschte Datensätze unbegrenzt und kennt keine Frist; ein Nutzer wird nur auf Status -1 gesetzt, Name und E-Mail bleiben dauerhaft stehen, und der Papierkorb kennt die Entität nicht; es gibt keinen Weg, die zu einer Person gespeicherten Daten vollständig auszugeben. Aufbewahrungsfrist als Systemeinstellung mit automatischer Endlöschung, Nutzer in den Papierkorb aufnehmen, Konto-Export als eigener Vorschlag.
11.	Port-Bindung und Container-Härtung (SEC-13)
	Das Deployment ist im Kern gut (eigener Benutzer statt root, keine Datenbank nach außen, zufälliges Root-Passwort). Offen: der API-Port wird auf allen Host-Schnittstellen gebunden, also auch am Reverse-Proxy und dessen TLS vorbei — hinter einem Proxy gehört dorthin 127.0.0.1. Dazu fehlen no-new-privileges, read_only und Ressourcengrenzen.
12.	Keine Erkennung wiederverwendeter Refresh-Token (SEC-07)
	Die Rotation ist da und richtig: ein vorgezeigter Token wird widerrufen. Was fehlt, ist die Schlussfolgerung — ein zweites Vorzeigen desselben Tokens ist ein sicheres Zeichen für Diebstahl und sollte die ganze Token-Kette des Nutzers fallen lassen, nicht nur diese Anfrage abweisen. Dazu ein Log-Ereignis.
13.	Keine Zusicherung, dass jede Route bewacht ist (SEC-17)
	Kein Loch: alle 47 Routen wurden geprüft, jede ist abgedeckt. Aber ein Teil der Prüfungen sitzt im Handler und teils erst in der aufgerufenen Service-Funktion, so dass eine Route ungeprüft aussieht und es nicht ist. Eine neue Route, die den Aufruf vergisst, fiele niemandem auf. Ein Integrationstest soll die Routentabelle auslesen und für jede Route ohne Token 401 und mit fremdkontigem Nutzer 403 erzwingen — damit wird die Regel prüfbar statt nur dokumentiert.
14.	Refresh-Token werden nie aufgeräumt (SEC-08)
	Abgelaufene und widerrufene Zeilen bleiben für immer stehen; jede Anmeldung und jede Rotation legt eine neue an. Im täglichen Erinnerungs-Tick mit aufräumen.
15.	Unbegrenzte Listen in drei Schemata (SEC-11)
	Die Buchungseinträge einer Leistungsabrechnung sowie Rollen und Konto-Grants eines Nutzers haben keine Obergrenze; jeder Eintrag wird als eigenes INSERT in einer Transaktion geschrieben, bei den Buchungen zusätzlich unter Sperren auf allen betroffenen Rechnungen. Begrenzt wird das heute nur durch die Größe des Request-Bodys. Je eine fachlich sinnvolle Obergrenze setzen.
16.	Steuerzeichen in Text-Einstellungen nicht abgewiesen (SEC-16)
	Der Absendername geht ungeprüft in den From-Header der Mails; geprüft werden nur Länge und teils ein Format, nicht aber Zeilenumbrüche. Nodemailer kodiert Anzeigenamen, weshalb daraus voraussichtlich nichts folgt — wir verlassen uns damit aber auf eine Bibliothekseigenschaft statt auf eine eigene Grenze. Steuerzeichen für alle Text-Einstellungen abweisen.
17.	Körpergrenze des JSON-Parsers nicht ausgeschrieben (SEC-12)
	Der JSON-Parser läuft ohne Optionen und damit auf dem Standardwert von 100 kB. Es besteht kein Loch, aber die Grenze steht nirgends im Projekt und hinge an einem Standardwert, den ein Major-Upgrade ändern könnte. Ausschreiben und den Grund dazu vermerken.
## Version 0.16.0-slice.2
### Date 20260929
Befunde aus dem Code-Review (Meilenstein B vor 1.0.0). Begründung, Fundstelle, Aufwand und Risiko
je Punkt in [Code-Review.md](Code-Review.md), dort unter der genannten CR-Nummer. Die Empfehlung
„vor 1.0“ / „nach 1.0“ steht dort ebenfalls; die Auswahl trifft der Autor.
1.	Geteilte Typen: `packages/shared-types` ist seit Slice 1 leer (CR-01)
	Das Paket enthält nur `export type Placeholder = never`. Seitdem führen beide Apps dieselben Verträge doppelt: die Status-Unions, die 51 Fehlercodes, die Enum-Werte (`ContractKind`, `BonusForfeitRule`), die Settings-Schlüssel und rund zwanzig DTO-Formen, die im Web als Interface nachgeschrieben sind. Der Compiler prüft heute keine einzige dieser Zusagen; eine Spalte, die ihren Typ wechselt, fällt erst zur Laufzeit auf. Paket aufsetzen (Build-Reihenfolge, Vite-Alias, Image) und zuerst hineinlegen, was auseinanderlaufen kann: Status, Fehlercodes, Enums, Settings-Schlüssel. CR-02 bis CR-05 folgen dieser Scheibe.
2.	Zahlungsampel zweimal implementiert, mit abweichender Datumsrechnung (CR-02)
	`calcPaymentState` und `DUE_SOON_DAYS = 10` stehen in `apps/api/src/reminders/payment.ts` und in `apps/web/src/invoices/payment.ts`, ausdrücklich als Zwilling dokumentiert. Die Datumsrechnung ist aber verschieden: die API vergleicht Kalendertage als UTC, das Web schneidet auf den lokalen Tagesanfang. In Europe/Berlin fällt beides zusammen, westlich von UTC nicht — dort stünde die Ampel einen Tag zu früh auf Rot, während die Erinnerung noch schwiege. Mit CR-01 zusammenlegen, die API-Fassung nehmen.
3.	Status-Typen wörtlich doppelt (CR-03)
	`WorkflowStatus` und `SubmissionStatus` stehen zeichengleich in `apps/api/src/domain/invoice-status.ts` und `apps/web/src/invoices/status.ts`, dazu `ContractKind` und `BonusForfeitRule` in `apps/web/src/contracts/api.ts`. Ein sechster Status — die Leiter ist schon zweimal gewachsen — wird an zwei Orten gepflegt; fällt einer aus, rendert das Web einen leeren Badge-Ton. Erster Inhalt des geteilten Pakets.
4.	`defaultAccount` doppelt (CR-04)
	Dieselbe Funktion mit demselben Kommentar in `apps/api/src/domain/agency-accounts.ts` und `apps/web/src/agencies/accounts.ts`; beide nennen einander „the twin of“. Der Inhalt ist eine Zeile, aber es ist die Regel, welches Konto vorgeschlagen wird — und die hat sich in Slice 44 schon einmal geändert. Mit CR-01 in das geteilte Paket.
5.	Deutsche Formatierung doppelt, mit unterschiedlichem Leerverhalten (CR-05)
	`germanDate`/`germanMoney` in `apps/api/src/lib/german.ts` gegen `germanDate`/`euro` in `apps/web/src/lib/format.ts`. Die API-Fassung prüft ihre Eingabe nicht: `germanDate('')` liefert `undefined.undefined.undefined`. Erreichbar wäre das über den Papierkorb, dort aber nur bei einem Geburtsdatum, das die Datenbank als NOT NULL ausschließt. Zusammenlegen und die Web-Fassung nehmen, die den Dash kennt.
6.	`directPayment` verlässt die API als 0/1, die anderen beiden Flags als boolean (CR-06)
	`present()` in `domain/invoices.ts` wandelt `reimbursementClosed` und `notCovered` in `Boolean`, lässt `directPayment` aber als TINYINT stehen. Das Web schreibt deshalb `directPayment: number` in seine DTO und vergleicht an drei Stellen gegen `=== 1`. Drei Flags derselben Zeile, zwei Darstellungen — und wer die dritte behandelt wie die ersten beiden, bekommt nur zufällig das Richtige. In `present()` mitwandeln, die `=== 1`-Vergleiche entfernen.
7.	Kontoskopierung siebenmal von Hand ausgeschrieben (CR-07)
	Sieben Listen-Endpunkte lösen dieselbe Frage mit demselben zwölf- bis zwanzigzeiligen Block: `getAccessibleAccounts`, `scope.all` abfangen, leere Liste abfangen, `IN (…)` bauen (invoices zweimal, submissions, allocations, billings, contracts, accounts). Die Fassungen sind bereits leicht verschieden, und SEC-04 ist genau die achte Stelle, an der der Block fehlt. Einen Helfer neben `getAccessibleAccounts` und die sieben Stellen darauf ziehen — gehört in dieselbe Scheibe wie SEC-04.
8.	`requireEntityAccount` ist toter Code, fünfzehn Stellen schreiben ihn nach (CR-08)
	`domain/workflow-access.ts` bietet genau die drei Schritte an, die jeder Einzelsatz-Endpunkt braucht — Konto auflösen, 404, Recht prüfen — und hat keinen einzigen Aufrufer. Stattdessen stehen die drei Zeilen fünfzehnmal von Hand da (invoices 5, service-billings 5, submissions 3, allocations 2). Entweder die Stellen darauf ziehen oder den Helfer löschen; das Erste ist besser, weil es die Reihenfolge „404 vor 403“ zur Eigenschaft statt zur Gewohnheit macht. `accountForAllocation` wandert dabei zu seinen Geschwistern.
9.	Antwort-Envelope zwölfmal am Helfer vorbei (CR-09)
	`crud/envelope.ts` sagt, jede erfolgreiche Antwort trage ihre Nutzlast unter `data`. Sechzehn Dateien halten sich daran; `auth/admin-routes.ts` schreibt sechsmal `res.json({ data: … })` von Hand, `auth/routes.ts` antwortet sechsmal ganz ohne Envelope, `routes/version.ts` ebenfalls. Für Version und Auth ist das eine sinnvolle Ausnahme — sie steht nur nirgends. `admin-routes.ts` auf `sendData` ziehen, die Ausnahme im Kommentar von `envelope.ts` benennen.
10.	`withTransaction` existiert, drei Stellen rollen die Transaktion von Hand (CR-10)
	Neun Stellen benutzen den Helfer, drei nicht: Einreichung anlegen, Leistungsabrechnung löschen, Police anlegen. In `submissions.ts` liegt das `sendData(…)` dabei innerhalb des `try`-Blocks nach dem `commit()` — wirft es, läuft ein `rollback()` auf einer bestätigten Transaktion. Die drei auf `withTransaction` ziehen, die Antwort nach außen.
11.	Parameter werden mal geprüft, mal roh gelesen (CR-11)
	Vier Endpunkte gehen an `parseQuery`/`pathParam` vorbei: `invoices.ts` `/years` liest `req.query.accountUID` roh, `allocations.ts` liest zwei Filter ungeprüft und ist damit die einzige Liste ohne `limit`, `reimbursement-plan.ts` prüft das Jahr in drei Zeilen von Hand, und `auth/admin-routes.ts` nimmt `req.params.uuid` durchgehend roh. Kein Loch (alle Werte werden gebunden), aber eine andere Fehlermeldung und eine fehlende Obergrenze. Ergänzt SEC-11.
12.	API antwortet an drei Stellen deutsch statt englisch (CR-12)
	`lib/error-codes.ts` legt fest: die API antwortet englisch, das Web übersetzt über den Code. `settings/routes.ts` antwortet zweimal deutsch, `mail/mailer.ts` liefert alle `reason`-Texte deutsch. Das hat eine Folge: `REMINDERS_DISABLED` ist der einzige von 51 Codes ohne deutschen Satz in `error-messages.ts` — der Nutzer sieht deshalb „Die Aktion ist fehlgeschlagen.“, wenn er den Erinnerungslauf bei ausgeschalteten Erinnerungen anstößt. Meldungen auf Englisch ziehen, den Code nachtragen.
13.	`GROUP_CONCAT` ohne Längengrenze kürzt still (CR-13)
	Die Einreichungsliste fasst ihre Rechnungs-IDs und die Abrechnungsliste ihre Rechnungsnummern mit `GROUP_CONCAT` zusammen, ohne `group_concat_max_len` zu setzen; der MariaDB-Standard ist 1024 Byte. Ab etwa 78 Rechnungen je Einreichung fällt der Rest stillschweigend weg — keine Warnung, nur eine kürzere Liste. Bei den Einreichungen stattdessen eine zweite Abfrage (wie es die Detailroute bereits tut).
14.	Suchtext maskiert `%` und `_` nicht (CR-14)
	Alle Freitextsuchen bauen `%${q}%` für `LIKE`. Wer `%` eingibt, findet alles; wer `_` eingibt, jeden Einzelzeichen-Treffer. Zusätzlich hat `q` in der Abrechnungssuche keine Längengrenze, während dasselbe Feld in der Rechnungssuche auf 50 Zeichen begrenzt ist. Kein Sicherheitsproblem (der Wert ist gebunden), aber ein leises Verhaltensrätsel. Ein Helfer `likeTerm(q)` und dieselbe Grenze in beiden Schemata.
15.	`invoices.ts` trägt fünf Rollen in 940 Zeilen (CR-15)
	Die größte Quelldatei des Projekts enthält Tabellenbeschreibung, Schemata, Abfrage- und Präsentationsschicht, fünf Fachregeln als reine Funktionen und den Router mit sieben Endpunkten. Die Regelfunktionen sind das Wertvollste darin und haben keinen Unit-Test, weil man nur über den Router und eine Datenbank an sie herankommt. Dreiteilen: `invoices/rules.ts`, `invoices/queries.ts`, `invoices.ts`. Gehört vor die SEC-Scheiben, die dieselbe Datei anfassen (SEC-01, SEC-11).
16.	Erstattungsplan fragt je Police fünfmal nach (CR-16)
	`reimbursement-plan.ts` läuft in einer Schleife über die Policen und stellt je Police fünf Abfragen nacheinander (Konditionen, Ansprüche, Jahresdatensätze, Konditionen mit Stufen). Der Endpunkt hängt an jedem Öffnen des Arbeitsbereichs und an jedem Jahreswechsel. Die Listen einmal für alle Policen holen und im Speicher gruppieren — dieselbe Technik, die `present()` in `invoices.ts` vorführt.
17.	Papierkorb-Liste fragt je Eintrag ein Dutzend Mal nach (CR-17)
	`listTrash` stellt je Eintrag zweimal den rekursiven Abstieg über die Fremdschlüssel und je verweisender Link-Tabelle eine Zählabfrage — für eine Rechnung rund zehn Abfragen, bei fünfzig Einträgen mehrere hundert Rundreisen für eine Seite. Heute ist der Papierkorb klein; mit der Aufbewahrungsfrist aus SEC-15 wird er es planmäßig nicht bleiben. Je Entitätsart eine Abfrage über alle Einträge statt je Eintrag eine.
18.	Einfügen in Schleife, wo `batch` danebensteht (CR-18)
	`createAllocationsForBilling` fügt die gebuchten Erstattungen einzeln ein, `replaceBonusTiers` die Bonus-Stufen ebenso — während `submissions.ts` für denselben Fall `conn.batch(…)` benutzt und `reminders/store.ts` die `VALUES`-Liste von Hand baut. Drei Schreibweisen für eine Aufgabe, und die langsamste sitzt dort, wo eine Abrechnung mit dreißig Rechnungen dreißig Rundreisen unter Sperren kostet. Mit SEC-11 zusammen erledigen.
19.	32 `as`-Casts, weil Treiberzeilen untypisiert ankommen (CR-19)
	Der Treiber liefert `Record<string, unknown>`, und der Code holt sich die Typen mit Zusicherungen zurück. Die schärfste steht in `contract-years.ts`: `listTermsWithValidity(…) as unknown as BonusTerms[]` — ein doppelter Cast, also die Feststellung, dass die Typen nichts miteinander zu tun haben; eine Umbenennung würde dort lautlos die Bonus-Berechnung falsch füttern. Keine Typisierungsoffensive, sondern zwei gezielte Schritte: echter Rückgabetyp für `listTermsWithValidity`, ein Helfer `rowAs<T>()` für den Rest.
20.	„account“ bezeichnet drei verschiedene Dinge (CR-20)
	`account` heißt im Code der Versicherte, die Kontoverbindung eines Abrechnungsdienstleisters und das Benutzerkonto. Zwei Module exportieren beide ein `accountsTable`, weshalb der Papierkorb eines davon beim Import umbenennen muss; dazu gibt es zwei `accountForInvoice` mit verschiedener Bedeutung. Noch kein Fehler, aber Zeitverlust beim Lesen und eine Falle bei jeder Umbenennung per Suche. Die Bankverbindung durchgängig `bankAccount` nennen — nur im Code, nicht in Spalten oder API-Feldern.
21.	ID-Muster erlaubt ein Zeichen, das der Generator nie erzeugt (CR-21)
	`ID_ALPHABET` lässt `0`, `O`, `1`, `I` und `l` bewusst weg, das Prüfmuster `entityIdPattern` erlaubt mit `a-z` aber `l`. Kein Loch, aber die Doku sagt etwas anderes als der Code, und das Muster ist genau dafür da, das Alphabet durchzusetzen. Das Muster aus dem Alphabet ableiten oder `a-km-z` schreiben.
22.	Jahr im DELETE der Vertragsjahre ungeprüft (CR-22)
	`PUT /contracts/:uid/years/:year` prüft das Jahr samt `NaN`, `DELETE` prüft gar nicht und gibt `Number(…)` direkt in die Abfrage — bei `/years/abc` also `NaN`, was nichts löscht und trotzdem 204 antwortet. Dieselbe Prüfung auch im DELETE.
23.	Eindeutigkeitsprüfung im PATCH außerhalb der Transaktion (CR-23)
	Beim Anlegen eines Beitragsstands oder einer Konditionen-Zeile läuft `assertValidityFree` innerhalb der Transaktion, beim Ändern davor gegen den Pool. Zwei gleichzeitige Änderungen könnten beide bestehen und dasselbe Gültigkeitsdatum schreiben; ein UNIQUE-Index fängt das nicht ab, weil es keinen gibt. In einem Haushalt theoretisch, die Asymmetrie zur POST-Route nicht. Prüfung in die Transaktion ziehen; der Index wäre eine eigene Entscheidung (Migration).
24.	Paralleler 401 löst mehrere Refreshes aus und wirft den Nutzer hinaus (CR-24)
	`apiFetch` hat keinen Single-Flight: laufen mehrere Anfragen gleichzeitig und ist der Zugriffstoken abgelaufen, ruft jede `tryRefresh()`. Der Refresh rotiert und widerruft den vorgezeigten Token sofort — der erste Aufruf gewinnt, die übrigen bekommen 401, und `tryRefresh()` löscht im `catch` die gerade erneuerte Sitzung. Der Nutzer landet ohne erkennbaren Grund auf der Anmeldeseite; parallele Aufrufe gibt es an fünf Stellen. Das ist der einzige Befund des Code-Reviews, den ein Nutzer als Fehler erlebt, und er verschärft sich mit SEC-07: der eigene Client löst dann aus, was dort als Diebstahl gewertet wird. Single-Flight im Store, vor der SEC-07-Scheibe.
25.	35 handgeschriebene Envelopes, fünfmal derselbe `unwrap` (CR-25)
	`apiFetch<T>` liefert die Antwort samt Hülle, also schreibt jeder Aufrufer `apiFetch<{ data: … }>` — 35-mal in zehn Dateien —, und in fünf Modulen steht dieselbe Zeile `const unwrap = <T>(res: { data: T }): T => res.data;`. Ein `apiData<T>()` neben `apiFetch` räumt beides weg; `apiFetch` bleibt für die Antworten ohne Envelope (siehe CR-09).
26.	Die Oberfläche kennt nur „Admin oder nicht“ (CR-26)
	Die API hat zwölf Rechte, global oder je Versichertem vergebbar; der Client wertet genau eines aus (`isAdmin = MANAGE_USERS`) und kein einziger Knopf prüft ein Recht. Zwei Folgen: Papierkorb und Einstellungen hängen an `MANAGE_TRASH` bzw. `MANAGE_SETTINGS`, werden aber nur Admins gezeigt — das Recht ist vergeben und wirkungslos; und ein Nutzer mit Leserecht sieht „Neue Rechnung“, „Löschen“, „Einreichen“ und erfährt erst nach dem Absenden von der fehlenden Berechtigung. Die API hält dicht, die Oberfläche lügt. Das ist die größte fehlende Funktion des Reviews; sie fällt in dem Moment auf, in dem zum ersten Mal jemand mit eingeschränkten Rechten angelegt wird. Ein `can(permission, accountUID?)` im Store, `requiresAdmin` durch das jeweils richtige Recht ersetzen, Aktionen deaktivieren statt anbieten.
27.	Policen werden vollständig geladen und im Client gefiltert (CR-27)
	Der Rechnungs-Arbeitsbereich holt `/contracts` ohne Filter und wirft anschließend alles weg, was nicht zum angezeigten Versicherten gehört — während Rechnungen und Abrechnungen einen `accountUID`-Filter haben. `?accountUID=` an `GET /contracts` ergänzen (mit dem Helfer aus CR-07 wenige Zeilen).
28.	`design-system/index.ts` ist tot (CR-28)
	Die Sammeldatei exportiert fünf der fünfzehn Komponenten und wird nirgends importiert: null Treffer, dagegen 141 direkte Importe aus `design-system/components/…`. Sie sieht aus wie die öffentliche Oberfläche des Design-Systems und ist keine. Löschen.
29.	17 Dialoge wiederholen denselben Vertrag von Hand (CR-29)
	Die Dialoge folgen alle derselben Form, schreiben sie aber jeder für sich: 14 deklarieren das Paar `submitting`/`error` als Props, 13 halten ein eigenes `localError`, 9 bauen einen eigenen `watch(() => props.open, …)` zum Zurücksetzen. Tut nicht weh, bis sich die Form ändert — etwa wenn die Rechteprüfung aus CR-26 in jeden Dialog muss; dann sind es 17 Änderungen statt einer. Ein `useFormDialog()` und ein gemeinsamer Prop-Typ, schrittweise eingeführt.
30.	Vier Ansichten über 750 Zeilen (CR-30)
	`InvoiceWorkspaceView.vue` (1025), `InvoiceDetailDialog.vue` (983), `ContractDetailDialog.vue` (830) und `SettingsView.vue` (766). Weniger schlimm, als die Zahlen klingen — die Fachlogik ist bereits in kleine, getestete Module ausgelagert, der Rest ist überwiegend Vorlage. Keine Generalüberholung, sondern zwei Schnitte: die acht Dialog-Zustände des Arbeitsbereichs in ein `useInvoiceDialogs()`, die Tabelle als eigene Komponente; `SettingsView` entlang seiner drei Abschnitte teilen.
31.	Composable-Dateinamen uneinheitlich (CR-31)
	Fünf Dateien exportieren ein `use…`: `lib/useTableSort.ts` in camelCase, die übrigen vier in kebab-case wie der Rest des Projekts. Umbenennen, fünf Importe.
32.	Keine Abdeckungsmessung, nirgends (CR-32)
	Weder die API (`node --test`) noch das Web (vitest) messen Abdeckung: keine Konfiguration, kein CI-Schritt, keine Schwelle. Die Suiten sind gut, aber ohne Messung ist jede Aussage über Lücken eine Schätzung — auch die in diesem Review. Beide Suiten mit Abdeckung laufen lassen und die Zahl in der CI ausgeben, zunächst ohne Schwelle. Passt zur selben Scheibe wie der `npm audit`-Schritt aus SEC-10.
33.	Das Rechtemodell hat keinen eigenen Test (CR-33)
	`auth/permissions.ts` trägt die Regeln, an denen die ganze Zugriffskontrolle hängt — globale Grants schlagen kontobezogene, deaktivierte Rollen zählen nie, `getAccessibleAccounts` ist die Umkehrung von `listUsersWithAccess` —, und hat keine eigene Testdatei; geprüft wird nur, was die Integrationstests zufällig durchlaufen. Mit SEC-17 zusammen erledigen: dessen Routentest deckt die Außenseite ab, ein kleiner Test gegen die drei Funktionen die Innenseite.
34.	17 der 43 Web-Tests prüfen nur Barrierefreiheit (CR-34)
	43 Testdateien für 61 Komponenten, davon 17 reine axe-Tests; Verhaltenstests gibt es für 11 Komponenten. Ohne eigenen Test sind unter anderem `SettingsView.vue` (766 Zeilen), `ContractDetailDialog.vue` (830) und `BillingsView.vue` (657). Die a11y-Tests sind wertvoll und haben echte Fehler gefunden, prüfen aber kein Verhalten: dass ein leeres Passwortfeld beim Speichern nicht als Löschung geschickt wird, steht in keiner Prüfung. Drei gezielte Tests entlang bereits ausformulierter Regeln; mehr entscheidet die Zahl aus CR-32.
35.	Zwei Demo-Endpunkte aus Slice 3 sind produktiv gemountet (CR-35)
	`GET /api/v1/admin/ping` und `GET /api/v1/accounts/:accountUID/ping` stammen aus der Definition of Done von Slice 3 („proving the guard works“) und sind seitdem in jeder Auslieferung enthalten; sie tun nichts Schädliches, sind aber zwei der 47 Routen, die SEC-17 absichern will, und stehen in keiner Dokumentation. Löschen und die beiden Testfälle auf echte Endpunkte umschreiben (`GET /me`, `GET /accounts/:uid`).
36.	Exportierte Helfer ohne Aufrufer (CR-36)
	`forgetSchemaLinks()` in `trash-references.ts` beschreibt einen Testaufbau, den es nicht gibt (kein Test ruft sie, der Migrationstest berührt den Cache nicht); `requireEntityAccount` siehe CR-08; `premiumsTable` und `termsTable` sind exportiert, werden aber nur in ihrer eigenen Datei benutzt. Zusammen mit CR-08 und CR-28 eine kleine Aufräum-Scheibe.
37.	Migrationen laufen ohne Sperre (CR-37)
	`index.ts` ruft beim Start `runMigrations(pool)`; zwei gleichzeitig startende Container würden dieselbe Migration parallel anwenden, weil umzugs `schema_migrations`-Eintrag erst nach dem Lauf geschrieben wird. Für den dokumentierten Betrieb (eine Instanz) kein Problem — gehört in die Liste, damit die Annahme „genau ein Container“ irgendwo steht. Ein `GET_LOCK()` um den Lauf, oder die Annahme in der README festhalten.
