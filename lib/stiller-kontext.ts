/**
 * Ersatz für WXTs `ContentScriptContext` in den Inhalts-Skripten (Alias in `wxt.config.ts`, Prüferbefund H3).
 * WXTs Fassung schickt beim Start in jedem Rahmen ein `CustomEvent` an `document` und eine Fenster-Nachricht an „*“
 * in die Seite — noch bevor `main()` prüfen kann, ob der Rahmen überhaupt zu einem Portal gehört. Das widerspricht
 * „beendet sich sofort“ (Spez. §3.3, §8) und „keine Veränderung an der Seite“ (U-21). Dieser Kontext tut nichts in der
 * Seite. Ein veraltetes Skript nach einem Update erkennt H4 an `browser.runtime.id` (fehlt dann).
 * Nur dieser Ausschnitt der WXT-Schnittstelle ist erlaubt: `isValid`, `isInvalid`, `signal`, `onInvalidated`.
 */
export class ContentScriptContext {
  readonly #abbruch = new AbortController();

  constructor(
    readonly contentScriptName: string,
    readonly options?: unknown,
  ) {}

  get signal(): AbortSignal {
    return this.#abbruch.signal;
  }

  get isInvalid(): boolean {
    if (!this.#abbruch.signal.aborted && !browser.runtime?.id) this.#abbruch.abort('Erweiterung neu geladen');
    return this.#abbruch.signal.aborted;
  }

  get isValid(): boolean {
    return !this.isInvalid;
  }

  onInvalidated(rueckruf: () => void): () => void {
    this.#abbruch.signal.addEventListener('abort', rueckruf);
    return () => this.#abbruch.signal.removeEventListener('abort', rueckruf);
  }
}
