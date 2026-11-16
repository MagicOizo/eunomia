# OIDC-Blueprint — Erfahrungen aus einem Schwesterprojekt

Diese Datei ist **keine Anleitung zum Abschreiben**, sondern die Abkürzung zu den Entscheidungen.
Sie stammt aus einem zweiten, technisch ähnlichen Projekt desselben Autors (Express 5, TypeScript,
MariaDB, JWT mit Refresh-Cookie), in dem die Anmeldung über einen OIDC-Anbieter in neun Scheiben
gebaut und danach gegen ein echtes Authentik durchgeprüft wurde. Was hier steht, ist der Teil, der
Zeit gekostet hat: die Entscheidungen mit ihrer Begründung und die Funde, die erst beim Bauen
sichtbar wurden.

**Die Umgebungsvariablen, die Tabellen- bzw. Settings-Struktur und der Scheibenschnitt müssen für
dieses Projekt neu geprüft werden.** Abschnitt 6 nennt die Stellen, an denen Eunomia anders gebaut
ist, und was daraus folgt.

Der Anbieter heißt im Folgenden neutral **Anmeldedienst**. Das gebaute Protokoll ist reines OIDC;
dass auf der anderen Seite ein Authentik stand, ist nur dort erwähnt, wo eine Eigenheit genau
dieser Software gemeint ist.

---

## 1 Der Schnitt, der funktioniert hat

Sieben Scheiben bis zum vollständigen Vorhaben, danach zwei Nachzügler für einen Fund, der erst
beim Durchsprechen auffiel. Jede war für sich lauffähig und geprüft:

1. **Die Anmeldequelle wird konfigurierbar** — Tabelle/Settings, Vertrag, Admin-Endpunkte (GET/PUT),
   noch kein Login-Weg. Das Secret wird verschlüsselt abgelegt.
2. **Die Verbindung lässt sich prüfen** — `POST .../test`: Discovery gegen den Issuer, Ergebnis als
   Status gespeichert. Noch immer kein Login.
3. **Die Konfiguration hat eine Ansicht** — Formular, Statuszeile, Knopf "Verbindung prüfen", die
   Zeile mit der Redirect-URI zum Kopieren.
4. **Der Login-Weg trägt eine Sitzung** — `/auth/oidc/start` und `/auth/oidc/callback`, Kontoauflösung,
   Sitzung wie nach einer Passwort-Anmeldung. Noch kein Knopf in der Oberfläche.
5. **Der Anmeldedienst bekommt einen Knopf** — Anmeldeseite fragt die öffentlichen Login-Optionen ab
   und zeigt den Knopf; Fehlercodes aus der Rückkehr werden zu Sätzen.
6. **Die Passwort-Anmeldung lässt sich abschalten** — Schalter plus die zwei Sperren davor, plus der
   Notausgang über eine Umgebungsvariable.
7. **Abschluss** — Reparaturweg "Verknüpfung lösen", Doku, Minor-Version.
8. **(nachgezogen)** Die Spalte "ist angekommen" — siehe Fund 4.
9. **(nachgezogen)** Die Einladung beschreibt den Weg, den es gibt — siehe Fund 5.

**Die Reihenfolge ist der Gewinn:** Konfiguration und Prüfung stehen, *bevor* der erste Login-Weg
existiert, und der Schalter, der die Passwort-Anmeldung schließt, kommt als **letztes**. So kann man
sich zu keinem Zeitpunkt selbst aussperren, und jede Scheibe ist am laufenden Stapel vorzeigbar.

---

## 2 Die tragenden Entscheidungen

**Konfiguration gehört in die Anwendung, nicht in die `.env`.** Der Gewinn ist nicht Bequemlichkeit,
sondern der Knopf "Verbindung prüfen": er beweist, dass der zweite Weg herein trägt, **bevor** der
erste geschlossen wird. Eine Einstellung in der `.env` könnte das nicht beweisen, und ein Neustart
wäre nötig, um sie zu korrigieren.

