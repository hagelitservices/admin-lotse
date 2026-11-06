// H11b (Spez. §10, §11.3, §14.3): T-08 Seitenzugriff, T-09 englisch, T-10 andere Portalsprache, T-11 Firmenmodus,
// T-12 „Hinweis ausblenden“ über einen Neustart. Gegen den Testbau (`npm run bauen:muster`): nur er kennt den Ersatz für
// `storage.managed` (`test:verwaltet` in `storage.local`, U-43b hält ihn aus dem Store-Paket). Netzfrei auf den echten
// Hostnamen; die Seiten tragen einen Regler wie in lesen.spec.ts (Wert „Ja“ = Abweichung, rot, Abzeichen 1).
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { NetzWaechter } from './hilfen/netz';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3-muster', import.meta.url));
const ROUTE = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings';
const ID = 'entra-app-registrierung';
const regler = (name: string) => `<button type="button" role="checkbox" aria-label="${name}" aria-checked="true" disabled>x</button>`;
const DEUTSCH = `<!doctype html><html lang="de"><head><title>Benutzer - Microsoft Entra Admin Center</title></head><body>${regler('Benutzer können Anwendungen registrieren')}</body></html>`;
const ENGLISCH = `<!doctype html><html lang="en"><head><title>Users - Microsoft Entra admin center</title></head><body>${regler('Users can register applications')}</body></html>`;
const FRANZOESISCH = `<!doctype html><html lang="fr"><head><title>Utilisateurs - Centre d’administration Microsoft Entra</title></head><body>${regler('Les utilisateurs peuvent inscrire des applications')}</body></html>`;

let kontext: BrowserContext;
/** T-13: jede Anfrage aus der Erweiterung über alle Abläufe dieser Datei (hilfen/netz.ts). */
const netz = new NetzWaechter();
let kennung: string;
let profil: string;
let seiteHtml = DEUTSCH;

async function starten(sprache?: string) {
  kontext = await chromium.launchPersistentContext(profil, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${PAKET}`, `--load-extension=${PAKET}`, '--enable-unsafe-extension-debugging', ...(sprache ? [`--lang=${sprache}`] : [])],
    ...(sprache ? { locale: sprache } : {}),
  });
  await netz.installieren(kontext);
  await kontext.route(/^https:\/\/(admin\.cloud\.microsoft|entra\.microsoft\.com|intune\.microsoft\.com|www\.example\.com)\//, (r) =>
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: r.request().url().includes('example') ? '<!doctype html><title>Beispiel</title>' : seiteHtml }),
  );
  const erster = kontext.serviceWorkers()[0] ?? (await kontext.waitForEvent('serviceworker'));
  kennung = new URL(erster.url()).host;
  await (await dienst()).evaluate(() => chrome.storage.local.set({ verstanden: true }));
}

async function dienst(): Promise<Worker> {
  const sw = kontext.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${kennung}/`));
  return sw ?? kontext.waitForEvent('serviceworker', { predicate: (w) => w.url().startsWith(`chrome-extension://${kennung}/`) });
}

async function tabVon(p: Page): Promise<number> {
  const u = p.url();
  let id = 0;
  await expect
    .poll(async () => {
      id = await (await dienst()).evaluate(async (a) => (await chrome.tabs.query({})).find((t: { url?: string; id?: number }) => t.url === a)?.id ?? 0, u);
      return id;
    })
    .toBeGreaterThan(0);
  return id;
}

