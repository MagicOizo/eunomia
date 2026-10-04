# Sicherheits-Review

## 1 Zweck und Geltungsbereich

Dieses Dokument ist kein Momentaufnahme-Protokoll, sondern die dauerhafte Sicherheitsakte von
Eunomia. Es hält drei Dinge fest:

- das **Bedrohungsmodell**, gegen das geprüft wird (Abschnitt 2),
- die **Invarianten**, gegen die jede künftige Scheibe geprüft wird (Abschnitt 4) — das ist der Teil,
  der über den Tag der ersten Prüfung hinaus trägt,
- die **Befunde** mit ihrem Stand (Abschnitt 5).

Erste vollständige Prüfung: 2026-09-29, Stand `0.16.0-slice.1`, vor dem Sprung auf 1.0.0.
Geprüft wurde der gesamte Anwendungscode (`apps/api`, `apps/web`, `packages/shared-types`), das
Deployment (`apps/api/Dockerfile`, `docker-compose.yml`, `scripts/`), die Abhängigkeiten und die
Verarbeitung der Gesundheitsdaten.

Die Befunde stehen zusätzlich als Punkte in [issues.md](issues.md) und werden dort abgehakt. Dieses
Dokument trägt die Begründung, die Fundstelle und den Nachweis; `issues.md` trägt den Arbeitsstand.

## 2 Bedrohungsmodell

### Was geschützt wird

Eunomia verwaltet private Krankenversicherungsabrechnungen: Rechnungsnummern und -beträge,
Behandlungsdaten, Leistungserbringer, Namen der Versicherten, Kontoverbindungen. Das sind
**Gesundheitsdaten nach Art. 9 DSGVO** — die Kategorie mit dem strengsten Maßstab. Ein Leck ist
nicht rückholbar: wer einmal weiß, wer wann bei welchem Facharzt war, weiß es dauerhaft.

Zweitrangig, aber real: die SMTP-Zugangsdaten und der GitHub-Token in den Systemeinstellungen, und
die Integrität der Abrechnungsdaten (eine unbemerkt veränderte Erstattung ist ein finanzieller
Schaden).

### Betriebsannahme

Die produktive Instanz ist **heute nur aus dem LAN bzw. über VPN erreichbar**; eine
Internet-Exposition hinter TLS-Reverse-Proxy ist geplant. Jeder Befund trägt deshalb zwei
Risikonoten:

- **heute** — LAN/VPN, kleiner, bekannter Nutzerkreis,
- **bei Exposition** — öffentlich erreichbar, anonyme Angreifer, mehrere Nutzer mit
  unterschiedlichen Rechten.

Diese zweite Note ist der Maßstab für 1.0.0, denn eine Version 1.0 soll exponierbar sein.

### Angreifermodelle

| Akteur | Kann | Nicht im Modell |
| --- | --- | --- |
| Anonym von außen | Alles erreichen, was ohne Token antwortet: `/api/v1/version`, `/api/v1/setup`, Login, Refresh, die ausgelieferte SPA | — |
| Angemeldeter Nutzer mit Konto-Rechten | Alles, was seine Grants hergeben; der interessante Fall ist der Ausbruch auf fremde Konten | — |
| Angemeldeter Nutzer mit Teilrechten (`MANAGE_SETTINGS`, `MANAGE_TRASH`) ohne `VIEW_INVOICES` | Gezielt die Wege suchen, auf denen Falldaten an der Kontotrennung vorbei sichtbar werden | — |
| Wer die Datenbank oder ein Backup in die Hand bekommt | Alles lesen, was nicht verschlüsselt ist | — |
| Betreiber/Root auf dem Host | Alles | Gegen den Host-Root wird nicht verteidigt — er betreibt die Instanz |

Ausdrücklich **nicht** im Modell: Seitenkanäle auf Hardware-Ebene, ein kompromittierter
Docker-Host, Angriffe auf die GitHub-Lieferkette des Basis-Images.

## 3 Methode

Gelesen und nachgeprüft wurde, nicht überflogen:

- **jede** der 47 Routen gegen ihre Autorisierung — einschließlich der Fälle, in denen die Prüfung
  nicht in der Route, sondern in der aufgerufenen Service-Funktion sitzt
  (`service-billings.ts:238` → `allocations.ts:178`),
- jede Stelle, an der SQL aus einem Template-Literal entsteht, auf die Frage, ob eine Eingabe hinein
  gelangen kann,
- die Zod-Schemata jedes schreibenden Endpunkts auf Vollständigkeit, Grenzen und Mass Assignment,
- die Kryptografie (`lib/password.ts`, `lib/secret-box.ts`, `auth/tokens.ts`) gegen die üblichen
  Fehler: Parameterwahl, Vergleich in konstanter Zeit, Nonce-Erzeugung, Algorithmus-Bindung,
- die ausgehenden Kanäle (Mailversand, Erinnerungen, Update-Check) auf SSRF, Header-Injection und
  darauf, wessen Daten in wessen Postfach landen,
- Header, Cookies und Auslieferung der SPA,
- `Dockerfile`, `docker-compose.yml`, `scripts/backup.sh`,
- `npm audit` für Produktions- und Entwicklungsabhängigkeiten getrennt.

Wo eine Behauptung nicht aus dem Code allein folgt, wurde sie ausgeführt. Der Nachweis steht am
Befund (SEC-01 trägt ihn).

**Nicht** geprüft: der laufende Produktivbetrieb (keine Tests gegen die Produktivdatenbank), die
Konfiguration des vorgelagerten Reverse-Proxy, die Betriebssicherheit des Docker-Hosts.

## 4 Sicherheits-Invarianten

Die Regeln, gegen die jede künftige Scheibe geprüft wird. Wer eine davon bricht, muss das hier
begründet ändern — sie sind nicht Beschreibung, sondern Vorgabe.

**I-1 Jede Route ist bewacht.** Kein Endpunkt unter `/api/v1` antwortet mit Daten ohne
`createRequireAuth`. Ausnahmen sind abschließend: `/version`, `/setup`, `/auth/login`,
`/auth/refresh`, `/auth/logout`.

**I-2 Jeder Zugriff auf Falldaten ist kontogeprüft.** Wer eine Rechnung, Police, Einreichung,
Leistungsabrechnung oder Buchung liest oder schreibt, hält die Berechtigung **auf deren Konto** —
über `authorizeAccount`/`loadAuthorizedContract` bei Einzelzugriff, über `accountFilter`
(auf `getAccessibleAccounts`) als `WHERE`-Einschränkung bei Listen. Eine Liste ohne Kontofilter ist
ein Fehler, kein Sonderfall. Die Ausnahme ist abschließend benannt und begründet:

1. der Papierkorb hinter dem instanzweiten `MANAGE_TRASH` (siehe SEC-04 und §2.4 des Plans) — ein
   gelöschter Eintrag kann den Verweis auf seinen Versicherten selbst verloren haben.

