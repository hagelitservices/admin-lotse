/**
 * Nachrichten zwischen Inhalts-Skripten, Hintergrund und Seitenleiste (Spez. §3.3).
 * Es fließen nur Routen-Schlüssel, Eintrags-Kennungen und Lesungs-Token — nie Namen, Adressen, IDs oder Seitentext.
 * Die Adresse schickt das Inhalts-Skript mit: `sender.url` bleibt nach einem Hash- oder pushState-Wechsel auf der
 * Adresse beim Laden stehen (gemessen H4, Chromium 156). Der Hintergrund nimmt sie nur an, wenn ihr Ursprung dem von
 * `sender.url` gleicht, und speichert sie nie — nur den Routen-Schlüssel daraus.
 */
import { PORTAL_URSPRUENGE } from '../manifest';
import type { Leser } from '../inhalte/schema';
import type { Seitenbefund } from './seite';
import type { Bewertung } from './zustand';

/** Oberster Rahmen → Hintergrund: Seite hat sich geändert. Titel nur für die Gegenprobe, wird nicht gespeichert. */
export interface SeiteMeldung {
  art: 'seite';
  href: string;
  titel: string;
  lang: string;
}

/** Ein Eintrag im Leseauftrag: nur seine Kennung und der Leser als Daten (§5.1). */
export interface LeserAuftrag {
  id: string;
  leser: Leser;
}

/** Hintergrund → Rahmen eines Tabs. `bis`: bis dahin wird gesucht (30 s nach dem Seitenwechsel, §5.3). */
export interface LiesAuftrag {
  art: 'lies';
  anfrage: string;
  bis: number;
  leser: LeserAuftrag[];
}

/** Rahmen → Hintergrund: Stand dieses Rahmens je Eintrag, immer vollständig (was fehlt, ist hier nicht mehr zu sehen). */
export interface LesungMeldung {
  art: 'lesung';
  anfrage: string;
  token: Record<string, string>;
  /** Nur Art `domains`: Namen zum Anzeigen und Kopieren. Bleiben im Arbeitsspeicher, nie in `storage.session` (§3.3). */
  anzeige?: Record<string, string[]>;
  /** Vom obersten Rahmen: Die Frist ist um (§5.3). */
  ende?: boolean;
}

/** Rahmen → Hintergrund: Skript ist da. Rahmen laden oft erst nach dem Seitenwechsel nach (Entra, H2) und bekommen dann den laufenden Auftrag. */
export interface RahmenBereit {
  art: 'rahmen-bereit';
}

/** Seitenleiste → Hintergrund: Knopf „Erneut lesen“ (§5.3). */
export interface ErneutLesen {
  art: 'erneut';
}

/** Zustand eines Tabs, gespiegelt in `storage.session` (Schlüssel `tab:<id>`). */
export interface TabZustand extends Seitenbefund {
  /** `true`, sobald das Inhalts-Skript berichtet hat (fehlt es: Seite vor Installation geladen, Z-14 in H11). */
  skript: boolean;
  /** Kennung des laufenden Leseauftrags (zufällig, übersteht den Neustart); nur seine Antworten zählen. */
  anfrage: string | null;
  /** Bis dahin suchen die Rahmen (Zeitstempel, §5.3). */
  bis: number | null;
  /** Die Frist ist um: Was jetzt fehlt, ist „nicht lesbar“. */
  fristUm: boolean;
  /** Bis dahin sind „Sprache“ und „Aufbau“ vorläufig (Ladebildschirm, H17c); `null`/fehlt = endgültig. */
  ladeBis?: number | null;
  /** Lesungen je Eintrag, nur Kennungen aus `zuLesen`. Bei Art `domains` nur die Anzahl, nie die Namen. */
  lesungen: Record<string, string>;
  abweichungen: number;
  stand: number;
}

/** Hintergrund → Seitenleiste über den Port `seitenleiste:<tabId>`. */
export interface ZustandMeldung {
  art: 'zustand';
  zustand: TabZustand | null;
  bewertungen: Record<string, Bewertung>;
  /** Domainnamen je Eintrag; nur hier und im Arbeitsspeicher des Hintergrunds. */
  anzeige: Record<string, string[]>;
}

export const SPEICHER_PRAEFIX = 'tab:';
export const PORT_PRAEFIX = 'seitenleiste:';

const RAHMEN = /^https:\/\/[a-z0-9-]+\.reactblade\.portal\.azure\.net$/;
const MAX_TEXT = 400;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_DOMAINS = 200;

