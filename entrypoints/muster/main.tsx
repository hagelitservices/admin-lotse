import '../../components/bausteine.css';
import { render } from 'preact';
import { Ausserhalb } from '../../components/ausserhalb';
import { Leiste } from '../../components/leiste';
import { firmaAus, OHNE_FIRMA, type Firma } from '../../lib/firmenmodus';
import { AKTIVE_EINTRAEGE } from '../../lib/inhalte';
import { text } from '../../lib/i18n';
import type { TabZustand } from '../../lib/nachrichten';
import { seiteVorbereiten } from '../../lib/oberflaeche';
import type { Portal } from '../../lib/route';
import type { Bewertung } from '../../lib/zustand';

// Musterseite nur im Testbau (`LOTSE_MUSTER=1`, nie im Store-Paket): zeigt jeden Zustand aus Spez. §11.3 mit echten
// Einträgen, damit Fotos (§14.7), axe (T-17) und Tastatur (T-15) jeden Zustand sehen, ohne ihn im Portal herzustellen.
const sprache = await seiteVorbereiten('erweiterung_name');

const passt = (token: string): Bewertung => ({ art: 'passt', form: 'kreis', farbe: 'ok', token });
const rot = (token: string): Bewertung => ({ art: 'weicht-ab', form: 'quadrat', farbe: 'down', token });
const gelb = (token: string): Bewertung => ({ art: 'weicht-ab', form: 'dreieck', farbe: 'degraded', token });
const nicht = (grund: Bewertung['grund']): Bewertung => ({ art: 'nicht-lesbar', grund, form: 'strich', farbe: 'unknown' });
const lese: Bewertung = { art: 'lese' };
const bewusst = (token: string, von: 'firma' | 'nutzer'): Bewertung => ({ art: 'bewusst', form: 'raute', farbe: 'planned', token, von });
const IDS = new Set(AKTIVE_EINTRAEGE.map((e) => e.id));
/** Musterfirma wie im Firmenprofil (§10): eigener Ansprechpartner, eine bewusste Abweichung. */
const MUSTERFIRMA: Firma = firmaAus(
  {
    hilfeKontakt: { name: 'IT-Team Musterfirma', url: 'mailto:it@musterfirma.de' },
    bewussteAbweichungen: [{ eintrag: 'entra-sicherheitsstandards', begruendung: 'Ersetzt durch Regeln des bedingten Zugriffs (Mehr-Faktor für alle), seit März 2026.' }],
  },
  IDS,
);

interface Muster {
  portal: Portal;
  bewertungen: Record<string, Bewertung>;
  anzeige?: Record<string, string[]>;
  skript?: boolean;
  verstanden?: boolean;
  /** Zustand fehlt noch (Z-2 vor der ersten Nachricht). */
  ohneZustand?: boolean;
  firma?: Firma;
  /** Edge ohne Seitenleiste (M-8): dieselbe Leiste als Popup. */
  alsPopup?: boolean;
  /** Z-12: statt der Leiste das Popup mit fehlendem Zugriff. */
  zugriff?: { fehlend: ('https://admin.cloud.microsoft/*' | 'https://entra.microsoft.com/*' | 'https://intune.microsoft.com/*')[]; imTab: boolean };
}