Eine zweite Ausnahme hat die Nachprüfung aufgeschrieben und die Entscheidung des Autors wieder
aufgehoben: der Export einer Versicherten (`GET /accounts/:uid/export`) verlangt seit dem
04.10.2026 `VIEW_ACCOUNTS`, `VIEW_INVOICES` **und** `VIEW_CONTRACTS` auf diesem Konto und ist damit
keine Ausnahme mehr (§8, B-3).

**Die Ausnahme ist eine Grenze, keine Erlaubnis:** jeder *weitere* Weg zu Falldaten braucht die
Berechtigung seiner Art — der Export ist der Fall, an dem diese Regel einmal nachgegeben hat und
dann wiederhergestellt wurde.

**I-3 `accountUID` ist unveränderlich.** Rechnung und Police lassen sich nicht zwischen Versicherten
verschieben; die Update-Schemata nehmen das Feld ausdrücklich heraus. Ein Verschieben bräuchte eine
Berechtigung auf beiden Konten und gibt es deshalb nicht.

**I-4 SQL bekommt Werte nur als Parameter.** In einem Template-Literal stehen ausschließlich
Konstanten aus dem Code oder generierte `?`-Platzhalter, deren Anzahl aus einer Array-Länge folgt.
Nie ein Wert aus Request, Datenbank oder Umgebung.

**I-5 Geschrieben wird nur auf erlaubte Spalten.** Jeder Schreibweg geht durch eine Whitelist
(`crud/repository.ts` `pickColumns`, oder eine ausbuchstabierte Spaltenliste). Kein `INSERT`/`UPDATE`
übernimmt Schlüssel direkt aus dem Request-Body.

**I-6 Secrets verlassen die API nicht.** Ein als `secret` markiertes Setting wird nach außen nur als
`isSet` sichtbar — auch für Administratoren. In der Datenbank liegt es AES-256-GCM-verschlüsselt.

**I-7 Keine Logzeile enthält ein Geheimnis.** `logEvent` bekommt Host, Fehlercode und Fehlertext,
nie ein Passwort, einen Token oder einen Schlüssel.

**I-8 Der Access-Token bleibt im Speicher.** Kein `localStorage`, kein `sessionStorage`. Der
Refresh-Token lebt ausschließlich im httpOnly-Cookie mit `SameSite=Strict` und Pfadbindung auf
`/api/v1/auth` — daraus folgt zugleich, dass die API keinen CSRF-Schutz braucht, weil kein
API-Aufruf ambient authentifiziert ist.

**I-9 Keine unkontrollierte URL wird zur Senke.** Eine URL aus Benutzereingabe **oder aus einer
fremden Antwort** darf nur dann in ein `href` oder `window.open` gelangen, wenn ihr Schema auf
`http`/`https` geprüft wurde. Der Prüfer dafür ist `isHttpUrl` in `packages/shared/src/http-url.ts`
(`@eunomia/shared`), gelesen von den Schemata der API und von den Senken im Web.
**`z.string().url()` genügt dieser Regel nicht** — siehe SEC-01. Die Erweiterung auf fremde
Antworten kam mit der Nachprüfung (§8): die Release-URL des Update-Checks ist keine Benutzereingabe
und lief trotzdem ungeprüft in zwei `href`.

**I-10 Rechte werden bei jeder Anfrage frisch aufgelöst.** Der Access-Token trägt nur die
Nutzer-UUID, keine Berechtigungen. Ein entzogener Grant und eine Deaktivierung wirken sofort statt
erst beim Ablauf des Tokens.

**I-11 Ausgehende Aufrufe gehen an feste Ziele.** Der Update-Check spricht fest `api.github.com` an;
konfigurierbar ist nur der `owner/repo`-Slug, und der ist regex-geprüft — als Umgebungsvariable
`UPDATE_CHECK_REPO`, geprüft beim Start in `config/env.ts` (`repositorySlug`), nicht als Einstellung
in der Datenbank. Eine Konfiguration, aus der eine beliebige Ziel-URL wird, ist ein SSRF und braucht
eine eigene Begründung.

**I-12 Die Testmail geht nur an die eigene Adresse.** Eine Instanz mit fremdem SMTP-Konto darf nicht
zum Versandweg für Dritte werden.

**I-13 Der Entwicklungs-Seed verweigert die Produktion.** `NODE_ENV=production` bricht `seed.ts` ab,
damit das Demo-Passwort nie in einer echten Instanz landet.

## 5 Befunde

Schwere: **kritisch** (sofort), **hoch** (vor 1.0.0), **mittel** (vor 1.0.0 oder begründet
verschoben), **niedrig** (nach 1.0.0 vertretbar), **Hinweis** (kein Risiko, nur Klarstellung).

Kein Befund ist heute aus dem Internet ausnutzbar, weil die Instanz nicht im Internet steht. Es gab
daher keinen Anlass für eine vorgezogene Hotfix-Scheibe.

### Übersicht

| ID | Befund | heute | bei Exposition |
| --- | --- | --- | --- |
| SEC-01 | `documentLink` akzeptiert `javascript:` — gespeichertes XSS | mittel | **hoch** |
| SEC-02 | Keine Security-Header, keine CSP | niedrig | **hoch** |
| SEC-09 | Kein Audit-Trail für Anmeldung, Rechte, Löschung | niedrig | **hoch** |
| SEC-03 | Erinnerungs-Vorschau umgeht die Kontotrennung | niedrig | mittel |
| SEC-05 | Passwortänderung widerruft Sitzungen nicht | niedrig | mittel |
| SEC-06 | Kein Selbstbedienungs-Passwortwechsel | niedrig | mittel |
| SEC-04 | `MANAGE_TRASH` wirkt kontoübergreifend | niedrig | mittel |
| SEC-10 | Verwundbare Abhängigkeiten, kein CI-Gate | niedrig | mittel |
| SEC-14 | Backup ist unverschlüsselter Klartext | mittel | mittel |
| SEC-15 | Keine Löschfrist, kein Hard-Delete für Nutzer, keine Auskunft | mittel | mittel |
| SEC-13 | Port-Bindung und Container-Härtung | niedrig | mittel |
| SEC-07 | Keine Reuse-Erkennung bei Refresh-Rotation | niedrig | niedrig |
| SEC-17 | Autorisierung ist Konvention, nicht strukturell erzwungen | niedrig | niedrig |
| SEC-08 | `RefreshTokens` wird nie aufgeräumt | niedrig | niedrig |
| SEC-11 | Unbegrenzte Arrays in drei Schemata | niedrig | niedrig |
| SEC-16 | Keine CR/LF-Prüfung auf String-Einstellungen | niedrig | niedrig |
| SEC-12 | `express.json()` ohne ausdrückliches Limit | Hinweis | Hinweis |

---

### SEC-01 — `documentLink` akzeptiert `javascript:` (gespeichertes XSS)