**Eine Singleton-Zeile, von der Migration angelegt** (nicht erst beim ersten Speichern). Begründung:
die Zeile muss immer die Frage "darf man sich noch mit Passwort anmelden?" beantworten können, und
diese Antwort darf nicht davon abhängen, ob jemand das Formular schon einmal geöffnet hat. Vorgabe =
genau der Zustand vor dem Feature: **OIDC aus, Passwort an.** Fehlt die Zeile trotzdem (jemand hat
sie von Hand gelöscht), antwortet der Code mit genau dieser Vorgabe, nicht mit einem Fehler.

**Das Client-Secret verlässt die API nie.** Verschlüsselt abgelegt, im Vertrag steht nur
`secretSet: boolean`; ein ausgelassenes Secret beim Speichern heißt "das gespeicherte behalten".
Entschlüsselt wird es an **einer** Stelle (dem Discovery-Aufruf).

**Zwei Verträge, nicht einer.** Der Admin-Vertrag trägt alles (Issuer, Client-ID, `secretSet`,
Status, Prüfergebnis). Der **öffentliche** Vertrag für die Anmeldeseite trägt nur zwei Dinge: ob die
Passwort-Anmeldung offen ist, und ob/mit welcher Beschriftung es einen Knopf gibt. Was dort **nicht**
drinsteht, ist der Punkt: ein unangemeldeter Aufrufer erfährt nichts über den Anbieter außer, dass es
einen gibt.

**Die Redirect-URI kommt aus der konfigurierten Basis-URL der Anwendung, nie aus dem Host-Header.**
Zwei Gründe: der Anbieter vergleicht sie zeichengenau mit der registrierten, und ein Wert aus dem
Request wäre von außen beeinflussbar. Route und angezeigte Zeile kommen aus **einer** Konstante,
damit "was in den Anbieter eingetragen wird" und "was tatsächlich antwortet" nicht auseinanderlaufen
können.

**Es werden keine Konten angelegt.** Der Anbieter entscheidet, *wer* herein darf; die Anwendung
entscheidet, *was* dieser Jemand darf. Ein drüben zugelassenes Konto ohne lokales Konto wird
abgewiesen (eigener Fehlercode). Der Weg zu einem Konto bleibt die Einladung. Folge: **keine**
Gruppen- oder Rollenübernahme aus dem Token, und deshalb auch kein `groups`-Scope.

**Die E-Mail-Adresse verknüpft einmal, danach führt `sub`.** Neue Spalte `oidc_subject`, nullable und
**UNIQUE** (sonst könnten zwei Konten dieselbe fremde Identität tragen). Die Adresse ist ein Attribut
und beidseitig änderbar, `sub` ist die Identität. Deshalb: erst per `sub` suchen, nur wenn das leer
ist per Adresse — und die gefundene Verknüpfung sofort schreiben.

**Trägt das per Adresse gefundene Konto schon eine _andere_ Identität, wird abgewiesen statt
überschrieben** (eigener Fehlercode, nicht derselbe wie "kein Konto"). Der Fall tritt real ein, sobald
drüben ein Konto gelöscht und unter derselben Adresse neu angelegt wird. Stilles Überschreiben würde
ein Konto an eine fremde Identität übergeben — der eine Fehler hier, den niemand je sehen würde.
Reparatur ist ein **"Verknüpfung lösen"** in der Benutzerverwaltung; die nächste Anmeldung verknüpft
über die Adresse neu.

**Der Flow-Zustand (state, nonce, PKCE-Verifier) steckt in einem signierten, kurzlebigen Cookie**,
nicht in einer Tabelle: zehn Minuten Gültigkeit, kein Aufräumen nötig, nichts darin ist länger als
einen Redirect wert. Signiert mit dem Zugriffstoken-Geheimnis, aber mit einem eigenen
`use`-Anspruch — so verifiziert kein Zugriffstoken als Flow-Zustand und umgekehrt. Cookie-Pfad eng
auf die zwei Login-Routen.

