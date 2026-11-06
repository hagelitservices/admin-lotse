/**
 * Jeder Rahmen eines Portal-Tabs, auch die eingebetteten Herkünfte aus H2 (Spez. §3.3, §5.3, §8).
 * Zuerst `location.ancestorOrigins`: Ist der oberste Rahmen keines der Portale, endet das Skript ohne Listener (U-12).
 *
 * **Ein Wert gilt erst, wenn er ruhig steht (`RUHE_MS`).** Entra zeigt nach dem Aufbau bis zu 1,9 s lang alle Schalter
 * als „aus“, ohne Ladehinweis, und setzt dann die echten Werte (gemessen 05.11.2026, `scripts/probe-lesezeit.ts`).
 * Wer sofort liest, meldet ein falsches „Passt“. Jede Wertänderung im Rahmen startet die Ruhezeit neu. Die Ruhezeit wächst
 * mit der Ladezeit (`ruheFuer`): Eine langsame Verbindung braucht auch für die Werte länger. Bei einem sichtbaren Fehlerhinweis
 * gilt nichts als gelesen. **Grenze:** Einen Vorgabewert, den das Portal ohne jeden Hinweis dauerhaft stehen lässt, kann
 * kein Leser erkennen; die Oberfläche sagt deshalb „Angezeigt: …“ (Spez. §5.3, §20.1).
 */
import { PORTAL_URSPRUENGE } from '../manifest';
import { fehlerHinweis, lies } from './leser';
import { FRIST_MS, type LeserAuftrag, type LesungMeldung, type LiesAuftrag, type RahmenBereit } from './nachrichten';

/** Doppelt so lang wie der längste gemessene Fall. */
export const RUHE_MS = 4_000;
/** Obergrenze der mitwachsenden Ruhezeit. */
export const RUHE_MAX_MS = 10_000;
/** Mindestens 4 s, sonst so lang, wie das Bedienelement zum Erscheinen brauchte. */
export const ruheFuer = (erscheinenNachMs: number) => Math.min(RUHE_MAX_MS, Math.max(RUHE_MS, erscheinenNachMs));
/** DOM höchstens alle 500 ms ansehen (§5.3). */
export const TAKT_MS = 500;

/** Liest nur, wenn der oberste Rahmen eines der vier Portale ist. */
export function obersterRahmenIstPortal(ort: Pick<Location, 'origin' | 'ancestorOrigins'>, oben: boolean): boolean {
  const kette = ort.ancestorOrigins;
  const oberster = oben || !kette || kette.length === 0 ? ort.origin : kette[kette.length - 1];
  return (PORTAL_URSPRUENGE as readonly string[]).includes(oberster ?? '');
}

export interface RahmenUmgebung {
  ort: Pick<Location, 'origin' | 'ancestorOrigins'>;
  oben: boolean;
  dokument: Document;
  hoeren(rueckruf: (n: unknown) => void): void;
  senden(m: LesungMeldung | RahmenBereit): void;
  /** Das Dokument geht endgültig weg (nicht bei Zwischenspeicherung im Vor-/Zurück-Puffer). */
  beiEnde?(rueckruf: () => void): void;
  gueltig(): boolean;
  jetzt(): number;
  wecken(rueckruf: () => void, ms: number): unknown;
  weckerEnde(kennung: unknown): void;
  /** T-19: Messpunkt je Lesedurchlauf, nur im Testbau gesetzt (`__LOTSE_MUSTER__`); im Store-Paket fehlt er. */
  messen?: { uhr(): number; melden(ms: number): void };
}

export const zustaendig = (rahmen: LeserAuftrag['leser']['rahmen'], oben: boolean) => rahmen === 'beliebig' || (rahmen === 'oben') === oben;

interface Kandidat {
  token: string;
  anzeige: string[] | undefined;
  seit: number;
  /** Seit dem Beginn des Auftrags: wie lange das Bedienelement zum Erscheinen brauchte. */
  erschienenNach: number;
}

const WERT_ATTRIBUTE = new Set(['aria-checked', 'aria-rowcount', 'aria-valuetext', 'checked', 'value']);

