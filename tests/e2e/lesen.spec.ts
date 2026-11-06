// Leser-Maschine von Ende zu Ende (Spez. §3.3, §5.3, §5.4): Inhalts-Skripte in allen Rahmen → Hintergrund → Seitenleiste,
// netzfrei auf den echten Hostnamen. Die Fixtures aus dem Testmandanten kommen in H6; hier geht es um den Weg.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { NetzWaechter } from './hilfen/netz';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const ENTRA_ROUTE = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings';
const REGLER = (w: string) => `<button type="button" role="checkbox" aria-label="Benutzer können Anwendungen registrieren" aria-checked="${w}" disabled>x</button>`;
const seite = (titel: string, koerper: string, lang = 'de') => `<!doctype html><html lang="${lang}"><head><title>${titel}</title></head><body>${koerper}</body></html>`;
const RAHMEN = 'https://sandbox-2.reactblade.portal.azure.net/';

let kontext: BrowserContext;
/** T-13: jede Anfrage aus der Erweiterung über alle Abläufe dieser Datei (hilfen/netz.ts). */
const netz = new NetzWaechter();
let kennung: string;
/** Was die Testseiten gerade ausliefern, je Host und Pfad. */
const antworten = new Map<string, string>();

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

async function leiste(tabId: number): Promise<Page> {
  const p = await kontext.newPage();
  await p.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=${tabId}`);
  return p;
}

const bewertung = async (l: Page, id: string) => {
  const roh = await l.locator('[data-bewertungen]').getAttribute('data-bewertungen', { timeout: 3000 }).catch(() => null);
  return (JSON.parse(roh ?? '{}') as Record<string, { art: string; grund?: string; token?: string }>)[id];
};
const art = async (l: Page, id: string) => (await bewertung(l, id))?.art;
const abzeichen = async (tabId: number) => (await dienst()).evaluate((t) => chrome.action.getBadgeText({ tabId: t }), tabId);

test.beforeAll(async () => {
  kontext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${PAKET}`, `--load-extension=${PAKET}`, '--enable-unsafe-extension-debugging'],
  });
  await netz.installieren(kontext);
  await kontext.route(/^https:\/\/(admin\.cloud\.microsoft|entra\.microsoft\.com|[a-z0-9-]+\.reactblade\.portal\.azure\.net)\//, (r) => {
    const u = new URL(r.request().url());
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: antworten.get(u.origin + u.pathname) ?? seite('Leer', '') });
  });
  const erster = kontext.serviceWorkers()[0] ?? (await kontext.waitForEvent('serviceworker'));
  kennung = new URL(erster.url()).host;
});

test.afterAll(async () => {
  await kontext.close();
  expect(netz.bericht(), 'T-13: Anfrage aus der Erweiterung oder Mitschnitt blind').toEqual({ verstoesse: [], blind: false });
});

test.beforeEach(() => antworten.clear());

test('Wert im nachgeladenen Rahmen: Empfohlen → „Passt“, kein Abzeichen, Token in der Sitzung', async () => {
  antworten.set(RAHMEN, seite('Azure', REGLER('false'), 'en'));
  antworten.set(
    'https://entra.microsoft.com/',
    seite('Benutzer - Microsoft Entra Admin Center', `<div id="h"></div><script>setTimeout(()=>{const f=document.createElement('iframe');f.src='${RAHMEN}';document.getElementById('h').append(f)},1500)</script>`),
  );
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const tab = await tabVon(p);
  const l = await leiste(tab);
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 3000 }).toBe('lese');
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 25_000 }).toBe('passt');
  expect(await abzeichen(tab)).toBe('');
  await p.close();
  await l.close();
});