**Das Zugriffstoken wandert nie durch eine URL.** Die Rückkehr setzt nur das Refresh-Cookie und
antwortet mit `302` auf die Startseite; das Zugriffstoken entsteht beim normalen Bootstrap, genau wie
bei einer zurückkehrenden Sitzung.

**Fehler des Login-Wegs antworten als Redirect mit Code, nicht als JSON.** Hier *navigiert* ein
Browser; ein Fehlerobjekt wäre eine leere Seite voller Klammern. Die Codes sind ein **Vertrag**
(Backend wählt, Anmeldeseite formuliert); alles außerhalb des Vertrags wird zu einem generischen
Code und lässt seine Einzelheit im Log.

**Auf diesem Weg gibt es keine Brute-Force-Buchführung** — der Zyklus gehört zum Passwort. Aber: die
Aufräum-Sweeps, die bisher an der Passwort-Anmeldung hingen (abgelaufene Refresh-/Aktions-Token),
müssen **mitgenommen** werden. Sonst wachsen diese Tabellen unbemerkt, sobald die Passwort-Anmeldung
abgeschaltet ist und die alte Anmeldefunktion nie mehr läuft.

**Scopes minimal:** `openid profile email`. `email` ist nicht optional (die Erstverknüpfung hängt
daran), `profile` ist bei Authentik nötig, damit die Adresse überhaupt im ID-Token landet. Jeder
weitere Scope erscheint dem Nutzer auf dem Zustimmungsbildschirm — ein guter Grund, nichts zu
erbitten, was man nicht liest.

**Die Passwort-Anmeldung abzuschalten hat zwei Sperren davor**, mit absichtlich unterschiedlicher
Reichweite:

- "Beide Türen zu" wird bei **jedem** Speichern abgewiesen: der Schalter darf nicht fallen, solange
  der andere Weg nicht aktiv ist.
- Der **Übergang** von offen auf zu verlangt zusätzlich eine **erfolgreiche** letzte Verbindungsprüfung.
  Nur der Übergang, nicht jedes spätere Speichern — sonst wäre das Formular genau dann unreparierbar,
  wenn es gebraucht wird (Passwort schon aus, Anbieter gestört, Prüfung rot, korrigierter Issuer
  ließe sich nicht mehr speichern).
- Der **Rückweg** ist nie gesperrt: "Passwort wieder erlauben" wird immer genommen.
- Die Ansicht rechnet dasselbe aus denselben Vertragsfeldern aus, damit das Formular nicht anbietet,
  was der Server abweist.

**Der Notausgang ist eine Umgebungsvariable**, kein zweiter Schalter in der Oberfläche: gesetzt,
schlägt sie den Schalter in der Datenbank und gibt die Passwort-Anmeldung wieder frei — für den Fall,
dass der Anmeldedienst ausfällt, während er der einzige Weg herein ist. Zu setzen braucht es
Host-Zugriff, und **genau das** ist die Begründung dafür, dass der Schalter in der Oberfläche
überhaupt umgelegt werden darf. Sie wirkt auf die **Entscheidung**, nicht auf die gespeicherte Zeile
— sonst hätte ein Formular-Durchgang den Schalter still zurückgelegt. Im Admin-Vertrag steht sie
deshalb als **eigenes** Feld neben dem gespeicherten Schalter, und die Ansicht sagt beides
nebeneinander (sonst ist ein leerer Haken bei funktionierenden Passwörtern unerklärlich).

**Eine Funktion beantwortet "darf man sich mit Passwort anmelden?"** — Umgebungs-Notausgang gegen
gespeicherten Schalter, an einer Stelle. Daran hören: der Anmelde-Endpunkt, die öffentliche
Anmeldeseite, die Sperre beim Lösen der eigenen Verknüpfung und (siehe Fund 5) die Einladungsmail.
Zwei Rechnungen wären eine Seite, die ein Formular verbirgt, das der Server genommen hätte.

