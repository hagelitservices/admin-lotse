import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { inhalteLesen } from './inhalte/pruefen';
import { manifestFuer } from './manifest';

// Spez. §3.2: WXT + Preact, ein Codebestand für Chrome (`wxt build`) und Edge (`wxt build -b edge`).
// `modulePreload: false`: Vites Vorlade-Polyfill bringt sonst `fetch(` ins Bündel (gemessen H3, U-43).
// Alias: WXTs Inhalts-Skript-Kontext feuert beim Start Ereignisse in die Seite — ersetzt durch lib/stiller-kontext.ts.
// Testbau mit Musterseite (`LOTSE_MUSTER=1`, Ausgabe `<browser>-mv3-muster`): zeigt jeden Zustand aus Spez. §11.3 für
// Fotos, axe und Tastatur. Das Store-Paket kennt die Seite nicht.
const MUSTER = process.env.LOTSE_MUSTER === '1';
const EINSTIEGE = ['background', 'oben', 'rahmen', 'seitenleiste', 'ausserhalb', 'optionen'];

export default defineConfig({
  vite: () => ({
    plugins: [preact()],
    build: { modulePreload: false },
    // Im Store-Paket `false`: der Zweig mit dem Ersatz für `storage.managed` fällt beim Bündeln weg (lib/einstellungen.ts).
    define: { __LOTSE_MUSTER__: JSON.stringify(MUSTER) },
    resolve: {
      alias: [
        {
          find: /^wxt\/utils\/content-script-context$/,
          replacement: fileURLToPath(new URL('./lib/stiller-kontext.ts', import.meta.url)),
        },
      ],
    },
  }),
  // Spez. §3.1: Das Schema prüft die Inhalte beim Bau; ein ungültiger Eintrag stoppt ihn.
  hooks: { 'build:before': () => void inhalteLesen() },
  manifest: () => manifestFuer(),
  filterEntrypoints: MUSTER ? [...EINSTIEGE, 'muster'] : EINSTIEGE,
  outDirTemplate: MUSTER ? '{{browser}}-mv{{manifestVersion}}-muster' : '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
});
