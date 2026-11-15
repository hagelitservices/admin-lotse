import '../../components/bausteine.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Ausserhalb } from '../../components/ausserhalb';
import { StoerungKasten } from '../../components/stoerung';
import { useStoerung } from '../../lib/stoerung-lesen';
import { text } from '../../lib/i18n';
import { seiteVorbereiten } from '../../lib/oberflaeche';
import { fehlendeHerkuenfte, herkunftVon, HERKUENFTE, type Herkunft } from '../../lib/zugriff';

// Popup in jedem Tab außerhalb der vier Portale (Spez. §11.1, Z-16) — und in Portal-Tabs, deren Zugriff der Nutzer
// eingeschränkt hat (Z-12): Ohne `tabs`-Recht sieht das Popup die Adresse nur dort, wo es Zugriff hat.
await seiteVorbereiten('erweiterung_name');

function Ansicht() {
  const [lage, setLage] = useState<{ fehlend: Herkunft[]; imTab: boolean; tabId?: number }>({ fehlend: [], imTab: false });
  const [abgelehnt, setAbgelehnt] = useState(false);
  const stoerung = useStoerung();
  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const erlaubt = Object.fromEntries(
        await Promise.all(HERKUENFTE.map(async (h) => [h, await browser.permissions.contains({ origins: [h] })] as const)),
      ) as Record<Herkunft, boolean>;
      const fehlend = fehlendeHerkuenfte(tab?.url, erlaubt);
      setLage({ fehlend, imTab: herkunftVon(tab?.url) !== undefined, tabId: tab?.id });
    })();
  }, []);
  return (
    <Ausserhalb
      t={text}
      version={browser.runtime.getManifest().version}
      fehlend={lage.fehlend}
      imTab={lage.imTab}
      abgelehnt={abgelehnt}
      stoerung={<StoerungKasten t={text} an={stoerung.an} stand={stoerung.stand} />}
      // Direkt im Klick (Geste). Danach lädt der Tab neu, damit das Inhalts-Skript läuft; der Hintergrund hört `onAdded`.
      onErlauben={(h) =>
        void browser.permissions.request({ origins: [h] }).then((ok) => {
          if (!ok) return setAbgelehnt(true);
          if (lage.imTab && lage.tabId !== undefined) void browser.tabs.reload(lage.tabId);
          window.close();
        })
      }
    />
  );
}

render(<Ansicht />, document.querySelector('main')!);
