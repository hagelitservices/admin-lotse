// Texte aus `_locales` (Rahmen E9). Fehlt ein Schlüssel, steht der Schlüssel selbst da — U-45 verhindert das.
// Firmenmodus `sprache` (Spez. §10): `getMessage` folgt immer der Browsersprache. Setzt die Firma eine feste Sprache,
// lädt `spracheFestlegen` die passende `messages.json` als eigenes Stück des Bündels (kein `fetch`, U-43) und `text`
// liest dann dort.

type Meldungen = Record<string, { message: string }>;
let fest: Meldungen | null = null;

/** `$1`…`$9` wie `getMessage` (die Dateien nutzen keine benannten Platzhalter, U-45). */
export function einsetzen(vorlage: string, ersetzungen: readonly string[]): string {
  return vorlage.replace(/\$(\d)/g, (_, n: string) => ersetzungen[Number(n) - 1] ?? '');
}

export function text(schluessel: string, ...ersetzungen: string[]): string {
  if (fest) {
    const m = fest[schluessel]?.message;
    return m ? einsetzen(m, ersetzungen) : schluessel;
  }
  return browser.i18n.getMessage(schluessel as never, ersetzungen) || schluessel;
}

/** `'auto'` (oder ein Ladefehler) lässt die Wahl des Browsers stehen. */
export async function spracheFestlegen(sprache: 'auto' | 'de' | 'en'): Promise<void> {
  if (sprache === 'auto') {
    fest = null;
    return;
  }
  try {
    const m = sprache === 'de' ? await import('../public/_locales/de/messages.json') : await import('../public/_locales/en/messages.json');
    fest = m.default as Meldungen;
  } catch {
    fest = null;
  }
}