**Bereich:** Eingabevalidierung / Frontend-Senken · **heute:** mittel · **bei Exposition:** hoch

Der Dokument-Link wird mit `z.string().trim().url().max(255)` validiert — in
`domain/invoices.ts:81` und `domain/service-billings.ts:46`. Zod 3 prüft damit nur, ob der
WHATWG-URL-Parser den Wert annimmt, **nicht das Schema**. Nachgewiesen gegen die installierte
Version 3.25.76:

```
ACCEPTED   "javascript:alert(document.domain)"
ACCEPTED   "data:text/html,<script>alert(1)</script>"
ACCEPTED   "vbscript:msgbox(1)"
ACCEPTED   "file:///etc/passwd"
ACCEPTED   "https://ok.example/doc.pdf"
```

Gespeichert wird der Wert an drei Stellen wieder zur Senke:

- `apps/web/src/invoices/PaymentInfoPopover.vue:89` — `<a :href="invoice.documentLink">`. Vue
  bereinigt `:href` nicht. Ein Klick führt `javascript:` in der Origin der App aus. **Das ist der
  ausnutzbare Pfad.**
- `apps/web/src/invoices/InvoiceWorkspaceView.vue:493` und `BillingsView.vue:168` —
  `window.open(link, '_blank', 'noopener')`. Moderne Browser blockieren `javascript:` hier meist;
  auf diese Blockade sollte sich die App nicht verlassen, und `data:`/`file:` bleiben.

Wirkung bei Exposition: ein Nutzer mit `MANAGE_INVOICES` auf **einem** Konto hinterlegt den Link;
ein Administrator öffnet das Dokument; der Access-Token liegt im Speicher derselben Origin und ist
damit abgreifbar, ebenso jede Aktion im Namen des Administrators. Das ist der Weg von einer
Kontoberechtigung zu voller Instanz-Kontrolle.

**Empfehlung.** Der richtige Prüfer steht bereits im Projekt: `isHttpUrl` in
`settings/registry.ts:60` prüft `url.protocol === 'http:' || 'https:'`. Ihn zu einem gemeinsamen
Helfer heben und als Zod-Refinement auf beide `documentLink`-Felder anwenden; im Frontend vor dem
Öffnen dieselbe Prüfung als zweite Linie. Bestandsdaten einmalig prüfen. Verletzt I-9.

### SEC-02 — Keine Security-Header, keine CSP

**Bereich:** Transport/Header · **heute:** niedrig · **bei Exposition:** hoch

Die API setzt keinen einzigen Sicherheits-Header. Kein `helmet` im Projekt, kein `res.setHeader`,
kein `<meta http-equiv>` in `apps/web/index.html`. Es fehlen:

- **`Content-Security-Policy`** — die Schicht, die SEC-01 von „Token weg" auf „Klick tut nichts"
  reduziert hätte,
- `X-Content-Type-Options: nosniff`,
- `Referrer-Policy` — heute geht der volle Pfad an jedes extern verlinkte Dokument,
- `X-Frame-Options` / `frame-ancestors` (Clickjacking),
- `Strict-Transport-Security`.

Zusätzlich ist `x-powered-by: Express` aktiv (`app.disable('x-powered-by')` fehlt).

**Empfehlung.** `helmet` in `app.ts` vor die Router, mit einer CSP, die zur SPA passt
(`default-src 'self'`, `img-src 'self' data:` für die GiroCode-QR, `connect-src 'self'`). HSTS
gehört zum Reverse-Proxy, sollte aber auch hier gesetzt sein, damit eine Instanz ohne fremde
Proxy-Konfiguration nicht ungeschützt ist.

### SEC-03 — Erinnerungs-Vorschau umgeht die Kontotrennung

**Bereich:** Autorisierung / Datenschutz · **heute:** niedrig · **bei Exposition:** mittel

`POST /api/v1/settings/reminders/run` mit `{"dryRun": true}` antwortet mit `preview` — für **jeden**
Empfänger dessen E-Mail-Adresse und den vollständigen Mailtext (`settings/routes.ts:140`). Dieser
Text enthält Rechnungsnummern, den Namen der behandelten Person, den Zahlungsempfänger, den Betrag
und das Fälligkeitsdatum (`reminders/message.ts`).

Der Endpunkt hängt an `MANAGE_SETTINGS` (global), nicht an `VIEW_INVOICES`. Wer die Systemverwaltung
darf, aber auf kein einziges Konto Leserecht hat, liest hier Falldaten **aller** Konten.

Der Erinnerungslauf selbst filtert korrekt pro Empfänger (`reminders/runner.ts`) — der Fehler liegt
allein darin, dass die Vorschau alle Empfänger auf einmal zurückgibt.

**Empfehlung.** Die Vorschau auf das einschränken, was der Aufrufer sehen darf, oder sie auf den
Aufrufer selbst beschränken und ansonsten nur Zählwerte melden. Verletzt I-2.

### SEC-04 — `MANAGE_TRASH` wirkt kontoübergreifend

**Bereich:** Autorisierung · **heute:** niedrig · **bei Exposition:** mittel

Der Papierkorb (`domain/trash.ts:417–435`) prüft `MANAGE_TRASH` ohne `accountUID`, also nur als
globalen Grant — und filtert danach nicht mehr. Wer ihn hält, sieht die gelöschten Datensätze aller
Konten mit sprechenden Bezeichnern (Rechnungsnummern, Namen, Beträge) und kann sie
wiederherstellen oder endgültig löschen, auch für Konten ohne jedes Leserecht.

Das ist eine bewusste Vereinfachung gewesen, aber sie steht quer zum sonst konsequenten
Konto-Scoping. Solange nur Administratoren die Berechtigung halten, ist der Unterschied theoretisch;
sobald `MANAGE_TRASH` an eine Aufräum-Rolle geht, ist er es nicht mehr.

**Empfehlung.** Entweder die Papierkorbliste nach `getAccessibleAccounts` filtern, oder im
Rechte-Modell dokumentieren, dass `MANAGE_TRASH` eine instanzweite Berechtigung wie `MANAGE_USERS`
ist und nur an Administratoren gehört. Die zweite Variante ist billiger und ehrlich, verlangt aber
den Eintrag in 2.4 des Plans.

**Entschieden (Autor, 2026-10-03, Scheibe 8 — v0.17.0-slice.3).** Die zweite Variante. `MANAGE_TRASH`
ist ein instanzweites Administratorrecht; der Papierkorb bleibt kontoübergreifend und steht als
benannte Ausnahme in I-2. Festgeschrieben in §2.4 des Plans, zusammen mit den übrigen instanzweiten
Rechten. Kein Code hat sich geändert — der Befund ist durch eine Festlegung geschlossen, nicht durch
einen Filter. Dass eine kontobezogene Vergabe instanzweiter Rechte wirkungslos ist, wird mit SEC-17
(Scheibe 16) prüfbar gemacht; heute ist es Zusage.

