// U-50 (Spez. §11.4, §14.3): Token in components/tokens.css gleich src/styles/global.css, Schriften gleich den
// Website-Dateien. Dazu die Anzeige-Logik der Seitenleiste (lib/ansicht.ts, H11a): Sortierung, Wortlaut, Links für Z-3.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { Eintrag, Leser } from '../../inhalte/schema';
import {
  angezeigtZeile,
  anfangsOffen,
  empfohlenWort,
  grundSchluessel,
  lizenzSchluessel,
  quelleAdresse,
  sortieren,
  statusSchluessel,
  wertWort,
  wichtigste,
} from '../../lib/ansicht';
import { AKTIVE_EINTRAEGE } from '../../lib/inhalte';
import type { Bewertung, Grund } from '../../lib/zustand';
import { WURZEL } from './hilfen/paket';

const WEBSITE = `${WURZEL}../../`;
// Im öffentlichen Spiegel (hagelitservices/admin-lotse) liegt die Website nicht daneben: dann entfällt der Abgleich.
const MIT_WEBSITE = existsSync(`${WEBSITE}src/styles/global.css`);
const de = JSON.parse(readFileSync(`${WURZEL}public/_locales/de/messages.json`, 'utf8')) as Record<string, { message: string }>;
/** Übersetzer wie `browser.i18n.getMessage`: `$1`… werden ersetzt. */
const t = (k: string, ...e: string[]) => (de[k]?.message ?? `?${k}`).replace(/\$(\d)/g, (_m, n: string) => e[Number(n) - 1] ?? '');

describe.skipIf(!MIT_WEBSITE)('U-50 Token und Schriften', () => {
  const palette = (css: string) => new Map([...css.matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,8})\s*;/g)].map((m) => [m[1]!, m[2]!.toUpperCase()]));
  const website = MIT_WEBSITE ? palette(readFileSync(`${WEBSITE}src/styles/global.css`, 'utf8')) : new Map<string, string>();
  const tokens = readFileSync(`${WURZEL}components/tokens.css`, 'utf8');
  const block = tokens.slice(tokens.indexOf('palette:start'), tokens.indexOf('palette:ende'));
  const lotse = palette(block);

  test('Palette vollständig: navy, slate, accent, status', () => {
    for (const gruppe of ['navy', 'slate', 'accent', 'status']) {
      const soll = [...website.keys()].filter((k) => k.startsWith(`--color-${gruppe}-`));
      expect(soll.length, gruppe).toBeGreaterThan(4);
      for (const k of soll) expect(lotse.has(k), `${k} fehlt in tokens.css`).toBe(true);
    }
  });

  test('jeder Wert gleich global.css', () => {
    for (const [k, v] of lotse) expect(v, k).toBe(website.get(k));
  });

  test.each([
    ['figtree-latin.woff2', '_Xms-HUzqDCFdgfMm4S9DaRvzig.woff2'],
    ['figtree-latin-ext.woff2', '_Xms-HUzqDCFdgfMm4q9DaRvziissg.woff2'],
    ['outfit-latin.woff2', 'QGYvz_MVcBeNP4NJtEtqUYLknw.woff2'],
    ['outfit-latin-ext.woff2', 'QGYvz_MVcBeNP4NJuktqUYLkn8BJ.woff2'],
  ])('Schrift %s gleich der Website-Datei', (lotse, website) => {
    expect(readFileSync(`${WURZEL}public/fonts/${lotse}`).equals(readFileSync(`${WEBSITE}public/fonts/${website}`))).toBe(true);
  });
});

const eintrag = (id: string) => AKTIVE_EINTRAEGE.find((e) => e.id === id)!;
const b = (art: Bewertung['art'], token?: string): Bewertung => ({ art, ...(token ? { token } : {}) });