**Die Discovery-Konfiguration wird für den Login-Weg gecacht, für die Prüfung nicht.** Eine Prüfung,
die aus dem Cache antwortet, bestätigt einen alten Erfolg. Der Cache wird beim Speichern der
Konfiguration **weggeworfen** — sonst wirkt ein korrigierter Issuer erst nach dem nächsten Neustart.
Ein fehlgeschlagener Discovery-Versuch wird nicht gemerkt (sonst bleibt ein kurzer Ausfall
"kaputt", bis jemand das Formular erneut speichert).

**Der Anmelde-Endpunkt weist bei geschlossener Passwort-Anmeldung ab, _bevor_ irgendetwas anderes
passiert** — vor der Brute-Force-Zählung, vor dem Zähler, vor einer Zweitfaktor-Mail. Eine
geschlossene Tür darf das Konto dahinter nicht sperren, und ein Browser, der wochenlang ein
gespeichertes Passwort nachschickt, soll nichts hinterlassen.

**Die Passwörter bleiben liegen und werden weiter gebraucht.** Admin-Reset, "Passwort setzen" und
der Passwortwechsel schreiben weiter Hashes; vor allem aber prüfen die unwiderruflichen Löschungen
weiter das eigene Passwort, ganz unabhängig davon, wie die Anmeldung läuft. Wer keines mehr weiß,
bekommt vom Administrator einen Rücksetzlink.

---

## 3 Die Funde, die Zeit gekostet haben

**Fund 1 — Ohne Signaturzertifikat signiert Authentik mit HS256 und veröffentlicht keinen
Schlüssel.** Das Discovery-Dokument antwortet dabei **sauber**. Eine Prüfung, die nach Discovery
aufhört, wird grün — und der Schalter, der die Passwort-Anmeldung schließt, nimmt dieses Grün als
Beweis. Deshalb sieht die Prüfung **zweimal** hin: welche Signaturverfahren der Anbieter nennt (nur
asymmetrische sind verifizierbar), und ob am JWKS-Endpunkt wenigstens ein Schlüssel liegt — mit
eigenem Timeout, denn dieser Abruf ist der eigene. Die Fehlermeldung nennt die Ursache im Klartext
("der Provider hat kein Signing-Key-Zertifikat — setze eines, dann erneut prüfen"). **Der häufigste
Stolperstein beim Einrichten überhaupt.**

**Fund 2 — Das Flow-Cookie muss `sameSite: 'lax'` sein.** Die Rückkehr vom Anmeldedienst ist eine
**seitenfremde** Top-Level-Navigation; ein `strict`-Cookie käme nicht mit. Symptom wäre: der
`state` passt *nie*, für jeden, immer — und man sucht im eigenen Code. Das Refresh-Cookie bleibt
`strict`, weil es in dieser Antwort nur **gesetzt** wird. (Eunomia setzt sein Refresh-Cookie
ebenfalls `strict` — `apps/api/src/auth/http.ts` —, der Fund trifft also eins zu eins.)

**Fund 3 — Die Callback-URL für den Token-Tausch aus der konfigurierten Basis-URL bauen**, nicht aus
dem Request. Die Bibliothek leitet die `redirect_uri` für die Token-Anfrage aus genau dieser URL ab;
kommt sie aus dem Host-Header, weist der Anbieter sie ab, sobald die Anwendung unter einem zweiten
Namen erreichbar ist. Die Query muss dabei erhalten bleiben.

