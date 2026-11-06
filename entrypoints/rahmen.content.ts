import { PORTAL_HOSTS, RAHMEN_HERKUNFT } from '../manifest';
import { rahmenStarten } from '../lib/rahmen';

// Alle Rahmen, auch die eingebetteten Herkünfte aus H2; Abbruch über `ancestorOrigins` (Spez. §3.3, §8).
export default defineContentScript({
  matches: [...PORTAL_HOSTS, RAHMEN_HERKUNFT],
  allFrames: true,
  runAt: 'document_idle',
  world: 'ISOLATED',
  main(ctx) {
    rahmenStarten({
      ort: location,
      oben: window.top === window,
      dokument: document,
      hoeren: (r) => browser.runtime.onMessage.addListener((n) => void r(n)),
      senden: (m) => void browser.runtime.sendMessage(m).catch(() => undefined),
      gueltig: () => ctx.isValid,
      beiEnde: (r) => window.addEventListener('pagehide', (e) => void (e.persisted || r()), { signal: ctx.signal }),
      jetzt: () => Date.now(),
      wecken: (r, ms) => setTimeout(r, ms),
      weckerEnde: (k) => clearTimeout(k as number),
      // T-19: Messpunkt nur im Testbau; im Store-Paket entfernt der Bau den Zweig (U-43b).
      ...(__LOTSE_MUSTER__
        ? { messen: { uhr: () => performance.now(), melden: (ms: number) => void browser.runtime.sendMessage({ art: 'messpunkt', ms }).catch(() => undefined) } }
        : {}),
    });
  },
});
