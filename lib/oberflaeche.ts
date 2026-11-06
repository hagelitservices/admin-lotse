// Gemeinsames der drei Erweiterungsseiten: Sprache der Oberfläche, Übersetzer, Grundgerüst des Dokuments.
import type { UiSprache } from './ansicht';
import { firmaAus } from './firmenmodus';
import { spracheFestlegen, text } from './i18n';

// Die Sprache kommt aus derselben Wahl wie die Texte (`getMessage`), nicht aus `getUILanguage()`: Unter macOS meldet diese
// „en-US“, während Chrome die deutschen Texte nimmt (gemessen H11a) — sonst stünden englische Inhalte neben deutschen Knöpfen.
export const uiSprache = (): UiSprache => (text('sprache') === 'de' ? 'de' : 'en');

const KEINE_IDS: ReadonlySet<string> = new Set();
const TEST_SCHLUESSEL = 'test:verwaltet';

/** Feste Sprache der Firma (Spez. §10) — ohne die Inhaltsliste, damit auch das kleine Popup sie lesen kann. */
async function firmenSprache(): Promise<'auto' | 'de' | 'en'> {
  try {
    const roh = __LOTSE_MUSTER__ ? (await browser.storage.local.get(TEST_SCHLUESSEL))[TEST_SCHLUESSEL] : await browser.storage.managed.get(null);
    return firmaAus(roh, KEINE_IDS).sprache;
  } catch {
    return 'auto';
  }
}

/**
 * Vor dem ersten Zeichnen: feste Sprache der Firma laden, `lang` und Titel setzen. Ändert die Firma die Sprache später,
 * lädt die Seite neu — alle Texte und Inhalte wechseln dann zugleich.
 */
export async function seiteVorbereiten(titelSchluessel: string): Promise<UiSprache> {
  const gewaehlt = await firmenSprache();
  await spracheFestlegen(gewaehlt);
  const sprache = uiSprache();
  document.documentElement.lang = sprache;
  document.title = text(titelSchluessel);
  browser.storage.onChanged.addListener((c, bereich) => {
    if (bereich !== 'managed' && !(__LOTSE_MUSTER__ && bereich === 'local' && TEST_SCHLUESSEL in c)) return;
    void firmenSprache().then((neu) => {
      if (neu !== gewaehlt) location.reload();
    });
  });
  return sprache;
}

/** Erster Start (Z-1): einmal „Verstanden“, gilt für alle Tabs. Nur dieser eine Wert liegt in `storage.local`. */
export const VERSTANDEN = 'verstanden';
