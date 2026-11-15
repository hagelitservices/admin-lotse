// Popup außerhalb der Portale (Spez. §11.1, Z-16): ein Satz Zweck, die vier Portale als Links. Fehlt der Seitenzugriff
// (Z-12), steht davor die Erklärung mit einem Knopf je fehlender Herkunft.
import { PORTAL_START } from '../lib/adressen';
import type { Uebersetzer } from '../lib/ansicht';
import { hostVon, type Herkunft } from '../lib/zugriff';
import { Fuss } from './leiste';
import { LotsenZeichen } from './zeichen';
import type { ComponentChildren } from 'preact';

const PORTALE = ['m365', 'entra', 'intune', 'exo'] as const;

export interface AusserhalbProps {
  t: Uebersetzer;
  version: string;
  /** Z-12: Herkünfte ohne Zugriff, die angeboten werden. */
  fehlend?: Herkunft[];
  /** Die Herkunft gehört zum aktuellen Tab (dann Einzahl-Text). */
  imTab?: boolean;
  abgelehnt?: boolean;
  onErlauben?: (h: Herkunft) => void;
  /** S8: Störungskasten, steht vor allem anderen (Antwort zuerst). */
  stoerung?: ComponentChildren;
}

export function Ausserhalb({ t, version, fehlend = [], imTab = false, abgelehnt = false, onErlauben, stoerung }: AusserhalbProps) {
  const zugriff = fehlend.length > 0;
  return (
    <div class="popup">
      <header class="kopf">
        <LotsenZeichen klasse="kopf__zeichen" />
        <div class="kopf__text">
          <h1>{t('erweiterung_kurzname')}</h1>
        </div>
      </header>
      <div class="leiste__inhalt" data-zugriff={fehlend.join(' ')}>
        {stoerung}
        {zugriff && (
          <section class="kasten kasten--hinweis" aria-labelledby="zugriff-titel">
            <h2 id="zugriff-titel">{t(imTab ? 'zugriff_titel' : 'zugriff_fehlt_titel')}</h2>
            <p>{t('zugriff_text', fehlend.map(hostVon).join(', '))}</p>
            {fehlend.map((h) => (
              <button key={h} type="button" class="knopf knopf--aktion zugriff-knopf" data-herkunft={h} onClick={() => onErlauben?.(h)}>
                {t('knopf_erlauben', hostVon(h))}
              </button>
            ))}
            {/* Live-Region steht von Anfang an; nur der Text kommt dazu, sonst sagen VoiceOver und NVDA nichts an. */}
            <p role="status" class="zugriff-abgelehnt">
              {abgelehnt ? t('zugriff_abgelehnt') : ''}
            </p>
            <p>{t('zugriff_weg', hostVon(fehlend[0]!))}</p>
            <p>{t('zugriff_zusage')}</p>
          </section>
        )}
        {!(zugriff && imTab) && (
          <section class="kasten" aria-labelledby="aus-titel">
            <h2 id="aus-titel">{t('ausserhalb_titel')}</h2>
            <p>{t('ausserhalb_hinweis')}</p>
            <ul>
              {PORTALE.map((p) => (
                <li key={p}>
                  <a href={PORTAL_START[p]} target="_blank" rel="noreferrer">
                    {t(`portal_${p}`)}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <Fuss version={version} t={t} hilfe={false} />
    </div>
  );
}
