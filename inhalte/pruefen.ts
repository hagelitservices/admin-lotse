/** Prüft alle Inhaltsdateien beim Bau (Hook in `wxt.config.ts`) und im Test (Spez. §3.1, U-30). Ein Fehler stoppt den Bau. */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { inhaltsdateiSchema, type Eintrag } from './schema';

export const INHALTSDATEIEN = ['m365', 'entra', 'intune', 'exchange'] as const;

export function inhalteLesen(): Eintrag[] {
  const alle: Eintrag[] = [];
  for (const name of INHALTSDATEIEN) {
    const url = new URL(`./${name}.json`, import.meta.url);
    const ergebnis = inhaltsdateiSchema.safeParse(JSON.parse(readFileSync(url, 'utf8')));
    if (!ergebnis.success) throw new Error(`inhalte/${name}.json:\n${z.prettifyError(ergebnis.error)}`);
    alle.push(...ergebnis.data);
  }
  const ids = alle.map((e) => e.id);
  const doppelt = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (doppelt.length) throw new Error(`Doppelte id: ${doppelt.join(', ')}`);
  return alle;
}
