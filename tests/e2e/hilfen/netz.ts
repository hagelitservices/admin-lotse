// T-13 (Spez. §14.3, §9): Netz-Wächter für jeden E2E-Kontext. Er zählt jede Anfrage, die von der Erweiterung ausgeht
// und sie verlässt — aus dem Dienstarbeiter, aus einer Erweiterungsseite (Leiste, Popup, Optionen) oder aus einem
// Inhalts-Skript in der Portalseite. Eigene Dateien (`chrome-extension://<id>/…`) zählen nicht, sie gehen nicht ins Netz.
// Zwei Quellen: Playwrights Anfrage-Ereignisse (Dienstarbeiter, Seiten) und ein CDP-Mitschnitt
// (`Network.requestWillBeSent`, Auslöser mit `chrome-extension://` im Aufrufstapel = Inhalts-Skript oder Erweiterungsseite)
// je Seite **und je Rahmen in eigenem Prozess** — die Microsoft-Rahmen `*.reactblade.portal.azure.net` laufen getrennt
// von der Portalseite, eine Seiten-Sitzung sieht ihre Anfragen nicht (Prüferbefund H13).
// Auch eine Anfrage, die CSP oder der Abspieler abblockt, zählt: Es geht um den Versuch, nicht um den Erfolg.
// Ein Mitschnitt, der sich nicht anschließen lässt, ist selbst ein Verstoß — ein blinder Wächter darf nicht grün sein.
import type { BrowserContext, CDPSession, Frame, Page, Request } from '@playwright/test';

const ERWEITERUNG = 'chrome-extension://';

interface Ausloeser {
  url?: string;
  stack?: { callFrames: { url: string }[]; parent?: Ausloeser['stack'] };
}

function stapelUrls(s: Ausloeser['stack']): string[] {
  const aus: string[] = [];
  for (let t = s; t; t = t.parent) for (const f of t.callFrames) aus.push(f.url);
  return aus;
}

const site = (url: string) => {
  try {
    return new URL(url).hostname.split('.').slice(-2).join('.');
  } catch {
    return '';
  }
};

export class NetzWaechter {
  /** Je Verstoß eine Zeile „Quelle → Adresse“. Erwartet: leer. */
  readonly verstoesse: string[] = [];
  /** Seiten mit CDP-Mitschnitt. */
  seiten = 0;
  /** Rahmen in eigenem Prozess mit CDP-Mitschnitt (Entra/Intune: die `reactblade`-Rahmen). */
  rahmen = 0;
  private angeschlossen = new WeakSet<Frame>();

  private eigen(url: string): boolean {
    return url.startsWith(ERWEITERUNG);
  }

  private quelle(r: Request): string | null {
    const sw = r.serviceWorker();
    if (sw) return sw.url().startsWith(ERWEITERUNG) ? 'Dienstarbeiter' : null;
    let rahmen: string;
    try {
      rahmen = r.frame().url();
    } catch {
      return null;
    }
    return rahmen.startsWith(ERWEITERUNG) ? `Erweiterungsseite ${new URL(rahmen).pathname}` : null;
  }

  private async mitschneiden(s: CDPSession): Promise<void> {
    s.on('Network.requestWillBeSent', (e: { request: { url: string }; initiator: Ausloeser; documentURL?: string }) => {
      if (this.eigen(e.request.url)) return;
      const aus = [e.initiator.url ?? '', ...stapelUrls(e.initiator.stack)].find((u) => u.startsWith(ERWEITERUNG));
      if (aus || (e.documentURL ?? '').startsWith(ERWEITERUNG)) this.verstoesse.push(`CDP ${aus ?? e.documentURL} → ${e.request.url}`);
    });
    await s.send('Network.enable');
  }

  /** Rahmen einer anderen Site als sein Elternrahmen läuft in eigenem Prozess (Site-Isolation): eigene Sitzung. */
  private async rahmenAnschliessen(f: Frame): Promise<void> {
    const eltern = f.parentFrame();
    if (!eltern || this.angeschlossen.has(f) || !f.url().startsWith('https://') || site(f.url()) === site(eltern.url())) return;
    this.angeschlossen.add(f);
    try {
      await this.mitschneiden(await f.page().context().newCDPSession(f));
      this.rahmen++;
    } catch (e) {
      const grund = (e as Error).message.split('\n')[0] ?? '';
      // Ziel schon geschlossen (gemessen H17b: Microsofts Token-Rahmen verschwindet beim Anschließen): Was nicht mehr da ist,
      // sendet nichts mehr — kein blinder Fleck. Jeder andere Fehler bleibt ein Verstoß.
      const weg = f.isDetached() || f.page().isClosed() || /Target page, context or browser has been closed|Target closed/.test(grund);
      if (!weg) this.verstoesse.push(`CDP-Mitschnitt nicht angeschlossen (Rahmen ${f.url()}): ${grund}`);
    }
  }

  private async seite(p: Page): Promise<void> {
    // Fixtures sind ohne Skript: Jede WebSocket-Verbindung im Testlauf ist verdächtig, gleich von wem.
    p.on('websocket', (w) => this.verstoesse.push(`WebSocket → ${w.url()}`));
    p.on('framenavigated', (f) => void this.rahmenAnschliessen(f));
    try {
      await this.mitschneiden(await p.context().newCDPSession(p));
      this.seiten++;
    } catch (e) {
      if (!p.isClosed()) this.verstoesse.push(`CDP-Mitschnitt nicht angeschlossen (Seite ${p.url()}): ${(e as Error).message.split('\n')[0]}`);
    }
  }

  async installieren(kontext: BrowserContext): Promise<void> {
    kontext.on('request', (r) => {
      const q = this.quelle(r);
      if (q && !this.eigen(r.url())) this.verstoesse.push(`${q} → ${r.url()}`);
    });
    kontext.on('page', (p) => void this.seite(p));
    await Promise.all(kontext.pages().map((p) => this.seite(p)));
  }

  /** Für `afterAll`: Verstöße und ob überhaupt mitgeschnitten wurde. */
  bericht(): { verstoesse: string[]; blind: boolean } {
    return { verstoesse: [...this.verstoesse], blind: this.seiten === 0 };
  }
}
