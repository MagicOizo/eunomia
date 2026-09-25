# Issue Documentation
## Version 0.9.0
### Date 20260925
1.  Tab im Auswahlfeld — Umgesetzt mit v0.12.0-slice.1
	Wenn man in einem Auswahlfeld (eu-picker__control) einen Eintrag wählt und anschließend TAB drück, dann wird der gewählte Eintrag nicht in das Feld übernommen
	sondern nur der Focus wächselt auf das +-Icon. Beim Shift+TAB wird wieder zurück in die Auswahl gewechselt und der ausgewählte Eintrag ist immer noch gewählt
	und kann mit ENTER übernommen werden. Erwartung wäre, dass der Eintrag erst ins Ffeld übernommen (bestätigt) wird und dann auf das +-Icon geweselt wird.
2.  Suche bei Leistungserbringer
	Es fehlt eine Möglichkeit auf der Seite "Leistungserbringer" nach solchen per Name zu suchen. Es werden schnell mehr und man verliert leicht den Überblick.
3.  Suche bei Abrechnungsdienstleister
	Gleiches wie bei Leistungserbringern (20260925-2) nur für die Seite "Abrechnungsdienstleister"
4.  Zusatzfelder beim Abrechnungsdienstleister
	Es fehlt ein "BIC" Feld sowie ein "Empfänger" Feld. Beide sollen optional sein. Beide sind ggf. wichtig zur GiroCode generierung. Wenn Empfänger gesetzt ist, 
	dann wird dieser Name im GiroCode als Name verwendet (und bei den Zahlungsdetails angezeigt), denn es gibt Fälle, wo sich das vom Namen des Dienstleisters
	unterscheidet.
5.  Versionierung von Kontoinformationen
	Es kommt vor, dass ein Abrechnungsdienstleister seine Kontoinformationen wechselt. Es ist unschön dann einen anderen Dienstleister anzugelegen, da es bei der Auswahl nicht
	naheliegend ist, welcher ausgewählt werden müsste. Schöner wäre, wenn man die neue Information mit einem Gültigkeitsdatum Eintragen könnte und es immer beim
	selbem Dienstleister bleibt.
6.  Suche einer Rechnungsnummer
	Wenn man eine Rechnung hat und nicht mehr weiß in welchem Jahr sie liegt, wäre eine Rechnungsnummersuche gut.
7.  Rechnung aus unterschiedlichen Einreichungen in einer Leistungsabrechnung
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
10. Es fehlt die Ansicht für den "Papierkorb"
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
1.	Rechnung mit mehreren Behandlungstagen
	Eine Rechnung kann mehr als ein Behandlungsdatum haben. Wir sollten uns auf lange sicht überlegen, wie wir das auch in der Oberfläche berücksichtigen können. Idealerweise soll je Behandlung die Kosten angegeben werden. Derzeit würde ich als Workarround nur eine der Behandlungsdaten angeben. Nur wenn die Daten in unterschiedlichen Jahren liegen, würde ich eine eigene Rechnung daraus extrahieren. Wir müssen das unterstützen und für den Nutzer so einfach wie möglich machen.
2.	Browservorschlag in Eingabefeldern unterdrücken
	Es kommt immer wieder vor, dass der Browser einen Vorschlag über seine eigene Vorschlagfunktion für felder macht. Das ist tatsächlich störend und passt nicht recht ins Design. Kann man siede automatischen Vorschläge oder Vorbelegungen unterdrücken?