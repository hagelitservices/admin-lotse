// Liest Quelltext und gebaute Pakete (`npm run pruefen` baut Chrome und Edge vorher).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WURZEL = fileURLToPath(new URL('../../../', import.meta.url));
export const PAKETE = { chrome: `${WURZEL}.output/chrome-mv3`, edge: `${WURZEL}.output/edge-mv3` } as const;

export function manifestAus(ordner: string): Record<string, unknown> {
  const pfad = `${ordner}/manifest.json`;
  if (!existsSync(pfad)) throw new Error(`${pfad} fehlt — erst „npm run bauen“ (oder „npm run pruefen“)`);
  return JSON.parse(readFileSync(pfad, 'utf8')) as Record<string, unknown>;
}

/** Alle Dateien unter `ordner` (rekursiv), gefiltert nach Endung. */
export function dateien(ordner: string, endung: RegExp): string[] {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).flatMap((d) => {
    const p = join(ordner, d);
    return statSync(p).isDirectory() ? dateien(p, endung) : endung.test(d) ? [p] : [];
  });
}

/** Eigener Quelltext der Erweiterung (ohne Tests, Messskripte und Abhängigkeiten). */
export const QUELLORDNER = ['entrypoints', 'lib', 'components', 'inhalte'].map((o) => `${WURZEL}${o}`);
export const quelltext = () => QUELLORDNER.flatMap((o) => dateien(o, /\.(ts|tsx)$/));