describe('Anzeige-Logik der Seitenleiste', () => {
  test('Sortierung: rot vor gelb, dann nicht lesbar, passt, nur Erklärung; sonst Reihenfolge der Datei', () => {
    const ids = ['entra-adminportal', 'entra-app-registrierung', 'entra-gasteinladungen', 'entra-rollen', 'entra-gaeste', 'entra-geraete'];
    const bew: Record<string, Bewertung> = {
      'entra-adminportal': b('passt', 'ja'),
      'entra-app-registrierung': b('weicht-ab', 'ja'),
      'entra-gasteinladungen': b('weicht-ab', 'jeder'),
      'entra-rollen': b('nicht-lesbar'),
      'entra-gaeste': b('nur-erklaerung'),
      'entra-geraete': b('lese'),
    };
    expect(sortieren(ids.map(eintrag), bew).map((e) => e.id)).toEqual([
      'entra-app-registrierung', // rot
      'entra-gasteinladungen', // gelb
      'entra-rollen', // nicht lesbar
      'entra-geraete', // liest noch: bei „nicht lesbar“
      'entra-adminportal',
      'entra-gaeste',
    ]);
  });

  test('Wortlaut der Werte: ja/nein, Auswahl in der Sprache der Oberfläche, Zahl, Domains', () => {
    const geraete = eintrag('entra-geraete').leser!;
    expect(wertWort(geraete, 'ja', 'de', t)).toBe('Ja');
    expect(wertWort(eintrag('entra-adminportal').leser!, 'nein', 'de', t)).toBe('Nein');
    const sspr = eintrag('entra-sspr').leser!;
    expect(wertWort(sspr, 'ausgewaehlt', 'de', t)).toBe('Ausgewählt');
    expect(wertWort(sspr, 'ausgewaehlt', 'en', t)).toBe('Selected');
    expect(wertWort(eintrag('m365-domains').leser!, '3', 'de', t)).toBe('3 Domänen');
    expect(wertWort(eintrag('m365-domains').leser!, '1', 'de', t)).toBe('1 Domäne');
    expect(empfohlenWort(eintrag('entra-rollen').leser!, 'de', t)).toBe('höchstens 4');
    expect(empfohlenWort(eintrag('entra-benutzereinwilligung').leser!, 'de', t)).toMatch(/ oder /);
    expect(empfohlenWort(eintrag('m365-domains').leser!, 'de', t)).toBeNull();
    expect(angezeigtZeile(eintrag('entra-geraete'), b('weicht-ab', 'nein'), 'de', t)).toBe('Angezeigt: Nein · Empfohlen: Ja');
    expect(angezeigtZeile(eintrag('m365-domains'), b('nur-erklaerung', '2'), 'de', t)).toBe('Angezeigt: 2 Domänen');
    expect(angezeigtZeile(eintrag('entra-geraete'), b('lese'), 'de', t)).toBeNull();
  });

  test('jedes Token jedes aktiven Lesers hat ein Wort in de und en', () => {
    for (const e of AKTIVE_EINTRAEGE) {
      const l = e.leser as Leser | null;
      if (!l?.werte) continue;
      for (const tok of Object.keys(l.werte)) for (const s of ['de', 'en'] as const) expect(wertWort(l, tok, s, t), `${e.id} ${tok}`).not.toBe(tok);
    }
  });

  test('Status, Gründe und Lizenzen haben Texte', () => {
    for (const art of ['passt', 'weicht-ab', 'nicht-lesbar', 'bewusst'] as const) expect(de[statusSchluessel(b(art))!], art).toBeDefined();
    expect(statusSchluessel(b('nur-erklaerung'))).toBeNull();
    for (const g of ['mehrdeutig', 'unbekannt', 'zeitgrenze', 'aufbau', 'sprache'] satisfies Grund[]) expect(de[grundSchluessel(g)], g).toBeDefined();
    for (const e of AKTIVE_EINTRAEGE) if (e.lizenz) expect(de[lizenzSchluessel(e.lizenz)], e.lizenz).toBeDefined();
    expect(de.grund_zeitgrenze?.message).toBe('Die Seite hat den Wert nicht gezeigt.');
  });

  test('Karten: Abweichung und „nicht lesbar“ offen, „passt“ zu, sonst offen nur als einzige', () => {
    expect(anfangsOffen(b('weicht-ab'), false)).toBe(true);
    expect(anfangsOffen(b('nicht-lesbar'), false)).toBe(true);
    expect(anfangsOffen(b('passt'), true)).toBe(false);
    expect(anfangsOffen(b('nur-erklaerung'), true)).toBe(true);
    expect(anfangsOffen(b('nur-erklaerung'), false)).toBe(false);
  });

  test('Quellen: Learn-Pfad in der Sprache der Oberfläche, volle Adresse unverändert', () => {
    const q: Eintrag['quellen'][number] = { pfad: 'entra/fundamentals/security-defaults', titel: { de: 'x', en: 'x' } };
    expect(quelleAdresse(q, 'de')).toBe('https://learn.microsoft.com/de-de/entra/fundamentals/security-defaults');
    expect(quelleAdresse(q, 'en')).toBe('https://learn.microsoft.com/en-us/entra/fundamentals/security-defaults');
    expect(quelleAdresse({ url: 'https://www.bsi.bund.de/x', titel: q.titel }, 'de')).toBe('https://www.bsi.bund.de/x');
  });

  test.each(['m365', 'entra', 'intune', 'exo'])('Z-3 %s: drei Ziele mit fester Adresse im Portal, rot zuerst', (portal) => {
    const w = wichtigste(portal);
    expect(w).toHaveLength(3);
    for (const z of w) {
      expect(z.adresse, z.id).not.toMatch(/:(id|domain|mail)\b/);
      expect(z.id.startsWith(`${portal}-`)).toBe(true);
    }
    const roteDa = AKTIVE_EINTRAEGE.some((e) => e.portal === portal && e.empfehlung.schwere === 'rot');
    if (roteDa) expect(eintrag(w[0]!.id).empfehlung.schwere).toBe('rot');
  });
});
