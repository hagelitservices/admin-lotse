// Karte je Eintrag (Spez. §11.2 Nr. 3, Zustände Z-4 bis Z-8). Kopf als Knopf mit aria-expanded, Höhe 150 ms (§11.4).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Eintrag } from '../inhalte/schema';
import {
  anfangsOffen,
  angezeigtZeile,
  grundSchluessel,
  lizenzSchluessel,
  quelleAdresse,
  statusSchluessel,
  type Uebersetzer,
  type UiSprache,
} from '../lib/ansicht';
import { indexSaetze } from '../lib/inhalte';
import type { Bewertung } from '../lib/zustand';
import { Pfeil, Punkt } from './zeichen';

export interface KarteProps {
  eintrag: Eintrag;
  bewertung: Bewertung | undefined;
  /** Domainnamen (Art `domains`), nur zum Anzeigen. */
  namen?: string[];
  einzige: boolean;
  /** Text „Lese die Seite …“ erst nach 800 ms (Z-2). */
  leseTextZeigen: boolean;
  /** Ohne Inhalts-Skript (Z-14) gibt es keine Statuszeile. */
  ohneStatus: boolean;
  /** Begründung der Firma, wenn sie diese Abweichung als bewusst markiert hat (Z-10). */
  firmaGrund?: string;
  sprache: UiSprache;
  t: Uebersetzer;
  onErneut: () => void;
  /** Fehlt, wo nichts ausgeblendet werden darf (Musterseite ohne Rückruf, Z-15). */
  onAusblenden?: (an: boolean) => void;
}

