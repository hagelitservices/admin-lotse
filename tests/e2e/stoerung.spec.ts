// T-21 (S8b, Spez. §21.39): Störungsanzeige eingeschaltet — der einzige Weg, auf dem die Erweiterung etwas ins Netz schickt.
// Prüferbefund S8: 1.1.0 nicht ohne diesen Test einreichen. Gegen den Testbau (`npm run bauen:muster`, kennt `test:verwaltet`
// als Ersatz für die Firmenrichtlinie). `/api/status` wird per `context.route` beantwortet — netzfrei, Zustand je Test.
// Der Netz-Wächter (T-13) läuft mit: Erlaubt ist genau `GET https://www.hagel-it.de/api/status` aus dem Dienstarbeiter,
// jede andere Anfrage aus der Erweiterung bleibt ein Verstoß.
import { chromium, expect, test, type BrowserContext, type CDPSession, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { NetzWaechter } from './hilfen/netz';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3-muster', import.meta.url));
const STATUS = 'https://www.hagel-it.de/api/status';
const PUNKT = '•';

let kontext: BrowserContext;
let netz: NetzWaechter;
let profil: string;
let kennung: string;
let browserCdp: CDPSession;
/** Jede Anfrage an `/api/status`, gleich von wem (Methode, ob aus dem Dienstarbeiter). */
let abrufe: { methode: string; dienstarbeiter: boolean; cookie: boolean; referer: boolean }[];
/** Was `/api/status` gerade antwortet: Zustand je Dienst oder ein HTTP-Fehler. */
let antwort: { zustaende: Record<string, string> } | { fehler: number };

const ruhig = { 'microsoft-365': 'ok', 'microsoft-teams': 'ok', 'exchange-online': 'ok' };

async function starten() {
  profil = mkdtempSync(join(tmpdir(), 'lotse-s8b-'));
  netz = new NetzWaechter();
  abrufe = [];
  antwort = { zustaende: ruhig };
  kontext = await chromium.launchPersistentContext(profil, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${PAKET}`, `--load-extension=${PAKET}`, '--enable-unsafe-extension-debugging'],
  });
  await netz.installieren(kontext);
  kontext.on('request', (r: Request) => {
    if (!r.url().startsWith(STATUS)) return;
    const k = r.headers();
    abrufe.push({ methode: r.method(), dienstarbeiter: r.serviceWorker() !== null, cookie: 'cookie' in k, referer: 'referer' in k });
  });
  await kontext.route(STATUS, (r) => {
    if ('fehler' in antwort) return r.fulfill({ status: antwort.fehler, body: '' });
    const services = Object.fromEntries(Object.entries(antwort.zustaende).map(([id, state]) => [id, { state, title: 'Herstellertitel' }]));
    return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ checkedAt: new Date().toISOString(), services }) });
  });
  await kontext.route(/^https:\/\/www\.example\.com\//, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Beispiel</title>' }));
  const erster = kontext.serviceWorkers()[0] ?? (await kontext.waitForEvent('serviceworker'));
  kennung = new URL(erster.url()).host;
  browserCdp = await kontext.browser()!.newBrowserCDPSession();
}

/** Erweiterungsseite als Werkzeug: Sie hat `chrome.*`, überlebt aber das Beenden des Dienstarbeiters (anders als dessen Handle). */
async function werkzeug(): Promise<Page> {
  const p = await kontext.newPage();
  await p.goto(`chrome-extension://${kennung}/optionen.html`);
  return p;
}

const abzeichen = (w: Page, tabId?: number) => w.evaluate((t) => chrome.action.getBadgeText(t === undefined ? {} : { tabId: t }), tabId);
/** Ohne `tabs`-Recht sieht die Erweiterung fremde Adressen nicht: der jüngste Tab ohne lesbare Adresse ist die eben geöffnete Seite. */
const neuesterFremderTab = async (w: Page) =>
  w.evaluate(async () => Math.max(0, ...(await chrome.tabs.query({})).filter((t: { url?: string }) => !t.url).map((t: { id: number }) => t.id)));
const wecker = (w: Page) => w.evaluate(async () => (await chrome.alarms.getAll()).map((a: { name: string; periodInMinutes?: number }) => [a.name, a.periodInMinutes]));
const arbeiter = async () =>
  ((await browserCdp.send('Target.getTargets')) as { targetInfos: { type: string; url: string }[] }).targetInfos.filter(
    (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${kennung}/`),
  ).length;

/** Nur der erlaubte Abruf darf im Wächter stehen; alles andere bleibt Verstoß. */
const fremde = () => netz.bericht().verstoesse.filter((v) => v !== `Dienstarbeiter → ${STATUS}`);

test.afterEach(async () => {
  await kontext?.close();
  rmSync(profil, { recursive: true, force: true });
});

test('T-21a ab Werk aus: kein Abruf, kein Wecker, Popup ohne Störungskasten', async () => {
  await starten();
  const w = await werkzeug();
  await expect(w.getByRole('switch')).not.toBeChecked();
  const seite = await kontext.newPage();
  await seite.goto('https://www.example.com/');
  const popup = await kontext.newPage();
  await popup.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  await expect(popup.locator('main, body').first()).toBeVisible();
  await popup.waitForTimeout(3000);
  expect(abrufe).toEqual([]);
  expect(await wecker(w)).toEqual([]);
  await expect(popup.locator('[data-stoerung]')).toHaveCount(0);
  expect(await abzeichen(w)).toBe('');
  expect(netz.bericht()).toEqual({ verstoesse: [], blind: false });
});

test('T-21b Schalter an: genau ein Abruf, Punkt und Kasten mit Link auf /outlook; Aufwachen und Neuladen fragen nicht neu; aus → nichts mehr', async () => {
  await starten();
  antwort = { zustaende: { ...ruhig, 'exchange-online': 'down' } };
  const seite = await kontext.newPage();
  await seite.goto('https://www.example.com/');
  const w = await werkzeug();
  const tab = await neuesterFremderTab(w);
  expect(tab).toBeGreaterThan(0);

  // Einschalten wie ein Nutzer: Schalter in den Einstellungen.
  await w.getByRole('switch').check();
  await expect.poll(() => abrufe.length).toBe(1);
  expect(abrufe[0]).toEqual({ methode: 'GET', dienstarbeiter: true, cookie: false, referer: false });
  await expect.poll(() => abzeichen(w, tab)).toBe(PUNKT);
  expect(await abzeichen(w)).toBe(PUNKT);
  expect(await wecker(w)).toEqual([['stoerungen', 5]]);

  const popup = await kontext.newPage();
  await popup.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  const kasten = popup.locator('.kasten--stoerung');
  await expect(kasten).toHaveAttribute('data-stoerung', 'exchange-online');
  const link = kasten.getByRole('link');
  await expect(link).toHaveCount(1);
  expect(await link.getAttribute('href')).toBe('https://www.hagel-it.de/it-stoerungen/outlook?mtm_campaign=admin-lotse&mtm_source=stoerung');
  await expect(link).toHaveAttribute('target', '_blank');

  // Dienstarbeiter beenden (wie T-07), dann wecken: Neuladen der Tabs löst `tabs.onUpdated` aus.
  expect(await arbeiter()).toBe(1);
  const cdp = await kontext.newCDPSession(w);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(arbeiter).toBe(0);
  await seite.reload();
  await popup.reload();
  await w.reload();
  await expect.poll(arbeiter).toBe(1);
  await expect.poll(() => abzeichen(w, tab)).toBe(PUNKT);
  await expect(popup.locator('.kasten--stoerung')).toHaveAttribute('data-stoerung', 'exchange-online');
  await w.waitForTimeout(3000);
  expect(abrufe, 'Aufwachen und Neuladen innerhalb der fünf Minuten fragen nicht erneut').toHaveLength(1);

  // Ausschalten: Wecker weg, Punkt weg in allen Tabs und global, Popup ohne Kasten, kein weiterer Abruf.
  const zweiter = await kontext.newPage();
  await zweiter.goto('https://www.example.com/?zwei');
  const tab2 = await neuesterFremderTab(w);
  expect(tab2).toBeGreaterThan(tab);
  await expect.poll(() => abzeichen(w, tab2)).toBe(PUNKT);
  await w.getByRole('switch').uncheck();
  await expect.poll(() => wecker(w)).toEqual([]);
  for (const t of [tab, tab2]) await expect.poll(() => abzeichen(w, t)).toBe('');
  expect(await abzeichen(w)).toBe('');
  await popup.reload();
  await expect(popup.locator('[data-stoerung]')).toHaveCount(0);
  await seite.reload();
  await w.waitForTimeout(3000);
  expect(abrufe).toHaveLength(1);
  expect(fremde()).toEqual([]);
  expect(netz.bericht().blind).toBe(false);
});

test('T-21c ohne Störung „keine Störung“, nicht abrufbar „nicht abrufbar“ (Grau ist kein Grün), Seitenleiste nur bei Störung', async () => {
  await starten();
  const w = await werkzeug();
  await w.getByRole('switch').check();
  await expect.poll(() => abrufe.length).toBe(1);
  const popup = await kontext.newPage();
  await popup.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  await expect(popup.locator('[data-stoerung]')).toHaveAttribute('data-stoerung', 'keine');
  expect(await abzeichen(w)).toBe('');

  // Website antwortet 503: neuer Profilstart ohne gespeicherten Stand → „nicht abrufbar“, kein Punkt.
  await kontext.close();
  rmSync(profil, { recursive: true, force: true });
  await starten();
  antwort = { fehler: 503 };
  const w2 = await werkzeug();
  await w2.getByRole('switch').check();
  await expect.poll(() => abrufe.length).toBe(1);
  const popup2 = await kontext.newPage();
  await popup2.goto(`chrome-extension://${kennung}/ausserhalb.html`);
  await expect(popup2.locator('[data-stoerung]')).toHaveAttribute('data-stoerung', 'unbekannt');
  expect(await abzeichen(w2)).toBe('');

  // Seitenleiste: ruhig ohne Störung, Kasten bei Störung (Stand von Hand gesetzt wie nach einem Abruf).
  const leiste = await kontext.newPage();
  await leiste.goto(`chrome-extension://${kennung}/seitenleiste.html?tab=1`);
  await expect(leiste.locator('[data-stoerung]')).toHaveCount(0);
  await leiste.evaluate(() => chrome.storage.session.set({ 'stoerung:stand': { geprueft: Date.now(), gestoert: ['microsoft-teams'] } }));
  await expect(leiste.locator('.kasten--stoerung')).toHaveAttribute('data-stoerung', 'microsoft-teams');
  expect(await leiste.locator('.kasten--stoerung a').getAttribute('href')).toContain('/it-stoerungen/microsoft-teams?');
  expect(fremde()).toEqual([]);
});

test('T-21d Firmenrichtlinie: an → Abruf und Schalter gesperrt an; aus → Schalter gesperrt aus, kein Abruf trotz Nutzerwahl', async () => {
  await starten();
  const w = await werkzeug();
  await w.evaluate(() => chrome.storage.local.set({ 'test:verwaltet': { stoerungsanzeige: true } }));
  await expect.poll(() => abrufe.length).toBe(1);
  await expect(w.getByRole('switch')).toBeChecked();
  await expect(w.getByRole('switch')).toBeDisabled();
  expect(await wecker(w)).toEqual([['stoerungen', 5]]);

  await w.evaluate(() => chrome.storage.local.set({ stoerungsanzeige: true, 'test:verwaltet': { stoerungsanzeige: false } }));
  await expect.poll(() => wecker(w)).toEqual([]);
  await expect(w.getByRole('switch')).not.toBeChecked();
  await expect(w.getByRole('switch')).toBeDisabled();
  await w.waitForTimeout(3000);
  expect(abrufe).toHaveLength(1);
  expect(fremde()).toEqual([]);
});

// T-22 (S8b (2), Spez. §14.3): Sichtprüfung der Störungsanzeige. Jeder Zustand wird in 320 und 480 px, hell und dunkel
// fotografiert (tests/sicht/, mit Read ansehen) und mit axe geprüft: Einstellungen (Schalter frei aus/an, per Firma gesperrt
// an/aus), Popup außerhalb in seiner festen Breite 380 px (Störung, keine, nicht abrufbar), Seitenleiste mit Störung. Der Stand wird nach dem einen Abruf von
// Hand in `storage.session` gesetzt — dieselbe Form, die der Dienstarbeiter schreibt.
const SICHT = fileURLToPath(new URL('../sicht/', import.meta.url));

async function pruefen(seite: Page, name: string) {
  await seite.evaluate(() => document.fonts.ready);
  await seite.waitForTimeout(400);
  await seite.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await seite.screenshot({ path: `${SICHT}${name}.png`, fullPage: true });
  const ueber = await seite.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ueber, `${name}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
  const r = await new AxeBuilder({ page: seite }).analyze();
  const schwer = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(schwer.map((v) => `${name}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

for (const thema of ['light', 'dark'] as const) {
  test(`T-22 Sichtprüfung Störungsanzeige ${thema}: Einstellungen, Popup, Seitenleiste — 320/480 px, axe sauber`, async () => {
    mkdirSync(SICHT, { recursive: true });
    await starten();
    antwort = { fehler: 503 };
    const fehler: string[] = [];
    const neu = async (pfad: string, breite: number) => {
      const p = await kontext.newPage();
      p.on('pageerror', (f) => fehler.push(f.message));
      p.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
      await p.emulateMedia({ colorScheme: thema, reducedMotion: 'no-preference' });
      await p.setViewportSize({ width: breite, height: 860 });
      await p.goto(`chrome-extension://${kennung}/${pfad}`);
      return p;
    };
    const w = await werkzeug();
    const stand = (gestoert: string[] | null) =>
      w.evaluate((g) => (g ? chrome.storage.session.set({ 'stoerung:stand': { geprueft: Date.now(), gestoert: g } }) : chrome.storage.session.remove('stoerung:stand')), gestoert);

    // Einstellungen: frei aus, frei an, Firma an (gesperrt), Firma aus (gesperrt).
    for (const breite of [320, 480]) {
      const o = await neu('optionen.html', breite);
      const schalter = o.getByRole('switch');
      await expect(schalter).not.toBeChecked();
      await o.locator('#opt-stoerung').scrollIntoViewIfNeeded();
      await pruefen(o, `stoerung-optionen-aus-${thema}-${breite}`);
      await schalter.check();
      await expect.poll(() => abrufe.length).toBeGreaterThan(0);
      await pruefen(o, `stoerung-optionen-an-${thema}-${breite}`);
      await o.evaluate(() => chrome.storage.local.set({ 'test:verwaltet': { stoerungsanzeige: true } }));
      await expect(schalter).toBeDisabled();
      await expect(schalter).toBeChecked();
      await pruefen(o, `stoerung-optionen-firma-an-${thema}-${breite}`);
      await o.evaluate(() => chrome.storage.local.set({ 'test:verwaltet': { stoerungsanzeige: false } }));
      await expect(schalter).not.toBeChecked();
      await expect(schalter).toBeDisabled();
      await pruefen(o, `stoerung-optionen-firma-aus-${thema}-${breite}`);
      await o.evaluate(() => chrome.storage.local.remove(['test:verwaltet']));
      await expect(schalter).toBeEnabled();
      await schalter.uncheck();
      await o.close();
    }

    // Popup außerhalb: Störung (zwei Dienste), keine Störung, nicht abrufbar. Ab hier fragt niemand mehr ab.
    await w.getByRole('switch').check();
    await w.waitForTimeout(1000);
    const bisher = abrufe.length;
    expect(bisher).toBeGreaterThan(0);
    // Das Popup hat im Browser fest 380 px (`.popup`), wie Z-16 in T-16.
    for (const breite of [380]) {
      const p = await neu('ausserhalb.html', breite);
      await stand(['exchange-online', 'microsoft-teams']);
      await expect(p.locator('.kasten--stoerung')).toHaveAttribute('data-stoerung', 'exchange-online microsoft-teams');
      await pruefen(p, `stoerung-popup-gestoert-${thema}-${breite}`);
      await stand([]);
      await expect(p.locator('[data-stoerung]')).toHaveAttribute('data-stoerung', 'keine');
      await pruefen(p, `stoerung-popup-keine-${thema}-${breite}`);
      await stand(null);
      await expect(p.locator('[data-stoerung]')).toHaveAttribute('data-stoerung', 'unbekannt');
      await pruefen(p, `stoerung-popup-unbekannt-${thema}-${breite}`);
      await p.close();
    }

    // Seitenleiste mit Störung.
    for (const breite of [320, 480]) {
      await stand(['microsoft-365']);
      const l = await neu('seitenleiste.html?tab=1', breite);
      await expect(l.locator('.kasten--stoerung')).toHaveAttribute('data-stoerung', 'microsoft-365');
      await pruefen(l, `stoerung-leiste-${thema}-${breite}`);
      await l.close();
    }
    expect(abrufe).toHaveLength(bisher);
    expect(abrufe.every((a) => a.methode === 'GET' && a.dienstarbeiter && !a.cookie && !a.referer)).toBe(true);
    expect(fremde()).toEqual([]);
    expect(fehler).toEqual([]);
  });
}