/** Frist nach dem Seitenwechsel (§5.3). 30 s seit H17b: Entra lädt lange Listen (Alle Rollen, Gast-Einladungen) gemessen bis 33 s. */
export const FRIST_MS = 30_000;

/**
 * Ladefrist (H17c, Spez. §4.6, §21.26; Regel in `ladeBisFuer`, lib/zustand.ts): So lange nach der ersten Meldung einer Route gelten „Sprache“ und „Aufbau“ noch
 * nicht als endgültig, weil Entra zuerst einen Ladebildschirm ohne Probewort und ohne `lang` zeigt (gemessen 5–20 s).
 */
export const LADEFRIST_MS = 30_000;

interface Absender {
  id?: string;
  url?: string;
  origin?: string;
  frameId?: number;
  tab?: { id?: number };
}

function ursprung(a: Absender): string | null {
  if (a.origin) return a.origin;
  try {
    return a.url ? new URL(a.url).origin : null;
  } catch {
    return null;
  }
}

/** Nur Nachrichten aus eigenen Inhalts-Skripten in einem Portal-Tab (Spez. §3.3, Bedrohungsmodell §16). */
export function vomEigenenSkript(a: Absender, eigeneId: string): a is Absender & { tab: { id: number }; url: string } {
  if (a.id !== eigeneId || typeof a.tab?.id !== 'number' || typeof a.url !== 'string') return false;
  const u = ursprung(a);
  return u !== null && ((PORTAL_URSPRUENGE as readonly string[]).includes(u) || RAHMEN.test(u));
}

/** Formprüfung; alles Unbekannte wird verworfen. */
export function alsSeiteMeldung(n: unknown, a: Absender): SeiteMeldung | null {
  if (a.frameId !== 0 || !(PORTAL_URSPRUENGE as readonly string[]).includes(ursprung(a) ?? '')) return null;
  const m = n as Partial<SeiteMeldung> | null;
  if (m?.art !== 'seite' || typeof m.href !== 'string' || typeof m.titel !== 'string' || typeof m.lang !== 'string') return null;
  if (m.href.length > 4096 || ursprung({ url: m.href }) !== ursprung(a)) return null;
  return { art: 'seite', href: m.href, titel: m.titel.slice(0, MAX_TEXT), lang: m.lang.slice(0, 35) };
}

/**
 * Nur Antworten auf den laufenden Auftrag, nur für Einträge, die gelesen werden sollten. Domainnamen nur für Einträge
 * der Art `domains` und nur in Domainform: Was anders aussieht, kommt hier nicht durch.
 */
export function alsLesungMeldung(
  n: unknown,
  anfrage: string | null,
  zuLesen: readonly string[],
  mitAnzeige: readonly string[] = [],
): LesungMeldung | null {
  const m = n as Partial<LesungMeldung> | null;
  if (m?.art !== 'lesung' || !anfrage || m.anfrage !== anfrage || typeof m.token !== 'object' || m.token === null) return null;
  const token: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.token)) if (zuLesen.includes(k) && typeof v === 'string' && v.length <= 40) token[k] = v;
  const anzeige: Record<string, string[]> = {};
  if (typeof m.anzeige === 'object' && m.anzeige !== null) {
    for (const [k, v] of Object.entries(m.anzeige)) {
      if (!mitAnzeige.includes(k) || !zuLesen.includes(k) || !Array.isArray(v)) continue;
      anzeige[k] = v.filter((d): d is string => typeof d === 'string' && d.length <= 253 && DOMAIN.test(d)).slice(0, MAX_DOMAINS);
    }
  }
  return { art: 'lesung', anfrage: m.anfrage, token, anzeige, ende: m.ende === true };
}

/**
 * Lesungen mehrerer Rahmen zusammenführen: Ein Eintrag mit Treffer in zwei Rahmen ist mehrdeutig und damit
 * „nicht lesbar“ (Spez. §3.3, U-22 in H5).
 */
export function lesungenZusammenfuehren(jeRahmen: ReadonlyMap<number, Record<string, string>>): Record<string, string> {
  const aus: Record<string, string> = {};
  const treffer = new Map<string, number>();
  for (const token of jeRahmen.values()) {
    for (const [id, wert] of Object.entries(token)) {
      treffer.set(id, (treffer.get(id) ?? 0) + 1);
      aus[id] = wert;
    }
  }
  for (const [id, n] of treffer) if (n > 1) aus[id] = 'mehrdeutig';
  return aus;
}

/** Text des Abzeichens: Zahl der Abweichungen, leer bei 0 (Spez. §11.1). */
export const abzeichenText = (abweichungen: number) => (abweichungen > 0 ? String(Math.min(abweichungen, 99)) : '');