/** Ein Leseauftrag in einem Rahmen. */
function durchlauf(roh: LiesAuftrag, u: RahmenUmgebung): { stopp: () => void; abmelden: () => void } {
  // Ein Rahmen, der erst nach der Frist kommt (Entra lädt um), bekommt sein eigenes Fenster: Sonst läse er nie, und die
  // Lesung des Rahmens, den er ersetzt, bliebe stehen.
  const auftrag = u.jetzt() > roh.bis ? { ...roh, bis: u.jetzt() + FRIST_MS } : roh;
  const beginn = auftrag.bis - FRIST_MS;
  const leser = auftrag.leser.filter((l) => zustaendig(l.leser.rahmen, u.oben));
  const kandidaten = new Map<string, Kandidat>();
  let gemeldet: Record<string, string> = {};
  let gemeldeteAnzeige: Record<string, string[]> = {};
  let letzteWertaenderung = -Infinity;
  let zuletzt = -Infinity;
  let wecker: unknown;
  let weckerZiel = Infinity;
  let endeGemeldet = false;
  let aus = false;
  let beobachter: MutationObserver | undefined;

  const senden = (ende: boolean) =>
    u.senden({ art: 'lesung', anfrage: auftrag.anfrage, token: gemeldet, anzeige: gemeldeteAnzeige, ...(ende ? { ende: true } : {}) });

  const stopp = () => {
    aus = true;
    beobachter?.disconnect();
    if (wecker !== undefined) u.weckerEnde(wecker);
    wecker = undefined;
  };

  const wecke = (ziel: number) => {
    if (aus || ziel >= weckerZiel) return;
    if (wecker !== undefined) u.weckerEnde(wecker);
    weckerZiel = ziel;
    wecker = u.wecken(pruefen, Math.max(0, ziel - u.jetzt()));
  };

  // T-19 (Spez. §14.3): Zeit je Durchlauf, nur wenn der Testbau einen Messpunkt mitgibt.
  function pruefen() {
    const m = u.messen;
    if (!m || leser.length === 0) return durchsehen();
    const start = m.uhr();
    durchsehen();
    m.melden(m.uhr() - start);
  }

  function durchsehen() {
    wecker = undefined;
    weckerZiel = Infinity;
    if (aus) return;
    if (!u.gueltig()) return stopp();
    const jetzt = u.jetzt();
    zuletzt = jetzt;
    const naechst: Record<string, string> = {};
    const naechsteAnzeige: Record<string, string[]> = {};
    let naechsterRuhepunkt = Infinity;
    const hinweis = fehlerHinweis(u.dokument);

    for (const { id, leser: l } of leser) {
      const offenNachFrist = jetzt > auftrag.bis && !kandidaten.has(id) && !l.dialog;
      const treffer = offenNachFrist || hinweis ? null : lies(u.dokument, l);
      if (!treffer) {
        kandidaten.delete(id);
        continue;
      }
      const alt = kandidaten.get(id);
      const anzeigeGleich = (alt?.anzeige ?? []).join() === (treffer.anzeige ?? []).join();
      const kandidat: Kandidat = alt && alt.token === treffer.token && anzeigeGleich ? alt : { token: treffer.token, anzeige: treffer.anzeige, seit: jetzt, erschienenNach: alt?.erschienenNach ?? jetzt - beginn };
      kandidaten.set(id, kandidat);
      const ruhigAb = Math.max(kandidat.seit, letzteWertaenderung) + ruheFuer(kandidat.erschienenNach);
      if (jetzt >= ruhigAb) {
        naechst[id] = kandidat.token;
        if (kandidat.anzeige) naechsteAnzeige[id] = kandidat.anzeige;
      } else {
        naechsterRuhepunkt = Math.min(naechsterRuhepunkt, ruhigAb);
        // Bis zur Ruhe bleibt der zuletzt sichere Wert stehen, aber nie ein Wert, dessen Bedienelement weg ist.
        const stand = gemeldet[id];
        if (stand !== undefined) {
          naechst[id] = stand;
          const a = gemeldeteAnzeige[id];
          if (a) naechsteAnzeige[id] = a;
        }
      }
    }

    const geaendert = JSON.stringify([naechst, naechsteAnzeige]) !== JSON.stringify([gemeldet, gemeldeteAnzeige]);
    gemeldet = naechst;
    gemeldeteAnzeige = naechsteAnzeige;
    const endePunkt = auftrag.bis + RUHE_MS;
    const ende = u.oben && !endeGemeldet && jetzt >= endePunkt;
    if (ende) endeGemeldet = true;
    if (geaendert || ende) senden(ende);

    if (naechsterRuhepunkt < Infinity) wecke(naechsterRuhepunkt);
    if (u.oben && !endeGemeldet) wecke(endePunkt);
    if (jetzt <= auftrag.bis) wecke(auftrag.bis + 1);
    // Nichts mehr zu suchen und nichts zu beobachten: Beobachter abstellen (§5.3).
    if (jetzt > endePunkt && kandidaten.size === 0 && !leser.some((l) => l.leser.dialog)) beobachter?.disconnect();
  }

  if (leser.length > 0) {
    const Beobachter = u.dokument.defaultView?.MutationObserver;
    if (Beobachter) {
      beobachter = new Beobachter((aenderungen) => {
        const jetzt = u.jetzt();
        if (aenderungen.some((a) => a.type === 'attributes' && WERT_ATTRIBUTE.has(a.attributeName ?? ''))) letzteWertaenderung = jetzt;
        wecke(Math.max(jetzt, zuletzt + TAKT_MS));
      });
      beobachter.observe(u.dokument, { subtree: true, childList: true, attributes: true, characterData: true });
    }
  }
  pruefen();
  return {
    stopp,
    // Rahmen geht weg: Seine Lesungen dürfen nicht stehen bleiben, sonst zeigt die Leiste weiter „Passt“ (Prüfer H5).
    abmelden: () => {
      stopp();
      if (Object.keys(gemeldet).length > 0) u.senden({ art: 'lesung', anfrage: auftrag.anfrage, token: {}, anzeige: {} });
    },
  };
}

/** `true`, wenn der Rahmen zuhört. */
export function rahmenStarten(u: RahmenUmgebung): boolean {
  if (!obersterRahmenIstPortal(u.ort, u.oben)) return false;
  let laufend: { anfrage: string; bis: number; lauf: ReturnType<typeof durchlauf> } | null = null;
  u.hoeren((n) => {
    const a = n as Partial<LiesAuftrag> | null;
    if (a?.art !== 'lies' || typeof a.anfrage !== 'string' || typeof a.bis !== 'number' || !Array.isArray(a.leser) || !u.gueltig()) return;
    // Rundsendung und gezielte Antwort auf „rahmen-bereit“ können sich kreuzen; ein älterer Auftrag verdrängt nie den neuen.
    if (laufend && (laufend.anfrage === a.anfrage || a.bis < laufend.bis)) return;
    laufend?.lauf.stopp();
    laufend = { anfrage: a.anfrage, bis: a.bis, lauf: durchlauf(a as LiesAuftrag, u) };
  });
  u.beiEnde?.(() => laufend?.lauf.abmelden());
  u.senden({ art: 'rahmen-bereit' });
  return true;
}
