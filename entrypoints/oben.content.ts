import { PORTAL_HOSTS } from '../manifest';
import { obenStarten } from '../lib/oben';

// Nur oberster Rahmen der vier Portale: meldet Seitenwechsel an den Hintergrund (Spez. §3.3, §4.5).
export default defineContentScript({
  matches: [...PORTAL_HOSTS],
  allFrames: false,
  runAt: 'document_idle',
  world: 'ISOLATED',
  main(ctx) {
    obenStarten({
      ort: () => ({ href: location.href, titel: document.title, lang: document.documentElement.lang }),
      senden: (m) => void browser.runtime.sendMessage(m).catch(() => undefined),
      ziel: window,
      signal: ctx.signal,
      gueltig: () => ctx.isValid,
      takt: (r, ms) => setInterval(r, ms),
      taktEnde: (k) => clearInterval(k as number),
    });
  },
});