### SEC-05 — Passwortänderung widerruft bestehende Sitzungen nicht

**Bereich:** Authentifizierung · **heute:** niedrig · **bei Exposition:** mittel

`PATCH /api/v1/users/:uuid` mit `password` schreibt den neuen Hash (`auth/admin-routes.ts:107` →
`auth/admin-repository.ts:80`), rührt die `RefreshTokens` des Nutzers aber nicht an. Ein Angreifer,
der einen Refresh-Token besitzt, behält bis zu 30 Tage Zugang — also genau in dem Fall, für den man
das Passwort wechselt.

Die **Deaktivierung** ist dagegen richtig gelöst: `refresh()` prüft `userStatus !== 1`
(`auth/service.ts`), und `createRequireAuth` prüft ihn bei jeder Anfrage. Ein deaktivierter Nutzer
ist sofort draußen.

**Empfehlung.** Beim Setzen eines neuen Passworts alle Refresh-Token des Nutzers widerrufen
(`UPDATE RefreshTokens SET revokedAt = NOW() WHERE userID = ? AND revokedAt IS NULL`).

### SEC-06 — Kein Selbstbedienungs-Passwortwechsel

**Bereich:** Authentifizierung · **heute:** niedrig · **bei Exposition:** mittel

Passwörter lassen sich nur über die Benutzerverwaltung ändern, also nur von einem Inhaber von
`MANAGE_USERS`. Ein gewöhnlicher Nutzer kann sein eigenes Passwort nicht wechseln. Zwei Folgen:

- ein kompromittiertes Passwort kann nur der Administrator drehen, und er kennt danach das neue,
- es gibt keinen Weg, bei dem das alte Passwort zur Bestätigung verlangt wird.

Das ist zugleich eine Funktionslücke und gehört in den Befundkatalog des Code-Reviews (B7).

**Empfehlung.** `POST /api/v1/auth/password` mit altem und neuem Passwort, danach Widerruf aller
eigenen Refresh-Token außer dem laufenden — zusammen mit SEC-05 eine Scheibe.

### SEC-07 — Keine Reuse-Erkennung bei der Refresh-Rotation

**Bereich:** Authentifizierung · **heute:** niedrig · **bei Exposition:** niedrig

Die Rotation ist vorhanden und richtig: der vorgezeigte Token wird widerrufen, ein neuer ausgegeben
(`auth/service.ts` `refresh`). Ein zweites Vorzeigen desselben Tokens scheitert also. Was fehlt, ist
die Schlussfolgerung daraus: ein wiederverwendeter Token ist ein sicheres Zeichen für einen
gestohlenen, und dann sollte die ganze Token-Kette des Nutzers fallen, nicht nur diese eine Anfrage.

**Empfehlung.** Beim Treffer auf einen bereits widerrufenen Hash alle aktiven Token des Nutzers
widerrufen und ein Log-Ereignis schreiben (siehe SEC-09).

### SEC-08 — `RefreshTokens` wird nie aufgeräumt

**Bereich:** Hygiene/Verfügbarkeit · **heute:** niedrig · **bei Exposition:** niedrig

Es gibt kein `DELETE` auf `RefreshTokens` außer im Reset des Entwicklungs-Seeds. Abgelaufene und
widerrufene Zeilen bleiben für immer — jede Anmeldung und jede Rotation legt eine an.

**Empfehlung.** Im täglichen Erinnerungs-Tick (`reminders/schedule.ts`) mit aufräumen: alles löschen,
was abgelaufen oder seit mehr als einer Refresh-Laufzeit widerrufen ist.

### SEC-09 — Kein Audit-Trail

**Bereich:** Logging / Nachweisbarkeit · **heute:** niedrig · **bei Exposition:** hoch

`lib/log.ts` ist gut gebaut — ein greppbares Ereignisformat mit der ausdrücklichen Regel, dass nie
ein Geheimnis in ein Feld gehört. Benutzt wird es aber nur von Mailversand, Erinnerungen,
Update-Check und der Settings-Entschlüsselung. Es gibt **kein einziges** Ereignis für:

- erfolgreiche und fehlgeschlagene Anmeldung,
- abgewiesene Autorisierung (401/403),
- Anlegen, Ändern, Deaktivieren eines Nutzers und jede Rollenänderung,
- endgültiges Löschen im Papierkorb,
- Änderungen an den Systemeinstellungen.

Damit ist ein Passwort-Rateangriff unsichtbar, und nach einem Vorfall lässt sich nicht feststellen,
wer was gesehen oder gelöscht hat. Bei Art.-9-Daten ist die Nachvollziehbarkeit selbst eine
Schutzmaßnahme, nicht nur eine Betriebsannehmlichkeit. Nach SEC-01 und SEC-02 halte ich das für den
wichtigsten Befund.

**Empfehlung.** Ereignisse `AUTH_LOGIN_OK`, `AUTH_LOGIN_FAILED` (mit Quell-IP, ohne Passwort),
`AUTH_FORBIDDEN`, `USER_CREATED`, `USER_UPDATED`, `USER_ROLES_CHANGED`, `TRASH_PURGED`,
`SETTINGS_CHANGED` über `logEvent`. Kein Falldateninhalt in die Zeile, nur UIDs — damit bleibt I-7
gewahrt und die Zeile ist trotzdem nachvollziehbar.

### SEC-10 — Verwundbare Abhängigkeiten, kein CI-Gate

**Bereich:** Lieferkette · **heute:** niedrig · **bei Exposition:** mittel

`npm audit --omit=dev` (das ist, was das Produktionsimage enthält) meldet drei:

| Paket | Schwere | Relevanz |
| --- | --- | --- |
| `qs` (über `express`) | mittel | DoS über die Query-Zerlegung — auf **jeder** API-Anfrage erreichbar |
| `nanoid` | hoch | nur über die Web-Build-Kette erreichbar, im Laufzeitpfad nicht ausgeführt |
| `postcss` | mittel | dito (Vite/Vue-Build) |

In den Entwicklungsabhängigkeiten zusätzlich `undici`, `brace-expansion` und `vitest`/
`@vitest/mocker`. Für alle steht ein Fix bereit (`npm audit fix`).

Materiell ist nur `qs` — die anderen liegen im Image, werden aber nie ausgeführt.

**Empfehlung.** `npm audit fix` fahren, und in `.github/workflows/ci.yml` einen Schritt
`npm audit --omit=dev --audit-level=high` ergänzen, damit der nächste Fund am Tag des Pushes
auffällt statt beim nächsten Review. Dass die Web-Build-Abhängigkeiten im Laufzeitimage mitfahren,
gehört in das Code-Review (unnötige Angriffsfläche und Imagegröße).

### SEC-11 — Unbegrenzte Arrays in drei Schemata