function datum(iso: string, sprache: UiSprache) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(sprache === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function Karte({ eintrag: e, bewertung: b, namen, einzige, leseTextZeigen, ohneStatus, firmaGrund, sprache, t, onErneut, onAusblenden }: KarteProps) {
  const [offen, setOffen] = useState(() => anfangsOffen(b, einzige));
  // Kommt das Ergebnis erst nach dem Lesen, entscheidet es, ob die Karte offen steht; danach nur noch der Nutzer.
  const vorher = useRef(b?.art);
  useEffect(() => {
    if (vorher.current === 'lese' && b?.art !== 'lese') setOffen(anfangsOffen(b, einzige));
    vorher.current = b?.art;
  }, [b?.art]);

  // Fokus folgt dem Knopf (§11.4, volle Tastaturbedienung): Nach „Hinweis ausblenden“ verschwindet der Knopf, also geht
  // der Fokus auf „Wieder anzeigen“ — und umgekehrt auf den Kartenkopf.
  const fokusNach = useRef<'wieder' | 'kopf' | null>(null);
  const wiederRef = useRef<HTMLButtonElement>(null);
  const kopfRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (fokusNach.current === 'wieder' && wiederRef.current) wiederRef.current.focus();
    else if (fokusNach.current === 'kopf' && b?.art !== 'bewusst') kopfRef.current?.focus();
    else return;
    fokusNach.current = null;
  }, [b?.art, b?.von]);

  const kennung = `karte-${e.id}`;
  const nutzerBewusst = !ohneStatus && b?.art === 'bewusst' && b.von === 'nutzer';
  const firmaBewusst = !ohneStatus && b?.art === 'bewusst' && b.von === 'firma';
  const ausblendbar = !ohneStatus && b?.art === 'weicht-ab' && onAusblenden !== undefined;
  const status = ohneStatus ? null : statusSchluessel(b);
  const zeile = ohneStatus ? null : angezeigtZeile(e, b, sprache, t);
  const lese = !ohneStatus && b?.art === 'lese';
  const index = indexSaetze(e, sprache);
  const schritte = e.soGehts?.[sprache] ?? [];

  return (
    <article class="karte" data-eintrag={e.id} data-art={b?.art ?? 'nur-erklaerung'} data-schwere={e.empfehlung.schwere} aria-labelledby={`${kennung}-titel`}>
      <div class="karte__kopf">
        <h2 id={`${kennung}-titel`}>
          <button ref={kopfRef} type="button" class="karte__ausloeser" aria-expanded={offen} aria-controls={`${kennung}-inhalt`} onClick={() => setOffen(!offen)}>
            <span>{e.titel[sprache]}</span>
            <Pfeil klasse="karte__pfeil" />
          </button>
        </h2>
        {(status || zeile || lese) && (
          <p class="karte__zeile">
            {status && b?.form && b.farbe && (
              <span class="status">
                <Punkt form={b.form} farbe={b.farbe} />
                {t(status)}
              </span>
            )}
            {zeile && <span>{zeile}</span>}
            {lese && (
              <>
                <span class="skelett skelett--zeile" aria-hidden="true" />
                <span class="lese-text">{leseTextZeigen ? t('lese_text') : ''}</span>
              </>
            )}
          </p>
        )}
        {firmaBewusst && firmaGrund && <p class="karte__bewusst">{t('bewusst_firma', firmaGrund)}</p>}
        {nutzerBewusst && (
          <div class="karte__bewusst">
            <p>{t('bewusst_nutzer')}</p>
            {onAusblenden && (
              <button
                ref={wiederRef}
                type="button"
                class="knopf knopf--still"
                onClick={() => {
                  fokusNach.current = 'kopf';
                  onAusblenden(false);
                }}
              >
                {t('knopf_wieder')}
              </button>
            )}
          </div>
        )}
      </div>
      <div class="karte__huelle" data-offen={String(offen)}>
        <div id={`${kennung}-inhalt`} inert={!offen}>
          <div class="karte__koerper">
            {b?.art === 'nicht-lesbar' && !ohneStatus && (
              <div class="grund">
                <p>{t(grundSchluessel(b.grund))}</p>
                {b.grund !== 'sprache' && (
                  <button type="button" class="knopf knopf--aktion" onClick={onErneut}>
                    {t('knopf_erneut')}
                  </button>
                )}
              </div>
            )}
            <section class="abschnitt">
              <h3>{t('karte_was')}</h3>
              <p>{e.wasEsTut[sprache]}</p>
            </section>
            <section class="abschnitt">
              <h3>{t('karte_empfehlung')}</h3>
              <p>{e.empfehlung.kurz[sprache]}</p>
            </section>
            <section class="abschnitt">
              <h3>{t('karte_bleibt')}</h3>
              <p>{e.empfehlung.wennEsSoBleibt[sprache]}</p>
            </section>
            {e.empfehlung.vorher && (
              <section class="abschnitt vorsicht">
                <h3>{t('karte_vorher')}</h3>
                <p>{e.empfehlung.vorher[sprache]}</p>
              </section>
            )}
            {namen && namen.length > 0 && (
              <section class="abschnitt">
                <h3>{t('karte_domains')}</h3>
                <ul class="domains">
                  {namen.map((n) => (
                    <li key={n} class="mono">
                      {n}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {schritte.length > 0 && (
              <details class="sogehts">
                <summary>{t('karte_sogehts')}</summary>
                <ol>
                  {schritte.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </details>
            )}
            {e.lizenz && (
              <section class="abschnitt">
                <h3>{t('karte_lizenz')}</h3>
                <p>{t(lizenzSchluessel(e.lizenz))}</p>
              </section>
            )}
            {index.length > 0 && (
              <section class="abschnitt">
                <h3>{t('karte_vergleich')}</h3>
                {index.map((s) => (
                  <p key={s}>{s}</p>
                ))}
              </section>
            )}
            <section class="abschnitt">
              <h3>{t(e.quellen.length > 1 ? 'karte_quellen' : 'karte_quelle')}</h3>
              <ul class="quellen">
                {e.quellen.map((q) => (
                  <li key={quelleAdresse(q, sprache)}>
                    <a href={quelleAdresse(q, sprache)} target="_blank" rel="noreferrer">
                      {q.titel[sprache]}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
            <p class="geprueft">{t('karte_geprueft', datum(e.inhaltGeprueftAm, sprache))}</p>
            {ausblendbar && (
              <div class="ausblenden">
                <p id={`${kennung}-ausblenden`}>{t('ausblenden_hilfe')}</p>
                <button
                  type="button"
                  class="knopf knopf--still"
                  aria-describedby={`${kennung}-ausblenden`}
                  onClick={() => {
                    fokusNach.current = 'wieder';
                    onAusblenden!(true);
                  }}
                >
                  {t('knopf_ausblenden')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
