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
