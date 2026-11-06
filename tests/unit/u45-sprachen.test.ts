// U-45 (Spez. §14.3, Rahmen E9): `_locales/de` und `/en` haben dieselben Schlüssel; jeder benutzte Schlüssel existiert.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { manifestFuer } from '../../manifest';
import { WURZEL, quelltext } from './hilfen/paket';

type Eintrag = { message: string };
const laden = (s: string) => JSON.parse(readFileSync(`${WURZEL}public/_locales/${s}/messages.json`, 'utf8')) as Record<string, Eintrag>;
const de = laden('de');
const en = laden('en');

describe('U-45 Sprachen', () => {
  test('de und en haben dieselben Schlüssel', () => expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort()));

  test.each([['de', de], ['en', en]] as const)('%s: keine leeren Texte', (_s, t) => {
    for (const [k, e] of Object.entries(t)) expect(e.message.trim(), k).not.toBe('');
  });

  test('jeder benutzte Schlüssel existiert', () => {
    const benutzt = new Set<string>();
    for (const t of [JSON.stringify(manifestFuer()), ...quelltext().map((p) => readFileSync(p, 'utf8'))]) {
      for (const m of t.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) benutzt.add(m[1] ?? '');
      for (const m of t.matchAll(/\b(?:text|t)\(\s*['"`]([A-Za-z0-9_@]+)['"`]/g)) benutzt.add(m[1] ?? '');
    }
    expect(benutzt.size).toBeGreaterThan(0);
    for (const k of benutzt) expect(de[k], `Schlüssel fehlt: ${k}`).toBeDefined();
  });

  test.each([['de', de], ['en', en]] as const)('%s: Name ≤ 45, Kurzbeschreibung ≤ 132 (Spez. §12.1)', (_s, t) => {
    expect([...(t.erweiterung_name?.message ?? '')].length).toBeLessThanOrEqual(45);
    expect([...(t.erweiterung_beschreibung?.message ?? '')].length).toBeLessThanOrEqual(132);
  });
});