test('Portal zeigt erst den Vorgabewert, dann den echten (Entra, gemessen): nie „Passt“, am Ende „Weicht ab“ mit Abzeichen', async () => {
  antworten.set(
    'https://entra.microsoft.com/',
    seite('Benutzer - Microsoft Entra Admin Center', `${REGLER('false')}<script>setTimeout(()=>document.querySelector('[role=checkbox]').setAttribute('aria-checked','true'),1900)</script>`),
  );
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const tab = await tabVon(p);
  const l = await leiste(tab);
  const gesehen = new Set<string | undefined>();
  await expect
    .poll(
      async () => {
        const a = await art(l, 'entra-app-registrierung');
        gesehen.add(a);
        return a;
      },
      { timeout: 25_000, intervals: [100] },
    )
    .toBe('weicht-ab');
  expect(gesehen.has('passt')).toBe(false);
  expect(await bewertung(l, 'entra-app-registrierung')).toMatchObject({ form: 'quadrat', farbe: 'down', token: 'ja' });
  expect(await abzeichen(tab)).toBe('1');
  await p.close();
  await l.close();
});

test('Treffer in zwei Rahmen: nicht lesbar (mehrdeutig)', async () => {
  antworten.set(RAHMEN, seite('Azure', REGLER('false'), 'en'));
  antworten.set('https://entra.microsoft.com/', seite('Benutzer - Microsoft Entra Admin Center', `${REGLER('false')}<iframe src="${RAHMEN}"></iframe>`));
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const l = await leiste(await tabVon(p));
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 25_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'mehrdeutig' });
  await p.close();
  await l.close();
});

test('Rahmen verschwindet: „Passt“ fällt weg; neuer Rahmen nach der Frist liest und ersetzt die Lesung', async () => {
  test.setTimeout(120_000);
  antworten.set(RAHMEN, seite('Azure', REGLER('false'), 'en'));
  antworten.set('https://sandbox-3.reactblade.portal.azure.net/', seite('Azure', REGLER('true'), 'en'));
  antworten.set('https://entra.microsoft.com/', seite('Benutzer - Microsoft Entra Admin Center', `<iframe id="r" src="${RAHMEN}"></iframe>`));
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const l = await leiste(await tabVon(p));
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 25_000 }).toBe('passt');
  await p.evaluate(() => document.getElementById('r')?.remove());
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 3000 }).not.toBe('passt');
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 50_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'zeitgrenze' });
  await p.evaluate(() => {
    const f = document.createElement('iframe');
    f.src = 'https://sandbox-3.reactblade.portal.azure.net/';
    document.body.append(f);
  });
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 25_000 }).toMatchObject({ art: 'weicht-ab', token: 'ja' });
  await p.close();
  await l.close();
});

test('Titel passt nicht (§4.4): Erklärung ja, Lesen nein', async () => {
  antworten.set('https://entra.microsoft.com/', seite('Etwas ganz anderes', REGLER('false')));
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const l = await leiste(await tabVon(p));
  // H17c: erst „lese“ (kann noch der Ladebildschirm sein), nach der Ladefrist von 30 s endgültig.
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 5000 }).toMatchObject({ art: 'lese' });
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 40_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'aufbau' });
  await p.close();
  await l.close();
});

test('Portal in anderer Sprache (§4.6): nicht lesbar, Grund Sprache', async () => {
  antworten.set('https://entra.microsoft.com/', seite('Utilisateurs', REGLER('false'), 'fr'));
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const l = await leiste(await tabVon(p));
  // H17c: erst „lese“ (kann noch der Ladebildschirm sein), nach der Ladefrist von 30 s endgültig.
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 5000 }).toMatchObject({ art: 'lese' });
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 40_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'sprache' });
  await p.close();
  await l.close();
});