async function oeffnen(html = DEUTSCH) {
  seiteHtml = html;
  const p = await kontext.newPage();
  await p.goto(ROUTE);
  const tab = await tabVon(p);
  const l = await kontext.newPage();
  await l.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=${tab}`);
  return { p, l, tab };
}

const bewertung = async (l: Page) => {
  const roh = await l.locator('[data-bewertungen]').getAttribute('data-bewertungen', { timeout: 3000 }).catch(() => null);
  return (JSON.parse(roh ?? '{}') as Record<string, { art: string; grund?: string; von?: string }>)[ID];
};
const abzeichen = async (tab: number) => (await dienst()).evaluate((t) => chrome.action.getBadgeText({ tabId: t }), tab);
const verwaltet = async (wert: unknown) =>
  (await dienst()).evaluate((w) => (w === null ? chrome.storage.local.remove('test:verwaltet') : chrome.storage.local.set({ 'test:verwaltet': w })), wert);

test.beforeEach(() => {
  profil = mkdtempSync(join(tmpdir(), 'lotse-h11b-'));
});
test.afterEach(async () => {
  await kontext?.close();
  rmSync(profil, { recursive: true, force: true });
  expect(netz.bericht(), 'T-13: Anfrage aus der Erweiterung oder Mitschnitt blind').toEqual({ verstoesse: [], blind: false });
});

test('T-12 „Hinweis ausblenden“ → Z-11, zählt nicht mehr, bleibt nach Neustart, „Wieder anzeigen“ hebt es auf', async () => {
  await starten();
  let { l, tab } = await oeffnen();
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await expect.poll(() => abzeichen(tab)).toBe('1');
  await l.getByRole('button', { name: 'Hinweis ausblenden' }).click();
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'bewusst', von: 'nutzer' });
  await expect.poll(() => abzeichen(tab)).toBe('');
  await expect(l.getByText('Von Ihnen ausgeblendet')).toBeVisible();
  // Fokus geht nicht verloren: Er steht auf „Wieder anzeigen“ (T-15-Regel).
  await expect(l.getByRole('button', { name: 'Wieder anzeigen' })).toBeFocused();
  // Optionen führen den Hinweis mit Titel.
  const o = await kontext.newPage();
  await o.goto(`chrome-extension://${kennung}/optionen.html`);
  await expect(o.locator('[data-ausgeblendet]')).toHaveAttribute('data-ausgeblendet', ID);
  // „Wieder anzeigen“ in den Optionen: Fokus bleibt in der Liste (leer → Überschrift); danach wieder ausblenden für den Neustart.
  await o.getByRole('button', { name: /Wieder anzeigen/ }).click();
  await expect(o.getByRole('heading', { name: 'Ausgeblendete Hinweise' })).toBeFocused();
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'weicht-ab' });
  await l.getByRole('button', { name: 'Hinweis ausblenden' }).click();
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'bewusst', von: 'nutzer' });

  // Neustart des Browsers mit demselben Profil.
  await kontext.close();
  await starten();
  ({ l, tab } = await oeffnen());
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'bewusst', von: 'nutzer' });
  await expect.poll(() => abzeichen(tab)).toBe('');
  await l.getByRole('button', { name: 'Wieder anzeigen' }).click();
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'weicht-ab' });
  await expect.poll(() => abzeichen(tab)).toBe('1');
  await expect(l.getByRole('button', { name: 'Benutzer können Anwendungen registrieren' })).toBeFocused();
});

test('T-11 Firmenmodus: Z-10 Begründung der Firma, Fußhinweis ersetzt; Z-15 ohne Lesen; zurück ohne Richtlinie', async () => {
  await starten();
  const { l, tab } = await oeffnen();
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await verwaltet({
    hilfeKontakt: { name: 'IT-Team Musterfirma', url: 'mailto:it@musterfirma.de' },
    bewussteAbweichungen: [{ eintrag: ID, begruendung: 'Nur die IT registriert Apps, per Rollenzuweisung.' }],
    unbekannt: 1,
  });
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'bewusst', von: 'firma' });
  await expect.poll(() => abzeichen(tab)).toBe('');
  await expect(l.locator('[data-firma]')).toContainText('Von Ihrer IT eingerichtet');
  await expect(l.getByText('Von Ihrer IT so entschieden: Nur die IT registriert Apps, per Rollenzuweisung.')).toBeVisible();
  await expect(l.getByRole('link', { name: 'IT-Team Musterfirma hilft.' })).toHaveAttribute('href', 'mailto:it@musterfirma.de');
  // Ein Nutzer kann die Entscheidung der Firma nicht aufheben: kein „Wieder anzeigen“, kein „Hinweis ausblenden“.
  await expect(l.getByRole('button', { name: /Wieder anzeigen|Hinweis ausblenden/ })).toHaveCount(0);

  // Z-15: Lesen aus — keine Statuszeile, kein Band, nur Erklärungen; Hilfe ganz ausgeblendet.
  await verwaltet({ werteLesen: false, hilfeAusblenden: true });
  await expect.poll(() => bewertung(l)).toMatchObject({ art: 'nur-erklaerung' });
  await expect(l.locator('.band')).toHaveCount(0);
  await expect(l.locator('[data-firma]')).toContainText('Lesen der Werte abgeschaltet');
  await expect(l.locator('.fuss a')).toHaveCount(0);
  await expect.poll(() => abzeichen(tab)).toBe('');

  // Richtlinie weg → Normalbetrieb, es wird wieder gelesen.
  await verwaltet(null);
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await expect(l.locator('[data-firma]')).toHaveCount(0);
  await expect.poll(() => abzeichen(tab)).toBe('1');
});

