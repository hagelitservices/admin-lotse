/**
 * Störungsanzeige (S8, Spez. §21.40) ohne `browser`: Auswertung von `GET https://www.hagel-it.de/api/status`.
 *
 * Standardmäßig aus. Erst wenn der Nutzer den Schalter in den Einstellungen umlegt (oder die Firma per Richtlinie
 * `stoerungsanzeige: true` setzt), fragt der Dienstarbeiter alle fünf Minuten genau diese eine Adresse ab — ein `GET` ohne
 * Cookies, ohne Referrer, ohne Inhalt. Aus den Portalen geht nichts mit: kein Routen-Schlüssel, keine Lesung, kein Tab.
 * Ausgewertet werden nur Kennung und Zustand der drei Dienste unten; Titel und Texte des Herstellers bleiben ungelesen.
 */

export const STATUS_ADRESSE = 'https://www.hagel-it.de/api/status';
/** Abstand der Abfrage in Minuten (Klartext im Schalter: „alle fünf Minuten“). */
export const ABSTAND_MIN = 5;
/** Älter als 15 Minuten = kein verlässlicher Stand (wie die Statuskachel der Website, S6). */
export const VERALTET_MS = 15 * 60_000;
export const SCHALTER = 'stoerungsanzeige';
export const STAND = 'stoerung:stand';
/** Zeitpunkt der letzten eigenen Abfrage (nicht die Prüfzeit des Sammlers): hält den Takt über das Schlafen hinweg. */
export const ABGEFRAGT = 'stoerung:abgefragt';
export const WECKER = 'stoerungen';
/** Kennzeichen am Symbol, wenn einer der drei Dienste gestört ist (Abweichungszahl in Portal-Tabs geht vor). */
export const PUNKT = '•';

/** Gemessene Dienste → Seite unter /it-stoerungen (Messkennung ≠ Adresse, S2: `exchange-online` → `outlook`). */
export const DIENSTE = [
  { id: 'microsoft-365', seite: 'microsoft-365', name: 'Microsoft 365' },
  { id: 'microsoft-teams', seite: 'microsoft-teams', name: 'Microsoft Teams' },
  { id: 'exchange-online', seite: 'outlook', name: 'Outlook und Exchange Online' },
] as const;
export type DienstId = (typeof DIENSTE)[number]['id'];

/** Zustände des Sammlers, die als Störung zählen (`ok`, `planned`, `unknown` nicht). */
const GESTOERT = new Set(['degraded', 'down']);

export interface Stand {
  /** Prüfzeit des Sammlers (ms). */
  geprueft: number;
  /** Gestörte Dienste in der Reihenfolge von `DIENSTE`. */
  gestoert: DienstId[];
}

/** Rohe Antwort → `Stand`, oder `null`, wenn sie unbrauchbar oder älter als `VERALTET_MS` ist (Grau ist kein Grün). */
export function standAus(roh: unknown, jetzt: number): Stand | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as { checkedAt?: unknown; services?: unknown };
  const geprueft = typeof r.checkedAt === 'string' ? Date.parse(r.checkedAt) : NaN;
  if (!Number.isFinite(geprueft) || jetzt - geprueft >= VERALTET_MS || geprueft - jetzt > 5 * 60_000) return null;
  if (!r.services || typeof r.services !== 'object') return null;
  const dienste = r.services as Record<string, { state?: unknown } | undefined>;
  const gestoert = DIENSTE.filter((d) => {
    const s = dienste[d.id]?.state;
    return typeof s === 'string' && GESTOERT.has(s);
  }).map((d) => d.id);
  return { geprueft, gestoert };
}

/** Gespeicherter Stand aus `storage.session` — geprüft, weil dort auch ein alter Stand liegen kann. */
export function gespeicherterStand(roh: unknown, jetzt: number): Stand | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as { geprueft?: unknown; gestoert?: unknown };
  if (typeof r.geprueft !== 'number' || !Number.isFinite(r.geprueft) || !Array.isArray(r.gestoert) || jetzt - r.geprueft >= VERALTET_MS) return null;
  const ids = new Set<string>(DIENSTE.map((d) => d.id));
  return { geprueft: r.geprueft, gestoert: r.gestoert.filter((x): x is DienstId => typeof x === 'string' && ids.has(x)) };
}

/** Wirksamer Schalter: Firma vor Nutzer, sonst aus. */
export const anzeigeAn = (firma: boolean | null, nutzer: unknown) => (firma ?? nutzer === true);

/** Text am Symbol: Abweichungszahl des Portal-Tabs, sonst der Punkt bei einer Störung, sonst nichts. */
export const abzeichenMit = (abweichungen: string, stand: Stand | null) =>
  abweichungen || (stand && stand.gestoert.length > 0 ? PUNKT : '');

/** Dienstseite mit Matomo-Kampagne (Spez. §9: Links auf hagel-it.de tragen nur `mtm_*`). */
export const dienstSeite = (id: DienstId) =>
  `https://www.hagel-it.de/it-stoerungen/${DIENSTE.find((d) => d.id === id)?.seite ?? 'microsoft-365'}?mtm_campaign=admin-lotse&mtm_source=stoerung`;

export const dienstName = (id: DienstId) => DIENSTE.find((d) => d.id === id)?.name ?? id;

/** Uhrzeit in Berliner Zeit wie auf der Website („14:32“). */
export const uhrzeit = (ms: number) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(ms);
