// Ladeprobe der Store-ZIPs (H16, Spez. §17.2): entpackt `npm run zip` nach .output/zip-probe/ und lädt jedes Paket in
// seinen Browser (Chromium für Chrome, Edge-Kanal für Edge). Gibt Name, Version und den ersten Text des Popups aus.
// Aufruf nach `npm run zip`: `node scripts/zip-probe.mjs`.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(`${WURZEL}package.json`, 'utf8'));
const PROBE = `${WURZEL}.output/zip-probe`;
rmSync(PROBE, { recursive: true, force: true });
let rot = 0;
for (const [kanal, browser] of [['chromium', 'chrome'], ['msedge', 'edge']]) {
  const pfad = `${PROBE}/${browser}`;
  mkdirSync(pfad, { recursive: true });
  execFileSync('unzip', ['-q', `${WURZEL}.output/admin-lotse-${version}-${browser}.zip`, '-d', pfad]);
  const ctx = await chromium.launchPersistentContext('', {
    channel: kanal,
    args: [`--disable-extensions-except=${pfad}`, `--load-extension=${pfad}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 20_000 }));
    const id = new URL(sw.url()).host;
    // eslint-disable-next-line no-undef
    const m = await sw.evaluate(() => chrome.runtime.getManifest());
    const s = await ctx.newPage();
    const fehler = [];
    s.on('pageerror', (f) => fehler.push(f.message));
    await s.goto(`chrome-extension://${id}/ausserhalb.html`);
    await s.locator('main a').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const text = (await s.locator('body').innerText()).slice(0, 70).replace(/\n/g, ' / ');
    const ok = m.version === version && fehler.length === 0 && text.length > 20;
    if (!ok) rot++;
    console.log(`${ok ? 'ok ' : 'ROT'} ${browser}: ${m.name} ${m.version} · Popup „${text}…“ · Fehler ${fehler.length}`);
  } finally {
    await ctx.close();
  }
}
process.exit(rot ? 1 : 0);
