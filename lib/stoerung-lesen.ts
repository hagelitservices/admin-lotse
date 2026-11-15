// Störungsanzeige (S8) für die Erweiterungsseiten: Schalter (Firma vor Nutzer) und Stand aus `storage.session`, mit
// Nachziehen bei jeder Änderung. Fragt selbst nichts ab — das tut allein der Dienstarbeiter.
import { useEffect, useState } from 'preact/hooks';
import { firmaLaden, nutzerAnzeigeLaden } from './einstellungen';
import { SCHALTER, STAND, anzeigeAn, gespeicherterStand, type Stand } from './stoerung';

export function useStoerung(): { an: boolean; stand: Stand | null } {
  const [lage, setLage] = useState<{ an: boolean; stand: Stand | null }>({ an: false, stand: null });
  useEffect(() => {
    const laden = async () => {
      const [firma, nutzer, s] = await Promise.all([firmaLaden(), nutzerAnzeigeLaden(), browser.storage.session.get(STAND)]);
      setLage({ an: anzeigeAn(firma.stoerungsanzeige, nutzer), stand: gespeicherterStand(s[STAND], Date.now()) });
    };
    void laden();
    const hoeren = (c: Record<string, unknown>, bereich: string) => {
      if (bereich === 'managed' || (bereich === 'local' && SCHALTER in c) || (bereich === 'session' && STAND in c)) void laden();
    };
    browser.storage.onChanged.addListener(hoeren);
    return () => browser.storage.onChanged.removeListener(hoeren);
  }, []);
  return lage;
}
