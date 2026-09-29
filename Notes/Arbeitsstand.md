# Arbeitsstand

Der Schreibtisch: was gerade offen ist, sonst nichts. Ist das Paket durchgearbeitet, wird der Inhalt
dieser Datei gelöscht — leerer Tisch heißt, es läuft nichts.

Deshalb zeigt **nichts** auf diese Datei: keine Code-Kommentare, keine Commit-Nachrichten, kein
Eintrag im Plan oder im Changelog. Was Bestand hat, steht in [issues.md](issues.md), besser im
[CHANGELOG](../CHANGELOG.md) oder in der [Projektbeschreibung](eunomia-plan.md).

Nach jeder umgesetzten Scheibe wandern drei Dinge zusammen: der Haken hier, der Vermerk
`Umgesetzt mit vX.Y.Z-slice.N` am Punkt in `issues.md`, und der Eintrag im `CHANGELOG.md`.

## Paket: Feinschliff 0.15.0 (die fünf offenen Befunde aus der 0.13.0-Nutzung)

- [x] **Slice 47 — Der Anlegen-Dialog fragt nur, was eine neue Rechnung braucht**
      (issues.md 0.13.0-1/-2/-3), v0.15.0-slice.1
- [x] **Slice 48 — Betrag per Klick in die Erstattung übernehmen** (issues.md 0.13.0-4),
      v0.15.0-slice.2
- [ ] **Slice 49 — Der GiroCode gibt seinen Platz nicht her** (issues.md 0.13.0-5): der Knopf
      verschwindet per `v-if`, und der wide-Dialog misst sich am Inhalt