**Fund 4 — Eine Spalte, die "hat ein Passwort gesetzt" bedeutete, wird unter Single Sign-on nie
gesetzt.** Das war nicht nur eine lügende Statusspalte ("Eingeladen", obwohl der Nutzer sich täglich
anmeldet), sondern: die **Empfängerliste der unbeaufsichtigten Mails** filterte auf genau diese
Spalte — ein reines SSO-Konto bekam die Erinnerung **nie**. Lösung: die Spalte bedeutet jetzt "ist
angekommen" und wird bei **jeder** erfolgreichen Anmeldung geschrieben, mit einem `WHERE … IS NULL`
im Repository als Wächter. Damit ist der zweite Aufruf ein No-op, und Altkonten heilen bei der
nächsten Anmeldung **ohne Migration**. → **Vor dem Bauen einmal durchsuchen, welche Abfragen auf
"hat ein Passwort"-artige Spalten filtern.**

**Fund 5 — Die Einladung führte ins Leere.** Sie verschickte einen Link zum Setzen eines Passworts,
mit dem sich der Eingeladene danach nicht anmelden kann. Lösung: die Einladungsmail fragt dieselbe
"darf man sich mit Passwort anmelden?"-Funktion und gabelt. Drei Details, die sich als richtig
erwiesen haben:

- **Beim Versenden** entscheiden, nicht beim Anlegen des Kontos — dann schickt ein erneutes Senden
  nach dem Zurücklegen des Schalters von selbst wieder die Passwort-Mail, ohne eine Zeile dafür.
- Im SSO-Zweig **kein** Aktions-Token anlegen (nicht nur den Link weglassen). Die prüfbare Aussage
  im Test ist dann "es entsteht keine Token-Zeile", nicht ein Wortlaut.
- Die **E-Mail-Adresse im Text ausschreiben**: sie ist das Einzige, was auf der anderen Seite
  übereinstimmen muss, und eine weitergeleitete Mail verliert ihren Umschlag.

**Fund 6 — Der Reparaturweg braucht seine eigene Sperre.** "Verknüpfung lösen" darf man für sich
selbst **nicht**, solange die Passwort-Anmeldung aus ist: hätte sich die Adresse drüben inzwischen
geändert, käme man nicht mehr herein. Umgekehrt steht der Weg bewusst **nicht** hinter einer
Passwort-Bestätigung — ein Konto, das nie ein Passwort hatte, könnte sie nicht geben, und gelöscht
wird dabei nichts.

**Fund 7 — Fremdschlüssel: die referenzierende Spalte muss dem Ziel exakt entsprechen** (auch in
der Vorzeichen-Eigenschaft), sonst weist MariaDB den FK mit `errno 150` ab. Betrifft die
`updated_by`-Spalte der Konfiguration.

**Fund 8 (Testwerkzeug, aber übertragbar) — Integrationssuiten, die gegen _eine_ Datenbank laufen,
dürfen nichts voraussetzen, was eine andere Suite anlegt.** In Hyperion lehnte sich eine Suite für
das Konto hinter ihrem Standard-Token an eine Zeile, die eine andere Suite schrieb; als die Datei
wuchs und dadurch zuerst lief (Vitest sortiert nach Dateigröße), fielen 40 Tests mit `401` — keiner
wegen des Codes, den sie prüfen. **Jede Suite legt ihren Akteur selbst an.** Dasselbe gilt für die
Konfigurationszeile: wer `password_login_enabled` zum Testen umlegt, stellt sie in `afterEach`
zurück, sonst nimmt sie jeder anderen Suite die Passwort-Anmeldung.

---

## 4 Was bewusst **nicht** gebaut wurde

- **Kein Single Logout.** Abmelden beendet die lokale Sitzung, nicht die beim Anmeldedienst. Mehr
  wäre ein eigenes Vorhaben mit eigenen Überraschungen.
- **Keine Kontoanlage und keine Rollen aus dem Token** (siehe Abschnitt 2).
- **Kein zweiter Anbieter parallel.** Eine Singleton-Konfiguration; mehrere wären ein anderes
  Datenmodell.
