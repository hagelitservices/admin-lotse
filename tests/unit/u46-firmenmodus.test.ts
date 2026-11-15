// U-46 (Spez. §10, §14.3) Firmenmodus; dazu Z-12 (Seitenzugriff) und der Popup-Ersatz für Edge (M-8) ohne Browser.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { einsetzen } from '../../lib/i18n';
import { PORTAL_HOSTS } from '../../manifest';
import { alsPopup, popupFuer, startKastenZeigen, startSeiteBei } from '../../lib/flaeche';
import { ausgeblendetAus, bewusstVon, firmaAus, OHNE_FIRMA } from '../../lib/firmenmodus';
import { tabBewerten } from '../../lib/zustand';
import { fehlendeHerkuenfte, HERKUENFTE, herkunftVon, type Herkunft } from '../../lib/zugriff';

const IDS = new Set(['entra-sicherheitsstandards', 'entra-geraete']);

describe('U-46 Firmenmodus: Zusammenführung, unbekannte Schlüssel, fremde Kennungen', () => {
  test('leer, kein Objekt oder nur unbekannte Schlüssel → Normalbetrieb, kein Band', () => {
    for (const roh of [undefined, null, 'x', 3, [], {}, { unbekannt: true, Sprache: 'de' }]) expect(firmaAus(roh, IDS)).toEqual(OHNE_FIRMA);
  });
  test('alle sechs Schlüssel werden übernommen, Band an', () => {
    const f = firmaAus(
      {
        hilfeKontakt: { name: ' IT-Team ', url: 'https://it.musterfirma.de/hilfe' },
        hilfeAusblenden: true,
        bewussteAbweichungen: [{ eintrag: 'entra-sicherheitsstandards', begruendung: 'Bedingter Zugriff ersetzt das.' }],
        werteLesen: false,
        sprache: 'en',
        stoerungsanzeige: true,
      },
      IDS,
    );
    expect(f).toEqual({
      verwaltet: true,
      hilfeKontakt: { name: 'IT-Team', url: 'https://it.musterfirma.de/hilfe' },
      hilfeAusblenden: true,
      bewusst: { 'entra-sicherheitsstandards': 'Bedingter Zugriff ersetzt das.' },
      werteLesen: false,
      sprache: 'en',
      stoerungsanzeige: true,
    });
  });
  test('fremde Eintrags-Kennung und leere Begründung fallen weg', () => {
    const f = firmaAus({ bewussteAbweichungen: [{ eintrag: 'gibt-es-nicht', begruendung: 'x' }, { eintrag: 'entra-geraete', begruendung: '  ' }, null, 7] }, IDS);
    expect(f.bewusst).toEqual({});
    expect(f.verwaltet).toBe(false);
  });
  test('Band auch, wenn die Firma nur den Standard ausdrücklich setzt (§10 „sobald ein verwalteter Wert gesetzt ist“)', () => {
    for (const roh of [{ werteLesen: true }, { sprache: 'auto' }, { hilfeAusblenden: false }]) expect(firmaAus(roh, IDS).verwaltet, JSON.stringify(roh)).toBe(true);
  });
  test('Hilfe-Link nur https: oder mailto:, nie javascript: oder http:', () => {
    expect(firmaAus({ hilfeKontakt: { name: 'IT', url: 'mailto:it@musterfirma.de' } }, IDS).hilfeKontakt?.url).toBe('mailto:it@musterfirma.de');
    for (const url of ['javascript:alert(1)', 'http://it.musterfirma.de', 'kein link', ''])
      expect(firmaAus({ hilfeKontakt: { name: 'IT', url } }, IDS).hilfeKontakt, url).toBeNull();
  });
  test('falsche Typen: werteLesen bleibt an, Sprache auto', () => {
    const f = firmaAus({ werteLesen: 'nein', sprache: 'fr', hilfeAusblenden: 'ja' }, IDS);
    expect([f.werteLesen, f.sprache, f.hilfeAusblenden, f.verwaltet]).toEqual([true, 'auto', false, false]);
  });
  test('verwaltet schlägt lokal: Firma vor Nutzer', () => {
    const f = firmaAus({ bewussteAbweichungen: [{ eintrag: 'entra-geraete', begruendung: 'So gewollt.' }] }, IDS);
    const aus = new Set(['entra-geraete', 'entra-sicherheitsstandards']);
    expect(bewusstVon(f, aus, 'entra-geraete')).toBe('firma');
    expect(bewusstVon(f, aus, 'entra-sicherheitsstandards')).toBe('nutzer');
    expect(bewusstVon(f, new Set(), 'entra-sicherheitsstandards')).toBe(false);
  });
  test('ausgeblendete Hinweise: nur bekannte Kennungen, ohne Doppelte', () => {
    expect(ausgeblendetAus(['entra-geraete', 'entra-geraete', 'weg', 3], IDS)).toEqual(['entra-geraete']);
    expect(ausgeblendetAus('entra-geraete', IDS)).toEqual([]);
  });
  test('Bewertung trägt, wer bewusst entschieden hat (Z-10, Z-11); Abzeichen zählt beides nicht', () => {
    const leser = { art: 'schalter', rolle: 'switch', name: { de: ['x'], en: ['x'] }, empfohlen: ['ja'] } as never;
    const e = { leser, empfehlung: { schwere: 'rot' } } as never;
    const z = { eintraege: ['a', 'b', 'c'], aufbauAbweichend: [], sprache: 'de' as const, lesungen: { a: 'nein', b: 'nein', c: 'nein' }, fristUm: false };
    const b = tabBewerten(z, () => e, (id) => (id === 'a' ? 'firma' : id === 'b' ? 'nutzer' : false));
    expect([b.a?.von, b.b?.von, b.c?.art]).toEqual(['firma', 'nutzer', 'weicht-ab']);
    expect(b.a?.form).toBe('raute');
  });
});

