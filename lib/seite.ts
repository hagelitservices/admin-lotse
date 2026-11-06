/**
 * Welche Einträge zu einer Seite gehören und ob gelesen werden darf (Spez. §4.2, §4.4, §4.6).
 * Das volle Inhaltsmodell (zod) kommt mit H5; hier zählt nur der Kopf eines Eintrags.
 */
import { seiteAus, spracheAus, vergleichsform, type Portal, type Sprache } from './route';

export interface EintragKopf {
  id: string;
  /** Routen-Schlüssel in der Form der Messung, z. B. `entra:view:…/~/UserSettings`. */
  route: string;
  /** Erwartete Wörter in `document.title` (Gegenprobe §4.4). Leer = keine Probe. */
  titel: { de: string[]; en: string[] };
}

export interface Seitenbefund {
  portal: Portal;
  schluessel: string | null;
  sprache: Sprache;
  /** Alle Einträge der Route (Erklärung erscheint immer). */
  eintraege: string[];
  /** Route passt, Titel nicht: Erklärung ja, Lesen nein, intern „Aufbau abweichend“ (U-11). */
  aufbauAbweichend: string[];
  /** Einträge, deren Werte gelesen werden dürfen. */
  zuLesen: string[];
}

const glatt = (s: string) =>
  s.normalize('NFKC').replace(/­/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Gegenprobe über den Titel: eines der erwarteten Wörter steht im Titel. Bei anderer Sprache beide Listen. */
export function titelPasst(eintrag: EintragKopf, titel: string, sprache: Sprache): boolean {
  const woerter = sprache === 'andere' ? [...eintrag.titel.de, ...eintrag.titel.en] : eintrag.titel[sprache];
  if (woerter.length === 0) return true;
  const t = glatt(titel);
  return woerter.some((w) => t.includes(glatt(w)));
}

/** Befund für eine Adresse; `null` außerhalb der vier Portale. Adresse und Titel werden nicht weitergereicht. */
export function seiteBewerten(
  adresse: string,
  titel: string | null,
  lang: string | null,
  inhalte: readonly EintragKopf[],
): Seitenbefund | null {
  const seite = seiteAus(adresse);
  if (!seite) return null;
  const sprache = spracheAus(lang);
  const passend = seite.schluessel
    ? inhalte.filter((e) => vergleichsform(e.route) === vergleichsform(seite.schluessel ?? ''))
    : [];
  // Ohne Titel (Meldung über tabs.onUpdated, bevor das Inhalts-Skript berichtet hat) wird noch nicht gelesen.
  const abweichend = titel === null ? [] : passend.filter((e) => !titelPasst(e, titel, sprache));
  const zuLesen =
    titel === null || sprache === 'andere' ? [] : passend.filter((e) => !abweichend.includes(e)).map((e) => e.id);
  return {
    portal: seite.portal,
    schluessel: seite.schluessel,
    sprache,
    eintraege: passend.map((e) => e.id),
    aufbauAbweichend: abweichend.map((e) => e.id),
    zuLesen,
  };
}