- **Kein Passwortlink in der SSO-Einladung** (Entscheidung des Autors). Wer ein Passwort braucht,
  bekommt einen Admin-Rücksetzlink.
- **Kein Hinweis auf der "Passwort setzen"-Seite**, dass man sich danach über SSO anmeldet: dorthin
  kommt unter SSO nur, wer gerade einen Admin-Reset bekommen hat — und für den wäre der Satz falsch.
- **Keine Sitzungs-Migration.** Bestehende Sitzungen laufen beim Umschalten normal weiter.

---

## 5 Prüfen: was sich gelohnt hat

**Die fremde Bibliothek mocken, nicht den eigenen Client.** So halten die Tests auch fest, dass
Issuer, Client-ID und das **entschlüsselte** Secret wirklich übergeben werden — der Teil, der
sonst niemandem auffällt.

**Je Fehlerabzweigung ein Test**, und zwar auf den Redirect-Code, nicht auf den Wortlaut:
abgeschaltet, Flow-Zustand fehlt/abgelaufen/passt nicht, kein Konto, Adresse fehlt im Token, fremde
Verknüpfung, Anbieter weist ab. Dazu die zwei Sperren des Schalters und der Notausgang.

**Zwei Tests, die man nicht erwartet, aber braucht:** (1) die erste Anmeldung setzt die
"ist angekommen"-Spalte, die zweite **verschiebt sie nicht**; (2) ein Konto, das nur über SSO
hereinkam, steht in der Empfängerliste der unbeaufsichtigten Mails.

**Die Probe am echten Anmeldedienst in dieser Reihenfolge** (jede Stufe ist für sich aussagekräftig):
Verbindungsprüfung → Erstanmeldung mit Verknüpfung → Anmeldung eines Kontos, das es lokal nicht gibt
→ Passwort-Anmeldung abschalten → Notausgang setzen und zurücknehmen → Verknüpfung lösen und neu
verknüpfen. Für Mail-Wege gilt: lieber den SMTP-Host kurz auf `127.0.0.1` zeigen lassen und in der
Datenbank nachsehen, als Testmails zu verschicken.

---

## 6 Wo Eunomia anders ist (bitte am Code gegenprüfen)

Stand der Durchsicht am 2026-11-15, aus einer Stichprobe — **vor dem Planen verifizieren**:

- **Es braucht wahrscheinlich keine neue Tabelle.** `apps/api/src/settings/registry.ts` ist ein
  typisierter Schlüssel-Wert-Katalog mit genau den Bausteinen, die die Konfiguration braucht:
  `string`, `bool`, **`secret`** (verschlüsselt, verlässt die API nie) und `readonly` für Werte, die
  die Anwendung selbst schreibt — also Issuer, Client-ID, Secret, zwei Schalter, Beschriftung und
  die drei Status-Felder der Verbindungsprüfung. Eine neue `section` (z. B. `login`) dazu. Ob die
  Vorgabe "Passwort an" dort so sicher trägt wie eine von der Migration angelegte Zeile, ist die
  **eine** Frage, die vorher zu beantworten ist (Abschnitt 2, erster Punkt).
- **Verschlüsselung gibt es schon**: `apps/api/src/lib/secret-box.ts`. Kein eigener Krypto-Baustein.
- **Die einzige Schemaänderung ist `users.oidc_subject`** (nullable, UNIQUE) — als Umzug-Migration
  im Stil von `apps/api/src/db/migrations/0xx-*.ts`.
- **JWT läuft über `jose`, nicht `jsonwebtoken`.** Der signierte Flow-Zustand ist also `SignJWT` /
  `jwtVerify`; der eigene `use`-Anspruch und die zehn Minuten bleiben wie beschrieben.
- **Das Frontend ist Vue 3 mit i18n (de + en).** Jede Meldung des Login-Wegs braucht **zwei**
  Fassungen — was die Entscheidung "Fehlercodes als Vertrag, Sätze im Frontend" hier noch wertvoller
  macht als im Schwesterprojekt (dort gibt es nur Deutsch).
