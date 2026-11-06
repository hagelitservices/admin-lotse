/**
 * Werte lesen über ARIA (Spez. §5). Der Leser ist Daten, diese Maschine für alle Einträge gleich.
 * Sie liest nur: kein Klick, kein Fokus, kein Schreiben (U-21). Aus dem Rahmen gehen nur Token, Domainnamen allein bei
 * der Art `domains` (§5.3) — Seitentext verlässt den Rahmen nie: Ein Wort ohne Eintrag in `werte` wird zu `unbekannt`.
 */
import type { Leser } from '../inhalte/schema';

export const MEHRDEUTIG = 'mehrdeutig';
export const UNBEKANNT = 'unbekannt';

export interface Treffer {
  token: string;
  /** Nur Art `domains`, nur zum Anzeigen und Kopieren. */
  anzeige?: string[];
}

/** §5.2 Nr. 3: Kleinbuchstaben, Leerraum, weiches Trennzeichen, „(Vorschau)“, typografische Anführungszeichen. */
export function normalisiere(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/­/g, '')
    // Richtungszeichen (U+200E/F, U+202A–E, U+2066–9): Das M365 Admin Center umschließt Produkt- und Fensternamen damit
    // („‎Kalender‎“, „‎Office 365‎“, Aufnahme H7b). Unsichtbar, aber sonst stimmt kein Vergleich.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .toLowerCase()
    .replace(/\((vorschau|preview)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const text = (el: Element | null | undefined) => el?.textContent ?? '';

/** ARIA-Bezug über die Kennung: kein DOM-Pfad, sondern der Verweis, den die Seite selbst setzt (§5.2 Nr. 2). */
function bezogene(el: Element, attribut: string): (Element | null)[] {
  const dok = el.ownerDocument;
  const kennungen = (el.getAttribute(attribut) ?? '').split(/\s+/).filter(Boolean);
  return kennungen.map((k) => dok.getElementById(k)); // ARIA-Bezug
}
const bezug = (el: Element, attribut: string) => bezogene(el, attribut).map(text).join(' ');

/** Beschriftung der nächsten Gruppe: `[role=group]` oder `fieldset` mit `legend`. */
function gruppenName(el: Element): string {
  const gruppe = el.parentElement?.closest('[role="group"],fieldset');
  if (!gruppe) return '';
  const eigen = gruppe.getAttribute('aria-label') ?? '';
  if (eigen.trim()) return eigen;
  const bezogen = bezug(gruppe, 'aria-labelledby');
  if (bezogen.trim()) return bezogen;
  return text([...gruppe.children].find((k) => k.tagName === 'LEGEND'));
}

/** §5.2 Nr. 2: `aria-label`, `aria-labelledby`, `<label for>` / umschließendes `<label>`, Gruppe. */
export function zugaenglicherName(el: Element): string {
  const label = el.getAttribute('aria-label') ?? '';
  if (label.trim()) return label;
  const bezogen = bezug(el, 'aria-labelledby');
  if (bezogen.trim()) return bezogen;
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return [...labels].map((l) => text(l)).join(' ');
  return gruppenName(el);
}

const versteckt = (el: Element) => el.closest('[hidden],[aria-hidden="true"]') !== null;

/**
 * Seitenfenster per CSS zu (Prüferbefund H7b): Entra zeigt „offen“ beim Kontextfenster nur über eine Klasse; bleibt der Inhalt
 * nach dem Schließen im DOM, darf daraus nichts gelesen werden. `checkVisibility()` fragt den Browser, ob das Element
 * gezeichnet wird (`display`, `visibility`, `content-visibility`); ohne Layout (jsdom) gibt es die Methode nicht, dann zählt
 * nur `hidden`/`aria-hidden`. Nur für das Entra-Kontextfenster: Das M365-Fenster verschwindet beim Schließen aus dem DOM, und
 * wie der Browser dessen Hülle einstuft (Größe null, `display: contents`), ist nicht gemessen — dort bliebe sonst jede Lesung aus.
 */
const ausgeblendet = (el: Element) => {
  const pruefe = (el as Element & { checkVisibility?: (o?: { visibilityProperty?: boolean }) => boolean }).checkVisibility;
  return typeof pruefe === 'function' && !pruefe.call(el, { visibilityProperty: true });
};

function bedienelemente(wurzel: ParentNode, rolle: Leser['rolle']): Element[] {
  switch (rolle) {
    case 'switch':
      return [...wurzel.querySelectorAll('[role="switch"]')];
    case 'checkbox':
      return [...wurzel.querySelectorAll('[role="checkbox"],input[type="checkbox"]:not([role])')];
    case 'radiogroup':
      return [...wurzel.querySelectorAll('[role="radiogroup"]')];
    case 'combobox':
      return [...wurzel.querySelectorAll('[role="combobox"],select')];
    case 'heading':
      return [...wurzel.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')];
    // Die Portale wechseln zwischen diesen Rollen (H2 hat sie zusammen gemessen); die Bezeichnung entscheidet.
    case 'table':
    case 'grid':
    case 'treegrid':
      return [...wurzel.querySelectorAll('table,[role="table"],[role="grid"],[role="treegrid"]')];
  }
}

function zustandSchalter(el: Element): string {
  const aria = el.getAttribute('aria-checked');
  if (aria === 'true') return 'ja';
  if (aria === 'false') return 'nein';
  if (aria !== null) return UNBEKANNT; // „mixed“
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).indeterminate ? UNBEKANNT : (el as HTMLInputElement).checked ? 'ja' : 'nein';
  return UNBEKANNT;
}

function tokenAus(werte: Leser['werte'], wort: string): string {
  const n = normalisiere(wort);
  for (const [token, woerter] of Object.entries(werte ?? {})) if (n && woerter.some((w) => normalisiere(w) === n)) return token;
  return UNBEKANNT;
}

/**
 * Titelzeile einer Beschriftung (H8c): Entra setzt bei Optionsgruppen mit Erklärung Titel und Beschreibung als getrennte
 * Blöcke in dieselbe Beschriftung (`<label><div>Titel</div><div>Beschreibung … Weitere Informationen</div></label>`).
 * Gezählt wird nur der Block des ersten sichtbaren Textes, nie die Erklärung: Sie könnte ein Wert-Wort enthalten.
 */
export function titelzeile(el: Element | null | undefined): string[] {
  if (!el) return [];
  // Erster sichtbarer Text in Dokumentreihenfolge; sein Block (nächstes div/p/label/li in `el`) ist die Titelzeile.
  const gang = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = gang.nextNode(); n; n = gang.nextNode()) {
    const eltern = n.parentElement;
    if (!eltern || versteckt(eltern) || !(n.nodeValue ?? '').trim()) continue;
    const block = eltern.closest('div,p,label,li');
    return block && block !== el && el.contains(block) ? [text(block)] : [];
  }
  return [];
}

/** Namen einer Optionsgruppe: zugänglicher Name, dazu die Titelzeile der Beschriftung, auf die sie verweist. */
function gruppenNamen(el: Element): string[] {
  return [zugaenglicherName(el), ...bezogene(el, 'aria-labelledby').flatMap(titelzeile)];
}

/** Wörter einer Option: ganzer Text zuerst, dann ihre Titelzeile ohne Erklärung (H8c); natives Optionsfeld über seine Beschriftung (H7b). */
function optionsWoerter(option: Element): string[] {
  if (option.tagName === 'INPUT') return [zugaenglicherName(option)];
  return [text(option), ...titelzeile(option)];
}

/**
 * Optionen einer Gruppe: ARIA-Optionen und native Optionsfelder, die nicht in einer ARIA-Option stecken (Entra: verstecktes
 * `input` im `li[role=radio]`, H8b). Das M365 Admin Center nimmt native Felder mit `<label for>` (Kalender, H7b).
 */
export function optionenVon(gruppe: Element): Element[] {
  return [
    ...gruppe.querySelectorAll('[role="radio"]'),
    ...[...gruppe.querySelectorAll('input[type="radio"]')].filter((r) => !r.hasAttribute('role') && !r.parentElement?.closest('[role="radio"]')),
  ];
}

/**
 * Gruppe ohne Namen über ihre Optionen (H8d, `gruppeUeberOption`): Sie hat weder eigenen Namen noch Bezug, und eine
 * ihrer Optionen tragen mindestens zwei verschiedene Wörter aus `werte`. Die sichtbare Überschrift hängt in Entra nur über eine Kennungs-Namenskonvention
 * (`…-for`) dran; die ist kein ARIA-Bezug und bleibt tabu (§5.3). Die Optionstexte sind dagegen das, was ein Screenreader vorliest.
 */
export function gruppeOhneNamenMitOption(gruppe: Element, leser: Pick<Leser, 'werte'>): boolean {
  if (gruppenNamen(gruppe).some((n) => n.trim() !== '')) return false;
  // Mindestens zwei verschiedene Token: Eine einzelne Option mit kurzem Wort („Ja“) träfe sonst jede Ja/Nein-Gruppe der Seite.
  const token = new Set(optionenVon(gruppe).map((o) => tokenAusErstem(leser.werte, optionsWoerter(o))).filter((t) => t !== UNBEKANNT));
  return token.size >= 2;
}

/** Gewählte Option einer Gruppe; keine oder mehrere gewählt = unbekannt, nie ein Treffer „aus Versehen“. */
function wortRadiogroup(gruppe: Element): string[] | null {
  const gewaehlt = [
    ...gruppe.querySelectorAll('[role="radio"][aria-checked="true"]'),
    // Native Optionsfelder nur, wenn sie nicht in einer ARIA-Option stecken (Entra: verstecktes `input` im `li[role=radio]`).
    ...[...gruppe.querySelectorAll('input[type="radio"]')].filter(
      (r) => (r as HTMLInputElement).checked && !r.hasAttribute('role') && !r.parentElement?.closest('[role="radio"]'),
    ),
  ];
  if (gewaehlt.length !== 1) return null;
  const el = gewaehlt[0] as Element;
  // Nur die eigene Bezeichnung der Option, nie die der umgebenden Gruppe (H8b: Entra legt Optionsgruppen in
  // `role=group`-Abschnitte, deren Name sonst als Optionswort gelesen würde); ohne eigene Bezeichnung ihr Text.
  if (el.tagName === 'INPUT') return [zugaenglicherName(el)];
  const eigen = (el.getAttribute('aria-label') ?? '').trim() || bezug(el, 'aria-labelledby').trim();
  return eigen ? [eigen] : optionsWoerter(el);
}

/** Erstes Wort, das in `werte` steht; sonst `unbekannt`. */
const tokenAusErstem = (werte: Leser['werte'], woerter: string[]) => woerter.map((w) => tokenAus(werte, w)).find((t) => t !== UNBEKANNT) ?? UNBEKANNT;

function wortCombobox(el: Element): string | null {
  const valuetext = el.getAttribute('aria-valuetext');
  if (valuetext) return valuetext;
  if (el.tagName === 'SELECT') {
    const s = el as HTMLSelectElement;
    return s.selectedOptions.length === 1 ? text(s.selectedOptions[0]) : null;
  }
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).value;
  return text(el);
}

