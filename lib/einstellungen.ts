// Gespeicherte Einstellungen für Hintergrund, Seitenleiste und Optionen (Spez. §9, §10): ausgeblendete Hinweise in
// `storage.local`, Firmeneinstellungen aus `storage.managed`. Im Testbau (`LOTSE_MUSTER=1`) ersetzt der Schlüssel
// `test:verwaltet` in `storage.local` die Richtlinie (T-11); das Store-Paket enthält diesen Zweig nicht (U-43b).
import { firmaAus, ausgeblendetAus, OHNE_FIRMA, type Firma } from './firmenmodus';
import { AKTIVE_EINTRAEGE } from './inhalte';

export const AUSGEBLENDET = 'ausgeblendet';
const IDS: ReadonlySet<string> = new Set(AKTIVE_EINTRAEGE.map((e) => e.id));

export async function firmaLaden(): Promise<Firma> {
  try {
    const roh = __LOTSE_MUSTER__
      ? (await browser.storage.local.get('test:verwaltet'))['test:verwaltet']
      : await browser.storage.managed.get(null);
    return firmaAus(roh, IDS);
  } catch {
    // Ohne Richtlinie (oder Edge ohne `storage.managed`) gilt der Normalbetrieb.
    return OHNE_FIRMA;
  }
}

export async function ausgeblendetLaden(): Promise<string[]> {
  return ausgeblendetAus((await browser.storage.local.get(AUSGEBLENDET))[AUSGEBLENDET], IDS);
}

export async function ausblenden(id: string, an: boolean): Promise<void> {
  const alt = await ausgeblendetLaden();
  const neu = an ? [...new Set([...alt, id])] : alt.filter((x) => x !== id);
  await browser.storage.local.set({ [AUSGEBLENDET]: neu });
}

/** Ruft `neu` bei jeder Änderung an Firmeneinstellungen oder ausgeblendeten Hinweisen. */
export function beiAenderung(neu: () => void): () => void {
  const hoeren = (c: Record<string, unknown>, bereich: string) => {
    if (bereich === 'managed' || (bereich === 'local' && (AUSGEBLENDET in c || (__LOTSE_MUSTER__ && 'test:verwaltet' in c)))) neu();
  };
  browser.storage.onChanged.addListener(hoeren);
  return () => browser.storage.onChanged.removeListener(hoeren);
}
