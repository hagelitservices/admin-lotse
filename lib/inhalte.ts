/**
 * Lädt und typisiert die Inhaltsdateien (Spez. §3.1, §6). Geprüft werden sie beim Bau und im Test (`inhalte/schema.ts`).
 * Index-Zahlen kommen nur aus `data/hamburg-index/ergebnis-2026.json` (§6.1); `{wert}`, `{basis}`, `{jahr}` füllt `indexSaetze`.
 */
import entra from '../inhalte/entra.json';
import exchange from '../inhalte/exchange.json';
import intune from '../inhalte/intune.json';
import m365 from '../inhalte/m365.json';
import type { Eintrag } from '../inhalte/schema';
import { gesamt, jahr } from '../daten/hamburg-index-2026.json';
import type { EintragKopf } from './seite';

export const ALLE_EINTRAEGE = [...m365, ...entra, ...intune, ...exchange] as unknown as readonly Eintrag[];

/** Was die Erweiterung zeigt: `ausgesetzt` wird gebaut, aber nicht gezeigt (§6.4), `entwurf` ebenso. */
export const AKTIVE_EINTRAEGE: readonly Eintrag[] = ALLE_EINTRAEGE.filter((e) => e.status === 'aktiv');

export const kopfVon = (e: Eintrag): EintragKopf => ({ id: e.id, route: `${e.portal}:${e.route}`, titel: e.titelProbe });
export const KOEPFE: readonly EintragKopf[] = AKTIVE_EINTRAEGE.map(kopfVon);

export const eintragMit = (id: string): Eintrag | undefined => AKTIVE_EINTRAEGE.find((e) => e.id === id);

/** Wert einer Kennzahl wie `dmarc.wirksam_prozent` aus dem Feld `gesamt`; `null`, wenn es sie nicht gibt. */
export function kennzahlWert(kennzahl: string): number | null {
  let stelle: unknown = gesamt;
  for (const teil of kennzahl.split('.')) {
    if (typeof stelle !== 'object' || stelle === null || !Object.hasOwn(stelle, teil)) return null;
    stelle = (stelle as Record<string, unknown>)[teil];
  }
  return typeof stelle === 'number' ? stelle : null;
}

/** §6.1: DNSSEC bezieht sich auf alle gemessenen Domains, Mail-Kennzahlen auf die mit Mailempfang. */
export const basisVon = (kennzahl: string): number => (kennzahl.startsWith('dnssec.') ? gesamt.gemessen : gesamt.mit_mailempfang);

const zahl = (n: number, sprache: 'de' | 'en') => n.toLocaleString(sprache === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 });

/** Fertige Sätze für die Oberfläche; Kennzahlen ohne Wert fallen weg (U-35 lässt das gar nicht erst durch). */
export function indexSaetze(e: Pick<Eintrag, 'index'>, sprache: 'de' | 'en'): string[] {
  return (e.index ?? []).flatMap((s) => {
    const wert = kennzahlWert(s.kennzahl);
    if (wert === null) return [];
    return [
      s.satz[sprache]
        .replaceAll('{wert}', zahl(wert, sprache))
        .replaceAll('{basis}', zahl(basisVon(s.kennzahl), sprache))
        .replaceAll('{jahr}', String(jahr))
        // Zahl und Prozentzeichen nie trennen (Sichtprüfung H17b: „54,2 / % von ihnen“ bei 320 px).
        .replace(/(\d) %/g, '$1\u00a0%'),
    ];
  });
}
