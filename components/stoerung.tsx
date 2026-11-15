// Störungsanzeige (S8): Kasten im Popup und in der Seitenleiste. Reine Ansicht, kennt kein `browser`.
// Gestört → Überschrift, je Dienst ein Link auf die Statusseite, Prüfzeit. Popup zeigt auch „keine Störung“ und
// „nicht abrufbar“ (Grau ist kein Grün); die Seitenleiste nur die Störung, damit sie ruhig bleibt.
import type { Uebersetzer } from '../lib/ansicht';
import { dienstName, dienstSeite, uhrzeit, type Stand } from '../lib/stoerung';
import { Punkt } from './zeichen';

export interface StoerungProps {
  t: Uebersetzer;
  /** Störungsanzeige eingeschaltet (Nutzer oder Firma). Aus → nichts. */
  an: boolean;
  stand: Stand | null;
  /** `true`: nur bei Störung etwas zeigen (Seitenleiste). */
  nurStoerung?: boolean;
}

export function StoerungKasten({ t, an, stand, nurStoerung = false }: StoerungProps) {
  if (!an) return null;
  const gestoert = stand?.gestoert ?? [];
  if (stand && gestoert.length > 0) {
    return (
      <section class="kasten kasten--stoerung" aria-labelledby="stoerung-titel" data-stoerung={gestoert.join(' ')}>
        <h2 id="stoerung-titel">
          <Punkt form="quadrat" farbe="down" /> {t('stoerung_titel')}
        </h2>
        <ul>
          {gestoert.map((id) => (
            <li key={id}>
              <a href={dienstSeite(id)} target="_blank" rel="noreferrer">
                {t('stoerung_link', dienstName(id))}
              </a>
            </li>
          ))}
        </ul>
        <p class="stoerung__stand">{t('stoerung_stand', uhrzeit(stand.geprueft))}</p>
      </section>
    );
  }
  if (nurStoerung) return null;
  return (
    <p class="stoerung__ruhig" data-stoerung={stand ? 'keine' : 'unbekannt'}>
      {stand ? t('stoerung_keine', uhrzeit(stand.geprueft)) : t('stoerung_unbekannt')}
    </p>
  );
}