test('T-11b Firmenmodus `sprache`: feste Sprache schlägt die Browsersprache, Seiten laden neu, zurück ohne Richtlinie', async () => {
  await starten();
  const { l } = await oeffnen();
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await expect(l.locator('html')).toHaveAttribute('lang', 'de');
  const o = await kontext.newPage();
  await o.goto(`chrome-extension://${kennung}/optionen.html`);
  await expect(o).toHaveTitle('Admin-Lotse\u00a0– Einstellungen');

  // Deutscher Browser, Firma legt Englisch fest: Leiste und Optionen laden neu, Knöpfe und Inhalte englisch, Band steht.
  await verwaltet({ sprache: 'en' });
  await expect(l.locator('html')).toHaveAttribute('lang', 'en', { timeout: 10_000 });
  await expect(l.getByRole('button', { name: 'Hide this notice' })).toBeVisible({ timeout: 25_000 });
  await expect(l.locator('[data-firma]')).toContainText('Set up by your IT');
  await expect(l.locator(`[data-eintrag="${ID}"]`)).not.toContainText('Hinweis ausblenden');
  await expect(o).toHaveTitle('Admin Pilot\u00a0– Settings', { timeout: 10_000 });
  // Symboltitel (Manifest: Browsersprache) setzt der Hintergrund nach (Prüfer H12).
  const titel = async () => (await dienst()).evaluate(() => chrome.action.getTitle({}));
  await expect.poll(titel).toBe('Open Admin Pilot');
  // Auch das Popup außerhalb der Portale folgt der Firma.
  const a = await kontext.newPage();
  await a.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  await expect(a.locator('html')).toHaveAttribute('lang', 'en');

  // `auto` = Browsersprache, das Band bleibt (ein gesetzter Wert ist verwaltet).
  await verwaltet({ sprache: 'auto' });
  await expect(l.locator('html')).toHaveAttribute('lang', 'de', { timeout: 10_000 });
  await expect(l.getByRole('button', { name: 'Hinweis ausblenden' })).toBeVisible({ timeout: 25_000 });
  await expect(l.locator('[data-firma]')).toContainText('Von Ihrer IT eingerichtet');
  await expect.poll(titel).toBe('Admin-Lotse öffnen');

  // Unbekannter Wert → wie ohne Richtlinie.
  await verwaltet({ sprache: 'fr' });
  await expect(l.locator('[data-firma]')).toHaveCount(0);
  await expect(l.locator('html')).toHaveAttribute('lang', 'de');
});

