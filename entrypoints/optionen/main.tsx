import '../../components/bausteine.css';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Fuss } from '../../components/leiste';
import { LotsenZeichen } from '../../components/zeichen';
import { ausblenden, ausgeblendetLaden, beiAenderung, firmaLaden, nutzerAnzeigeLaden, nutzerAnzeigeSetzen } from '../../lib/einstellungen';
import { OHNE_FIRMA, type Firma } from '../../lib/firmenmodus';
import { text } from '../../lib/i18n';
import { eintragMit } from '../../lib/inhalte';
import { startKastenZeigen } from '../../lib/flaeche';
import { seiteVorbereiten } from '../../lib/oberflaeche';

// Einstellungen (Spez. §11, §10): Zusagen, ausgeblendete Hinweise mit „Wieder anzeigen“ (Z-11), Vorgaben der Firma.
const sprache = await seiteVorbereiten('optionen_titel');

function Ansicht() {
  const [liste, setListe] = useState<string[] | undefined>(undefined);
  const [firma, setFirma] = useState<Firma>(OHNE_FIRMA);
  const [nutzerAnzeige, setNutzerAnzeige] = useState(false);
  useEffect(() => {
    const laden = () => {
      void nutzerAnzeigeLaden().then(setNutzerAnzeige);
      void ausgeblendetLaden().then(setListe);
      void firmaLaden().then(setFirma);
    };
    laden();
    return beiAenderung(laden);
  }, []);
  const firmaIds = Object.keys(firma.bewusst);
  // H17d: Nach der Installation (`#start`) Kasten hervorheben und Fokus auf seine Überschrift; bei Installation per
  // Richtlinie (Symbol fest angeheftet, §10) gar kein Kasten.
  const start = location.hash === '#start';
  const startRef = useRef<HTMLHeadingElement>(null);
  const [kasten, setKasten] = useState(false);
  useEffect(() => {
    void browser.management.getSelf().then((ich) => setKasten(startKastenZeigen(ich.installType)), () => setKasten(true));
  }, []);
  useEffect(() => {
    if (start && kasten) startRef.current?.focus();
  }, [kasten]);
  // Fokus nach „Wieder anzeigen“: auf den Knopf an derselben Stelle (oder den letzten), bei leerer Liste auf die Überschrift.
  const fokusStelle = useRef<number | null>(null);
  const listeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const stelle = fokusStelle.current;
    if (stelle === null || liste === undefined) return;
    fokusStelle.current = null;
    const knoepfe = listeRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const ziel = knoepfe[Math.min(stelle, knoepfe.length - 1)];
    if (ziel) ziel.focus();
    else listeRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [liste]);

  return (
    <div class="seite">
      <header class="kopf">
        <LotsenZeichen klasse="kopf__zeichen" />
        <div class="kopf__text">
          <p class="kopf__marke">{text('erweiterung_kurzname')}</p>
          <h1>{text('optionen_titel')}</h1>
        </div>
      </header>
      {kasten && (
        <section id="start" class={start ? 'kasten kasten--hinweis' : 'kasten'} aria-labelledby="opt-start">
          <h2 id="opt-start" ref={startRef} tabIndex={-1}>{text('start_titel')}</h2>
          <ol class="schritte-start">
            <li>{text('start_schritt_1')}</li>
            <li>{text('start_schritt_2')}</li>
            <li>{text('start_schritt_3')}</li>
          </ol>
          <p>{text('start_zahl')}</p>
        </section>
      )}
      <section class="kasten" aria-labelledby="opt-zusagen">
        <h2 id="opt-zusagen">{text('optionen_zusagen_titel')}</h2>
        <p>{text('erst_was')}</p>
        <p>{text('erst_zusagen')}</p>
        <p>{text('optionen_daten')}</p>
      </section>
      <section class="kasten" aria-labelledby="opt-stoerung" data-stoerungsanzeige={String(firma.stoerungsanzeige ?? nutzerAnzeige)}>
        <h2 id="opt-stoerung">{text('optionen_stoerung_titel')}</h2>
        <label class="schalter">
          <input
            type="checkbox"
            role="switch"
            checked={firma.stoerungsanzeige ?? nutzerAnzeige}
            disabled={firma.stoerungsanzeige !== null}
            aria-describedby="opt-stoerung-text"
            onChange={(e) => void nutzerAnzeigeSetzen((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>{text('optionen_stoerung_schalter')}</span>
        </label>
        <p id="opt-stoerung-text">
          {/* Die Adresse nie am Bindestrich umbrechen („www.hagel-“ / „it.de“ las sich auf 320 px wie zwei Wörter, T-22). */}
          {text('optionen_stoerung_text')
            .split(/(www\.hagel-it\.de)/)
            .map((teil, i) => (i % 2 === 1 ? <span key={i} class="adresse">{teil}</span> : teil))}
        </p>
        <p>{text('optionen_stoerung_was')}</p>
        {firma.stoerungsanzeige !== null && <p>{text(firma.stoerungsanzeige ? 'optionen_stoerung_firma_an' : 'optionen_stoerung_firma_aus')}</p>}
      </section>
      <section ref={listeRef} class="kasten" aria-labelledby="opt-aus" data-ausgeblendet={liste?.join(' ') ?? ''}>
        <h2 id="opt-aus" tabIndex={-1}>{text('optionen_ausgeblendet_titel')}</h2>
        {liste !== undefined && liste.length === 0 && <p>{text('optionen_ausgeblendet_leer')}</p>}
        {liste !== undefined && liste.length > 0 && (
          <ul class="liste-aus">
            {liste.map((id, i) => (
              <li key={id}>
                <span>{eintragMit(id)?.titel[sprache] ?? id}</span>
                <button type="button" class="knopf knopf--still" aria-label={`${text('knopf_wieder')}: ${eintragMit(id)?.titel[sprache] ?? id}`} onClick={() => {
                    fokusStelle.current = i;
                    void ausblenden(id, false);
                  }}
                >
                  {text('knopf_wieder')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {firma.verwaltet && (
        <section class="kasten" aria-labelledby="opt-firma" data-firma="">
          <h2 id="opt-firma">{text('band_firma')}</h2>
          <p>{text('band_firma_text')}</p>
          {!firma.werteLesen && <p>{text('optionen_werte_aus')}</p>}
          {firmaIds.length > 0 && (
            <>
              <p>{text('optionen_firma_bewusst')}</p>
              <ul class="liste-aus">
                {firmaIds.map((id) => (
                  <li key={id}>
                    <span>
                      <strong>{eintragMit(id)?.titel[sprache] ?? id}</strong> — {firma.bewusst[id]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <Fuss version={browser.runtime.getManifest().version} t={text} firma={firma} />
    </div>
  );
}

render(<Ansicht />, document.querySelector('main')!);