/** Text gleich nach der Überschrift (§5.2 „Überschriften für text“): nächstes Geschwister, sonst das des Elternteils. */
function wortNachUeberschrift(el: Element): string | null {
  const danach = el.nextElementSibling ?? el.parentElement?.nextElementSibling;
  return danach ? text(danach) : null;
}

function zeilen(tabelle: Element): { daten: Element[]; kopf: number } {
  const alle = [...tabelle.querySelectorAll('tr,[role="row"]')];
  const daten = alle.filter((z) => z.querySelector('[role="columnheader"],th') === null && z.closest('thead') === null);
  return { daten, kopf: alle.length - daten.length };
}

/** Zeilenzahl ohne Kopf. Virtuelle Listen zeigen nur einen Teil, `aria-rowcount` nennt dann alle (Messung H2). */
export function datenzeilen(tabelle: Element): number {
  const { daten, kopf } = zeilen(tabelle);
  const angabe = Number(tabelle.getAttribute('aria-rowcount'));
  const sichtbar = daten.length + kopf;
  return Number.isInteger(angabe) && angabe > sichtbar ? angabe - Math.max(kopf, 1) : daten.length;
}

/**
 * Die ganze Zelle ist ein Domainname in Kleinbuchstaben, höchstens mit dem Zusatz des Portals: `beispiel.de (Standard)`.
 * Namen, Daten und Mailadressen kommen so nicht durch (`Max.Muster GmbH`, `05.11.2026`, `max@beispiel.de`).
 */