**Bereich:** Lastgrenzen · **heute:** niedrig · **bei Exposition:** niedrig

- `domain/allocations.ts:38` — `entries` hat `.min(1)`, aber kein `.max()`. Jeder Eintrag wird als
  eigenes `INSERT` in **einer** Transaktion geschrieben, während alle betroffenen Rechnungen mit
  `FOR UPDATE` gesperrt sind.
- `auth/admin-routes.ts:45` und `:47` — `roleUIDs` und `grants` ohne Obergrenze, ebenfalls
  Einzel-`INSERT`s in einer Transaktion.

Begrenzt wird das heute allein durch das Body-Limit (SEC-12), also auf einige Tausend Einträge. Zum
Ausnutzen braucht es bereits Schreibrechte.

**Empfehlung.** Je ein `.max()` in der Größenordnung des fachlich Sinnvollen (Buchungen: 200; Rollen
und Grants: 100).

### SEC-12 — `express.json()` ohne ausdrückliches Limit

**Bereich:** Lastgrenzen · **Hinweis**

`app.ts:64` ruft `express.json()` ohne Optionen. Express 5 setzt dann 100 kB — es besteht also kein
Loch. Die Grenze steht aber nirgends im Projekt und hinge an einem Standardwert, den ein
Major-Upgrade ändern könnte.

**Empfehlung.** `express.json({ limit: '100kb' })` schreiben und den Grund als Kommentar dazu.

### SEC-13 — Port-Bindung und Container-Härtung

**Bereich:** Deployment · **heute:** niedrig · **bei Exposition:** mittel

Das Deployment ist überwiegend vorbildlich: Multi-Stage-Build, eigener Benutzer `eunomia:nodejs`
statt root, `npm ci --omit=dev`, zufälliges Root-Passwort für MariaDB, **kein** Port-Mapping auf die
Datenbank, Healthcheck auf dem JSON-Endpunkt.

Offen bleiben drei Punkte:

- `ports: '${PORT:-3000}:3000'` bindet auf **allen** Host-Schnittstellen. Hinter einem
  Reverse-Proxy gehört dort `127.0.0.1:${PORT}:3000`, sonst ist die API am Proxy vorbei erreichbar —
  und damit auch an dessen TLS und Zugriffsregeln vorbei.
- Keine `security_opt: [no-new-privileges:true]`, kein `read_only`, kein `cap_drop`.
- Keine Speicher-/CPU-Grenzen; ein Lastproblem im API-Container kann den Host mitnehmen.

**Empfehlung.** Alle drei in `docker-compose.yml`, die Bindung an `127.0.0.1` zusammen mit der
Proxy-Anleitung in der README — sie gehören inhaltlich zusammen.

### SEC-14 — Backup ist unverschlüsselter Klartext

**Bereich:** Datenschutz · **heute:** mittel · **bei Exposition:** mittel

`scripts/backup.sh` streamt einen vollständigen logischen Dump nach STDOUT, gzip-komprimiert, sonst
unverändert. Das Ergebnis ist der komplette Art.-9-Datenbestand im Klartext in einer Datei auf dem
Host — und die dokumentierte Verwendung (`… > eunomia-$(date +%F).sql.gz`) legt sie unverschlüsselt
im Arbeitsverzeichnis ab.

Die verschlüsselten Settings-Secrets sind darin unlesbar, weil der Schlüssel in der Umgebung bleibt
— das ist der Zweck von 2.6 und es funktioniert. Die Falldaten liegen aber offen.

Dass die Verschlüsselung Sache des Betreibers ist, ist vertretbar. Dass die README das nicht
verlangt, ist es nicht.

**Empfehlung.** Ein optionaler Verschlüsselungsschritt im Skript (`age` oder `gpg --symmetric`), und
in der README ein ausdrücklicher Abschnitt: wohin Backups gehören, wie lange sie aufbewahrt werden,
und dass sie verschlüsselt sein müssen.

### SEC-15 — Keine Löschfrist, kein Hard-Delete für Nutzer, keine Auskunft

**Bereich:** Datenschutz (Art. 5, 15, 17, 20 DSGVO) · **heute:** mittel · **bei Exposition:** mittel

Drei zusammenhängende Lücken:

- **Keine Aufbewahrungs-/Löschfrist.** Der Papierkorb hält gelöschte Datensätze unbegrenzt; endgültig
  gelöscht wird nur von Hand. Es gibt keine Regel, nach der Falldaten irgendwann verschwinden.
- **Nutzer lassen sich nicht endgültig löschen.** `softDeleteUser` setzt `userStatus = -1`
  (`auth/admin-repository.ts:115`); Name und E-Mail-Adresse bleiben dauerhaft in `Users`. Ein
  Hard-Delete existiert für Nutzer nicht — der Papierkorb kennt die Entität nicht.
- **Keine Auskunfts-/Exportfunktion.** Es gibt keinen Weg, die zu einer Person gespeicherten Daten
  vollständig auszugeben. Für eine selbstgehostete Haushaltsanwendung ist das nachrangig, für eine
  Version 1.0 mit Art.-9-Daten gehört zumindest die Entscheidung dokumentiert.

**Empfehlung.** Die Aufbewahrungsfrist als Systemeinstellung mit automatischer Endlöschung im
Papierkorb; Nutzer in den Papierkorb aufnehmen; ein Konto-Export (JSON) als Funktionsvorschlag ins
Code-Review (B7). Das Ergebnis gehört als Abschnitt in den Plan, nicht nur in den Code.

### SEC-16 — Keine CR/LF-Prüfung auf String-Einstellungen

**Bereich:** Ausgehende Kommunikation · **heute:** niedrig · **bei Exposition:** niedrig

`mail.fromName` geht ungeprüft in den From-Header (`mail/mailer.ts:198`:
`"${config.fromName}" <${config.fromAddress}>`). `validateIncoming` prüft Länge und optional ein
Format, aber kein Setting prüft auf `\r`/`\n`; `trim()` entfernt nur die Ränder. Nodemailer kodiert
Anzeigenamen, weshalb daraus voraussichtlich keine Header-Injection wird — aber die Prüfung fehlt,
und wir verlassen uns damit auf eine Bibliothekseigenschaft statt auf eine eigene Grenze.

**Empfehlung.** In `validateIncoming` für alle `string`-Settings Steuerzeichen abweisen.

### SEC-17 — Autorisierung ist Konvention, nicht strukturell erzwungen

**Bereich:** Vorbeugung · **heute:** niedrig · **bei Exposition:** niedrig

Dies ist **kein Loch**: alle 47 Routen wurden geprüft, jede ist abgedeckt. Es ist ein Befund über
die Art der Absicherung.

