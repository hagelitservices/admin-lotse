/**
 * Was die Seitenleiste aus Eintrag und Bewertung macht (Spez. §11.2, §11.3, §5.4) — ohne DOM, damit Unit-Tests und die
 * Musterseite dieselbe Logik sehen. Texte der Oberfläche kommen über `t` aus `_locales`, Texte der Einträge aus den
 * Inhaltsdateien in der Sprache der Oberfläche.
 */
import type { Eintrag, Leser } from '../inhalte/schema';
import { adresseVon } from './adressen';
import { AKTIVE_EINTRAEGE } from './inhalte';
import type { Bewertung, Grund } from './zustand';

export type UiSprache = 'de' | 'en';
export type Uebersetzer = (schluessel: string, ...ersetzungen: string[]) => string;

/** Sortierung der Karten (§11.2): weicht ab (rot vor gelb) → nicht lesbar → passt → bewusst so → nur Erklärung. */
export function rang(e: Pick<Eintrag, 'empfehlung'>, b: Bewertung | undefined): number {
  switch (b?.art) {
    case 'weicht-ab':
      return e.empfehlung.schwere === 'rot' ? 0 : 1;
    case 'nicht-lesbar':
    case 'lese':
      return 2;
    case 'passt':
      return 3;
    case 'bewusst':
      return 4;
    default:
      return 5;
  }
}