describe('Z-12 Seitenzugriff', () => {
  const alle = (w: boolean) => Object.fromEntries(HERKUENFTE.map((h) => [h, w])) as Record<Herkunft, boolean>;
  test('Herkünfte gleich den Host-Rechten im Manifest', () => expect([...HERKUENFTE].sort()).toEqual([...PORTAL_HOSTS].sort()));
  test('Exchange liegt unter admin.cloud.microsoft', () => expect(herkunftVon('https://admin.cloud.microsoft/exchange#/mailboxes')).toBe('https://admin.cloud.microsoft/*'));
  test('Portal-Tab ohne Zugriff → genau diese Herkunft', () => {
    expect(fehlendeHerkuenfte('https://entra.microsoft.com/#home', { ...alle(true), 'https://entra.microsoft.com/*': false })).toEqual(['https://entra.microsoft.com/*']);
  });
  test('Portal-Tab mit Zugriff oder sicher fremder Tab → nichts', () => {
    expect(fehlendeHerkuenfte('https://entra.microsoft.com/', alle(true))).toEqual([]);
    expect(fehlendeHerkuenfte('https://www.example.com/', alle(false))).toEqual([]);
  });
  test('Adresse unsichtbar → alle fehlenden', () => {
    expect(fehlendeHerkuenfte(undefined, { ...alle(true), 'https://intune.microsoft.com/*': false })).toEqual(['https://intune.microsoft.com/*']);
    expect(fehlendeHerkuenfte(undefined, alle(true))).toEqual([]);
    expect(fehlendeHerkuenfte('chrome-extension://abc/optionen.html', alle(false))).toEqual([...HERKUENFTE]);
  });
});

describe('M-8 Popup statt Seitenleiste', () => {
  test('mit Seitenleiste kein Popup im Portal-Tab, ohne die Leiste als Popup', () => {
    expect(popupFuer(7, false)).toBe('');
    expect(popupFuer(7, true)).toBe('seitenleiste.html?tab=7&als=popup');
    expect(alsPopup('?tab=7&als=popup')).toBe(true);
    expect(alsPopup('?tab=7')).toBe(false);
  });
});