const MUSTER: Record<string, Muster> = {
  'Z-1': { portal: 'entra', bewertungen: {}, verstanden: false },
  'Z-2': { portal: 'entra', bewertungen: { 'entra-app-registrierung': lese, 'entra-adminportal': lese } },
  'Z-2a': { portal: 'entra', bewertungen: {}, ohneZustand: true },
  'Z-3': { portal: 'entra', bewertungen: {} },
  'Z-4': { portal: 'intune', bewertungen: { 'intune-asr': { art: 'nur-erklaerung' } } },
  'Z-5': { portal: 'entra', bewertungen: { 'entra-geraete': passt('ja') } },
  'Z-6': { portal: 'entra', bewertungen: { 'entra-benutzereinwilligung': rot('alle') } },
  'Z-7': { portal: 'entra', bewertungen: { 'entra-geraete': gelb('nein') } },
  'Z-8': { portal: 'entra', bewertungen: { 'entra-kennwortschutz': nicht('zeitgrenze') } },
  'Z-9': {
    portal: 'entra',
    bewertungen: {
      'entra-adminportal': passt('ja'),
      'entra-gasteinladungen': gelb('jeder'),
      'entra-app-registrierung': rot('ja'),
      'entra-rollen': nicht('mehrdeutig'),
      'entra-auth-methoden': { art: 'nur-erklaerung', token: 'nein' },
    },
  },
  'Z-9d': { portal: 'm365', bewertungen: { 'm365-domains': { art: 'nur-erklaerung', token: '2' } }, anzeige: { 'm365-domains': ['musterfirma.de', 'musterfirma-hamburg.de'] } },
  'Z-10': {
    portal: 'entra',
    bewertungen: { 'entra-sicherheitsstandards': bewusst('aus', 'firma'), 'entra-gasteinladungen': gelb('jeder') },
    firma: MUSTERFIRMA,
  },
  'Z-11': { portal: 'entra', bewertungen: { 'entra-benutzereinwilligung': bewusst('alle', 'nutzer'), 'entra-geraete': passt('ja') } },
  'Z-12': { portal: 'entra', bewertungen: {}, zugriff: { fehlend: ['https://entra.microsoft.com/*'], imTab: true } },
  'Z-12b': {
    portal: 'entra',
    bewertungen: {},
    zugriff: { fehlend: ['https://admin.cloud.microsoft/*', 'https://entra.microsoft.com/*', 'https://intune.microsoft.com/*'], imTab: false },
  },
  'Z-15': {
    portal: 'entra',
    bewertungen: { 'entra-benutzereinwilligung': { art: 'nur-erklaerung' }, 'entra-app-registrierung': { art: 'nur-erklaerung' } },
    firma: firmaAus({ werteLesen: false, hilfeAusblenden: true }, IDS),
  },
  'Z-9p': {
    portal: 'entra',
    bewertungen: { 'entra-app-registrierung': rot('ja'), 'entra-adminportal': passt('ja'), 'entra-gasteinladungen': gelb('jeder') },
    alsPopup: true,
  },
  /** Store-Bilder (H16, Spez. §12.2): ruhige Leiste für die große Kachel, je eine Abweichung rot und gelb, eine passt. */
  'S-1': {
    portal: 'entra',
    bewertungen: { 'entra-app-registrierung': rot('ja'), 'entra-gasteinladungen': gelb('jeder'), 'entra-adminportal': passt('ja') },
  },
  /**
   * Store-Fotos 1–4 (H16b, scripts/store-fotos.ts): je Portalseite die Bewertung, die die Erweiterung im Testmandanten
   * tatsächlich zeigt (gemessen 06.11.2026) — kein erfundener Wert. Intune und Exchange-Remotedomänen haben keinen Leser.
   */
  'S-2': { portal: 'entra', bewertungen: { 'entra-app-registrierung': passt('nein'), 'entra-adminportal': gelb('nein') } },
  /** Clip (Kernmoment §1.2): dieselbe Seite, solange die Leiste noch liest. */
  'S-2a': { portal: 'entra', bewertungen: { 'entra-app-registrierung': lese, 'entra-adminportal': lese } },
  'S-3': { portal: 'm365', bewertungen: { 'm365-domains': { art: 'nur-erklaerung', token: '1' } }, anzeige: { 'm365-domains': ['musterfirma.onmicrosoft.com'] } },
  'S-4': { portal: 'intune', bewertungen: { 'intune-konformitaet': { art: 'nur-erklaerung' } } },
  'S-5': { portal: 'exo', bewertungen: { 'exo-remotedomaenen': { art: 'nur-erklaerung' } } },
  'Z-13': { portal: 'entra', bewertungen: { 'entra-geraete': nicht('sprache'), 'entra-sspr': nicht('sprache') } },
  'Z-14': { portal: 'entra', bewertungen: { 'entra-app-registrierung': lese, 'entra-adminportal': lese }, skript: false },
};

function zustandAus(m: Muster): TabZustand {
  const eintraege = Object.keys(m.bewertungen);
  return {
    portal: m.portal,
    schluessel: `${m.portal}:muster`,
    sprache: 'de',
    eintraege,
    aufbauAbweichend: [],
    zuLesen: eintraege,
    skript: m.skript ?? true,
    anfrage: null,
    bis: null,
    fristUm: false,
    lesungen: {},
    abweichungen: Object.values(m.bewertungen).filter((b) => b.art === 'weicht-ab').length,
    stand: 0,
  };
}

function zeigen() {
  const name = decodeURIComponent(location.hash.slice(1)) || 'Z-9';
  const m = MUSTER[name] ?? MUSTER['Z-9']!;
  const ziel = document.querySelector('main')!;
  render(null, ziel);
  if (m.zugriff) {
    render(<Ausserhalb t={text} version={browser.runtime.getManifest().version} fehlend={m.zugriff.fehlend} imTab={m.zugriff.imTab} onErlauben={(h) => console.log(`muster: erlauben ${h}`)} />, ziel);
    document.body.dataset.muster = name;
    return;
  }
  render(
    <Leiste
      zustand={m.ohneZustand ? undefined : zustandAus(m)}
      bewertungen={m.bewertungen}
      anzeige={m.anzeige ?? {}}
      verstanden={m.verstanden ?? true}
      sprache={sprache}
      version={browser.runtime.getManifest().version}
      t={text}
      onVerstanden={() => console.log('muster: verstanden')}
      onErneut={() => console.log('muster: erneut')}
      onNavigieren={(a) => console.log(`muster: navigieren ${a}`)}
      onNeuLaden={() => console.log('muster: neu laden')}
      onEinstellungen={() => console.log('muster: einstellungen')}
      firma={m.firma ?? OHNE_FIRMA}
      onAusblenden={(id, an) => console.log(`muster: ausblenden ${id} ${an}`)}
      alsPopup={m.alsPopup}
    />,
    ziel,
  );
  document.body.dataset.muster = name;
}

addEventListener('hashchange', zeigen);
zeigen();