test('T-10 Portal auf Französisch → Z-13: Erklärung ja, Werte nicht (nach der Ladefrist)', async () => {
  await starten();
  const { l, tab } = await oeffnen(FRANZOESISCH);
  // H17c: Bis zum Ende der Ladefrist (30 s) kann es noch der Ladebildschirm sein — „lese“, kein „nicht lesbar“.
  await expect.poll(() => bewertung(l), { timeout: 10_000 }).toMatchObject({ art: 'lese' });
  await expect.poll(() => bewertung(l), { timeout: 40_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'sprache' });
  await expect(l.locator(`[data-eintrag="${ID}"]`).getByText('Werte lese ich nur bei deutscher oder englischer Portalsprache.')).toBeVisible();
  await expect(l.getByRole('button', { name: 'Erneut lesen' })).toHaveCount(0);
  expect(await abzeichen(tab)).toBe('');
});

// H17c: Entra zeigt zuerst einen Ladebildschirm ohne `lang` und ohne Probewort im Titel, nach einigen Sekunden erst `lang`,
// dann den richtigen Titel und die Regler. Die Leiste darf dabei nie „nicht lesbar“ zeigen.
const LADEBILDSCHIRM = `<!doctype html><html><head><title>Microsoft Entra</title></head><body><div>…</div><script>
setTimeout(() => { document.documentElement.lang = 'de'; }, 4000);
setTimeout(() => { document.title = 'Benutzer - Microsoft Entra Admin Center'; document.body.innerHTML = ${JSON.stringify(regler('Benutzer können Anwendungen registrieren'))}; }, 8000);
</script></body></html>`;

test('T-10b Ladebildschirm (H17c): erst „lese“, nie „nicht lesbar“, dann der Wert', async () => {
  test.setTimeout(90_000);
  await starten();
  const { l } = await oeffnen(LADEBILDSCHIRM);
  const verlauf: string[] = [];
  await expect
    .poll(
      async () => {
        const b = await bewertung(l);
        const art = b ? `${b.art}${b.grund ? `:${b.grund}` : ''}` : '';
        if (art && verlauf.at(-1) !== art) verlauf.push(art);
        return b?.art;
      },
      { timeout: 30_000, intervals: [200] },
    )
    .toBe('weicht-ab');
  expect(verlauf, verlauf.join(' → ')).not.toContainEqual(expect.stringMatching(/^nicht-lesbar/));
  expect(verlauf[0]).toBe('lese');
  // Nach dem Ende der Ladefrist (30 s ab der ersten Meldung) bleibt der Wert stehen.
  await l.waitForTimeout(25_000);
  expect(await bewertung(l)).toMatchObject({ art: 'weicht-ab' });
});

/**
 * Chromium unter macOS nimmt die Oberflächensprache aus `AppleLanguages` des Programms, `--lang` wirkt dort nicht (gemessen
 * H11b; Playwright lässt `-AppleLanguages (en-US)` als Argument nicht zu, Chrome hielte den Wert für eine Adresse). Darum
 * gilt die Einstellung nur für den Testbrowser und nur für die Dauer dieses Falls. Unter Windows und Linux reicht `--lang`.
 */
function macSprache(sprache: string): () => void {
  if (process.platform !== 'darwin') return () => undefined;
  const plist = chromium.executablePath().replace(/\/MacOS\/[^/]+$/, '/Info.plist');
  const kennung = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', plist], { encoding: 'utf8' }).trim();
  let vorher: string | null = null;
  try {
    vorher = execFileSync('defaults', ['export', kennung, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    vorher = null;
  }
  const hatte = vorher?.includes('<key>AppleLanguages</key>') ?? false;
  if (hatte) throw new Error(`${kennung} hat schon AppleLanguages gesetzt — nicht überschreiben`);
  execFileSync('defaults', ['write', kennung, 'AppleLanguages', '-array', sprache]);
  return () => execFileSync('defaults', ['delete', kennung, 'AppleLanguages']);
}

test('T-09 englisches Portal bei Browsersprache en: gelesen, Oberfläche englisch', async () => {
  const zurueck = macSprache('en-US');
  try {
    await starten('en-US');
  } finally {
    zurueck();
  }
  const { l, tab } = await oeffnen(ENGLISCH);
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await expect.poll(() => abzeichen(tab)).toBe('1');
  await expect(l.locator('html')).toHaveAttribute('lang', 'en');
  await expect(l.getByRole('heading', { level: 2, name: 'Users can register applications' })).toBeVisible();
  await expect(l.getByText('Changes nothing. Sends nothing.', { exact: false })).toBeVisible();
  await expect(l.getByRole('button', { name: 'Hide this notice' })).toBeVisible();
});

/** Website-Zugriff so stellen, wie es der Nutzer in `chrome://extensions` tut (Rahmen §10: `developerPrivate` dort). */
async function zugriffStellen(wie: 'ON_CLICK' | 'ON_ALL_SITES') {
  const s = await kontext.newPage();
  await s.goto('chrome://extensions/');
  await s.evaluate(([id, h]) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, hostAccess: h }), [kennung, wie] as const);
  await s.close();
}

