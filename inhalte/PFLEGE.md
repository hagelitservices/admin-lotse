# Inhalte pflegen (Spezifikation §6.4)

Die Erklärungen stehen in `m365.json`, `entra.json`, `intune.json`, `exchange.json`. Geprüft werden sie beim Bau und im Test
(`schema.ts`, `pruefen.ts`, U-30 bis U-36). Fehler stoppen den Bau.

| Was | Wann | Wer | Ergebnis |
|---|---|---|---|
| Eintrag neu oder geändert | jederzeit | Bau- oder Reparatur-Sitzung | Änderung an `inhalte/*.json` → Schema- und Texttests → Fixture vorhanden → Version +0.0.1 → `CHANGELOG.md` → Store-Upload |
| Route, Titel, Leser gegen das echte Portal | wöchentlich | Wochentest | Bericht; rot → Reparatur-Sitzung |
| Quellen erreichbar | wöchentlich im Wochentest | Skript | HTTP-Status jeder Learn-Seite; 404 oder Umleitung auf eine Übersicht = rot |
| Inhalt fachlich prüfen | spätestens 180 Tage nach `inhaltGeprueftAm` | Sitzung nach dieser Datei | Text gegen Quelle und Portal, Datum neu. Ältere aktive Einträge machen den Bau rot (U-33) |
| Index-Zahlen | wenn `ergebnis-<Jahr>.json` neu ist | Bau-Import | automatisch beim nächsten Bau; Jahr wird mit angezeigt |
| Microsoft ändert eine Empfehlung | Anlass | Sitzung | Eintrag anpassen; nie still: `CHANGELOG.md` nennt den Eintrag |

## Regeln für einen Eintrag

1. **`id` nie umbenennen.** Der Firmenmodus verweist darauf.
2. **Texte** nach Spezifikation §6.2: Fachwort beim ersten Auftreten erklären, Empfehlung zuerst als Handlung, dann die Folge.
   Keine Garantie- oder Absolutaussagen, keine Preise. `wennEsSoBleibt` bei Überschneidung wörtlich oder sinngleich aus dem
   Härtungs-Check bzw. `kjello/packages/domain/src/sicherheits-check.ts`, `herkunft` nennt die Stelle.
3. **Jede Quelle vor dem Eintragen aufrufen** und gegen den Satz prüfen, der sich auf sie stützt. Trägt die Seite die Aussage
   nicht, fliegt die Aussage raus, nicht die Quelle.
4. **Index-Sätze ohne Ziffern.** `{wert}`, `{basis}`, `{jahr}` füllt der Bau aus `data/hamburg-index/ergebnis-2026.json`.
5. **`titelProbe` aus der Messung**, nicht aus dem Gedächtnis: `document.title` im Portal, de und en.

## Leser

Der Leser ist Daten (`leser` im Eintrag, §5.1), die Maschine in `lib/leser.ts` gilt für alle.

| Art | Rolle | Token | Bewertung |
|---|---|---|---|
| `schalter`, `haekchen` | `switch`, `checkbox` | `ja`, `nein` | `empfohlen` |
| `auswahl` | `radiogroup`, `combobox` | Schlüssel aus `werte` | `empfohlen` |
| `text` | `heading` | Schlüssel aus `werte` | `empfohlen` |
| `anzahl` | `table`, `grid`, `treegrid` | Zahl der Datenzeilen | `spanne` (`min`, `max`) |
| `domains` | `table`, `grid`, `treegrid` | Zahl; Namen nur zur Anzeige | keine, zeigt nur an |

* **Liste ohne Zeile ist keine Lesung.** `leerGilt: true` nur setzen, wenn die Fixture das leere Bild der Seite belegt.
* **Ein Wert gilt erst nach mindestens 4 s Ruhe** (`RUHE_MS` in `lib/rahmen.ts`). Entra zeigt nach dem Aufbau bis zu 1,9 s alle Schalter als
  „aus“, ohne Ladehinweis. Diese Grenze nie unterschreiten, sonst entsteht ein falsches „Passt“.
* **Beschriftungen aus der Messung** eintragen, beide Sprachen. Entra mischt sie im selben Rahmen; der Leser sucht in beiden Listen.
* **Nie einen Selektor** mit Klasse oder Pfad (U-20), nie eine Änderung an der Seite (U-21).
* **Fixture dazu:** jede `route` braucht mindestens eine Fixture und eine Abweichungs-Fixture (U-30, T-01, T-02; ab H6).

## Aussetzen

`"status": "ausgesetzt"` wird gebaut, aber nicht gezeigt. So bleibt eine falsche Erklärung nie länger als bis zur nächsten Version
stehen. `entwurf` wird ebenfalls nicht gezeigt.
