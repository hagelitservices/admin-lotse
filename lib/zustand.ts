/**
 * Bewertung passt / weicht ab / nicht lesbar (Spez. §5.3, §5.4). „Passt“ gibt es genau dann, wenn eine sichere Lesung
 * vorliegt und ihr Token in `empfohlen` steht bzw. die Zahl in der Spanne liegt. Alles andere ist nie „passt“ (U-23).
 */
import type { Eintrag, Leser } from '../inhalte/schema';
import { MEHRDEUTIG } from './leser';
import type { Seitenbefund } from './seite';

export type Art = 'lese' | 'passt' | 'weicht-ab' | 'nicht-lesbar' | 'bewusst' | 'nur-erklaerung';
export type Grund = 'mehrdeutig' | 'unbekannt' | 'zeitgrenze' | 'aufbau' | 'sprache';
export type Form = 'kreis' | 'quadrat' | 'dreieck' | 'strich' | 'raute';
export type Farbe = 'ok' | 'down' | 'degraded' | 'unknown' | 'planned';

export interface Bewertung {
  art: Art;
  grund?: Grund;
  form?: Form;
  farbe?: Farbe;
  /** Das gelesene Token für die Zeile „Angezeigt: …“. */
  token?: string;
  /** Nur bei „bewusst so“: Firma (Begründung aus §10, Z-10) oder Nutzer („Hinweis ausblenden“, Z-11). */
  von?: 'firma' | 'nutzer';
}

export interface Lage {
  /** Lesung dieses Eintrags, falls eine da ist. */
  token: string | undefined;
  /** Die 15 s nach dem Seitenwechsel sind um (§5.3). */
  fristUm: boolean;
  /** Route passt, Titel nicht (§4.4). */
  aufbauAbweichend: boolean;
  /** Portal weder de noch en (§4.6, Z-13). */
  andereSprache: boolean;
  /** Firma oder Nutzer hat die Abweichung als bewusst markiert (§5.4). `true` = ohne Angabe, wer. */
  bewusst?: boolean | 'firma' | 'nutzer';
  /** Die Ladefrist läuft noch (H17c): Sprache und Aufbau können sich noch ändern, also „lese“ statt „nicht lesbar“. */
  ladend?: boolean;
}

const nichtLesbar = (grund: Grund, token?: string): Bewertung => ({ art: 'nicht-lesbar', grund, form: 'strich', farbe: 'unknown', ...(token ? { token } : {}) });

type Urteil = 'passt' | 'weicht-ab' | 'unbekannt';

function urteil(leser: Leser, token: string): Urteil {
  // Zahlen (Zeilenzahl oder Zahl in einer Zelle, H8c) gelten über die Spanne, nie über ein Wort.
  if (leser.art === 'anzahl' || leser.spanne) {
    if (!/^\d+$/.test(token)) return 'unbekannt';
    const n = Number(token);
    const { min, max } = leser.spanne ?? {};
    if (min === undefined && max === undefined) return 'unbekannt';
    return (min === undefined || n >= min) && (max === undefined || n <= max) ? 'passt' : 'weicht-ab';
  }
  if (leser.empfohlen.includes(token)) return 'passt';
  const bekannt = leser.art === 'schalter' || leser.art === 'haekchen' ? token === 'ja' || token === 'nein' : Object.hasOwn(leser.werte ?? {}, token);
  return bekannt ? 'weicht-ab' : 'unbekannt';
}