/** Stabil sortiert: Gleichrangige bleiben in der Reihenfolge der Inhaltsdatei. */
export function sortieren<T extends Pick<Eintrag, 'id' | 'empfehlung'>>(eintraege: readonly T[], bewertungen: Record<string, Bewertung>): T[] {
  return eintraege
    .map((e, i) => ({ e, i, r: rang(e, bewertungen[e.id]) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}

/** Zahl als Wert: Zeilenzahl (`anzahl`) oder Zahl in einer Zelle (`zelle` mit Spanne). */
const istZahl = (l: Leser) => l.art === 'anzahl' || l.spanne !== undefined;

/**
 * Sichtbares Wort zu einem Token. `werte` führt je Token die Portal-Wörter abwechselnd deutsch und englisch (H7–H10):
 * Stelle 0 ist deutsch, Stelle 1 englisch.
 */
export function wertWort(l: Leser, token: string, sprache: UiSprache, t: Uebersetzer): string {
  if (l.art === 'schalter' || l.art === 'haekchen') return t(token === 'ja' ? 'wert_ja' : 'wert_nein');
  if (l.art === 'domains') return t(token === '1' ? 'wert_domain_eine' : 'wert_domains', token);
  if (istZahl(l)) return token;
  const woerter = l.werte?.[token];
  if (!woerter) return token;
  return (sprache === 'de' ? woerter[0] : (woerter[1] ?? woerter[0])) ?? token;
}

/** Empfehlung als Wort („Nein“, „höchstens 4“). `null`, wo es keine gibt (Domainliste). */
export function empfohlenWort(l: Leser, sprache: UiSprache, t: Uebersetzer): string | null {
  if (l.art === 'domains') return null;
  if (istZahl(l)) {
    const { min, max } = l.spanne ?? {};
    if (min !== undefined && max !== undefined) return t('spanne_zwischen', String(min), String(max));
    if (max !== undefined) return t('spanne_hoechstens', String(max));
    if (min !== undefined) return t('spanne_mindestens', String(min));
    return null;
  }
  if (l.empfohlen.length === 0) return null;
  return l.empfohlen.map((tok) => wertWort(l, tok, sprache, t)).join(` ${t('wort_oder')} `);
}

/** Zeile „Angezeigt: Ja · Empfohlen: Nein“. `null`, solange nichts gelesen ist. */
export function angezeigtZeile(e: Pick<Eintrag, 'leser'>, b: Bewertung | undefined, sprache: UiSprache, t: Uebersetzer): string | null {
  const l = e.leser;
  if (!l || b?.token === undefined) return null;
  const angezeigt = t('zeile_angezeigt', wertWort(l, b.token, sprache, t));
  const empfohlen = empfohlenWort(l, sprache, t);
  return empfohlen ? `${angezeigt} · ${t('zeile_empfohlen', empfohlen)}` : angezeigt;
}

/** Schlüssel des Statusworts (§5.4); `null` bei „nur Erklärung“ (kein Punkt) und während des Lesens. */
export function statusSchluessel(b: Bewertung | undefined): string | null {
  switch (b?.art) {
    case 'passt':
      return 'status_passt';
    case 'weicht-ab':
      return 'status_weicht_ab';
    case 'nicht-lesbar':
      return 'status_nicht_lesbar';
    case 'bewusst':
      return 'status_bewusst';
    default:
      return null;
  }
}

/** Ein Satz zum Grund von „nicht lesbar“ (Z-8, Z-13). */
export const grundSchluessel = (g: Grund | undefined) => `grund_${g ?? 'unbekannt'}`;

/** Lizenz-Schlüssel der Inhalte → Satz in `_locales` (`entra-p1` → `lizenz_entra_p1`). */
export const lizenzSchluessel = (l: string) => `lizenz_${l.replaceAll('-', '_')}`;

/** Quelle als Adresse: `pfad` ist der Pfad bei Microsoft Learn ohne Sprache (§6.1). */
export function quelleAdresse(q: Eintrag['quellen'][number], sprache: UiSprache): string {
  return 'url' in q ? q.url : `https://learn.microsoft.com/${sprache === 'de' ? 'de-de' : 'en-us'}/${q.pfad}`;
}

/** Karte offen beim ersten Zeigen (§11.3): Abweichung und „nicht lesbar“ offen, „passt“ und „bewusst“ zu. */
export function anfangsOffen(b: Bewertung | undefined, einzige: boolean): boolean {
  if (b?.art === 'weicht-ab' || b?.art === 'nicht-lesbar') return true;
  if (b?.art === 'passt' || b?.art === 'bewusst') return false;
  return einzige;
}

/**
 * Z-3: die drei wichtigsten Einträge eines Portals als Ziel im selben Tab. Wichtig = Schwere rot vor gelb vor Info, dann
 * Reihenfolge der Inhaltsdatei. Routen mit Platzhalter (`:id`, `:domain`) haben keine feste Adresse und fallen weg; je
 * Route höchstens ein Eintrag.
 */
export function wichtigste(portal: string, n = 3): { id: string; titel: Eintrag['titel']; adresse: string }[] {
  const gewicht = { rot: 0, gelb: 1, info: 2 } as const;
  const kandidaten = AKTIVE_EINTRAEGE.filter((e) => e.portal === portal && !/(^|\/):/.test(e.route))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => gewicht[a.e.empfehlung.schwere] - gewicht[b.e.empfehlung.schwere] || a.i - b.i);
  const routen = new Set<string>();
  const aus: { id: string; titel: Eintrag['titel']; adresse: string }[] = [];
  for (const { e } of kandidaten) {
    if (routen.has(e.route)) continue;
    routen.add(e.route);
    aus.push({ id: e.id, titel: e.titel, adresse: adresseVon(e.portal, e.route) });
    if (aus.length === n) break;
  }
  return aus;
}

/** Ansage für die Live-Region (§11.4): Zählung statt Einzelheiten, damit sie kurz bleibt. */
export function ansage(bewertungen: readonly (Bewertung | undefined)[], t: Uebersetzer): string {
  const zahl = (art: Bewertung['art']) => bewertungen.filter((b) => b?.art === art).length;
  if (bewertungen.some((b) => b?.art === 'lese')) return t('ansage_lese');
  const teile: string[] = [];
  const weicht = zahl('weicht-ab');
  const passt = zahl('passt');
  const nicht = zahl('nicht-lesbar');
  if (weicht) teile.push(t(weicht === 1 ? 'ansage_weicht_eine' : 'ansage_weicht', String(weicht)));
  if (nicht) teile.push(t('ansage_nicht_lesbar', String(nicht)));
  if (passt) teile.push(t('ansage_passt', String(passt)));
  return teile.join(', ');
}
