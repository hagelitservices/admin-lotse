// T-04 bis T-07 (Spez. §4.5, §11.1, §14.3) gegen einfache Testseiten auf den echten Hostnamen (`context.route()`),
// netzfrei. Die Seitenleiste wird als Erweiterungsseite mit `?tab=<id>` geöffnet — genau die Adresse, die der
// Hintergrund per sidePanel.setOptions je Tab setzt; die echte Leiste öffnet T-04 über `Extensions.triggerAction`.
import { chromium, expect, test, type BrowserContext, type CDPSession, type Page, type Worker } from '@playwright/test';
import { NetzWaechter } from './hilfen/netz';
import { fileURLToPath } from 'node:url';

// Läuft im Dienstarbeiter bzw. auf Erweiterungsseiten, wo `chrome` vorhanden ist; Typen braucht der Test nicht.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const ENTRA = 'https://entra.microsoft.com/';
const M365 = 'https://admin.cloud.microsoft/';
let kontext: BrowserContext;
/** T-13: jede Anfrage aus der Erweiterung über alle Abläufe dieser Datei (hilfen/netz.ts). */
const netz = new NetzWaechter();
let kennung: string;
let browserCdp: CDPSession;

const testseite = (titel: string, lang = 'de') =>
  `<!doctype html><html lang="${lang}"><head><title>${titel}</title></head><body><main>Testseite</main></body></html>`;

async function dienst(): Promise<Worker> {
  const sw = kontext.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${kennung}/`));
  return sw ?? kontext.waitForEvent('serviceworker', { predicate: (w) => w.url().startsWith(`chrome-extension://${kennung}/`) });
}

/** Tab-ID über den Hintergrund (ohne `tabs`-Recht sieht er die Adresse nur auf Portal-Hosts). */
async function tabVon(seite: Page): Promise<number> {
  const url = seite.url();
  await expect
    .poll(async () => (await dienst()).evaluate(async (u) => (await chrome.tabs.query({})).find((t: { url?: string; id?: number }) => t.url === u)?.id ?? 0, url))
    .toBeGreaterThan(0);
  return (await dienst()).evaluate(async (u) => (await chrome.tabs.query({})).find((t: { url?: string; id?: number }) => t.url === u)?.id ?? 0, url);
}

async function leiste(tabId: number): Promise<Page> {
  const p = await kontext.newPage();
  await p.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=${tabId}`);
  return p;
}

const schluessel = (p: Page) => p.locator('[data-schluessel]').getAttribute('data-schluessel', { timeout: 5000 });

test.beforeAll(async () => {
  kontext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${PAKET}`, `--load-extension=${PAKET}`, '--enable-unsafe-extension-debugging'],
  });
  await netz.installieren(kontext);
  await kontext.route(/^https:\/\/(admin\.cloud\.microsoft|entra\.microsoft\.com|intune\.microsoft\.com|www\.example\.com)\//, (r) =>
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: testseite(r.request().url().includes('example') ? 'Beispiel' : 'Benutzer') }),
  );
  const erster = kontext.serviceWorkers()[0] ?? (await kontext.waitForEvent('serviceworker'));
  kennung = new URL(erster.url()).host;
  browserCdp = await kontext.browser()!.newBrowserCDPSession();
});

test.afterAll(async () => {
  await kontext.close();
  expect(netz.bericht(), 'T-13: Anfrage aus der Erweiterung oder Mitschnitt blind').toEqual({ verstoesse: [], blind: false });
});

/** Klick aufs Symbol für den Tab mit dieser Adresse (Rahmen §10: Ziel vom Typ `tab`). */
async function symbolKlick(url: string) {
  const { targetInfos } = (await browserCdp.send('Target.getTargets', { filter: [{}] })) as { targetInfos: { targetId: string; type: string; url: string }[] };
  const ziel = targetInfos.find((t) => t.type === 'tab' && t.url === url);
  expect(ziel, `Tab-Ziel für ${url}`).toBeDefined();
  await browserCdp.send('Extensions.triggerAction' as never, { id: kennung, targetId: ziel!.targetId } as never);
}

