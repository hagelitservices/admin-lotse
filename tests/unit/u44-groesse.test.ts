// U-44 (Spez. §14.3): Inhalts-Skripte je ≤ 40 KB gzip, Seitenleiste ≤ 150 KB gzip ohne Schriften.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { PAKETE } from './hilfen/paket';

/** Ein Einstieg samt aller verwiesenen .js/.css-Dateien. Unauflösbarer Verweis wirft: lieber rot als zu klein gemessen. */
function abhaengigkeiten(ordner: string, datei: string, gesehen = new Set<string>()): Set<string> {
  if (gesehen.has(datei)) return gesehen;
  if (!existsSync(join(ordner, datei))) throw new Error(`U-44: Verweis auf ${datei} nicht auflösbar`);
  gesehen.add(datei);
  const inhalt = readFileSync(join(ordner, datei), 'utf8');
  const verweise = datei.endsWith('.html')
    ? [...inhalt.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1] ?? '')
    : datei.endsWith('.js')
      ? [...inhalt.matchAll(/["'`]((?:\.{1,2}\/|\/)?[\w./-]+\.(?:js|css))["'`]/g)].map((m) => m[1] ?? '')
      : [];
  for (const v of verweise) {
    if (/^https?:/.test(v)) continue;
    const ziel = v.startsWith('/') ? v.slice(1) : v.startsWith('.') ? posix.normalize(posix.join(dirname(datei), v)) : v;
    abhaengigkeiten(ordner, ziel, gesehen);
  }
  return gesehen;
}

const gzipKB = (ordner: string, einstieg: string) =>
  [...abhaengigkeiten(ordner, einstieg)].reduce((s, d) => s + gzipSync(readFileSync(join(ordner, d)), { level: 9 }).length, 0) / 1024;

const BUDGETS: Record<string, number> = {
  'content-scripts/oben.js': 40,
  'content-scripts/rahmen.js': 40,
  'seitenleiste.html': 150,
};

describe.each(Object.entries(PAKETE))('U-44 Größe %s', (_b, ordner) => {
  test.each(Object.entries(BUDGETS))('%s ≤ %d KB gzip', (einstieg, budget) => {
    const kb = gzipKB(ordner, einstieg);
    expect(kb, `${einstieg}: ${kb.toFixed(1)} KB gzip`).toBeLessThanOrEqual(budget);
  });
});
