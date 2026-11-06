// Beispielprofile in `firmen/` aus lib/firmenprofile.ts erzeugen (Spez. §10). Aufruf: `npm run firmen`.
// Nach der Einreichung (H18) die Store-Kennungen in `STORE_ID` eintragen und neu erzeugen; U-47 prüft den Gleichstand.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eintragsListe, erzwingen, plattformskript, regDatei } from '../lib/firmenprofile.ts';

const ziel = fileURLToPath(new URL('../firmen/', import.meta.url));
mkdirSync(ziel, { recursive: true });
const utf16 = (s: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
for (const b of ['chrome', 'edge'] as const) {
  // Nur der Wert der Richtlinie, einzeilig: so wird er im Einstellungskatalog bzw. in der ADMX-Richtlinie eingefügt.
  writeFileSync(`${ziel}${b}-erzwingen.json`, `${JSON.stringify(erzwingen(b))}\n`);
  writeFileSync(`${ziel}${b}-firmeneinstellungen.reg`, utf16(regDatei(b)));
}
// UTF-8 mit BOM: Windows PowerShell 5.1 liest sonst die Umlaute falsch.
writeFileSync(`${ziel}intune-plattformskript.ps1`, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(plattformskript(), 'utf8')]));
// Reihenfolge wie lib/inhalte.ts (m365, entra, intune, exchange), nur aktive Einträge.
type E = { id: string; portal: string; titel: { de: string; en: string }; status: string };
const alle = ['m365', 'entra', 'intune', 'exchange'].flatMap((n) => JSON.parse(readFileSync(new URL(`../inhalte/${n}.json`, import.meta.url), 'utf8')) as E[]);
writeFileSync(`${ziel}eintraege.md`, eintragsListe(alle.filter((e) => e.status === 'aktiv')));
console.log(`firmen/: 6 Dateien geschrieben (${ziel})`);