test('T-04 Nicht-Portal-Tab: kein Abzeichen, Popup außerhalb; Portal-Tab: Klick öffnet die Seitenleiste', async () => {
  const fremd = await kontext.newPage();
  await fremd.goto('https://www.example.com/');
  const portal = await kontext.newPage();
  await portal.goto(`${ENTRA}#view/Microsoft_AAD_IAM/AllowlistPolicyBlade`);
  const portalTab = await tabVon(portal);
  await fremd.bringToFront();
  const sw = await dienst();
  const fremdTab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? 0);
  expect(fremdTab).toBeGreaterThan(0);
  expect(fremdTab).not.toBe(portalTab);

  expect(await sw.evaluate((t) => chrome.action.getPopup({ tabId: t }), fremdTab)).toMatch(/\/ausserhalb\.html$/);
  expect(await sw.evaluate((t) => chrome.action.getBadgeText({ tabId: t }), fremdTab)).toBe('');
  await expect.poll(() => sw.evaluate((t) => chrome.action.getPopup({ tabId: t }), portalTab)).toBe('');
  await expect.poll(() => sw.evaluate(async (t) => (await chrome.sidePanel.getOptions({ tabId: t })).enabled, portalTab)).toBe(true);
  expect(await sw.evaluate(async (t) => (await chrome.sidePanel.getOptions({ tabId: t })).enabled, fremdTab)).toBe(false);

  await portal.bringToFront();
  await symbolKlick(portal.url());
  await expect
    .poll(async () => (await dienst()).evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).map((c: { documentUrl?: string }) => c.documentUrl)))
    .toEqual([expect.stringMatching(new RegExp(`/seitenleiste\\.html\\?tab=${portalTab}$`))]);
  // Portal verlassen: Tab bekommt wieder Popup außerhalb, kein Zustand, Seitenleiste aus (Befund Prüfer H4).
  await portal.goto('https://www.example.com/weg');
  await expect.poll(() => sw.evaluate((t) => chrome.action.getPopup({ tabId: t }), portalTab)).toMatch(/\/ausserhalb\.html$/);
  expect(await sw.evaluate((t) => chrome.storage.session.get(`tab:${t}`), portalTab)).toEqual({});
  await expect.poll(() => sw.evaluate(async (t) => JSON.stringify(await chrome.sidePanel.getOptions({ tabId: t })), portalTab)).toContain('"enabled":false');
  await expect.poll(() => sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length)).toBe(0);
  await fremd.close();
  await portal.close();
});

test('T-05 Routenwechsel per Hash (M365) und ohne Ereignis (Entra): Leiste ≤ 1 s, alte Seite weg', async () => {
  const portal = await kontext.newPage();
  await portal.goto(`${M365}#/users`);
  const tab = await tabVon(portal);
  const l = await leiste(tab);
  await expect.poll(() => schluessel(l)).toBe('m365:users');

  let start = Date.now();
  await portal.evaluate(() => (location.hash = '#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy'));
  await expect.poll(() => schluessel(l), { intervals: [25], timeout: 3000 }).toBe('m365:Settings/SecurityPrivacy/Settings/L1/PasswordPolicy');
  const hash = Date.now() - start;

  await portal.goto(`${ENTRA}#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings`);
  const tab2 = await tabVon(portal);
  expect(tab2).toBe(tab);
  await expect.poll(() => schluessel(l)).toBe('entra:view:Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings');
  start = Date.now();
  // Entra wechselt per pushState ohne hashchange/popstate (H2).
  await portal.evaluate(() => history.pushState(null, '', '#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers'));
  await expect.poll(() => schluessel(l), { intervals: [25], timeout: 3000 }).toBe('entra:view:Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers');
  const ohneEreignis = Date.now() - start;

  // Gegenprobe ohne tabs.onUpdated: Das Inhalts-Skript selbst muss den pushState-Wechsel ≤ 1 s melden (500-ms-Prüfung).
  const sw = await dienst();
  await sw.evaluate(() => {
    const g = globalThis as unknown as { h4: { href: string; t: number }[] };
    g.h4 = [];
    chrome.runtime.onMessage.addListener((n: { art?: string; href?: string }) => void (n.art === 'seite' && g.h4.push({ href: n.href ?? '', t: Date.now() })));
  });
  const ziel = 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AllRolesBlade';
  const t0 = await portal.evaluate((z) => (history.pushState(null, '', z), Date.now()), ziel);
  await expect
    .poll(() => sw.evaluate((z) => (globalThis as unknown as { h4: { href: string; t: number }[] }).h4.find((m) => m.href === z)?.t ?? 0, ziel), { intervals: [25], timeout: 3000 })
    .toBeGreaterThan(0);
  const skript = (await sw.evaluate((z) => (globalThis as unknown as { h4: { href: string; t: number }[] }).h4.find((m) => m.href === z)?.t ?? 0, ziel)) - t0;
  await expect.poll(async () => (await sw.evaluate((t) => chrome.storage.session.get(`tab:${t}`), tab))[`tab:${tab}`]).toMatchObject({ skript: true, schluessel: 'entra:view:Microsoft_AAD_IAM/AllRolesBlade' });
  console.log(`T-05: Hash ${hash} ms, ohne Ereignis ${ohneEreignis} ms, Inhalts-Skript allein ${skript} ms`);
  expect(skript).toBeLessThanOrEqual(1000);
  expect(hash).toBeLessThanOrEqual(1000);
  expect(ohneEreignis).toBeLessThanOrEqual(1000);
  // Seit H11 steht „Microsoft 365“ auch im Fuß („Fragen zu Ihrem Microsoft 365?“): Die Überschrift nennt das Portal.
  await expect(l.locator('h1')).not.toContainText('Microsoft 365');
  await l.close();
  await portal.close();
});

