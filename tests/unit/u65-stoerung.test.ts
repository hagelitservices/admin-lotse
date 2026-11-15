// U-65 (S8): Störungsanzeige — Auswertung der Statusantwort, Schalter Firma vor Nutzer, Abzeichen, Richtlinie.
import { describe, expect, test } from 'vitest';
import { firmaAus, OHNE_FIRMA } from '../../lib/firmenmodus';
import { PUNKT, VERALTET_MS, abzeichenMit, anzeigeAn, dienstSeite, gespeicherterStand, standAus } from '../../lib/stoerung';

const JETZT = Date.parse('2026-11-16T10:00:00Z');
const antwort = (zustaende: Record<string, string>, vor = 60_000) => ({
  checkedAt: new Date(JETZT - vor).toISOString(),
  services: Object.fromEntries(Object.entries(zustaende).map(([k, v]) => [k, { state: v, title: '<b>Fremdtext</b>' }])),
});

describe('U-65 standAus', () => {
  test('degraded und down zählen, ok/planned/unknown nicht; Reihenfolge fest', () => {
    const s = standAus(antwort({ 'exchange-online': 'down', 'microsoft-365': 'degraded', 'microsoft-teams': 'planned', datev: 'down' }), JETZT);
    expect(s?.gestoert).toEqual(['microsoft-365', 'exchange-online']);
    expect(standAus(antwort({ 'microsoft-teams': 'unknown', 'microsoft-365': 'ok' }), JETZT)?.gestoert).toEqual([]);
  });
  test('veraltet, aus der Zukunft oder kaputt → null (Grau ist kein Grün)', () => {
    expect(standAus(antwort({ 'microsoft-365': 'down' }, VERALTET_MS), JETZT)).toBeNull();
    expect(standAus(antwort({ 'microsoft-365': 'down' }, -10 * 60_000), JETZT)).toBeNull();
    for (const roh of [null, 'x', 42, {}, { checkedAt: 'gestern', services: {} }, { checkedAt: new Date(JETZT).toISOString() }])
      expect(standAus(roh, JETZT)).toBeNull();
  });
  test('gespeicherter Stand: nur bekannte Dienste, verfällt nach 15 Minuten', () => {
    expect(gespeicherterStand({ geprueft: JETZT - 1000, gestoert: ['microsoft-teams', 'boese', 3] }, JETZT)?.gestoert).toEqual(['microsoft-teams']);
    expect(gespeicherterStand({ geprueft: JETZT - VERALTET_MS, gestoert: [] }, JETZT)).toBeNull();
    expect(gespeicherterStand(undefined, JETZT)).toBeNull();
  });
});

describe('U-65 Schalter und Abzeichen', () => {
  test('Standard aus; Firma schlägt Nutzer', () => {
    expect(anzeigeAn(null, undefined)).toBe(false);
    expect(anzeigeAn(null, 'ja')).toBe(false);
    expect(anzeigeAn(null, true)).toBe(true);
    expect(anzeigeAn(false, true)).toBe(false);
    expect(anzeigeAn(true, false)).toBe(true);
  });
  test('Abweichungszahl geht vor, sonst Punkt bei Störung', () => {
    const gestoert = { geprueft: JETZT, gestoert: ['microsoft-teams' as const] };
    expect(abzeichenMit('3', gestoert)).toBe('3');
    expect(abzeichenMit('', gestoert)).toBe(PUNKT);
    expect(abzeichenMit('', { geprueft: JETZT, gestoert: [] })).toBe('');
    expect(abzeichenMit('', null)).toBe('');
  });
  test('Dienstseiten mit Kampagne, Exchange auf /outlook', () => {
    expect(dienstSeite('exchange-online')).toBe('https://www.hagel-it.de/it-stoerungen/outlook?mtm_campaign=admin-lotse&mtm_source=stoerung');
    expect(dienstSeite('microsoft-365')).toContain('/it-stoerungen/microsoft-365?');
  });
  test('Richtlinie `stoerungsanzeige`: nur boolean, setzt das Firmenband', () => {
    expect(OHNE_FIRMA.stoerungsanzeige).toBeNull();
    expect(firmaAus({ stoerungsanzeige: true }, new Set())).toMatchObject({ stoerungsanzeige: true, verwaltet: true });
    expect(firmaAus({ stoerungsanzeige: false }, new Set())).toMatchObject({ stoerungsanzeige: false, verwaltet: true });
    expect(firmaAus({ stoerungsanzeige: 'true' }, new Set())).toMatchObject({ stoerungsanzeige: null, verwaltet: false });
  });
});
