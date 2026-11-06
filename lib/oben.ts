/**
 * Oberster Rahmen eines Portals: meldet jede Seitenänderung (Spez. §3.3, §4.5).
 * `hashchange` und `popstate` (M365), dazu eine Prüfung von `location.href` und Titel alle 500 ms — Entra und Intune
 * wechseln die Route ohne Ereignis (H2). 500 statt 1000 ms, damit die Leiste auch dort ≤ 1 s nachzieht (T-05).
 * Liest nur, schreibt nichts in die Seite (U-21).
 */
import type { SeiteMeldung } from './nachrichten';

export const TAKT_MS = 500;

export interface ObenUmgebung {
  ort(): { href: string; titel: string; lang: string };
  senden(m: SeiteMeldung): void;
  ziel: Pick<Window, 'addEventListener'>;
  signal: AbortSignal;
  /** `false`, sobald die Erweiterung neu geladen wurde (veraltetes Skript). */
  gueltig(): boolean;
  takt(rueckruf: () => void, ms: number): unknown;
  taktEnde(kennung: unknown): void;
}

export function obenStarten(u: ObenUmgebung): () => void {
  let zuletzt = '';
  let kennung: unknown;
  const pruefen = () => {
    if (!u.gueltig() || u.signal.aborted) {
      u.taktEnde(kennung);
      return;
    }
    const { href, titel, lang } = u.ort();
    const merkmal = `${href}\n${titel}\n${lang}`;
    if (merkmal === zuletzt) return;
    zuletzt = merkmal;
    try {
      u.senden({ art: 'seite', href, titel, lang });
    } catch {
      u.taktEnde(kennung);
    }
  };
  u.ziel.addEventListener('hashchange', pruefen, { signal: u.signal });
  u.ziel.addEventListener('popstate', pruefen, { signal: u.signal });
  kennung = u.takt(pruefen, TAKT_MS);
  u.signal.addEventListener('abort', () => u.taktEnde(kennung));
  pruefen();
  return pruefen;
}
