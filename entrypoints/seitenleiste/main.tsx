import '../../components/bausteine.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Leiste } from '../../components/leiste';
import { text } from '../../lib/i18n';
import { PORT_PRAEFIX, type TabZustand, type ZustandMeldung } from '../../lib/nachrichten';
import { ausblenden, beiAenderung, firmaLaden } from '../../lib/einstellungen';
import { alsPopup } from '../../lib/flaeche';
import { OHNE_FIRMA, type Firma } from '../../lib/firmenmodus';
import { seiteVorbereiten, VERSTANDEN } from '../../lib/oberflaeche';

// Seitenleiste je Tab (Spez. §3.3, §11). Der Tab steht in der Adresse (`?tab=<id>`, gesetzt per sidePanel.setOptions);
// der Hintergrund schiebt den Zustand über den Port nach.
const tabId = Number(new URLSearchParams(location.search).get('tab'));
const sprache = await seiteVorbereiten('erweiterung_name');
const version = browser.runtime.getManifest().version;
// Edge ohne Seitenleiste (M-8): dieselbe Ansicht im Popup.
const popup = alsPopup(location.search);

function Ansicht() {
  const [zustand, setZustand] = useState<TabZustand | null | undefined>(Number.isInteger(tabId) && tabId > 0 ? undefined : null);
  const [bewertungen, setBewertungen] = useState<ZustandMeldung['bewertungen']>({});
  const [anzeige, setAnzeige] = useState<ZustandMeldung['anzeige']>({});
  const [verstanden, setVerstanden] = useState<boolean | undefined>(undefined);
  const [firma, setFirma] = useState<Firma>(OHNE_FIRMA);
  const [port, setPort] = useState<ReturnType<typeof browser.runtime.connect> | null>(null);

  useEffect(() => {
    void browser.storage.local.get(VERSTANDEN).then((w) => setVerstanden(w[VERSTANDEN] === true));
    const aenderung = (c: Record<string, { newValue?: unknown }>, bereich: string) => {
      if (bereich === 'local' && VERSTANDEN in c) setVerstanden(c[VERSTANDEN]?.newValue === true);
    };
    browser.storage.onChanged.addListener(aenderung);
    const laden = () => void firmaLaden().then(setFirma);
    laden();
    const ab = beiAenderung(laden);
    return () => {
      browser.storage.onChanged.removeListener(aenderung);
      ab();
    };
  }, []);

  useEffect(() => {
    if (!Number.isInteger(tabId) || tabId <= 0) return;
    let aus = false;
    let aktuell: ReturnType<typeof browser.runtime.connect> | null = null;
    const verbinden = () => {
      if (aus) return;
      aktuell = browser.runtime.connect({ name: PORT_PRAEFIX + tabId });
      setPort(aktuell);
      aktuell.onMessage.addListener((m: ZustandMeldung) => {
        if (m.art !== 'zustand') return;
        setZustand(m.zustand);
        setBewertungen(m.bewertungen);
        setAnzeige(m.anzeige ?? {});
      });
      // Schläft der Dienstarbeiter ein, reißt der Port ab: neu verbinden, Zustand kommt aus storage.session.
      aktuell.onDisconnect.addListener(() => setTimeout(verbinden, 100));
    };
    verbinden();
    return () => {
      aus = true;
      aktuell?.disconnect();
    };
  }, []);

  return (
    <Leiste
      zustand={zustand}
      bewertungen={bewertungen}
      anzeige={anzeige}
      verstanden={verstanden}
      sprache={sprache}
      version={version}
      t={text}
      onVerstanden={() => void browser.storage.local.set({ [VERSTANDEN]: true })}
      onErneut={() => port?.postMessage({ art: 'erneut' })}
      // Ohne `tabs`-Recht erlaubt: Adresse des eigenen Tabs setzen und neu laden (Z-3, Z-14).
      onNavigieren={(adresse) => void browser.tabs.update(tabId, { url: adresse })}
      onNeuLaden={() => void browser.tabs.reload(tabId)}
      onEinstellungen={() => void browser.runtime.openOptionsPage()}
      firma={firma}
      // Der Hintergrund hört auf `storage.local` und bewertet neu (Z-11, Abzeichen).
      onAusblenden={(id, an) => void ausblenden(id, an)}
      alsPopup={popup}
    />
  );
}

render(<Ansicht />, document.querySelector('main')!);
