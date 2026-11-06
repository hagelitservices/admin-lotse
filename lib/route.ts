/**
 * Routen-Schlüssel aus der Adresse (Spez. §4.1, §4.2; Formen gemessen in H2, docs/messung-portale.md).
 * Die Seite wird an der Adresse erkannt, nie am Aufbau. Ergebnis `<portal>:<route>`; GUIDs, Domainnamen und
 * Mailadressen werden Platzhalter, damit der Schlüssel nie Mandantendaten trägt (Spez. §3.3).
 */
export type Portal = 'm365' | 'entra' | 'intune' | 'exo';

export interface Seite {
  portal: Portal;
  /** `null`: Portal erkannt, aber keine Seite mit Route (Startseite, Anmeldung, Fehlerseite). */
  route: string | null;
  schluessel: string | null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAIL = /^[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function entschluesseln(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Hash ohne `#`, ohne führende `/`, ohne Abfrage; leere Segmente (doppeltes `/`) fallen weg. */
function segmente(hash: string): string[] {
  const ohneAbfrage = hash.replace(/^#/, '').split('?')[0] ?? '';
  return ohneAbfrage.split('/').filter((s) => s !== '').map(entschluesseln);
}

/** M365: Segment `:` entfernen, Platzhalter setzen; nach dem ersten Platzhalter folgt nur noch der Reiter. */
function m365Route(hash: string): string | null {
  const aus: string[] = [];
  for (const s of segmente(hash)) {
    if (s === ':') continue;
    const platzhalter = GUID.test(s) ? ':id' : MAIL.test(s) ? ':mail' : DOMAIN.test(s) ? ':domain' : null;
    if (platzhalter) {
      aus.push(platzhalter);
      break;
    }
    aus.push(s);
  }
  return aus.length ? aus.join('/') : null;
}

/** Exchange: erstes Hash-Segment. */
function exoRoute(hash: string): string | null {
  return segmente(hash)[0] ?? null;
}

/**
 * Entra/Intune: `view/<Erweiterung>/<Blade>/~/<Menü>`; Parameter-Paare `name~/wert` fallen weg; `#blade/…` gleich.
 * Danach wird abgeschnitten: Was hinter Blade bzw. Menü steht, können Werte sein (Domainname, UPN, Richtlinienname).
 */
function ansichtRoute(hash: string): string | null {
  const teile = segmente(hash);
  const art = teile.shift()?.toLowerCase();
  if (art !== 'view' && art !== 'blade') return null;
  const ohnePaare: string[] = [];
  for (let i = 0; i < teile.length; i++) {
    const t = teile[i] ?? '';
    if (t !== '~' && t.endsWith('~')) i++;
    else ohnePaare.push(t);
  }
  const [erweiterung, blade, trenner, menue] = ohnePaare;
  if (!erweiterung || erweiterung === '~') return null;
  const aus = [erweiterung];
  if (blade && blade !== '~') aus.push(blade);
  if (aus.length === 2 && trenner === '~' && menue && menue !== '~')
    aus.push('~', GUID.test(menue) ? ':id' : MAIL.test(menue) ? ':mail' : menue);
  return `view:${aus.join('/')}`;
}

/** Portal und Route einer Adresse; `null` für alles, was keines der vier Portale ist (U-09). */
export function seiteAus(adresse: string): Seite | null {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const pfad = url.pathname.replace(/\/{2,}/g, '/').toLowerCase().replace(/\/$/, '');
  let portal: Portal;
  let route: string | null = null;
  switch (url.hostname) {
    case 'admin.cloud.microsoft':
    case 'admin.microsoft.com':
      if (pfad === '/exchange' || pfad.startsWith('/exchange/')) {
        portal = 'exo';
        route = exoRoute(url.hash);
      } else {
        portal = 'm365';
        route = pfad === '' || pfad === '/adminportal/home' ? m365Route(url.hash) : null;
      }
      break;
    case 'admin.exchange.microsoft.com':
      portal = 'exo';
      route = exoRoute(url.hash);
      break;
    case 'entra.microsoft.com':
    case 'intune.microsoft.com':
      portal = url.hostname === 'entra.microsoft.com' ? 'entra' : 'intune';
      route = pfad === '' ? ansichtRoute(url.hash) : null;
      break;
    default:
      return null;
  }
  return { portal, route, schluessel: route ? `${portal}:${route}` : null };
}

/** Schlüssel werden kleingeschrieben verglichen, gespeichert in der Form der Messung (Spez. §4.2). */
export const vergleichsform = (schluessel: string) => schluessel.toLowerCase();

export type Sprache = 'de' | 'en' | 'andere';

/** `<html lang>` des obersten Rahmens: `de*` und `en*` werden gelesen, alles andere nicht (Spez. §4.6). */
export function spracheAus(lang: string | null | undefined): Sprache {
  const l = (lang ?? '').trim().toLowerCase();
  return /^de\b/.test(l) ? 'de' : /^en\b/.test(l) ? 'en' : 'andere';
}
