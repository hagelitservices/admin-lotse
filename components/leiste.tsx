// Die Seitenleiste als reine Ansicht (Spez. §11.2, §11.3): bekommt den Tab-Zustand und Rückrufe, kennt kein `browser`.
// So rendern Seitenleiste und Musterseite (Fotos Z-1 bis Z-16, axe) dieselbe Komponente.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Eintrag } from '../inhalte/schema';
import { ansage, angezeigtZeile, sortieren, statusSchluessel, wichtigste, type Uebersetzer, type UiSprache } from '../lib/ansicht';
import { eintragMit } from '../lib/inhalte';
import type { TabZustand } from '../lib/nachrichten';
import { OHNE_FIRMA, type Firma } from '../lib/firmenmodus';
import type { Bewertung } from '../lib/zustand';
import { Karte } from './karte';
import { LotsenZeichen, Punkt, Zahnrad } from './zeichen';

export const HILFE_ADRESSE = 'https://www.hagel-it.de/leistungen/modern-workplace?utm_source=admin-lotse&utm_medium=erweiterung';
/** Z-2: Der Text „Lese die Seite …“ erscheint erst nach 800 ms, vorher nur das Skelett. */
export const LESE_TEXT_MS = 800;
/** Live-Region: höchstens eine Ansage je 1,5 s (gedrosselt, §11.4). */
export const ANSAGE_MS = 1500;

export interface LeisteProps {
  /** `undefined`: noch keine Nachricht vom Hintergrund (Z-2); `null`: Tab ist kein Portal. */
  zustand: TabZustand | null | undefined;
  bewertungen: Record<string, Bewertung>;
  anzeige: Record<string, string[]>;
  /** `undefined`: noch nicht geladen (dann nichts zeigen, sonst blitzt Z-1 auf). */
  verstanden: boolean | undefined;
  sprache: UiSprache;
  version: string;
  t: Uebersetzer;
  onVerstanden: () => void;
  onErneut: () => void;
  onNavigieren: (adresse: string) => void;
  onNeuLaden: () => void;
  onEinstellungen: () => void;
  /** Firmeneinstellungen (§10); ohne Angabe Normalbetrieb. */
  firma?: Firma;
  /** „Hinweis ausblenden“ (`an = true`) bzw. „Wieder anzeigen“ (Z-11). */
  onAusblenden?: (id: string, an: boolean) => void;
  /** Läuft als Popup statt als Seitenleiste (Edge ohne Leiste, M-8). */
  alsPopup?: boolean;
  /** S8: Störungskasten über dem Inhalt (nur bei Störung gefüllt). */
  stoerung?: ComponentChildren;
}

function useNach(ms: number, an: boolean) {
  const [da, setDa] = useState(false);
  useEffect(() => {
    if (!an) return setDa(false);
    const z = setTimeout(() => setDa(true), ms);
    return () => clearTimeout(z);
  }, [an, ms]);
  return da;
}

/** Gedrosselte Ansage: neue Texte sammeln sich, gesprochen wird der letzte, höchstens alle `ANSAGE_MS`. */
function useAnsage(text: string) {
  const [gesagt, setGesagt] = useState('');
  const zuletzt = useRef(0);
  useEffect(() => {
    const warten = Math.max(0, zuletzt.current + ANSAGE_MS - Date.now());
    const z = setTimeout(() => {
      zuletzt.current = Date.now();
      setGesagt(text);
    }, warten);
    return () => clearTimeout(z);
  }, [text]);
  return gesagt;
}

function Kopf({ titel, t, onEinstellungen }: { titel: string; t: Uebersetzer; onEinstellungen: () => void }) {
  return (
    <header class="kopf">
      <LotsenZeichen klasse="kopf__zeichen" />
      <div class="kopf__text">
        <p class="kopf__marke">{t('erweiterung_kurzname')}</p>
        <h1>{titel}</h1>
      </div>
      <button type="button" class="knopf-symbol" aria-label={t('knopf_einstellungen')} title={t('knopf_einstellungen')} onClick={onEinstellungen}>
        <Zahnrad />
      </button>
    </header>
  );
}

export function Fuss({ version, t, hilfe = true, firma = OHNE_FIRMA }: { version: string; t: Uebersetzer; hilfe?: boolean; firma?: Firma }) {
  // Firmenmodus (§10): eigener Ansprechpartner statt „hagel IT hilft“, oder gar kein Hinweis.
  const kontakt = firma.hilfeKontakt;
  return (
    <footer class="fuss">
      {hilfe && !firma.hilfeAusblenden && (
        <p>
          {t('fuss_frage')}{' '}
          <a href={kontakt?.url ?? HILFE_ADRESSE} target="_blank" rel="noreferrer">
            {kontakt ? t('fuss_hilft_name', kontakt.name) : t('fuss_hilft')}
          </a>
        </p>
      )}
      <p class="fuss__zusage">{t('zusage_kurz')}</p>
      <p>{t('fuss_version', version)}</p>
    </footer>
  );
}