const DOMAIN = /^((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?:\s*\(?(?:standard|default|primär|primary|fallback|anfangsdomäne|initial)\)?)?$/;

/**
 * Text ohne versteckte Teile. Das Admin Center legt in jede Domänenzelle eine `hidden`-Kopie des Namens als Tooltip
 * (Aufnahme H6); `textContent` ergäbe `x.de (Standard)x.de (Standard)` und damit keinen Treffer.
 */
function sichtbarerText(el: Element): string {
  const dok = el.ownerDocument;
  const gang = dok.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let aus = '';
  for (let n = gang.nextNode(); n; n = gang.nextNode()) if (n.parentElement && !versteckt(n.parentElement)) aus += n.nodeValue ?? '';
  return aus;
}

/** Domainname aus der ersten Zelle, die einer ist. */
export function domainsAus(tabelle: Element): string[] {
  const gefunden = new Set<string>();
  for (const zeile of zeilen(tabelle).daten) {
    const zellen = [...zeile.querySelectorAll('td,th,[role="gridcell"],[role="cell"],[role="rowheader"]')];
    for (const z of zellen.length ? zellen : [zeile]) {
      const treffer = DOMAIN.exec(sichtbarerText(z).replace(/\s+/g, ' ').trim().replace(/ (\(?[A-Za-zä]+\)?)$/, (_, w: string) => ` ${w.toLowerCase()}`));
      if (treffer?.[1]) {
        gefunden.add(treffer[1].toLowerCase());
        break;
      }
    }
  }
  return [...gefunden];
}

/** Spaltenköpfe einer Tabelle in Lesereihenfolge (ARIA-Rolle oder natives `th` ohne Rolle), ohne versteckte Kopien. */
function spaltenkoepfe(tabelle: Element): Element[] {
  return [...tabelle.querySelectorAll('[role="columnheader"],th:not([role])')].filter((k) => !versteckt(k));
}

/** Sichtbarer Text einer Zelle oder eines Kopfs. Zellen werden über `[role=gridcell|cell|rowheader]` und natives `td` gesucht (U-20: Selektor an jeder Abfrage ausgeschrieben). */
const zelltext = (el: Element) => normalisiere(sichtbarerText(el));

/**
 * Zelle einer Zeile unter dem Spaltenkopf `kopf`. Zuerst der Verweis, den die Seite setzt (`aria-describedby` auf den
 * Kopf, Entra-Rollenliste), dann `aria-colindex`, zuletzt die Stellung: n-te Zelle unter dem n-ten Kopf (Fluent-Listen
 * führen eine leere Auswahlspalte in Kopf und Zeile, H8c-Aufnahme). Fehlt die Zelle, `null`.
 */
function zelleUnter(zeile: Element, koepfe: Element[], kopf: Element): Element | null {
  const zellen = [...zeile.querySelectorAll('[role="gridcell"],[role="cell"],[role="rowheader"],td:not([role])')].filter((z) => !versteckt(z));
  const kennung = kopf.id;
  if (kennung) {
    const verwiesen = zellen.find((z) => [...(z.getAttribute('aria-describedby') ?? '').split(/\s+/), ...(z.getAttribute('headers') ?? '').split(/\s+/)].includes(kennung));
    if (verwiesen) return verwiesen;
  }
  const spalte = kopf.getAttribute('aria-colindex');
  if (spalte) return zellen.find((z) => z.getAttribute('aria-colindex') === spalte) ?? null;
  // Stellung nur, wenn Köpfe und Zellen gleich viele sind: Ein versteckter Kopf über einer sichtbaren Zelle verschöbe sonst die Spalte.
  return zellen.length === koepfe.length ? (zellen[koepfe.indexOf(kopf)] ?? null) : null;
}

/** Tabellen für `zelle`: Bezeichnung aus `name`, ohne Bezeichnung ein Spaltenkopf aus `name`. Reine Layout-Tabellen nie. */
function zellTabellen(wurzel: ParentNode, leser: Leser): Element[] {
  const namen = [...leser.name.de, ...leser.name.en].map(normalisiere);
  return bedienelemente(wurzel, leser.rolle).filter((t) => {
    if (versteckt(t) || ['presentation', 'none'].includes(t.getAttribute('role') ?? '')) return false;
    const eigen = normalisiere(nameVon(t, leser));
    return eigen ? namen.includes(eigen) : spaltenkoepfe(t).some((k) => namen.includes(zelltext(k)));
  });
}

/**
 * Zellen der Art `zelle` (H8c): je Eintrag in `zeilen` die Zelle unter `spalte`. `null` = Spalte oder Zeile (noch)
 * nicht da, `mehrdeutig` = Spalte oder Zeile mehrfach. Auch die Abweichungs-Fixtures finden ihre Zelle hierüber.
 */
export function zellenSuchen(tabelle: Element, leser: Pick<Leser, 'spalte' | 'zeilen'>): Element[] | null | typeof MEHRDEUTIG {
  const spalten = [...(leser.spalte?.de ?? []), ...(leser.spalte?.en ?? [])].map(normalisiere);
  const koepfe = spaltenkoepfe(tabelle);
  const kopf = koepfe.filter((k) => spalten.includes(zelltext(k)));
  if (kopf.length === 0) return null;
  if (kopf.length > 1) return MEHRDEUTIG;
  const daten = zeilen(tabelle).daten.filter((z) => !versteckt(z));
  const gefunden: Element[] = [];
  for (const zeile of leser.zeilen ?? []) {
    const namen = [...zeile.de, ...zeile.en].map(normalisiere);
    const passend = daten.filter((z) => [...z.querySelectorAll('[role="gridcell"],[role="cell"],[role="rowheader"],td:not([role])')].some((c) => !versteckt(c) && namen.includes(zelltext(c))));
    if (passend.length === 0) return null;
    if (passend.length > 1) return MEHRDEUTIG;
    const zelle = zelleUnter(passend[0] as Element, koepfe, kopf[0] as Element);
    if (!zelle) return null;
    gefunden.push(zelle);
  }
  return gefunden;
}

/**
 * Art `zelle`: Wert einer benannten Spalte in benannten Zeilen, als Wort über `werte` oder als Zahl. Wie bei allen Arten
 * verlässt nur ein Token den Rahmen: Wörter über `werte`, Zahlen nur als Ziffern.
 */
function liesZelle(tabelle: Element, leser: Leser): Treffer | null {
  const zellen = zellenSuchen(tabelle, leser);
  if (zellen === null) return null;
  if (zellen === MEHRDEUTIG) return { token: MEHRDEUTIG };
  const gelesen = zellen.map((z) => {
    const w = sichtbarerText(z).replace(/\s+/g, ' ').trim();
    return leser.spanne ? (/^\d+$/.test(w) ? w : UNBEKANNT) : tokenAus(leser.werte, w);
  });
  if (gelesen.includes(UNBEKANNT)) return { token: UNBEKANNT };
  // Mehrere Zeilen: Die erste, die nicht passt, bestimmt das Token — „passt“ nur, wenn jede Zeile passt.
  return { token: gelesen.find((t) => !leser.empfohlen.includes(t)) ?? (gelesen[0] as string) };
}

/** Tabellen für `zelle` im Dokument (für die Abweichungs-Fixtures, die sonst dieselbe Suche nachbauen müssten). */
export const zellTabellenIn = (dok: Document, leser: Pick<Leser, 'name' | 'rolle' | 'art' | 'dialog'>) => zellTabellen(dok, leser as Leser);

/**
 * Dialog-Schlüssel (§4.3): ein sichtbares Seitenfenster mit diesem Namen. Das M365 Admin Center nimmt `role="dialog"`,
 * das Entra Admin Center für seine Kontextfenster `role="complementary"` mit `aria-labelledby` (Aufnahme H7b,
 * „Sicherheitsstandards verwalten“). Beides sind semantische Merkmale, kein DOM-Pfad.
 */
function wurzelFuer(dok: Document, leser: Leser): ParentNode | null {
  if (!leser.dialog) return dok;
  const namen = [...leser.dialog.de, ...leser.dialog.en].map(normalisiere);
  const offen = [...dok.querySelectorAll('[role="dialog"],[role="complementary"]')].filter(
    (d) => !versteckt(d) && !(d.getAttribute('role') === 'complementary' && ausgeblendet(d)) && namen.includes(normalisiere(zugaenglicherName(d))),
  );
  return offen.length === 1 ? (offen[0] as Element) : null;
}

/**
 * Voraussetzung (`nurWenn`, H7b): Die Auswahl zählt nur, solange ein Häkchen daneben an ist (Kalender: die Detailstufe
 * gilt laut Learn nur für den Zugriff per E-Mail-Einladung). Aus, fehlt oder doppelt = hier nichts zu lesen; mit
 * Dialog-Schlüssel bleibt es dann bei der Erklärung, nie bei einer Bewertung.
 */
function voraussetzungErfuellt(wurzel: ParentNode, leser: Leser): boolean {
  if (!leser.nurWenn) return true;
  const namen = [...leser.nurWenn.de, ...leser.nurWenn.en].map(normalisiere);
  const kaestchen = bedienelemente(wurzel, 'checkbox')
    .concat(bedienelemente(wurzel, 'switch'))
    .filter((el) => !versteckt(el) && namen.includes(normalisiere(zugaenglicherName(el))));
  // Gesperrt (Prüferbefund H7b): Laut Learn gibt es den Zugriff per Einladung nur, wenn die externe Freigabe an ist; ein
  // gesetztes, aber gesperrtes Häkchen gilt dann nicht. Gemessen ist es als Globaler Leser bedienbar (`disabled` fehlt).
  const k = kaestchen[0];
  const gesperrt = k !== undefined && (k.getAttribute('aria-disabled') === 'true' || k.hasAttribute('disabled'));
  return kaestchen.length === 1 && !gesperrt && zustandSchalter(k as Element) === 'ja';
}

/** Name der Überschrift ist ihr Text, sonst §5.2 Nr. 2. Beide Sprachen zählen: Entra mischt sie im selben Rahmen (H2). */
function nameVon(el: Element, leser: Leser): string {
  return leser.rolle === 'heading' ? text(el) : zugaenglicherName(el) || (leser.rolle === 'table' || leser.rolle === 'grid' ? text(el.querySelector('caption')) : '');
}

/**
 * Erfolgsmeldung statt Fehler: Das Admin Center sagt „Domänenliste geladen“ und „1 Domäne geladen“ als `role=alert`
 * an (Aufnahme H6). Nur diese gemessenen Ansagen zählen so, jede andere Meldung sperrt weiter (lieber „nicht lesbar“
 * als ein Wert aus einer fehlgeschlagenen Ladung). Neue Ansagen nur nach Aufnahme hier eintragen (H7–H10). Das Exchange Admin
 * Center sagt die geladene Liste ebenfalls als `role=alert` an (H10).
 */
const LADE_ANSAGEN = [
  /^(?:\d+ )?(?:domäne|domänen|domänenliste) geladen$/,
  // „Domains list loaded“ gemessen am echten Portal (en-US, H17b, 06.11.2026); vorher nur „Domain list“.
  /^(?:\d+ )?(?:domain|domains|domain list|domains list) loaded$/,
  // Exchange Admin Center, akzeptierte Domänen (H10, de und en gemessen; Zahl in U+200E eingepackt, normalisiere() entfernt sie).
  /^akzeptierte domänen listen geladene \d+ verfügbare elemente auf$/,
  /^accepted domains list loaded \d+ items? available$/,
];
export function nurLadeMeldung(t: string): boolean {
  const n = normalisiere(t).replace(/\.$/, '');
  return LADE_ANSAGEN.some((m) => m.test(n));
}

/** Sichtbarer Fehlerhinweis im Rahmen: Dann stammen die Werte womöglich aus einer fehlgeschlagenen Ladung. */
export function fehlerHinweis(dok: Document): boolean {
  return [...dok.querySelectorAll('[role="alert"]')].some((a) => !versteckt(a) && text(a).trim() !== '' && !nurLadeMeldung(text(a)) && !feedbackUmfrage(a));
}

/**
 * Microsofts Zufriedenheitsumfrage („Feedback an Microsoft senden“) ist im Entra Admin Center ein `role="alert"` und
 * erscheint zufällig (gemessen H17b, 06.11.2026). Sie ist kein Fehlerhinweis — aber nur, wenn sie wirklich die Umfrage
 * ist: gemessener Titel und Auswahlknöpfe darin. Jede andere Meldung sperrt weiter.
 */
const FEEDBACK_TITEL = [/^feedback an microsoft senden/, /^send feedback to microsoft/];
/** Obergrenze für den ganzen Text: Titel, Frage, Skala und Knöpfe (gemessen gut 150 Zeichen). Mehr = es steht noch etwas anderes darin. */
const FEEDBACK_MAX_ZEICHEN = 600;
function feedbackUmfrage(a: Element): boolean {
  const t = normalisiere(text(a));
  return FEEDBACK_TITEL.some((r) => r.test(t)) && t.length <= FEEDBACK_MAX_ZEICHEN && a.querySelectorAll('input[type="radio"],[role="radio"]').length >= 2 && a.querySelector('[role="alert"]') === null;
}

/** Liest einen Leser im Dokument. `null` = hier nichts gefunden (ein anderer Rahmen kann es haben). */
export function lies(dok: Document, leser: Leser): Treffer | null {
  const wurzel = wurzelFuer(dok, leser);
  if (!wurzel || !voraussetzungErfuellt(wurzel, leser)) return null;
  const namen = [...leser.name.de, ...leser.name.en].map(normalisiere);
  const treffer =
    leser.art === 'zelle'
      ? zellTabellen(wurzel, leser)
      : bedienelemente(wurzel, leser.rolle).filter(
          (el) =>
            !versteckt(el) &&
            (leser.rolle === 'radiogroup' ? gruppenNamen(el) : [nameVon(el, leser)]).some((n) => namen.includes(normalisiere(n))) ||
            (leser.gruppeUeberOption === true && !versteckt(el) && gruppeOhneNamenMitOption(el, leser)),
        );
  if (treffer.length === 0) return null;
  if (treffer.length > 1) return { token: MEHRDEUTIG };
  const el = treffer[0] as Element;
  switch (leser.art) {
    case 'schalter':
    case 'haekchen':
      return { token: zustandSchalter(el) };
    case 'auswahl': {
      const woerter = el.getAttribute('role') === 'radiogroup' ? wortRadiogroup(el) : [wortCombobox(el)].filter((w): w is string => w !== null);
      return { token: woerter === null || woerter.length === 0 ? UNBEKANNT : tokenAusErstem(leser.werte, woerter) };
    }
    case 'text': {
      const wort = wortNachUeberschrift(el);
      return { token: wort === null ? UNBEKANNT : tokenAus(leser.werte, wort) };
    }
    case 'anzahl': {
      const n = datenzeilen(el);
      // Eine Liste ohne Zeile lädt meist noch. Null gilt nur, wo die Fixture das leere Bild belegt (`leerGilt`).
      return n === 0 && !leser.leerGilt ? null : { token: String(n) };
    }
    case 'zelle':
      return liesZelle(el, leser);
    case 'domains': {
      const anzeige = domainsAus(el);
      // Keine Zeile = die Liste lädt noch; jeder Mandant hat mindestens eine Domain.
      return anzeige.length ? { token: String(anzeige.length), anzeige } : null;
    }
  }
}
