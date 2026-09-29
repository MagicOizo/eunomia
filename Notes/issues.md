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
1.	Unnötige Meldung bei Direktzahlung
	Meldung "Zahlungsziel und Zahlungsdatum werden auf das Rechnungsdatum gesetzt." muss nicht im Dialog stehen, wenn auf Direktzahlung geschaltet wird. Das nimmt nur Platz weg.
2.	"Nicht gedeckt" nicht im Anlegen-Dialog
	"Nicht gedeckt" ist eine Eigenschaft, die erst nach dem Anlegen festgelegt werden muss, sie braucht nicht im Anlegen, sondern nur im Bearbeiten-Dialog eingestellt werden können
3.	Weitere-Behandlungstage nimmt zu viel Raum ein
	Die Funktion kommt nur bei ca. 10% der Rechnungen zum Einsatz. Sie sollte dezenter im Anlegen-Dialog enthalten sein. Der Rahmen mit fettem Label, Beschreibung und riesiger Schaltfläche sieht so aus, als wäre diese Angabe fast immer erforderlich
4.	Betrag Übernehmen bei Zuordnung
	Es wäre eine Erleichterung mit einem einfachen Klicke auf den Betrag in den Rechnungsdetails (oder einer dezenten Icon daneben) bei der Zuordnung diesen Betrag direkt in das Erstattung-Feld zu übernehmen.
5.	GiroCode-Icon ändert Dialogbreite
	Wenn ich eine Rechnung habe und das Zahlungsdatum setze, wo vorher keines gesetzt war, verschwindet das GiroCode Icon. Der Platz wird aber nicht reserviert (Unterschied zwischen hidden und visible), wodurch der ganze Dialog durch das Setzen des Zahlungsdatums schmaler wird. Das ist nicht schön. (Testsystem hat 1905 Displaybreite)
## Version 0.14.0-slice.2
### Date 20260929
1.	Vorschlagsliste zu schmal für die IBAN — Umgesetzt mit v0.14.0-slice.3
	Bei der Auswahl der Kontoverbindung ist das Vorschlagsfeld nicht lang genug für die IBAN, es entsteht ein horizontaler Scrollbalken. Anklicken lässt er sich nicht, weil das Feld dabei direkt ausgeblendet wird, und schön ist er ohnehin nicht.