function Band({ eintraege, bewertungen, sprache, t, leseTextZeigen }: { eintraege: Eintrag[]; bewertungen: Record<string, Bewertung>; sprache: UiSprache; t: Uebersetzer; leseTextZeigen: boolean }) {
  return (
    <section class="band" aria-labelledby="band-titel">
      <h2 id="band-titel">{t('band_titel')}</h2>
      <ul>
        {eintraege.map((e) => {
          const b = bewertungen[e.id];
          const status = statusSchluessel(b);
          const zeile = angezeigtZeile(e, b, sprache, t);
          return (
            <li key={e.id} data-band={e.id}>
              {b?.form && b.farbe ? <Punkt form={b.form} farbe={b.farbe} /> : <span class="punkt punkt--leer" aria-hidden="true" />}
              <span class="band__titel">{e.titel[sprache]}</span>
              <span class="band__wert">
                {status && <strong>{t(status)}</strong>}
                {status && zeile && ' · '}
                {zeile}
                {b?.art === 'lese' && (leseTextZeigen ? t('lese_text') : ' ')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Band „Von Ihrer IT eingerichtet“ (§10, Z-10, Z-15): oben, sobald ein verwalteter Wert gesetzt ist. */
export function FirmaBand({ firma, t }: { firma: Firma; t: Uebersetzer }) {
  return (
    <section class="firma" aria-labelledby="firma-titel" data-firma="">
      <h2 id="firma-titel">{t('band_firma')}</h2>
      <p>{t(firma.werteLesen ? 'band_firma_text' : 'werte_aus_firma')}</p>
    </section>
  );
}

function ErsterStart({ t, onVerstanden }: { t: Uebersetzer; onVerstanden: () => void }) {
  return (
    <section class="kasten kasten--hinweis" aria-labelledby="erst-titel">
      <h2 id="erst-titel">{t('erst_titel')}</h2>
      <p>{t('erst_was')}</p>
      <p>{t('erst_zusagen')}</p>
      <p>{t('erst_keine_pruefung')}</p>
      <div>
        <button type="button" class="knopf knopf--aktion" onClick={onVerstanden}>
          {t('knopf_verstanden')}
        </button>
      </div>
    </section>
  );
}

export function Leiste(p: LeisteProps) {
  const { zustand: z, bewertungen, anzeige, sprache, t } = p;
  const firma = p.firma ?? OHNE_FIRMA;
  const eintraege = useMemo(
    () => (z ? z.eintraege.flatMap((id) => (eintragMit(id) ? [eintragMit(id)!] : [])) : []),
    [z?.eintraege.join(' ')],
  );
  const sortiert = useMemo(() => sortieren(eintraege, bewertungen), [eintraege, bewertungen]);
  const liest = z === undefined || Object.values(bewertungen).some((b) => b.art === 'lese');
  const leseTextZeigen = useNach(LESE_TEXT_MS, liest);
  const ohneSkript = z ? !z.skript : false;
  // Z-15: Ohne Lesen keine Statuszeile und kein Band, nur die Erklärungen.
  const ohneStatus = ohneSkript || !firma.werteLesen;
  const gesagt = useAnsage(z && !ohneStatus ? ansage(sortiert.map((e) => bewertungen[e.id]), t) : '');
  const mitStatus = !ohneStatus && sortiert.some((e) => e.leser);
  const titel = z ? t(`portal_${z.portal}`) : t('erweiterung_kurzname');

  let inhalt;
  if (z === undefined || p.verstanden === undefined) {
    inhalt = (
      <div class="leiste__skelett" aria-hidden="true">
        <span class="skelett skelett--karte" />
        <span class="skelett skelett--karte" />
        <p class="lese-text">{leseTextZeigen ? t('lese_text') : ''}</p>
      </div>
    );
  } else if (!p.verstanden) {
    inhalt = <ErsterStart t={t} onVerstanden={p.onVerstanden} />;
  } else if (z === null) {
    inhalt = <p>{t('kein_portal')}</p>;
  } else {
    inhalt = (
      <>
        {ohneSkript && (
          <section class="kasten kasten--hinweis" aria-labelledby="neu-titel">
            <h2 id="neu-titel">{t('neuladen_titel')}</h2>
            <p>{t('neuladen_text')}</p>
            <div>
              <button type="button" class="knopf knopf--aktion" onClick={p.onNeuLaden}>
                {t('knopf_neuladen')}
              </button>
            </div>
          </section>
        )}
        {sortiert.length === 0 ? (
          <section class="kasten" aria-labelledby="leer-titel">
            <h2 id="leer-titel">{t('seitenleiste_leer')}</h2>
            <p>{t('leer_vorschlag')}</p>
            <ul>
              {wichtigste(z.portal).map((w) => (
                <li key={w.id}>
                  <a
                    href={w.adresse}
                    onClick={(ev) => {
                      ev.preventDefault();
                      p.onNavigieren(w.adresse);
                    }}
                  >
                    {w.titel[sprache]}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <>
            {mitStatus && <Band eintraege={sortiert} bewertungen={bewertungen} sprache={sprache} t={t} leseTextZeigen={leseTextZeigen} />}
            {sortiert.map((e) => (
              <Karte
                key={e.id}
                eintrag={e}
                bewertung={bewertungen[e.id]}
                namen={anzeige[e.id]}
                einzige={sortiert.length === 1}
                leseTextZeigen={leseTextZeigen}
                ohneStatus={ohneStatus}
                firmaGrund={firma.bewusst[e.id]}
                sprache={sprache}
                t={t}
                onErneut={p.onErneut}
                onAusblenden={p.onAusblenden ? (an) => p.onAusblenden!(e.id, an) : undefined}
              />
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <div class={p.alsPopup ? 'leiste leiste--popup' : 'leiste'}>
      <Kopf titel={titel} t={t} onEinstellungen={p.onEinstellungen} />
      {firma.verwaltet && p.verstanden && z !== undefined && <FirmaBand firma={firma} t={t} />}
      <div
        class="leiste__inhalt"
        data-schluessel={z?.schluessel ?? ''}
        data-eintraege={z?.eintraege.join(' ') ?? ''}
        data-bewertungen={JSON.stringify(bewertungen)}
        data-abweichungen={z?.abweichungen ?? 0}
        aria-busy={liest}
      >
        {p.stoerung}
        {inhalt}
      </div>
      <p class="nur-vorlesen" aria-live="polite">
        {gesagt}
      </p>
      {z !== null && <Fuss version={p.version} t={t} firma={firma} />}
    </div>
  );
}