Nur ein Teil der Routen trägt die Prüfung als Middleware (`requireAuth, requirePermission`). Der
größere Teil — alles Kontobezogene — prüft **im Handler** über `authorizeAccount`, teils erst in der
aufgerufenen Service-Funktion: `POST /billings/:uid/allocations` (`service-billings.ts:238`) sieht
ungeprüft aus und ist es nicht, weil `createAllocationsForBilling` (`allocations.ts:178`) prüft.
Dasselbe bei `PATCH /allocations/:uid`.

Das ist sachlich richtig — die Berechtigung hängt am Konto, das erst nach dem Laden der Entität
bekannt ist. Aber: eine neue Route, die den Aufruf vergisst, fällt niemandem auf. Es gibt keinen
Test, der behauptet „jede Route ist bewacht".

Verwandt und ebenso indirekt: die Kontotrennung beim Buchen folgt nicht aus einer eigenen Prüfung,
sondern daraus, dass `assertEntriesBookable` `submittedHere` verlangt (`allocations.ts:130`) und
Einreichungen bereits kontogeprüft sind (`assertInvoicesSubmittable`, `submissions.ts:86`). Wer
diese Regel einmal lockert, öffnet damit unbeabsichtigt den kontoübergreifenden Zugriff.

**Empfehlung.** Ein Integrationstest, der die Routentabelle des Express-Apps ausliest und für jede
Route, die nicht auf der Ausnahmeliste aus I-1 steht, eine Anfrage ohne Token gegen 401 und — wo
kontobezogen — mit einem fremdkontigen Nutzer gegen 403 prüft. Damit wird I-1 und I-2 prüfbar statt
nur dokumentiert. Dazu ein Kommentar an `loadCandidates`, der die Abhängigkeit aus dem zweiten
Absatz festhält.

## 6 Was geprüft wurde und gut ist

Damit spätere Umbauten wissen, was sie nicht kaputtmachen dürfen — jeder Punkt wurde nachgelesen,
nicht angenommen:

- **Passwörter:** scrypt mit N=2¹⁵, r=8, p=1, 16-Byte-Salt, selbstbeschreibendes Format, Vergleich
  mit `timingSafeEqual`. Der Login rechnet gegen einen Dummy-Hash weiter, wenn die E-Mail unbekannt
  ist — die Antwortzeit verrät also nicht, welche Konten existieren.
- **Token:** Access-Token als HS256-JWT mit festgenagelten `algorithms` und `issuer`, Laufzeit
  15 Minuten, Inhalt nur die UUID. Refresh-Token opak, 32 Byte Zufall, **nur als SHA-256-Hash**
  gespeichert, rotierend.
- **Secrets:** AES-256-GCM mit 96-Bit-Nonce aus `randomBytes`, Authentifizierungs-Tag geprüft,
  selbstbeschreibendes Format für spätere Algorithmuswechsel. Schlüssel nur aus der Umgebung,
  Fehlkonfiguration bricht beim Start ab. Plaintext verlässt die API nie.
- **SQL:** durchgängig parametrisiert. Bei der Nachprüfung (§8) wurde das über alle
  Interpolationsstellen des Produktionscodes gelesen, nicht über eine Auswahl: Tabellen- und
  Spaltennamen kommen aus dem Code (`trash-registry.ts`, `trash-tree.ts`, `crud/repository.ts`,
  `account-export.ts`), jede Werteinterpolation ist ein generierter `?`-Platzhalter. Die zwei
  Ausnahmen — ein eingesetztes `LIMIT` in der Rechnungs- und in der Abrechnungsliste — sind dort
  behoben worden.
- **Mass Assignment:** ausgeschlossen durch `pickColumns` gegen eine Spalten-Whitelist.
- **Kontotrennung:** `accountUID` ist bei Rechnung und Police aus den Update-Schemata ausdrücklich
  herausgenommen, mit Begründung im Code. Einreichungen prüfen jede Rechnung gegen das Konto der
  Police (`assertInvoicesSubmittable`).
- **Fehler:** ein terminaler Handler, bekannte SQL-Fehlernummern werden auf saubere API-Fehler
  abgebildet, alles andere wird geloggt und als generischer 500 beantwortet. Keine Stacktraces nach
  außen. Ein Authentifizierungsfehler ist immer derselbe 401, egal woran es lag.
- **Frontend:** kein `v-html` im gesamten Projekt. Access-Token nur in einer Pinia-Ref, nie in
  `localStorage` — seit §8 als Quell-Scan in `stores/auth.spec.ts` geprüft, nicht mehr nur zugesagt.
- **Cookie:** `httpOnly`, `secure` in Produktion, `SameSite=Strict`, Pfad auf `/api/v1/auth`
  begrenzt.
- **Update-Check:** Ziel-Host fest verdrahtet, nur der `owner/repo`-Slug konfigurierbar und
  regex-geprüft, Timeout gesetzt, Antwort schema-validiert. Kein SSRF.
- **Setup-Endpunkt:** Token-Prüfung in konstanter Zeit **vor** der Prüfung, ob schon ein Nutzer
  existiert — ein falscher Token verrät damit nicht, ob das Setup noch offen ist. `/me` meldet einem
  Administrator, dass `SETUP_TOKEN` noch gesetzt ist.
- **Testmail:** ausschließlich an die Adresse des Aufrufers; kein Empfängerfeld im Body.
- **Letzter Administrator:** lässt sich weder deaktivieren noch löschen noch entrechten; Aktionen am
  eigenen Konto sind gesperrt.
- **Rate-Limiting:** 10 Anfragen pro 15 Minuten auf Login/Refresh/Setup, 300 pro Minute auf die
  übrige API, mit `trust proxy` für die echte Client-IP.
- **Seed:** verweigert `NODE_ENV=production` — seit §8 als Test, der den Seed wirklich startet
  (`seed/seed.test.ts`).

## 7 Bewusst akzeptierte Risiken

- **Kein CSRF-Token.** Nicht nötig: die API authentifiziert ausschließlich über den
  `Authorization`-Header, und das einzige Cookie ist `SameSite=Strict` und pfadgebunden. Kein
  API-Aufruf ist ambient authentifiziert. Festgehalten als I-8, damit eine spätere Umstellung auf
  Cookie-Authentifizierung diese Entscheidung mitzieht.
- **Keine Zwei-Faktor-Authentifizierung.** Für eine Haushaltsinstanz hinter VPN unverhältnismäßig.
  Vor einer echten Internet-Exposition neu zu bewerten.
- **Kein Schutz gegen den Host-Root.** Wer den Docker-Host kontrolliert, kontrolliert die
  Anwendung — inklusive `CONFIG_ENCRYPTION_KEY` in der Prozessumgebung. Das ist die Grenze des
  Modells, nicht ein Versäumnis.
- **Passwortregeln bleiben bei mindestens 8 Zeichen.** Keine Komplexitätsregeln, kein Abgleich gegen
  Leak-Listen. Bei einem kleinen, bekannten Nutzerkreis vertretbar; Rate-Limiting und scrypt tragen
  die Last.

## 8 Nachprüfung vor 1.0.0

