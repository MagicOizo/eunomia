# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Anmeldung über OIDC → 1.3.0

Ein Anmeldedienst als zweiter Weg herein, danach die Passwort-Anmeldung abschaltbar. Geplant als
Slices 85–91 in [eunomia-plan.md](eunomia-plan.md), Abschnitt „Paket Anmeldung über OIDC".

| ✓   | Slice | Inhalt                                                  | Version         |
| --- | ----- | ------------------------------------------------------- | --------------- |
| ✓   | 85    | Konfigurierbar: Section `login`, `general.appUrl`       | `1.3.0-slice.1` |
| ✓   | 86    | Verbindung prüfen, Discovery-Cache                      | `1.3.0-slice.2` |
| ✓   | 87    | Ansicht in den Einstellungen                            | `1.3.0-slice.3` |
|     | 88    | Login-Weg: start/callback, `Users.oidcSubject`          | `1.3.0-slice.4` |
|     | 89    | Knopf auf der Login-Seite, Fehlercodes als Sätze        | `1.3.0-slice.5` |
|     | 90    | Passwort-Anmeldung abschaltbar, Notausgang              | `1.3.0-slice.6` |
|     | 91    | Verknüpfung lösen, erzeugtes Passwort, Doku             | `1.3.0-slice.7` |
|     | —     | Release nach Dev-Check und Probe am Anmeldedienst       | `1.3.0`         |