- **Umgebungsvariablen prüfen**, bevor der Plan steht: Gibt es eine konfigurierte **absolute
  Basis-URL** der Anwendung (das Äquivalent zu `APP_ORIGIN`)? Ohne sie lassen sich Redirect-URI und
  Callback-URL nicht sauber bauen — und sie aus dem Request zu nehmen, ist Fund 3. Dazu: woran hängt
  das `secure`-Flag der Cookies, und wie wird die Notausgang-Variable durch Compose
  **durchgereicht** (eine Variable, die in `docker-compose.yml` fehlt, erreicht den Container nie;
  und eine geänderte Variable wirkt erst bei `up -d`, nicht bei `restart`).
- **`openid-client` ist noch keine Abhängigkeit.** Im Schwesterprojekt ist es `^6.8.9` von panva
  (abhängigkeitsfrei) — die Fassung, die `buildAuthorizationUrl`, `authorizationCodeGrant`,
  `randomState`, `randomNonce`, `randomPKCECodeVerifier`, `calculatePKCECodeChallenge` und
  `discovery` als **Funktionen** exportiert. Eigenbau für Discovery, PKCE, state/nonce und
  Signaturprüfung lohnt nicht.
- **Rate-Limit**: die beiden Login-Routen und der öffentliche Login-Optionen-Endpunkt brauchen eines
  (im Schwesterprojekt 20 Versuche / 5 min für den Login-Weg, 60 / min für die Optionen — Letzteres
  absichtlich lose, die Seite fragt bei jedem Laden). Prüfen, was Eunomia dafür schon hat.
- **Öffentliches Repo**: keine echten Issuer, Hostnamen oder Adressen in Doku, Tests oder Fixtures —
  Platzhalter wie `https://<provider>/application/o/<slug>/`.
- **Die Hausregeln von Eunomia gelten**, nicht die des Schwesterprojekts: Scheibenschnitt,
  `npm run version:*`, Arbeitsstand in `Notes/Arbeitsstand.md`, Prüfkette und Commit-Konventionen aus
  `CONTRIBUTING.md` / `DEV.md`.

---

## 7 Die Einrichtung auf der Anbieterseite (Authentik), kurz

Ein **Provider** vom Typ "OAuth2/OpenID Provider": Client type **Confidential**; Redirect-URI
**exakt** die Zeile, die die Ansicht zum Kopieren anbietet (nicht leer lassen — Authentik merkt sich
sonst die erste benutzte); **Signing Key: ein Zertifikat, zwingend** (Fund 1); Scopes `openid`,
`profile`, `email`; Subject mode auf der Vorgabe lassen — **nicht** auf E-Mail stellen, sonst
wanderte `sub` mit einer Adressänderung und verlöre genau die Eigenschaft, für die er da ist.

Dazu eine **Application**, an diesen Provider gebunden; ihr Slug bestimmt die **Issuer-URL** (mit
Schrägstrich am Ende). **Nicht** die `.well-known`-URL eintragen: der Discovery-Pfad wird selbst
angehängt, und dabei wird geprüft, dass das Dokument denselben Issuer nennt — wer die Discovery-URL
einträgt, schaltet genau diese Prüfung ab. Authentik koppelt Application und Provider 1:1, zwei
Installationen (z. B. Test und Produktion) brauchen also **je eigene**.

Erwartbare Fehlerbilder in der Statuszeile: `ENOTFOUND`/`ECONNREFUSED` (Adresse falsch oder vom
Container aus nicht erreichbar), `SELF_SIGNED_CERT_IN_CHAIN`/`UNABLE_TO_VERIFY_LEAF_SIGNATURE`
(eigene CA — über `NODE_EXTRA_CA_CERTS` lösen), `404` auf das Discovery-Dokument (Slug falsch),
und die Signatur-Meldung aus Fund 1.
