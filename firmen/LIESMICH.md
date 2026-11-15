# Admin-Lotse in der Firma verteilen und einstellen

Der Admin-Lotse liest nur, was im Admin Center ohnehin auf dem Bildschirm steht. Er ändert nichts. Er sendet nichts aus Ihren Portalen.
Mit diesen Beispielen installiert Ihre IT ihn für alle Admins und legt fest, wie er sich verhält.

> **Zwei Kennungen.** Die Erweiterung hat im Chrome Web Store und bei Microsoft Edge Add-ons je eine eigene Kennung.
> Edge nimmt die Chrome-Kennung nicht. Beide sind in den Dateien schon eingetragen: Chrome
> `lcfimfdbdclcdnphmkhikfcimamodphf`, Edge `hkpgjiooldogphbobmhbkmkkgjdgneei`.

## Die sechs Einstellungen

| Name | Art | Wirkung |
|---|---|---|
| `hilfeKontakt` | Objekt mit `name` und `url` (`https:` oder `mailto:`) | Statt „hagel IT hilft“ steht Ihr eigener Ansprechpartner unten in der Seitenleiste |
| `hilfeAusblenden` | Wahr/Falsch | Der Hinweis auf Hilfe entfällt ganz |
| `bewussteAbweichungen` | Liste aus `eintrag` und `begruendung` | Dieser Eintrag zeigt „Bewusst so“ mit Ihrer Begründung statt „Weicht ab“. Die Kennungen stehen in `eintraege.md` |
| `werteLesen` | Wahr/Falsch, Standard wahr | Falsch: nur Erklärungen, der Lotse liest keine Werte |
| `sprache` | `auto`, `de` oder `en` | Feste Sprache der Erweiterung; `auto` folgt dem Browser |
| `stoerungsanzeige` | Wahr/Falsch, ohne Angabe entscheidet der Nutzer | Wahr: Störungsanzeige für alle an. Falsch: aus, Nutzer können sie nicht einschalten. In der Registrierung als `dword:00000001` bzw. `dword:00000000` |

**Zur Störungsanzeige:** Ist sie an, fragt der Lotse alle fünf Minuten `https://www.hagel-it.de/api/status` nach dem
Zustand von Microsoft 365, Microsoft Teams und Exchange Online und zeigt bei einer Störung einen roten Punkt am Symbol.
Der Abruf trägt keine Cookies, keinen Referrer und keinen Inhalt; aus den Portalen geht nichts mit. Unser Server sieht
dabei, wie bei jedem Abruf, die IP-Adresse des Geräts. Ab Werk ist die Anzeige aus. Die Beispieldateien setzen den
Schlüssel nicht, dort entscheidet also jeder Nutzer selbst.

Sobald eine Einstellung gesetzt ist, steht oben in der Seitenleiste „Von Ihrer IT eingerichtet“. Nutzer können diese
Werte nicht überschreiben. Unbekannte Namen und Kennungen ignoriert der Lotse.

## Dateien

| Datei | Wofür |
|---|---|
| `chrome-erzwingen.json` · `edge-erzwingen.json` | Wert für die Richtlinie `ExtensionSettings`, einzeilig zum Einfügen: installiert den Lotsen fest, Edge zeigt das Symbol in der Leiste, Chrome heftet es an |
| `chrome-firmeneinstellungen.reg` · `edge-firmeneinstellungen.reg` | Beispielwerte für die Einstellungen in der Registrierung (ohne `stoerungsanzeige`) (`…\3rdparty\extensions\<Kennung>\policy`) |
| `intune-plattformskript.ps1` | Beides zusammen für Chrome und Edge; zwei Schalter oben im Skript |
| `eintraege.md` | Kennungen aller Einträge für `bewussteAbweichungen` |

## Intune

1. **Installieren:** Geräte › Konfiguration › Neue Richtlinie › Windows 10 und höher › Einstellungskatalog.
   - Edge: „Microsoft Edge › Erweiterungen › Einstellungen für die Erweiterungsverwaltung konfigurieren“, als Wert den
     Inhalt von `edge-erzwingen.json`.
   - Chrome: „Google › Google Chrome › Erweiterungen › Einstellungen für die Erweiterungsverwaltung“, als Wert den Inhalt
     von `chrome-erzwingen.json`.
   - **Gibt es diese Richtlinie bei Ihnen schon** (etwa mit `"*": {"installation_mode": "blocked"}`), ergänzen Sie dort
     den Eintrag des Lotsen, statt eine zweite anzulegen.
2. **Einstellen:** Für die Werte unter `3rdparty` gibt es im Einstellungskatalog keinen Eintrag. Nehmen Sie
   `intune-plattformskript.ps1`: Geräte › Skripts und Korrekturen › Plattformskripts › Hinzufügen, „Skript mit den
   Anmeldeinformationen des angemeldeten Benutzers ausführen“ = Nein, „Skript in 64-Bit-PowerShell-Host ausführen“ = Ja.
   Das Skript erledigt auch Schritt 1, solange oben `$ExtensionSettingsSetzen = $true` steht. **Setzt Ihre IT
   `ExtensionSettings` schon zentral**, stellen Sie den Schalter auf `$false` und nehmen Schritt 1 — sonst überschreibt
   die nächste Synchronisierung den Wert, den das Skript zusammengeführt hat, und der Lotse verschwindet wieder.
3. Prüfen auf einem Gerät: `chrome://policy` bzw. `edge://policy` öffnen, „Richtlinien neu laden“. Unter
   „Admin-Lotse“ stehen die gesetzten Werte.

## Gruppenrichtlinie

1. **Installieren:** Die Vorlagen (ADMX) für Chrome bzw. Edge einspielen, dann Computerkonfiguration › Administrative
   Vorlagen › Google › Google Chrome bzw. Microsoft Edge › Erweiterungen › „Einstellungen für die Erweiterungsverwaltung“, Wert
   wie oben.
2. **Einstellen:** Computerkonfiguration › Einstellungen › Windows-Einstellungen › Registrierung, die Werte aus der
   `.reg`-Datei als Elemente anlegen und auf der Registerkarte „Gemeinsam“ jeweils „Element entfernen, wenn es nicht
   mehr angewendet wird“ setzen — sonst bleiben die Werte nach dem Löschen stehen. Für einen einzelnen Rechner reicht ein
   Doppelklick auf die `.reg`-Datei.

## Zurücknehmen

* **Intune:** Plattformskripte nehmen keine Parameter, und das Entfernen der Zuweisung nimmt nichts zurück. Legen Sie
  eine Kopie des Skripts mit `$Entfernen = $true` als eigenes Plattformskript an und weisen Sie sie zu. Sie löscht die
  Einstellungen und den eigenen Eintrag in `ExtensionSettings`; andere Erweiterungen dort bleiben stehen.
* **Gruppenrichtlinie:** Die Elemente unter „Einstellungen › Registrierung“ löschen (mit „Element entfernen, wenn es
  nicht mehr angewendet wird“ verschwinden die Werte beim nächsten Abgleich) und die Richtlinie aus Schritt 1 auf
  „Nicht konfiguriert“ setzen.
* **Einzelner Rechner:** in der `.reg`-Datei vor jeden Schlüssel ein Minus setzen (`[-HKEY_LOCAL_MACHINE\…\policy]`).