test('Domainnamen: in der Leiste per Port, nie in storage.session; übersteht den Neustart des Dienstarbeiters', async () => {
  const zeile = (d: string) => `<div role="row"><div role="rowheader">${d}</div></div>`;
  antworten.set(
    'https://admin.cloud.microsoft/',
    seite('Domänen - Microsoft 365 admin center', `<div role="grid" aria-label="Domänen"><div role="row"><div role="columnheader">Domänenname</div></div>${zeile('musterfirma.de')}${zeile('musterfirma.onmicrosoft.com')}</div>`),
  );
  const p = await kontext.newPage();
  await p.goto('https://admin.cloud.microsoft/#/Domains');
  const tab = await tabVon(p);
  const l = await kontext.newPage();
  await l.addInitScript(() => {
    (globalThis as unknown as { meldungen: unknown[] }).meldungen = [];
    const orig = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...a: unknown[]) => {
      const port = orig(...a);
      port.onMessage.addListener((m: unknown) => (globalThis as unknown as { meldungen: unknown[] }).meldungen.push(m));
      return port;
    };
  });
  await l.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=${tab}`);
  await expect.poll(() => bewertung(l, 'm365-domains'), { timeout: 25_000 }).toMatchObject({ art: 'nur-erklaerung', token: '2' });
  const letzteAnzeige = () =>
    l.evaluate(() => ((globalThis as unknown as { meldungen: { anzeige: Record<string, string[]> }[] }).meldungen.at(-1)?.anzeige ?? {})['m365-domains']);
  expect(await letzteAnzeige()).toEqual(['musterfirma.de', 'musterfirma.onmicrosoft.com']);
  const sitzung = await l.evaluate(async () => JSON.stringify(await chrome.storage.session.get(null)));
  expect(sitzung).toContain('m365-domains');
  expect(sitzung).not.toContain('musterfirma');
  // Keine Bewertung, kein Abzeichen: Die Domains werden nur gezeigt.
  expect(await abzeichen(tab)).toBe('');

  // Dienstarbeiter beenden: Wert bleibt stehen, Namen kommen durch neues Lesen zurück.
  const cdp = await kontext.newCDPSession(l);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await l.evaluate(() => void chrome.runtime.sendMessage({ art: 'wecken' }).catch(() => undefined));
  await expect.poll(letzteAnzeige, { timeout: 25_000 }).toEqual(['musterfirma.de', 'musterfirma.onmicrosoft.com']);
  await expect.poll(() => bewertung(l, 'm365-domains')).toMatchObject({ art: 'nur-erklaerung', token: '2' });
  await p.close();
  await l.close();
});

test('Seitenwechsel per Hash: alte Lesung ist weg, Erneut-Lesen und Frist: nicht lesbar nach 30 s + Ruhe', async () => {
  test.setTimeout(120_000);
  antworten.set('https://entra.microsoft.com/', seite('Benutzer - Microsoft Entra Admin Center', REGLER('false')));
  const p = await kontext.newPage();
  await p.goto(ENTRA_ROUTE);
  const tab = await tabVon(p);
  const l = await leiste(tab);
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 25_000 }).toBe('passt');
  await p.evaluate(() => {
    location.hash = '#view/Microsoft_AAD_IAM/AllowlistPolicyBlade';
  });
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 2000 }).toBeUndefined();
  // Zurück, aber das Bedienelement fehlt jetzt: Die Seite zeigt den Wert nie.
  await p.evaluate(() => {
    document.querySelector('[role=checkbox]')?.remove();
    location.hash = '#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings';
  });
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 2000 }).toBe('lese');
  await expect.poll(() => bewertung(l, 'entra-app-registrierung'), { timeout: 50_000 }).toMatchObject({ art: 'nicht-lesbar', grund: 'zeitgrenze' });
  // Knopf „Erneut lesen“ (§5.3): Der Wert ist inzwischen da, ein neuer Auftrag findet ihn.
  await p.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), REGLER('false'));
  await l.evaluate((t) => chrome.runtime.connect({ name: `seitenleiste:${t}` }).postMessage({ art: 'erneut' }), tab);
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 2000 }).toBe('lese');
  await expect.poll(() => art(l, 'entra-app-registrierung'), { timeout: 25_000 }).toBe('passt');
  await p.close();
  await l.close();
});