test('T-06 zwei Portal-Tabs: jede Leiste zeigt ihren Tab', async () => {
  const a = await kontext.newPage();
  await a.goto(`${ENTRA}#view/Microsoft_AAD_IAM/AllRolesBlade`);
  const b = await kontext.newPage();
  await b.goto('https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/asr');
  const [ta, tb] = [await tabVon(a), await tabVon(b)];
  expect(ta).not.toBe(tb);
  const [la, lb] = [await leiste(ta), await leiste(tb)];
  await expect.poll(() => schluessel(la)).toBe('entra:view:Microsoft_AAD_IAM/AllRolesBlade');
  await expect.poll(() => schluessel(lb)).toBe('intune:view:Microsoft_Intune_Workflows/SecurityManagementMenu/~/asr');
  await b.evaluate(() => (location.hash = '#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/antivirus'));
  await expect.poll(() => schluessel(lb)).toBe('intune:view:Microsoft_Intune_Workflows/SecurityManagementMenu/~/antivirus');
  expect(await schluessel(la)).toBe('entra:view:Microsoft_AAD_IAM/AllRolesBlade');
  for (const p of [la, lb, a, b]) await p.close();
});

test('T-07 Dienstarbeiter beendet: Zustand aus storage.session, kein leerer Schirm', async () => {
  const portal = await kontext.newPage();
  await portal.goto('https://admin.cloud.microsoft/exchange#/remotedomains');
  const tab = await tabVon(portal);
  const l = await leiste(tab);
  await expect.poll(() => schluessel(l)).toBe('exo:remotedomains');

  // Playwright meldet das Ende des Arbeiters erst beim Schließen des Kontexts — deshalb über die Ziele des Browsers.
  const arbeiter = async () =>
    ((await browserCdp.send('Target.getTargets')) as { targetInfos: { targetId: string; type: string; url: string }[] }).targetInfos
      .filter((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${kennung}/`))
      .map((t) => t.targetId);
  const vorher = await arbeiter();
  expect(vorher).toHaveLength(1);
  const cdp = await kontext.newCDPSession(l);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(arbeiter).toEqual([]);

  // Nichts an der Portalseite ändert sich, das Inhalts-Skript meldet also nichts neu: der Zustand muss aus dem Speicher kommen.
  await l.reload();
  await expect.poll(() => schluessel(l)).toBe('exo:remotedomains');
  const nachher = await arbeiter();
  expect(nachher).toHaveLength(1); // neu gestartet (Ziel-ID bleibt je Registrierung gleich)
  const gespeichert = await l.evaluate(async (t) => (await chrome.storage.session.get(`tab:${t}`))[`tab:${t}`], tab);
  expect(gespeichert).toMatchObject({ portal: 'exo', schluessel: 'exo:remotedomains', skript: true });
  expect(JSON.stringify(gespeichert)).not.toMatch(/https?:|Benutzer/);
  for (const p of [l, portal]) await p.close();
});

test('T-03 Seite ohne Eintrag: Z-3 mit drei Links, Klick navigiert im selben Tab', async () => {
  const portal = await kontext.newPage();
  await portal.goto(`${ENTRA}#view/Microsoft_AAD_IAM/TenantOverview.ReactView`);
  const tab = await tabVon(portal);
  await (await dienst()).evaluate(() => chrome.storage.local.set({ verstanden: true }));
  const l = await leiste(tab);
  await expect(l.getByRole('heading', { level: 2, name: 'Für diese Seite gibt es noch keine Erklärung.' })).toBeVisible();
  const links = l.locator('.kasten li a');
  await expect(links).toHaveCount(3);
  const ziel = await links.first().getAttribute('href');
  expect(ziel).toMatch(/^https:\/\/entra\.microsoft\.com\/#view\//);
  const tabsVorher = kontext.pages().length;
  await links.first().click();
  await expect.poll(() => portal.url()).toBe(ziel);
  expect(kontext.pages().length).toBe(tabsVorher);
  // Die Leiste folgt dem Tab: jetzt mit Eintrag, also ohne Z-3.
  await expect(l.getByRole('heading', { level: 2, name: 'Für diese Seite gibt es noch keine Erklärung.' })).toHaveCount(0);
  await (await dienst()).evaluate(() => chrome.storage.local.remove('verstanden'));
  await l.close();
  await portal.close();
});