export function bewerten(e: Pick<Eintrag, 'leser' | 'empfehlung'>, lage: Lage): Bewertung {
  const leser = e.leser;
  if (!leser) return { art: 'nur-erklaerung' };
  // Ladebildschirm (Entra): Titel und `lang` stehen noch nicht fest — kein „nicht lesbar“, solange die Ladefrist läuft.
  if ((lage.andereSprache || lage.aufbauAbweichend) && lage.ladend) return leser.dialog ? { art: 'nur-erklaerung' } : { art: 'lese' };
  if (lage.andereSprache) return nichtLesbar('sprache');
  if (lage.aufbauAbweichend) return nichtLesbar('aufbau');
  const { token } = lage;
  if (token === undefined) {
    // Dialog-Leser: Solange das Seitenfenster zu ist, gilt nur der Seiteneintrag (§4.3).
    if (leser.dialog) return { art: 'nur-erklaerung' };
    return lage.fristUm ? nichtLesbar('zeitgrenze') : { art: 'lese' };
  }
  if (token === MEHRDEUTIG) return nichtLesbar('mehrdeutig');
  if (leser.art === 'domains') return /^\d+$/.test(token) ? { art: 'nur-erklaerung', token } : nichtLesbar('unbekannt');
  const u = urteil(leser, token);
  if (u === 'unbekannt') return nichtLesbar('unbekannt');
  // Nur die Abweichung ist sicher (H8c): ein empfohlener Wert wird angezeigt, aber nie zum grünen Kreis.
  if (u === 'passt') return leser.nurAbweichung ? { art: 'nur-erklaerung', token } : { art: 'passt', form: 'kreis', farbe: 'ok', token };
  if (lage.bewusst) return { art: 'bewusst', form: 'raute', farbe: 'planned', token, ...(lage.bewusst === true ? {} : { von: lage.bewusst }) };
  return e.empfehlung.schwere === 'rot'
    ? { art: 'weicht-ab', form: 'quadrat', farbe: 'down', token }
    : { art: 'weicht-ab', form: 'dreieck', farbe: 'degraded', token };
}

/** Alle Einträge einer Seite bewerten. `eintrag` liefert den vollen Eintrag zur Kennung; `jetzt` zählt gegen `ladeBis`. */
export function tabBewerten(
  z: Pick<Seitenbefund, 'eintraege' | 'aufbauAbweichend' | 'sprache'> & { lesungen: Record<string, string>; fristUm: boolean; ladeBis?: number | null },
  eintrag: (id: string) => Pick<Eintrag, 'leser' | 'empfehlung'> | undefined,
  bewusst: (id: string) => boolean | 'firma' | 'nutzer' = () => false,
  jetzt: number = Date.now(),
): Record<string, Bewertung> {
  const aus: Record<string, Bewertung> = {};
  const ladend = typeof z.ladeBis === 'number' && jetzt < z.ladeBis;
  for (const id of z.eintraege) {
    const e = eintrag(id);
    if (!e) continue;
    aus[id] = bewerten(e, {
      token: Object.hasOwn(z.lesungen, id) ? z.lesungen[id] : undefined,
      fristUm: z.fristUm,
      aufbauAbweichend: z.aufbauAbweichend.includes(id),
      andereSprache: z.sprache === 'andere',
      bewusst: bewusst(id),
      ladend,
    });
  }
  return aus;
}

/**
 * Ladefrist einer Route (H17c, Spez. §4.6): Weicht Sprache oder Aufbau ab, beginnt sie mit der ersten solchen Meldung.
 * Danach bleibt sie, solange die Route gleich bleibt — auch abgelaufen: Eine wirklich fremdsprachige Seite springt bei einer
 * späteren Titeländerung nicht wieder auf „lese“. Neu beginnt sie nur nach einem Routenwechsel oder wenn die Seite
 * zwischendurch ohne Abweichung war (etwa Neuladen einer gelesenen Seite).
 */
export function ladeBisFuer(
  befund: Pick<Seitenbefund, 'schluessel' | 'eintraege' | 'aufbauAbweichend' | 'sprache'>,
  alt: { schluessel: string | null; ladeBis?: number | null } | undefined,
  jetzt: number,
  frist: number,
): number | null {
  const vorlaeufig = befund.eintraege.length > 0 && (befund.sprache === 'andere' || befund.aufbauAbweichend.length > 0);
  if (!vorlaeufig) return null;
  if (alt && alt.schluessel === befund.schluessel && typeof alt.ladeBis === 'number') return alt.ladeBis;
  return jetzt + frist;
}

/** Das Abzeichen zählt nur „weicht ab“ (§5.4). */
export const abweichungenZaehlen = (b: Iterable<Bewertung>) => [...b].filter((x) => x.art === 'weicht-ab').length;
