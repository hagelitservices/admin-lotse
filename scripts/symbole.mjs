// Symbole 16/32/48/128 px (Spez. §11.4): Signalflagge „H“ — links weiß, rechts Akzent-Orange — auf navy-950,
// abgerundetes Quadrat. 128 px mit 96-px-Motiv (Spez. §12.2). Gezeichnet im mitgelieferten Chromium (Canvas), keine Bildbibliothek im Paket.
// Aufruf: `node scripts/symbole.mjs` → public/icons/*.png (eingecheckt). Gleiche Geometrie wie components/zeichen.tsx.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ziel = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(ziel, { recursive: true });
const browser = await chromium.launch();
const seite = await browser.newPage();
await seite.setContent('<canvas id="c"></canvas>');
for (const g of [16, 32, 48, 128]) {
  const daten = await seite.evaluate((g) => {
    const c = document.getElementById('c');
    c.width = g;
    c.height = g;
    const x = c.getContext('2d');
    // Chrome-Vorgabe für 128 px: Motiv 96 × 96, je 16 px durchsichtiger Rand (Store-Liste und Erweiterungsseite).
    const rand = g === 128 ? 16 : 0;
    const m = g - 2 * rand;
    const e = m / 32;
    x.translate(rand, rand);
    x.fillStyle = '#0F2440';
    x.beginPath();
    x.roundRect(0, 0, m, m, 7 * e);
    x.fill();
    // Bei 16 px auf ganze Pixel, sonst verschwimmt die Mittelkante.
    const r = (v) => (g <= 16 ? Math.round(v * e) : v * e);
    x.fillStyle = '#FFFFFF';
    x.fillRect(r(6), r(8), r(10), r(16));
    x.fillStyle = '#E8621A';
    x.fillRect(r(16), r(8), r(10), r(16));
    return c.toDataURL('image/png').split(',')[1];
  }, g);
  writeFileSync(`${ziel}${g}.png`, Buffer.from(daten, 'base64'));
}
await browser.close();
console.log('Symbole geschrieben:', ziel);
