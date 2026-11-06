// H11a (Spez. §11, §14.3, §14.7): Zustände der Seitenleiste auf der Musterseite des Testbaus (`npm run bauen:muster`),
// dazu Popup außerhalb und Optionen. T-15 Tastatur, T-16 Fotos 320/480 px hell/dunkel, T-17 axe 0 kritisch/ernst,
// Z-2 „Lese die Seite …“ erst nach 800 ms. Fotos liegen in tests/sicht/ (nicht eingecheckt) und werden mit Read angesehen.
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { NetzWaechter } from './hilfen/netz';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3-muster', import.meta.url));
const SICHT = fileURLToPath(new URL('../sicht/', import.meta.url));
const ZUSTAENDE = ['Z-1', 'Z-2', 'Z-2a', 'Z-3', 'Z-4', 'Z-5', 'Z-6', 'Z-7', 'Z-8', 'Z-9', 'Z-9d', 'Z-10', 'Z-11', 'Z-13', 'Z-14', 'Z-15'];
/** H11b: Popup-Zustände, fest 380 bzw. 400 px wie im Browser — Z-12 (Seitenzugriff) und die Leiste als Popup (Edge, M-8). */
const POPUPS = ['Z-12', 'Z-12b', 'Z-9p'];
let kontext: BrowserContext;
/** T-13: jede Anfrage aus der Erweiterung über alle Abläufe dieser Datei (hilfen/netz.ts). */
const netz = new NetzWaechter();
let kennung: string;

test.beforeAll(async () => {
  mkdirSync(SICHT, { recursive: true });
  kontext = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${PAKET}`, `--load-extension=${PAKET}`],
  });
  await netz.installieren(kontext);
  const sw = kontext.serviceWorkers()[0] ?? (await kontext.waitForEvent('serviceworker'));
  kennung = new URL(sw.url()).host;
});
test.afterAll(async () => {
  await kontext.close();
  expect(netz.bericht(), 'T-13: Anfrage aus der Erweiterung oder Mitschnitt blind').toEqual({ verstoesse: [], blind: false });
});

async function oeffnen(pfad: string, thema: 'light' | 'dark', breite: number): Promise<{ seite: Page; fehler: string[] }> {
  const seite = await kontext.newPage();
  const fehler: string[] = [];
  seite.on('pageerror', (f) => fehler.push(f.message));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
  await seite.emulateMedia({ colorScheme: thema, reducedMotion: 'no-preference' });
  await seite.setViewportSize({ width: breite, height: 860 });
  await seite.goto(`chrome-extension://${kennung}/${pfad}`);
  await seite.evaluate(() => document.fonts.ready);
  return { seite, fehler };
}

/** Endliche Animationen abwarten (Rahmen §10), dann die 800 ms von Z-2 hinter sich lassen. */
async function ruhe(seite: Page) {
  await seite.waitForTimeout(900);
  await seite.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

async function axe(seite: Page, wo: string) {
  const r = await new AxeBuilder({ page: seite }).analyze();
  const schwer = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(schwer.map((v) => `${wo}: ${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
}

for (const thema of ['light', 'dark'] as const) {
  for (const breite of [320, 480]) {
    test(`T-16/T-17 Seitenleiste ${thema} ${breite} px: alle Zustände fotografiert, axe sauber, kein Überlauf`, async () => {
      const { seite, fehler } = await oeffnen('muster.html#Z-1', thema, breite);
      for (const z of ZUSTAENDE) {
        await seite.evaluate((h) => (location.hash = h), z);
        await expect(seite.locator('body')).toHaveAttribute('data-muster', z);
        await ruhe(seite);
        await seite.screenshot({ path: `${SICHT}${z}-${thema}-${breite}.png`, fullPage: true });
        const ueber = await seite.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(ueber, `${z}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
        await axe(seite, z);
      }
      expect(fehler).toEqual([]);
      await seite.close();
    });
  }
  test(`T-16/T-17 Popups Z-12 und Edge-Ersatz ${thema}`, async () => {
    const { seite, fehler } = await oeffnen('muster.html#Z-12', thema, 400);
    for (const z of POPUPS) {
      await seite.evaluate((h) => (location.hash = h), z);
      await expect(seite.locator('body')).toHaveAttribute('data-muster', z);
      await ruhe(seite);
      await seite.screenshot({ path: `${SICHT}${z}-${thema}-400.png`, fullPage: true });
      const ueber = await seite.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(ueber, `${z}: waagrechter Überlauf`).toBeLessThanOrEqual(0);
      await axe(seite, z);
    }
    expect(fehler).toEqual([]);
    await seite.close();
  });

  test(`T-16/T-17 Optionen mit ausgeblendeten Hinweisen und Firmenvorgaben ${thema}`, async () => {
    const sw = kontext.serviceWorkers()[0]!;
    await sw.evaluate(() =>
      chrome.storage.local.set({
        ausgeblendet: ['entra-benutzereinwilligung', 'm365-kennwortablauf'],
        'test:verwaltet': { bewussteAbweichungen: [{ eintrag: 'entra-sicherheitsstandards', begruendung: 'Ersetzt durch Regeln des bedingten Zugriffs.' }], werteLesen: false },
      }),
    );
    for (const breite of [320, 900]) {
      const { seite, fehler } = await oeffnen('optionen.html', thema, breite);
      await expect(seite.locator('.liste-aus li')).toHaveCount(3);
      await ruhe(seite);
      await seite.screenshot({ path: `${SICHT}optionen-liste-${thema}-${breite}.png`, fullPage: true });
      await axe(seite, `optionen-liste ${breite}`);
      expect(fehler).toEqual([]);
      await seite.close();
    }
    await sw.evaluate(() => chrome.storage.local.remove(['ausgeblendet', 'test:verwaltet']));
  });

  test(`T-16/T-17 Popup außerhalb (Z-16) und Optionen ${thema}`, async () => {
    for (const [pfad, breite, name] of [['ausserhalb.html', 380, 'Z-16'], ['optionen.html', 900, 'optionen']] as const) {
      const { seite, fehler } = await oeffnen(pfad, thema, breite);
      await ruhe(seite);
      await seite.screenshot({ path: `${SICHT}${name}-${thema}.png`, fullPage: true });
      await axe(seite, name);
      expect(fehler).toEqual([]);
      await seite.close();
    }
  });
}

