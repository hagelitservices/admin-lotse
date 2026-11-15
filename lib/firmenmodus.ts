/**
 * Firmeneinstellungen (Spez. §10, Rahmen E5) ohne `browser`: aus dem rohen Wert von `storage.managed` wird eine geprüfte
 * `Firma`. Unbekannte Schlüssel und fremde Eintrags-Kennungen fallen weg (U-46); Nutzer können verwaltete Werte nicht
 * überschreiben — eine Begründung der Firma schlägt ein „Ausblenden“ des Nutzers.
 */
export interface Firma {
  /** Irgendein bekannter Schlüssel ist gesetzt: Band „Von Ihrer IT eingerichtet“ (§10). */
  verwaltet: boolean;
  hilfeKontakt: { name: string; url: string } | null;
  hilfeAusblenden: boolean;
  /** Eintrags-Kennung → Begründung der Firma. */
  bewusst: Record<string, string>;
  werteLesen: boolean;
  sprache: 'auto' | 'de' | 'en';
  /** Störungsanzeige (S8): `true`/`false` von der Firma erzwungen, `null` = der Nutzer entscheidet (Standard aus). */
  stoerungsanzeige: boolean | null;
}

export const OHNE_FIRMA: Firma = { verwaltet: false, hilfeKontakt: null, hilfeAusblenden: false, bewusst: {}, werteLesen: true, sprache: 'auto', stoerungsanzeige: null };

const text = (w: unknown, max: number) => (typeof w === 'string' && w.trim() !== '' ? w.trim().slice(0, max) : null);

/** Nur `https:` und `mailto:` (§10), damit kein `javascript:` als Hilfe-Link landet. */
function kontakt(w: unknown): Firma['hilfeKontakt'] {
  if (!w || typeof w !== 'object') return null;
  const name = text((w as { name?: unknown }).name, 80);
  const url = text((w as { url?: unknown }).url, 500);
  if (!name || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'mailto:' ? { name, url: u.href } : null;
  } catch {
    return null;
  }
}

export function firmaAus(roh: unknown, ids: ReadonlySet<string>): Firma {
  if (!roh || typeof roh !== 'object') return OHNE_FIRMA;
  const r = roh as Record<string, unknown>;
  const hilfeKontakt = kontakt(r.hilfeKontakt);
  const hilfeAusblenden = r.hilfeAusblenden === true;
  const bewusst: Record<string, string> = {};
  if (Array.isArray(r.bewussteAbweichungen)) {
    for (const b of r.bewussteAbweichungen) {
      const id = (b as { eintrag?: unknown } | null)?.eintrag;
      const grund = text((b as { begruendung?: unknown } | null)?.begruendung, 300);
      if (typeof id === 'string' && ids.has(id) && grund) bewusst[id] = grund;
    }
  }
  const werteLesen = r.werteLesen !== false;
  const sprache = r.sprache === 'de' || r.sprache === 'en' ? r.sprache : 'auto';
  const stoerungsanzeige = typeof r.stoerungsanzeige === 'boolean' ? r.stoerungsanzeige : null;
  // §10: Das Band steht, sobald ein verwalteter Wert gesetzt ist — auch wenn er dem Standard entspricht (Prüfer H11b).
  const verwaltet =
    hilfeKontakt !== null ||
    typeof r.hilfeAusblenden === 'boolean' ||
    Object.keys(bewusst).length > 0 ||
    typeof r.werteLesen === 'boolean' ||
    r.sprache === 'auto' ||
    sprache !== 'auto' ||
    stoerungsanzeige !== null;
  return { verwaltet, hilfeKontakt, hilfeAusblenden, bewusst, werteLesen, sprache, stoerungsanzeige };
}

/** Wer hat die Abweichung als bewusst markiert? Firma vor Nutzer. */
export function bewusstVon(firma: Firma, ausgeblendet: ReadonlySet<string>, id: string): 'firma' | 'nutzer' | false {
  if (Object.hasOwn(firma.bewusst, id)) return 'firma';
  return ausgeblendet.has(id) ? 'nutzer' : false;
}

/** Liste ausgeblendeter Hinweise aus `storage.local`: nur bekannte Kennungen, ohne Doppelte. */
export function ausgeblendetAus(roh: unknown, ids: ReadonlySet<string>): string[] {
  return Array.isArray(roh) ? [...new Set(roh.filter((x): x is string => typeof x === 'string' && ids.has(x)))] : [];
}
