# Admin-Lotse für Microsoft 365

Browser-Erweiterung für Chrome und Edge. Sie erklärt im Microsoft 365 Admin Center, im Entra Admin Center, in Intune
und im Exchange Admin Center wichtige Einstellungen auf Deutsch: was die Einstellung tut, was wir empfehlen, was
passiert, wenn sie so bleibt, und wo man sie umstellt. Wo es eindeutig geht, liest sie den angezeigten Wert und zeigt,
ob er von der Empfehlung abweicht.

**Installieren und mehr erfahren:** <https://www.hagel-it.de/tools/admin-lotse>
· Datenschutz: <https://www.hagel-it.de/tools/admin-lotse/datenschutz>

*English version below.*

## Drei Zusagen — und wie Sie sie selbst prüfen

| Zusage | Wo Sie es im Quelltext sehen |
|---|---|
| **Ändert nichts.** Die Erweiterung klickt nichts, setzt keinen Wert und schickt kein Formular ab. | Suchen Sie nach `.click(`, `dispatchEvent(`, `.value =`, `.submit(` — im eigenen Code kommt nichts davon vor. Der Test `tests/unit/u20-u21-quelltext.test.ts` bricht den Bau ab, sobald es auftaucht. |
| **Sendet nichts.** Sie baut keine einzige Netzverbindung auf. | Suchen Sie nach `connect-src`: In `manifest.ts` steht `connect-src 'none'`. Diese Sicherheitsrichtlinie setzt der Browser selbst durch, nicht die Erweiterung. Der Test `tests/unit/u40-u43-manifest.test.ts` prüft das gebaute Paket zusätzlich auf `fetch(`, `XMLHttpRequest`, `WebSocket` und `sendBeacon`. |
| **Nur vier Portale.** Sie läuft nirgends sonst. | `PORTAL_HOSTS` in `manifest.ts`: nur die vier Admin-Center von Microsoft. Berechtigungen: `sidePanel` und `storage`, sonst keine. |

## Selbst bauen

Voraussetzung: Node.js 22 (ab 22.12) oder 24.

```bash
npm ci
npm run pruefen   # Typen, Bau für Chrome und Edge, Unit-Tests
npm run bauen     # Pakete in .output/chrome-mv3 und .output/edge-mv3
```

Den Ordner `.output/chrome-mv3` können Sie unter `chrome://extensions` (Entwicklermodus, „Entpackte Erweiterung
laden“) einspielen und mit der Fassung aus dem Store vergleichen.

**Was hier fehlt:** Aufnahmen der echten Microsoft-Portale, mit denen wir intern testen (das ist Microsofts HTML und
darf nicht veröffentlicht werden), unsere Messskripte gegen den Testmandanten und die Store-Unterlagen. Die Tests, die
diese Aufnahmen brauchen, werden hier übersprungen.

**Für Firmen:** Vorlagen für Intune und Gruppenrichtlinie liegen in `firmen/` (siehe `firmen/LIESMICH.md`).

## Fragen und Fehler

Ein Issue in diesem Repository oder eine Mail an info@hagel-it.de. Dieses Repository ist ein Spiegel: Es wird bei jeder
Version aus unserem internen Repository nachgezogen. Pull Requests lesen wir, übernehmen sie aber von Hand.

Herausgeber: hagel IT-Services GmbH, Hamburg — <https://www.hagel-it.de>. Lizenz: MIT.

---

# Admin Pilot for Microsoft 365 (English)

A browser extension for Chrome and Edge. In the Microsoft 365 admin center, the Entra admin center, Intune and the
Exchange admin center it explains important settings: what a setting does, what we recommend, what happens if you
leave it, and where to change it. Where it can do so unambiguously, it reads the displayed value and shows whether it
differs from the recommendation. The extension follows the browser language (German or English).

**Install and learn more:** <https://www.hagel-it.de/tools/admin-lotse>

## Three promises — and how to verify them yourself

| Promise | Where to see it in the source |
|---|---|
| **Changes nothing.** It never clicks, sets a value or submits a form. | Search for `.click(`, `dispatchEvent(`, `.value =`, `.submit(` — none of it appears in our code. `tests/unit/u20-u21-quelltext.test.ts` fails the build if it does. |
| **Sends nothing.** It never opens a network connection. | Search for `connect-src`: `manifest.ts` sets `connect-src 'none'`, a policy enforced by the browser itself. `tests/unit/u40-u43-manifest.test.ts` also scans the built package for `fetch(`, `XMLHttpRequest`, `WebSocket` and `sendBeacon`. |
| **Four portals only.** It runs nowhere else. | `PORTAL_HOSTS` in `manifest.ts`: only Microsoft's four admin centers. Permissions: `sidePanel` and `storage`, nothing else. |

## Build it yourself

Requires Node.js 22 (22.12 or later) or 24.

```bash
npm ci
npm run pruefen   # type check, build for Chrome and Edge, unit tests
npm run bauen     # packages in .output/chrome-mv3 and .output/edge-mv3
```

**Not included:** recordings of the real Microsoft portals we test against internally (Microsoft's HTML, not ours to
publish), our measurement scripts for the test tenant, and the store paperwork. Tests that need the recordings are
skipped here.

## Questions and bugs

Open an issue or write to info@hagel-it.de. This repository is a mirror, updated from our internal repository with
every release. We read pull requests but apply changes by hand.

Publisher: hagel IT-Services GmbH, Hamburg, Germany — <https://www.hagel-it.de>. License: MIT.