test('Z-16 Popup: vier Portale als Links, ein Satz Zweck', async () => {
  const { seite } = await oeffnen('ausserhalb.html', 'light', 380);
  const links = seite.locator('a[href^="https://"]');
  await expect(links.filter({ hasNotText: /hagel IT/ })).toHaveCount(4);
  await expect(seite.getByRole('heading', { level: 2 })).toHaveText(/vier Portalen|four portals/);
  await seite.close();
});

test('Z-2 Skelett sofort, Text „Lese die Seite …“ erst nach 800 ms', async () => {
  const { seite } = await oeffnen('muster.html#Z-2', 'light', 320);
  const t0 = Date.now();
  await expect(seite.locator('.karte .skelett').first()).toBeVisible();
  const frueh = await seite.locator('.lese-text').first().innerText();
  if (Date.now() - t0 < 700) expect(frueh.trim()).toBe('');
  await expect(seite.locator('.lese-text').first()).toHaveText(/Lese die Seite|Reading the page/, { timeout: 2000 });
  await seite.close();
});

test('T-15 Tastatur: Reihenfolge, Aufklappen per Enter und Leertaste, Fokus sichtbar', async () => {
  const { seite } = await oeffnen('muster.html#Z-9', 'light', 400);
  await ruhe(seite);
  // Erstes Ziel ist das Zahnrad im Kopf, dann der Kopf der ersten Karte.
  await seite.keyboard.press('Tab');
  await expect(seite.locator(':focus')).toHaveAttribute('aria-label', /Einstellungen|Settings/);
  await seite.keyboard.press('Tab');
  const erste = seite.locator('.karte').first();
  const knopf = erste.locator('.karte__ausloeser');
  await expect(knopf).toBeFocused();
  // Rote Abweichung steht oben und ist offen.
  await expect(erste).toHaveAttribute('data-art', 'weicht-ab');
  await expect(erste).toHaveAttribute('data-schwere', 'rot');
  await expect(knopf).toHaveAttribute('aria-expanded', 'true');
  const ring = await knopf.evaluate((k) => getComputedStyle(k).outlineStyle + ' ' + getComputedStyle(k).outlineWidth);
  expect(ring).toBe('solid 2px');
  await seite.keyboard.press('Enter');
  await expect(knopf).toHaveAttribute('aria-expanded', 'false');
  await seite.keyboard.press(' ');
  await expect(knopf).toHaveAttribute('aria-expanded', 'true');
  // Zugeklappter Inhalt ist nicht erreichbar (inert): Eine passende Karte steht zu, ihre Links liegen nicht im Tab-Weg.
  const zu = seite.locator('.karte[data-art="passt"] [inert]');
  await expect(zu).toHaveCount(1);
  await seite.close();
});
