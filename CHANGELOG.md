# Änderungen — Admin-Lotse für Microsoft 365

Neueste Fassung oben. Jede Version, die in einen Store geht, bekommt hier einen Abschnitt (Spez. §17.2).

## 1.1.1 — 21.11.2026: nur neue Versionsnummer

* Keine Änderung am Code. Die Nummer ist neu, damit der Edge-Store die neuen Store-Bilder (Zusage „Sendet nichts aus
  Ihren Portalen.“) annimmt: Im Partner-Center-Entwurf lag schon ein zweites 1.1.0-Paket, das sich nicht verwerfen lässt.
* Erklärt 39 Einstellungen, wie 1.1.0.

## 1.1.0 — 16.11.2026: Störungsanzeige

* Neu: Störungsanzeige, ab Werk aus. Einschalten in den Einstellungen der Erweiterung: „Microsoft-Störungen am Symbol
  anzeigen“. Eingeschaltet fragt der Lotse alle fünf Minuten `https://www.hagel-it.de/api/status` nach dem Zustand von
  Microsoft 365, Microsoft Teams und Exchange Online. Meldet Microsoft dort eine Störung, zeigt das Symbol einen roten
  Punkt; Popup und Seitenleiste nennen den Dienst und verlinken die passende Seite im Störungsmonitor
  (www.hagel-it.de/it-stoerungen). Ein Stand, der älter als 15 Minuten ist, gilt als „nicht abrufbar“.
* Der Abruf trägt keine Cookies, keinen Referrer und keinen Inhalt. Aus den Portalen geht nichts mit.
* Gespeichert werden nur der Schalter (`storage.local`) und der letzte Stand (`storage.session`, weg beim Schließen des
  Browsers).
* Firmenmodus: neuer Schlüssel `stoerungsanzeige` (`true` = für alle an, `false` = aus und nicht einschaltbar, ohne
  Angabe entscheidet der Nutzer).
* Neues Recht `alarms` für den Fünf-Minuten-Takt. Kein neues Host-Recht.
* Sicherheitsrichtlinie der Erweiterungsseiten: `connect-src https://www.hagel-it.de/api/status` statt
  `connect-src 'none'`, genau diese eine Adresse.
* Erklärt 39 Einstellungen, wie 1.0.0.
* Ändert nichts. Sendet nichts aus Ihren Portalen.

## 1.0.0 — erste Store-Fassung

* Erklärt 39 Einstellungen im Microsoft 365 Admin Center, im Entra Admin Center, in Intune und im Exchange Admin
  Center: was sie tut, unsere Empfehlung, was passiert, wenn es so bleibt, was man vorher bedenken sollte, der Weg zum
  Umstellen, die nötige Lizenz und die Quelle bei Microsoft.
* Liest bei Einstellungen mit eindeutigem Bedienelement den angezeigten Wert und zeigt, ob er von der Empfehlung
  abweicht; die Zahl der Abweichungen steht am Symbol.
* Hamburger Vergleich aus dem Hamburger IT-Sicherheits-Index bei Mail- und Domain-Einstellungen.
* Hinweise einzeln ausblenden und wieder anzeigen.
* Firmenmodus über Richtlinie (`storage.managed`): eigener Ansprechpartner, bewusst entschiedene Abweichungen, Werte
  lesen aus, Sprache fest. Vorlagen für Intune und Gruppenrichtlinie in `firmen/`.
* Deutsch und Englisch, helle und dunkle Darstellung, ganz mit der Tastatur bedienbar.
* Ändert nichts, sendet nichts: keine Netzverbindung, kein Klick und kein gesetzter Wert im Portal, läuft nur in den
  vier Portalen.