describe('U-46b Richtlinien-Schema und feste Sprache (Spez. §10)', () => {
  const schema = JSON.parse(readFileSync(new URL('../../public/managed_schema.json', import.meta.url), 'utf8')) as {
    type: string;
    properties: Record<string, { type: string; enum?: string[]; properties?: Record<string, unknown>; items?: { properties?: Record<string, unknown> } }>;
  };
  test('genau die sechs Schlüssel aus §10, mit den Typen der Zusammenführung', () => {
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties).sort()).toEqual(['bewussteAbweichungen', 'hilfeAusblenden', 'hilfeKontakt', 'sprache', 'stoerungsanzeige', 'werteLesen']);
    expect(schema.properties.stoerungsanzeige?.type).toBe('boolean');
    expect(schema.properties.hilfeKontakt?.type).toBe('object');
    expect(Object.keys(schema.properties.hilfeKontakt?.properties ?? {}).sort()).toEqual(['name', 'url']);
    expect(schema.properties.hilfeAusblenden?.type).toBe('boolean');
    expect(schema.properties.werteLesen?.type).toBe('boolean');
    expect(schema.properties.bewussteAbweichungen?.type).toBe('array');
    expect(Object.keys(schema.properties.bewussteAbweichungen?.items?.properties ?? {}).sort()).toEqual(['begruendung', 'eintrag']);
    expect(schema.properties.sprache?.enum).toEqual(['auto', 'de', 'en']);
  });
  test('jeder Wert, den das Schema zulässt, übernimmt die Zusammenführung', () => {
    for (const s of schema.properties.sprache?.enum ?? []) expect(firmaAus({ sprache: s }, IDS)).toMatchObject({ verwaltet: true, sprache: s });
    expect(firmaAus({ sprache: 'fr' }, IDS)).toEqual(OHNE_FIRMA);
  });
  test('Platzhalter wie getMessage: $1…$9, fehlende leer', () => {
    expect(einsetzen('$1 bis $2', ['3', '7'])).toBe('3 bis 7');
    expect(einsetzen('Version $1', [])).toBe('Version ');
    expect(einsetzen('ohne', ['x'])).toBe('ohne');
  });
  test('jede Vorlage in _locales nutzt nur $1…$9, keine benannten Platzhalter', () => {
    for (const s of ['de', 'en']) {
      const m = JSON.parse(readFileSync(new URL(`../../public/_locales/${s}/messages.json`, import.meta.url), 'utf8')) as Record<string, { message: string; placeholders?: unknown }>;
      for (const [k, v] of Object.entries(m)) {
        expect(v.placeholders, `${s}:${k}`).toBeUndefined();
        expect(v.message.replace(/\$\d/g, ''), `${s}:${k}`).not.toMatch(/\$/);
      }
    }
  });
});

describe('U-46c Anheften-Hinweis nach der Installation (H17d, Spez. §14.5 Nr. 3)', () => {
  test('nur bei der Erstinstallation, nie bei Update oder Browser-Update', () => {
    for (const art of ['normal', 'development', 'sideload', 'other']) expect(startSeiteBei('install', art)).toBe('/optionen.html#start');
    for (const g of ['update', 'chrome_update', 'shared_module_update', '']) expect(startSeiteBei(g, 'normal')).toBeNull();
  });
  test('nie bei Installation per Richtlinie: Das Firmenprofil heftet das Symbol selbst an (§10)', () => {
    expect(startSeiteBei('install', 'admin')).toBeNull();
    expect(startKastenZeigen('admin')).toBe(false);
    expect(startKastenZeigen('normal')).toBe(true);
    expect(startKastenZeigen(undefined)).toBe(true);
  });
});
