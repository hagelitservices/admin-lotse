/**
 * Manifest-Angaben — eine Quelle für `wxt.config.ts`, die Inhalts-Skripte und die Tests U-40 bis U-42 (Spez. §8).
 * Jedes Recht und jede Herkunft braucht eine Zeile in `store/berechtigungen.md` (Rahmen E3), sonst wird U-40 rot.
 * Herkünfte gemessen in H2 (05.11.2026, docs/messung-portale.md).
 */
export const BERECHTIGUNGEN = ['sidePanel', 'storage'] as const;

/** Die vier Portale auf drei Hosts: M365 und Exchange teilen sich `admin.cloud.microsoft` (`/` bzw. `/exchange`). */
export const PORTAL_HOSTS = [
  'https://admin.cloud.microsoft/*',
  'https://entra.microsoft.com/*',
  'https://intune.microsoft.com/*',
] as const;

/** Eingebettete Rahmen von Entra und Intune (`sandbox-<n>`, Nummer wechselt je Laden). Nur in `matches`, kein Host-Recht. */
export const RAHMEN_HERKUNFT = 'https://*.reactblade.portal.azure.net/*';

/** Ursprünge, die als oberster Rahmen gelten dürfen (`location.ancestorOrigins`, Spez. §3.3). */
export const PORTAL_URSPRUENGE = [
  'https://admin.cloud.microsoft',
  'https://entra.microsoft.com',
  'https://intune.microsoft.com',
] as const;

/** `sidePanel.open()` gibt es ab 116 (Spez. §3.2). */
export const MINDESTVERSION = '116';

/** CSP der Erweiterungsseiten, wörtlich aus Spez. §8. */
export const CSP =
  "script-src 'self'; object-src 'self'; connect-src 'none'; img-src 'self'; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'";

/** Verboten im Manifest (Spez. §8, U-41). */
export const VERBOTEN = [
  'tabs', 'scripting', 'webRequest', 'webNavigation', 'cookies', 'downloads', '<all_urls>', 'activeTab',
] as const;

/** Symbole aus `scripts/symbole.mjs` (Spez. §11.4, Signalflagge „H“). */
export const SYMBOLE = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' } as const;

/** Store-Manifest (Chrome und Edge identisch). Inhalts-Skripte trägt WXT aus den Einstiegen ein. */
export function manifestFuer() {
  return {
    name: '__MSG_erweiterung_name__',
    short_name: '__MSG_erweiterung_kurzname__',
    description: '__MSG_erweiterung_beschreibung__',
    default_locale: 'de',
    minimum_chrome_version: MINDESTVERSION,
    permissions: [...BERECHTIGUNGEN],
    host_permissions: [...PORTAL_HOSTS],
    icons: { ...SYMBOLE },
    action: { default_title: '__MSG_erweiterung_titel__', default_icon: { 16: SYMBOLE[16], 32: SYMBOLE[32] } },
    side_panel: { default_path: 'seitenleiste.html' },
    options_ui: { page: 'optionen.html', open_in_tab: true },
    commands: {
      // Öffnet die Seitenleiste bzw. das Popup außerhalb (Spez. §11.1); Logik folgt mit H4.
      _execute_action: { suggested_key: { default: 'Alt+Shift+L' } },
    },
    content_security_policy: { extension_pages: CSP },
    // Firmenmodus (Spez. §10, Rahmen E5): Chrome/Edge reichen Richtlinienwerte nur mit Schema durch. Inhalt folgt in H12.
    storage: { managed_schema: 'managed_schema.json' },
  };
}