/**
 * Die Rückfrage von `permissions.request` ist ein Browser-Dialog, den Playwright nicht bedienen kann (gemessen H11b: die
 * Anfrage bleibt offen, auch mit `--apps-gallery-install-auto-confirm-for-tests`). Darum: Der Test hält fest, dass der Knopf
 * genau die eine Herkunft anfragt, und erteilt den Zugriff dann so, wie es der Nutzer in `chrome://extensions` täte.
 */
test('T-08 Website-Zugriff „Bei Klick“ → Z-12, Knopf fragt genau diese Herkunft an, erteilter Zugriff stellt den Lotsen wieder her', async () => {
  await starten();
  const sw = await dienst();
  await zugriffStellen('ON_CLICK');
  await expect.poll(() => sw.evaluate(() => chrome.permissions.contains({ origins: ['https://entra.microsoft.com/*'] }))).toBe(false);
  seiteHtml = DEUTSCH;
  const p = await kontext.newPage();
  await p.goto(ROUTE);
  await p.waitForTimeout(1500);
  // Ohne Zugriff: kein Zustand, kein Abzeichen.
  expect(await sw.evaluate(() => chrome.storage.session.get(null))).toEqual({});

  // Popup ohne sichtbare Adresse (so ist es ohne Zugriff): alle fehlenden Herkünfte, je ein Knopf.
  const pop = await kontext.newPage();
  await pop.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  await expect(pop.locator('[data-zugriff]')).toHaveAttribute('data-zugriff', 'https://admin.cloud.microsoft/* https://entra.microsoft.com/* https://intune.microsoft.com/*');
  await expect(pop.getByRole('heading', { name: 'Für diese Portale fehlt der Website-Zugriff' })).toBeVisible();
  await pop.evaluate(() => {
    const w = window as unknown as { anfragen: unknown[] };
    w.anfragen = [];
    chrome.permissions.request = async (r: unknown) => (w.anfragen.push(r), false);
  });
  await pop.getByRole('button', { name: 'Zugriff auf entra.microsoft.com erlauben' }).click();
  await expect(pop.getByRole('status')).toHaveText('Nicht erlaubt. Sie können es jederzeit wieder versuchen.');
  expect(await pop.evaluate(() => (window as unknown as { anfragen: unknown[] }).anfragen)).toEqual([{ origins: ['https://entra.microsoft.com/*'] }]);
  await pop.close();

  // Zugriff erteilt: Der offene Portal-Tab wird sofort erkannt (Inhalts-Skript erst nach dem Neuladen, Z-14) …
  await zugriffStellen('ON_ALL_SITES');
  const tab = await tabVon(p);
  const l = await kontext.newPage();
  await l.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=${tab}`);
  await expect(l.getByRole('heading', { name: 'Bitte die Seite einmal neu laden.' })).toBeVisible({ timeout: 10_000 });
  // … und nach dem Neuladen liest er wieder.
  await p.reload();
  await expect.poll(() => bewertung(l), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab' });
  await expect.poll(() => abzeichen(tab)).toBe('1');

  // Zugriff wieder entzogen: Der Tab verliert Zustand und Leiste, das Symbol zeigt wieder das Popup.
  await zugriffStellen('ON_CLICK');
  await expect.poll(() => sw.evaluate(() => chrome.storage.session.get(null))).toEqual({});
});
