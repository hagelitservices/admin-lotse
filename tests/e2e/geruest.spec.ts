// Rauchtest H3: Das gebaute Chrome-Paket lädt in Chromium, der Dienstarbeiter startet, die drei Seiten rendern
// ohne CSP-Verstoß. Netzfrei (Spez. §14.1).
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { NetzWaechter } from './hilfen/netz';
import { fileURLToPath } from 'node:url';

const PAKET = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
let kontext: BrowserContext;
/** T-13: jede Anfrage aus der Erweiterung über alle Abläufe dieser Datei (hilfen/netz.ts). */
const netz = new NetzWaechter();
let kennung: string;

test.beforeAll(async () => {
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

for (const [seite, deutsch] of [
  ['seitenleiste', 'So arbeitet der Lotse'],
  ['ausserhalb', 'Der Lotse arbeitet in diesen vier Portalen'],
  ['optionen', 'Admin-Lotse\u00a0– Einstellungen'],
] as const) {
  test(`${seite}.html rendert ohne Konsolenfehler`, async () => {
    const page = await kontext.newPage();
    const fehler: string[] = [];
    page.on('console', (m) => m.type() === 'error' && fehler.push(m.text()));
    page.on('pageerror', (e) => fehler.push(e.message));
    await page.goto(`chrome-extension://${kennung}/${seite}.html`);
    // Oberflächensprache unter macOS nicht setzbar (Rahmen §10, 05.11.2026): beide Sprachen zulassen.
    await expect(page.locator('main')).toHaveText(/\S/);
    const t = (await page.locator('main').innerText()).trim();
    // Seit H11 rendert jede Seite ihre volle Oberfläche: Der erwartete Satz steht darin (Seitenleiste ohne Tab: Erster Start, Z-1).
    expect(t.includes(deutsch) || /How the pilot works|four portals|Settings/.test(t), t).toBe(true);
    expect(fehler).toEqual([]);
    await page.close();
  });
}

// H17d (Spez. §14.5 Nr. 3): Chrome und Edge verstecken das Symbol im Puzzle-Menü. Nach der Installation öffnet sich
// einmal die Einstellungsseite mit dem Kasten „So öffnen Sie den Lotsen“, Fokus auf dessen Überschrift.
test('T-20 Installation öffnet einmal die Einstellungen mit dem Anheften-Hinweis', async () => {
  await expect.poll(() => kontext.pages().filter((p) => p.url().endsWith('/optionen.html#start')).length, { timeout: 10_000 }).toBe(1);
  const page = kontext.pages().find((p) => p.url().endsWith('/optionen.html#start'))!;
  const kasten = page.locator('section#start');
  await expect(kasten).toHaveClass(/kasten--hinweis/);
  await expect(kasten.locator('ol > li')).toHaveCount(3);
  await expect(kasten.locator('h2')).toBeFocused();
  await expect(kasten).toContainText(/Puzzle|puzzle/);
  for (const [w, h] of [[320, 860], [900, 860]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300); // erst neu malen lassen, sonst steht der alte Kopf doppelt im Foto
    for (const schema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: schema });
      await page.screenshot({ path: fileURLToPath(new URL(`../sicht/optionen-start-${schema}-${w}.png`, import.meta.url)) });
    }
  }
  // Ohne `#start` (Aufruf über „Optionen“): Kasten steht da, aber ohne Hervorhebung.
  const normal = await kontext.newPage();
  await normal.goto(`chrome-extension://${kennung}/optionen.html`);
  await expect(normal.locator('section#start')).not.toHaveClass(/kasten--hinweis/);
  await normal.close();
});