Geplant war eine Delta-Prüfung **nur** auf den von Meilenstein B berührten Dateien, gegen I-1 bis
I-13, mit besonderem Blick darauf, ob ein Datei-Schnitt eine Autorisierung aus einem Handler
herausgelöst hat, ohne sie neu anzubringen — bei SEC-17 der wahrscheinlichste Weg, sich etwas
einzufangen.

Durchgeführt am 04.10.2026 (v0.19.0-slice.5), und zwar als **vollständiger Durchgang je Invariante**
statt als Delta. Der Grund steht in den Zahlen: die 18 Scheiben haben 266 Dateien angefasst,
darunter `app.ts`, `crud/repository.ts`, `db/transaction.ts`, alle Domain-Dateien, das geteilte
Paket und 43 Dateien im Web. Ein Delta auf dieser Menge ist der ganze Code; ihn als Delta zu lesen
hätte nur den Anschein einer engeren Prüfung gehabt.

### Was je Invariante geprüft wurde

- **I-1 (gehalten, maschinell).** `auth/route-guards.test.ts` läuft grün: 15 Prüfungen über alle
  **87** Routen, die die App heute beantwortet (die Untergrenze der Suite steht bei 83, also sind
  seit Scheibe 16 vier dazugekommen: `POST /users/:uuid/restore`,
  `DELETE /users/:uuid/permanent`, `POST /settings/retention/run`, `GET /accounts/:uid/export`).
  Ohne `requireAuth` antworten genau die fünf benannten Routen, und jede der übrigen 82 beantwortet
  eine Anfrage ohne Token mit 401 — nicht nur in der Kette gelesen, sondern über HTTP beobachtet.
- **I-2 (gehalten, mit einer neuen benannten Ausnahme).** Die vier neuen Routen tragen ihren
  Wächter als Middleware und sind richtig eingeordnet (Export kontobezogen, Aufbewahrung und
  Nutzer-Löschung instanzweit). Darüber hinaus wurde von Hand nachgelesen, was der Test nur
  **behaupten** kann: die 37 Einträge der `DECLARED`-Tabelle mit einer Prüfung im Handler sagen,
  *wo* sie sitzt, und genau diese Stellen sind im Code nachgesehen — einschließlich der beiden, die
  sie an eine Service-Funktion weiterreichen (`POST /billings/:uid/allocations` →
  `createAllocationsForBilling`, `PATCH /allocations/:uid` → `updateAllocation`, beide mit
  `authorizeAccount(MANAGE_INVOICES)` auf dem Konto der Rechnung). Kein Schnitt der 18 Scheiben hat
  eine Autorisierung verloren. Alle sieben Listen tragen ihren `accountFilter`. Der Befund zum
  Export steht unten.
- **I-3 (gehalten, jetzt geprüft).** `accountUID` ist aus den Update-Schemata von Rechnung
  (`domain/invoices.ts`) und Police (`domain/contracts.ts`) herausgenommen; das Gegenstück bei den
  Abrechnungen ist `contractUID` (`service-billings.ts`), und die Buchung kennt in ihrem
  Patch-Schema überhaupt nur `receiptNumber` und `reimbursement`. Die Einreichung hat keinen
  Update-Weg. Neu als Prüfung festgehalten, siehe unten.
- **I-4 (ein Befund, behoben).** Alle Interpolationsstellen des Produktionscodes gelesen. Was in
  ein Template-Literal eingesetzt wird, ist Tabellen-/Spaltenname oder Alias aus dem Code, ein
  `placeholders(...)`-Ausdruck oder eine aus einer lokalen Liste gebaute `WHERE`-Kette; die beiden
  dynamischen Spaltenlisten (`allocations.ts`, `admin-repository.ts`) lesen ihre Namen aus im Code
  stehenden Tupeln. Zwei Stellen setzten einen **Wert aus der Anfrage** ein — siehe Befunde.
- **I-5 (gehalten).** Jeder Schreibweg geht durch `pickColumns` gegen `t.columns` oder durch eine
  ausbuchstabierte Spaltenliste. `insertManyRows` nimmt die Spalten als Vereinigung über alle
  Zeilen (Scheibe 10), was die Whitelist nicht aufweicht: die Vereinigung wird gegen `t.columns`
  gebildet, nicht gegen die Schlüssel der Zeilen. Kein `INSERT`/`UPDATE` übernimmt Schlüssel aus
  dem Request-Body.
- **I-6 (gehalten).** `getPublicSettings` setzt für ein `secret` ausdrücklich `value: null` und
  lässt nur `isSet` übrig; die vorhandenen Prüfungen tragen die Regel
  (`settings/registry.test.ts`: „only the password and the GitHub token are secrets";
  `settings.integration.test.ts`: `isSet` nach dem Schreiben, und der gespeicherte Wert ist
  verschlüsselt). Keine neue Prüfung nötig.
- **I-7 (gehalten).** Alle 34 Log-Stellen des Produktionscodes gelesen. Geschrieben werden Host,
  Fehlercode, Fehlertext, Ereignisname und Schlüssel**namen** — der Schreibweg der Einstellungen
  nennt ausdrücklich nur die Keys (`settings/routes.ts`), und `SETTINGS_SECRET_UNREADABLE` trägt
  `key: settingKey`, nicht den Wert.
- **I-8 (gehalten, jetzt geprüft).** Kein `localStorage`, kein `sessionStorage`, kein
  `document.cookie` im Web — außer in dem Kommentar, der die Regel nennt. Neu als Prüfung
  festgehalten, siehe unten.
- **I-9 (ein Befund, behoben).** Alle Senken im Web nachgesehen, Templates **und** Zuweisungen in
  JavaScript: `InvoiceWorkspaceView` und `BillingsView` prüfen mit `isHttpUrl` vor dem
  `window.open`; `PaymentInfoPopover` rendert sein `href` nur innerhalb eines
  `v-if="isHttpUrl(...)"`; `PaymentQrPopover` zeigt eine selbst gebaute `data:`-URL, und
  `lib/download.ts` setzt ein `href` auf eine eigene `blob:`-URL. Offen waren die zwei `href` auf
  die Release-URL des Update-Checks — siehe Befunde.
- **I-10 (gehalten).** Der Access-Token trägt nur `sub` (`auth/tokens.ts`). `createRequireAuth`
  lädt den Nutzer bei **jeder** Anfrage und weist ihn ab, wenn `userStatus !== 1`;
  `hasPermission` fragt jedes Mal die Datenbank, ohne Cache. Eine Deaktivierung und ein entzogener
  Grant wirken damit sofort.
- **I-11 (gehalten).** Ziel fest verdrahtet (`https://api.github.com/repos/…`), der Slug kommt aus
  `UPDATE_CHECK_REPO` und wird beim Start regex-geprüft. Die Formulierung der Invariante sprach von
  einer Einstellung; es ist eine Umgebungsvariable, und das steht jetzt dort.
