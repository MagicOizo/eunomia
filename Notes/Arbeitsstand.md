# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Konten der Abrechnungsdienstleister (0.14.0)

- [x] **Slice 44 — Mehrere Kontoverbindungen je Dienstleister** (issues.md 0.12.0-4),
      v0.14.0-slice.1
- [ ] **Slice 45 — Rechnungsliste je Abrechnungsdienstleister** (issues.md 0.12.0-5): braucht einen
      eigenen Endpunkt samt Rechteprüfung je Versichertem (`getAccessibleAccounts`)