- **I-12 (gehalten).** `POST /settings/mail/test` nimmt keinen Empfänger aus dem Body, sondern
  `getAuthUser(res).email`. Unverändert seit Scheibe 7.
- **I-13 (gehalten, jetzt geprüft).** Die Absage steht als erste Zeile in `main()` von `seed.ts`.
  Weil `main()` modulprivat ist und nur als Einsprungpunkt läuft, hielt die Regel bisher nichts —
  neu als Prüfung festgehalten, siehe unten.

### Befunde

- **B-1 (I-4, behoben).** `domain/invoice-queries.ts` und `domain/service-billings.ts` setzten den
  `limit`-Wert der Anfrage als Zahl in das SQL ein, je mit dem Kommentar, zod habe ihn auf einen
  Integer verengt. Das stimmt und war nicht ausnutzbar — aber I-4 kennt diese Ausnahme nicht, und
  die dritte Liste (`domain/allocations.ts`) machte es längst richtig mit `LIMIT ?`. Beide Stellen
  sind darauf umgestellt. I-4 hat damit keine Ausnahme mehr, und die Zusage in §6 („durchgängig
  parametrisiert") ist wieder wahr.
- **B-2 (I-9, behoben).** `lib/update-check.ts` nahm das `html_url` der GitHub-Antwort mit
  `z.string().url()` — genau die Prüfung, die I-9 für unzureichend erklärt, weil sie
  `javascript:` durchlässt. Der Wert wird als `releaseUrl` weitergegeben und landet in zwei `href`
  (`AppFooter`, `UpdateSection`), beide ohne eigene Prüfung. Praktisch nicht ausnutzbar: die
  Antwort kommt über TLS von `api.github.com`. Behoben am Eingang statt an den Senken
  (`.refine(isHttpUrl)`), weil es dort eine Stelle ist und an den Senken zwei; eine Antwort mit
  einer anderen URL-Art gilt jetzt als `no_release`. Als Fall festgehalten und rot geprüft.
  I-9 ist dabei um fremde Antworten erweitert worden: dass die Regel nur von „Benutzereingabe"
  sprach, ist der Grund, warum diese Stelle durch zwei Reviews gekommen ist.
- **B-3 (I-2, behoben).** `GET /accounts/:uid/export` liefert Rechnungen, Einreichungen,
  Abrechnungen und Buchungen einer Versicherten, verlangte aber nur `VIEW_ACCOUNTS` auf diesem
  Konto — das war die Entscheidung zu SEC-15 (§2.11 des Plans: wer den Datensatz lesen darf, darf
  lesen, was zu ihm gespeichert ist). Mit den beiden Systemrollen hatte das keine Wirkung, weil
  „Nutzer" `VIEW_INVOICES` und `VIEW_CONTRACTS` mitträgt und Rollen über die API nicht anlegbar
  sind; eine Rolle, die in der Datenbank anders zusammengesetzt wird, hätte sie. Nicht eigenmächtig
  geändert, sondern vorgelegt — und **entschieden (Autor, 2026-10-04, Scheibe 1 der letzten
  Befunde): der Export verlangt alle drei Leserechte.** „Den Datensatz lesen dürfen" heißt damit
  nicht „alles über die Person lesen dürfen", I-2 hat seine zweite Ausnahme wieder verloren, und
  §2.11 des Plans ist entsprechend geändert. Der Fall steht in
  `domain/account-export.integration.test.ts` mit einer Rolle, die nur `VIEW_ACCOUNTS` trägt — die
  Rolle, von der der Befund sprach. Die Oberfläche zeigt den Export-Knopf ohne die Rechte weiter an
  und deaktiviert ihn, wie jede andere Aktion seit CR-26.

### Was jetzt geprüft statt zugesagt ist

Vor dieser Nachprüfung waren I-1 und I-2 maschinell gesichert und die elf anderen Prosa. Drei haben
eine Prüfung bekommen — jede dort, wo es bisher **keine** gab, und jede rot geprüft (Regel von Hand
gebrochen, Fall fällt, zurückgenommen):

- **I-3** in `domain/workflow.integration.test.ts`: ein `PATCH` mit fremdem `accountUID` auf
  Rechnung und Police antwortet 200, lässt den Datensatz aber bei seiner Person. Als
  Verhaltensprüfung statt als Quell-Scan, weil die Update-Schemata modulprivat sind.
- **I-8** in `stores/auth.spec.ts`: ein Scan über alle Quelldateien des Webs (Kommentare entfernt,
  damit die eine Stelle, die die Regel nennt, sie nicht bricht). Dazu die Prüfung, dass der Scan
  überhaupt Dateien findet — ein leerer Durchgang darf nicht als sauberer gelten.
- **I-13** in `seed/seed.test.ts`: der Seed wird als Kindprozess gestartet, wie `npm run seed` es
  tut, mit einer von Hand gebauten Umgebung ohne jede `DB_*`-Variable — er kann also keine
  Datenbank erreichen. Geprüft wird die **Meldung**, nicht der Exit-Code: ohne die Regel wäre der
  Lauf am fehlenden `DB_HOST` gescheitert und hätte denselben Code geliefert.

**I-4, I-5, I-7 und I-10 bleiben gelesen, nicht geprüft.** Eine Prüfung dafür müsste SQL-Strings,
Log-Felder oder die Frische einer Auflösung erkennen; was davon billig zu bauen ist, erkennt sie
unzuverlässig, und eine Prüfung, die nicht greift, täuscht Sicherheit nur vor. Für I-4 ist der
Ersatz, dass es nach B-1 keine Stelle mehr gibt, an der ein Wert eingesetzt wird — ein neuer
Einsetzer fällt beim Lesen auf, weil er der einzige wäre.

### Beobachtet, nicht angefasst

- `MAIL_SEND_OK` und `MAIL_SEND_FAILED` schreiben die Empfängeradresse ins Log. Kein Geheimnis,
  also kein Bruch von I-7 — aber eine Adresse, und damit die einzige Stelle, an der ein Log etwas
  über eine Person sagt. Für einen Betreiber, der ohnehin die Einstellungen liest, vertretbar.
- Der Pfad `POST /agencies/:uid/accounts` heißt noch nach dem alten Wort: er verwaltet die
  Kontoverbindungen eines Abrechnungsdienstleisters (`AgencyBankAccounts`), nicht Konten von
  Versicherten — für I-2 ohne Belang, beim Lesen der Routentabelle aber kurz irritierend.

### Stand

I-1 bis I-13 gelten. Alle drei Befunde sind behoben und durch Prüfungen festgehalten; B-3 wurde
dem Autor vorgelegt und am 04.10.2026 zugunsten der strengeren Variante entschieden, womit I-2
wieder genau eine Ausnahme hat (den Papierkorb). Damit ist die Nachprüfung erledigt.
