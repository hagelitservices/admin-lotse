// U-13…U-19, U-22…U-27, U-30…U-36 (Spez. §5, §6, §14.3): Leser auf Mini-DOM, Rahmen-Maschine mit falscher Uhr, Bewertung,
// Inhaltsdateien. Der Abschnitt „Passt nur mit sicherer Lesung“ prüft die Abnahme von H5 über alle Lagen.
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';
import ergebnis from '../../daten/hamburg-index-2026.json';
import { inhalteLesen } from '../../inhalte/pruefen';
import { eintragSchema, leserSchema, type Eintrag, type Leser } from '../../inhalte/schema';
import { ALLE_EINTRAEGE, basisVon, indexSaetze, kennzahlWert } from '../../lib/inhalte';
import { datenzeilen, domainsAus, fehlerHinweis, lies, normalisiere, zugaenglicherName } from '../../lib/leser';
import { FRIST_MS, alsLesungMeldung, lesungenZusammenfuehren, type LesungMeldung } from '../../lib/nachrichten';
import { RUHE_MAX_MS, RUHE_MS, TAKT_MS, rahmenStarten, ruheFuer, zustaendig, type RahmenUmgebung } from '../../lib/rahmen';

// Die Aufnahmen der echten Portale (tests/fixtures/) sind Microsoft-HTML und bleiben privat; im öffentlichen Spiegel
// (hagelitservices/admin-lotse) fehlen sie, dort werden die Fälle darauf übersprungen. Privat sichert U-60/U-61 ihr Dasein.
const MIT_FIXTURES = existsSync(new URL('../fixtures/portale/', import.meta.url));
import { abweichungenZaehlen, bewerten, ladeBisFuer, tabBewerten, type Lage } from '../../lib/zustand';
import type { Seitenbefund } from '../../lib/seite';

const dom = (html: string) => new JSDOM(`<!doctype html><html lang="de"><body>${html}</body></html>`).window.document;
const leser = (l: Partial<Leser> & Pick<Leser, 'art' | 'rolle'>): Leser =>
  leserSchema.parse({ name: { de: ['Testwert'], en: ['Test value'] }, empfohlen: [], rahmen: 'beliebig', dialog: null, ...l });
const JA_NEIN = { ja: ['Ja', 'Yes'], nein: ['Nein', 'No'] };

describe('U-13…U-19 Leser je Art', () => {
  test('U-13 schalter: role=switch über aria-checked', () => {
    const l = leser({ art: 'schalter', rolle: 'switch', empfohlen: ['ja'] });
    expect(lies(dom('<button role="switch" aria-label="Testwert" aria-checked="true"></button>'), l)).toEqual({ token: 'ja' });
    expect(lies(dom('<button role="switch" aria-label="Testwert" aria-checked="false"></button>'), l)).toEqual({ token: 'nein' });
  });

  test('U-14 haekchen: role=checkbox wie in Entra gemessen (button, aria-checked, disabled) und natives input', () => {
    const l = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['nein'] });
    expect(lies(dom('<button type="button" role="checkbox" aria-label="Testwert" aria-checked="false" disabled></button>'), l)).toEqual({ token: 'nein' });
    expect(lies(dom('<label>Testwert <input type="checkbox" checked></label>'), l)).toEqual({ token: 'ja' });
    expect(lies(dom('<button role="checkbox" aria-label="Testwert" aria-checked="mixed"></button>'), l)).toEqual({ token: 'unbekannt' });
    expect(lies(dom('<button role="checkbox" aria-label="Testwert"></button>'), l)).toEqual({ token: 'unbekannt' });
  });

  test('U-15 auswahl: radiogroup mit role=radio und mit input[type=radio]', () => {
    const l = leser({ art: 'auswahl', rolle: 'radiogroup', werte: JA_NEIN, empfohlen: ['nein'] });
    expect(lies(dom('<div role="radiogroup" aria-label="Testwert"><div role="radio" aria-checked="false">Ja</div><div role="radio" aria-checked="true">Nein</div></div>'), l)).toEqual({ token: 'nein' });
    expect(lies(dom('<div role="radiogroup" aria-labelledby="t"><span id="t">Testwert</span><label><input type="radio" name="a" checked> Ja</label><label><input type="radio" name="a"> Nein</label></div>'), l)).toEqual({ token: 'ja' });
    expect(lies(dom('<div role="radiogroup" aria-label="Testwert"><div role="radio" aria-checked="false">Ja</div></div>'), l)).toEqual({ token: 'unbekannt' });
    // Entra (H8b): Optionsgruppe in einem benannten Abschnitt, im gewählten `li[role=radio]` ein verstecktes `input checked`.
    expect(lies(dom('<div role="group" aria-label="Abschnitt"><ul role="radiogroup" aria-label="Testwert"><li role="radio" aria-checked="true"><input type="radio" aria-hidden="true" checked><span>Ja</span></li><li role="radio" aria-checked="false"><input type="radio" aria-hidden="true"><span>Nein</span></li></ul></div>'), l)).toEqual({ token: 'ja' });
  });

  test('U-15b auswahl: Gruppe und Option mit Erklärung über ihre Titelzeile (Entra Benutzereinwilligung, H8c)', () => {
    const l = leser({ art: 'auswahl', rolle: 'radiogroup', werte: { nicht: ['Nicht zulassen'], ja: ['Zulassen'] }, empfohlen: ['nicht'] });
    const option = (titel: string, an: boolean) => `<li role="radio" aria-checked="${an}"><input type="radio" aria-hidden="true"${an ? ' checked' : ''}><span></span><span><div>${titel}</div><div>Erklärung zu ${titel}.</div></span></li>`;
    const gruppe = (a: boolean) => `<label id="g"><div>Testwert</div><div>Hiermit wird konfiguriert, ob … Weitere Informationen</div></label><ul role="radiogroup" aria-labelledby="g">${option('Nicht zulassen', a)}${option('Zulassen', !a)}${option('Microsoft verwaltet', false)}</ul>`;
    expect(lies(dom(gruppe(true)), l)).toEqual({ token: 'nicht' });
    expect(lies(dom(gruppe(false)), l)).toEqual({ token: 'ja' });
    // Eine Option ohne Eintrag in `werte` bleibt unbekannt, auch wenn ihre Erklärung ein bekanntes Wort enthielte.
    expect(lies(dom(`<label id="g"><div>Testwert</div></label><ul role="radiogroup" aria-labelledby="g"><li role="radio" aria-checked="true"><span><div>Microsoft verwaltet</div><div>Zulassen</div></span></li></ul>`), l)).toEqual({ token: 'unbekannt' });
    // Titel mit Hervorhebung: Die Titelzeile ist der ganze erste Block, nicht das Wort darin oder die Erklärung danach.
    expect(lies(dom(`<label id="g"><div>Testwert</div></label><ul role="radiogroup" aria-labelledby="g"><li role="radio" aria-checked="true"><span><div><b>Nicht</b> zulassen</div><div>Zulassen</div></span></li></ul>`), l)).toEqual({ token: 'nicht' });
    // Die Erklärung der Gruppe ist kein Name.
    expect(lies(dom(`<label id="g"><div>Andere Gruppe</div><div>Testwert</div></label><ul role="radiogroup" aria-labelledby="g">${option('Nicht zulassen', true)}</ul>`), l)).toBeNull();
  });

  test('U-15c auswahl: Gruppe ohne Namen über ihre Optionen (Entra Externe Zusammenarbeit, H8d)', () => {
    const werte = { streng: ['Nur eigene Objekte (restriktivste Einstellung).'], offen: ['Wie Mitglieder (umfassendste Einstellung).'] };
    const l = leser({ art: 'auswahl', rolle: 'radiogroup', werte, empfohlen: ['streng'], gruppeUeberOption: true });
    const option = (t: string, an: boolean) => `<li role="radio" aria-checked="${an}"><input type="radio" aria-hidden="true"${an ? ' checked' : ''}><span>${t}<div></div></span></li>`;
    const gruppe = (streng: boolean, attr = '') => `<ul role="radiogroup" id="form-label-id-2-for"${attr}>${option('Wie Mitglieder (umfassendste Einstellung).', !streng)}${option('Nur eigene Objekte (restriktivste Einstellung).', streng)}</ul>`;
    const jaNein = `<ul role="radiogroup">${option('Ja', true)}${option('Nein', false)}</ul>`;
    // Die Überschrift hängt nur über die Kennungs-Konvention `…-for` dran: kein ARIA-Bezug, zählt nie (§5.3).
    const kopf = '<div id="form-label-id-2">Testwert</div>';
    expect(lies(dom(kopf + gruppe(true) + jaNein), l)).toEqual({ token: 'streng' });
    expect(lies(dom(kopf + gruppe(false) + jaNein), l)).toEqual({ token: 'offen' });
    // Ohne das Feld bleibt die Gruppe unauffindbar.
    expect(lies(dom(gruppe(true)), leser({ art: 'auswahl', rolle: 'radiogroup', werte, empfohlen: ['streng'] }))).toBeNull();
    // Zwei Gruppen mit diesen Optionen: mehrdeutig, nie die erste.
    expect(lies(dom(gruppe(true) + gruppe(false)), l)).toEqual({ token: 'mehrdeutig' });
    // Gruppe mit fremdem Namen zählt nicht, auch wenn ihre Optionen passen; mit eigenem Namen weiter über `name`.
    expect(lies(dom(gruppe(true, ' aria-label="Andere Gruppe"')), l)).toBeNull();
    expect(lies(dom(gruppe(false, ' aria-label="Testwert"')), l)).toEqual({ token: 'offen' });
    // Neue Option gewählt, die `werte` nicht kennt: unbekannt, nie „passt“.
    expect(lies(dom(`<ul role="radiogroup">${option('Wie Mitglieder (umfassendste Einstellung).', false)}${option('Nur eigene Objekte (restriktivste Einstellung).', false)}${option('Neue Stufe', true)}</ul>`), l)).toEqual({ token: 'unbekannt' });
    // Nur Ja/Nein-Gruppen auf der Seite: keine Gruppe gefunden.
    expect(lies(dom(jaNein + jaNein), l)).toBeNull();
    // Versteckte Gruppe neben der sichtbaren zählt nicht.
    expect(lies(dom(`<div aria-hidden="true">${gruppe(false)}</div>` + gruppe(true)), l)).toEqual({ token: 'streng' });
    // Gruppe in einem benannten Abschnitt hat einen Namen (§5.2 Nr. 2) und zählt dann nur über `name`.
    expect(lies(dom(`<div role="group" aria-label="Abschnitt">${gruppe(true)}</div>`), l)).toBeNull();
    // Nur eine bekannte Option in der Gruppe: zu wenig, um sie als diese Gruppe zu erkennen.
    expect(lies(dom(`<ul role="radiogroup">${option('Nur eigene Objekte (restriktivste Einstellung).', true)}${option('Etwas anderes', false)}</ul>`), l)).toBeNull();
    // Zwei Leser auf demselben Dokument finden je ihre Gruppe.
    const l2 = leser({ art: 'auswahl', rolle: 'radiogroup', werte: { jeder: ['Jeder'], niemand: ['Niemand'] }, empfohlen: ['niemand'], gruppeUeberOption: true });
    const beide = dom(gruppe(true) + `<ul role="radiogroup">${option('Jeder', true)}${option('Niemand', false)}</ul>`);
    expect([lies(beide, l), lies(beide, l2)]).toEqual([{ token: 'streng' }, { token: 'jeder' }]);
  });

  test('U-16 auswahl: combobox über aria-valuetext, Text, input und select', () => {
    const l = leser({ art: 'auswahl', rolle: 'combobox', werte: { alle: ['Alle', 'All'], keine: ['Keine', 'None'] }, empfohlen: ['alle'] });
    expect(lies(dom('<div role="combobox" aria-label="Testwert" aria-valuetext="Alle">x</div>'), l)).toEqual({ token: 'alle' });
    expect(lies(dom('<button role="combobox" aria-label="Testwert">Keine</button>'), l)).toEqual({ token: 'keine' });
    expect(lies(dom('<input role="combobox" aria-label="Testwert" value="All">'), l)).toEqual({ token: 'alle' });
    expect(lies(dom('<label for="s">Testwert</label><select id="s"><option>Alle</option><option selected>Keine</option></select>'), l)).toEqual({ token: 'keine' });
  });

  test('U-17 text: Wort nach der Überschrift, nur bekannte Wörter werden zu Token', () => {
    const l = leser({ art: 'text', rolle: 'heading', werte: { an: ['Aktiviert', 'Enabled'] }, empfohlen: ['an'] });
    expect(lies(dom('<h2>Testwert</h2><p>Aktiviert</p>'), l)).toEqual({ token: 'an' });
    expect(lies(dom('<div role="heading">Test value</div><p>Enabled</p>'), l)).toEqual({ token: 'an' });
    // Seitentext verlässt den Rahmen nie: Unbekannter Text wird nicht durchgereicht.
    expect(lies(dom('<h2>Testwert</h2><p>Geheim GmbH, Max Muster</p>'), l)).toEqual({ token: 'unbekannt' });
  });

  test('U-18 anzahl: Datenzeilen ohne Kopf, aria-rowcount bei virtuellen Listen, Messung H2', () => {
    const l = leser({ art: 'anzahl', rolle: 'grid', spanne: { max: 4 } });
    const kopf = '<div role="row"><div role="columnheader">Name</div></div>';
    const zeile = '<div role="row"><div role="gridcell">x</div></div>';
    expect(lies(dom(`<div role="grid" aria-label="Testwert">${kopf}${zeile}${zeile}</div>`), l)).toEqual({ token: '2' });
    expect(lies(dom(`<table aria-label="Testwert"><thead><tr><th>N</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`), l)).toEqual({ token: '1' });
    // Fluent zählt die Kopfzeile in aria-rowcount mit und rendert nur einen Teil.
    expect(lies(dom(`<div role="grid" aria-label="Testwert" aria-rowcount="13">${kopf}${zeile}${zeile}</div>`), l)).toEqual({ token: '12' });
    // Gemessen in Edge während des Ladens: Kopf da, aria-rowcount 0. Das ist keine Lesung, sonst hieße es „Passt“ bei „weniger als fünf“.
    const leer = `<div role="grid" aria-label="Testwert" aria-rowcount="0">${kopf}</div>`;
    expect(lies(dom(leer), l)).toBeNull();
    expect(lies(dom(leer), { ...l, leerGilt: true })).toEqual({ token: '0' });
    // Alle drei Tabellenrollen, die Bezeichnung entscheidet.
    expect(lies(dom(`<div role="treegrid" aria-label="Testwert">${kopf}${zeile}</div>`), l)).toEqual({ token: '1' });
  });

  test('U-19 domains: Namen nur zur Anzeige, Token ist die Anzahl, keine Mailadressen, leere Liste ist kein Treffer', () => {
    const l = leser({ art: 'domains', rolle: 'grid' });
    const z = (t: string) => `<div role="row"><div role="rowheader">${t}</div><div role="gridcell">Fehlerfrei</div></div>`;
    const d = dom(`<div role="grid" aria-label="Testwert"><div role="row"><div role="columnheader">Domänenname</div></div>${z('beispiel.de (Standard)')}${z('beispiel.onmicrosoft.com Default')}${z('max@beispiel.de')}${z('Kein Name')}${z('Max.Muster GmbH')}${z('05.11.2026')}${z('Max.Muster')}</div>`);
    expect(lies(d, l)).toEqual({ token: '2', anzeige: ['beispiel.de', 'beispiel.onmicrosoft.com'] });
    expect(lies(dom('<div role="grid" aria-label="Testwert"><div role="row"><div role="columnheader">N</div></div></div>'), l)).toBeNull();
    expect(domainsAus(dom('<table><tr><td>a.de</td><td>b.de</td></tr></table>').querySelector('table')!)).toEqual(['a.de']);
    expect(datenzeilen(dom('<table></table>').querySelector('table')!)).toBe(0);
  });

  test('Sichtbarer Fehlerhinweis zählt, leere oder versteckte nicht', () => {
    expect(fehlerHinweis(dom('<div role="alert">Laden fehlgeschlagen</div>'))).toBe(true);
    expect(fehlerHinweis(dom('<div role="alert"> </div><div role="alert" hidden>x</div><div role="status">Gespeichert</div>'))).toBe(false);
  });

  test('Lade-Ansage des Admin Centers (Aufnahme H6) sperrt nicht, jede Verneinung schon', () => {
    expect(fehlerHinweis(dom('<div role="alert">Domänenliste geladen</div><div role="alert"><div>1 Domäne geladen</div></div>'))).toBe(false);
    expect(fehlerHinweis(dom('<div role="alert">Domain list loaded.</div>'))).toBe(false);
    // H17b, echtes Portal: Microsofts Zufriedenheitsumfrage ist ein role=alert und sperrte zufällig jede Lesung im Rahmen.
    const umfrage = (titel: string, mitAuswahl: boolean) =>
      `<div role="alert"><h2>${titel}</h2><p>Wie zufrieden oder unzufrieden sind Sie mit Microsoft Entra? *</p>${mitAuswahl ? '<input type="radio" name="z"><input type="radio" name="z">' : ''}</div>`;
    expect(fehlerHinweis(dom(umfrage('Feedback an Microsoft senden', true)))).toBe(false);
    expect(fehlerHinweis(dom(umfrage('Send feedback to Microsoft', true)))).toBe(false);
    // Ohne Auswahlknöpfe oder mit anderem Titel bleibt es ein Fehlerhinweis.
    expect(fehlerHinweis(dom(umfrage('Feedback an Microsoft senden', false)))).toBe(true);
    expect(fehlerHinweis(dom(umfrage('Fehler beim Laden', true)))).toBe(true);
    // Grenzen (Prüfer H17e): Ein eigener Fehler daneben oder darin sperrt weiter, ebenso ein langer Zusatztext im selben Alert.
    expect(fehlerHinweis(dom(umfrage('Feedback an Microsoft senden', true) + '<div role="alert">Fehler beim Laden der Einstellungen</div>'))).toBe(true);
    expect(fehlerHinweis(dom('<div role="alert"><h2>Feedback an Microsoft senden</h2><input type="radio"><input type="radio"><div role="alert">Fehler beim Laden</div></div>'))).toBe(true);
    expect(fehlerHinweis(dom(`<div role="alert"><h2>Feedback an Microsoft senden</h2><input type="radio"><input type="radio"><p>${'Die Einstellungen konnten nicht geladen werden. '.repeat(14)}</p></div>`))).toBe(true);
    expect(fehlerHinweis(dom('<div role="alert"><h2>Feedback an Microsoft senden</h2><input type="radio"></div>'))).toBe(true);
    // Echtes Markup in Varianten: Titel in span mit Leerraum/geschütztem Leerzeichen, Knöpfe als role=radio; ausgeblendet zählt gar nicht.
    expect(fehlerHinweis(dom('<div role="alert"> <span>Feedback\u00a0an Microsoft senden</span><div role="radio"></div><div role="radio"></div></div>'))).toBe(false);
    expect(fehlerHinweis(dom('<div role="alert" hidden>Fehler beim Laden</div>'))).toBe(false);
    // H17b, echtes Portal en-US: „Domains list loaded“ und „1 Domain loaded“.
    expect(fehlerHinweis(dom('<div role="alert">Domains list loaded</div><div role="alert"><div>1 Domain loaded</div></div>'))).toBe(false);
    for (const t of ['Domänen konnten nicht geladen werden', 'Nicht geladen', 'Domains could not be loaded', 'Not loaded', 'Teilweise geladen', 'Fehler: Liste geladen', 'Partially loaded', 'Nothing loaded', 'Sitzung abgelaufen, alte Liste geladen', 'Veraltete Werte geladen', 'Domänenliste wird geladen...', 'Daten werden geladen.', 'Werte geladen'])
      expect(fehlerHinweis(dom(`<div role="alert">${t}</div>`)), t).toBe(true);
  });

  test('Lade-Ansage des Exchange Admin Centers (Aufnahme H10, de und en) sperrt nicht, Abwandlungen schon', () => {
    expect(fehlerHinweis(dom('<div role="alert">Akzeptierte Domänen listen geladene ‎1‎ verfügbare Elemente auf</div>'))).toBe(false);
    expect(fehlerHinweis(dom('<div role="alert">Accepted domains list loaded ‎2‎ items available</div>'))).toBe(false);
    for (const t of ['Akzeptierte Domänen konnten nicht geladen werden', 'Accepted domains list loaded 0 items available, error', 'Accepted domains list failed to load'])
      expect(fehlerHinweis(dom(`<div role="alert">${t}</div>`)), t).toBe(true);
  });

  test('Domänenzelle mit versteckter Tooltip-Kopie (Aufbau aus der Aufnahme H6)', () => {
    const zelle = '<div role="gridcell"><span role="button">beispiel.onmicrosoft.com (Standard)</span><div hidden id="t1"><span role="button">beispiel.onmicrosoft.com (Standard)</span></div></div>';
    const d = dom(`<div role="treegrid" aria-label="Domänen"><div role="row"><div role="columnheader">Domänenname</div></div><div role="row"><div role="gridcell"></div>${zelle}<div role="gridcell">Fehlerfrei</div></div></div>`);
    expect(domainsAus(d.querySelector('[role=treegrid]')!)).toEqual(['beispiel.onmicrosoft.com']);
  });

  test('Bezeichnung in der Reihenfolge von §5.2: aria-label, labelledby, label, Gruppe', () => {
    const d = dom(`<fieldset><legend>Gruppe</legend><input id="a" type="checkbox" aria-label="Eins" aria-labelledby="t"><span id="t">Zwei</span><input id="b" type="checkbox" aria-labelledby="t"><label for="c">Drei</label><input id="c" type="checkbox"><input id="e" type="checkbox"></fieldset>`);
    const n = (id: string) => zugaenglicherName(d.getElementById(id)!);
    expect([n('a'), n('b'), n('c'), n('e')]).toEqual(['Eins', 'Zwei', 'Drei', 'Gruppe']);
    expect(lies(dom('<div role="group" aria-label="Testwert"><button role="checkbox" aria-checked="true"></button></div>'), leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'] }))).toEqual({ token: 'ja' });
  });

  test('Versteckte Bedienelemente zählen nicht, Dialog-Leser sucht nur im passenden offenen Dialog (§4.3)', () => {
    const l = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'] });
    const b = (w: string) => `<button role="checkbox" aria-label="Testwert" aria-checked="${w}"></button>`;
    expect(lies(dom(`<div hidden>${b('true')}</div>${b('false')}`), l)).toEqual({ token: 'nein' });
    const mitDialog = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'], dialog: { de: ['Remotedomäne bearbeiten'], en: ['Edit remote domain'] } });
    expect(lies(dom(b('true')), mitDialog)).toBeNull();
    expect(lies(dom(`${b('false')}<div role="dialog" aria-label="Remotedomäne bearbeiten">${b('true')}</div>`), mitDialog)).toEqual({ token: 'ja' });
    expect(lies(dom(`<div role="dialog" aria-label="Anderer Dialog">${b('true')}</div>`), mitDialog)).toBeNull();
  });

  test('U-15d Seitenfenster (H7b): Richtungszeichen im Namen, Entra-Kontextfenster, native Optionsfelder, Voraussetzung nurWenn', () => {
    // M365 umschließt Fensternamen mit U+200E („‎Kalender‎“): unsichtbar, darf den Vergleich nicht kippen.
    expect(normalisiere('\u200eKalender\u200e')).toBe('kalender');
    expect(normalisiere('für \u200eOffice 365\u200f oder \u2066Exchange\u2069')).toBe('für office 365 oder exchange');
    const kal = leser({
      art: 'auswahl',
      rolle: 'radiogroup',
      werte: { frei: ['Nur Zeit'], ort: ['Mit Ort'], alle: ['Alles'] },
      empfohlen: ['frei'],
      gruppeUeberOption: true,
      nurWenn: { de: ['Jedem den Zugriff gestatten'], en: ['Allow anyone'] },
      dialog: { de: ['Kalender'], en: ['Calendar'] },
    });
    const gruppe = (gewaehlt: number) =>
      `<div role="radiogroup">${['Nur Zeit', 'Mit Ort', 'Alles'].map((w, i) => `<input type="radio" id="o${i}" name="k"${i === gewaehlt ? ' checked' : ''}><label for="o${i}">${w}</label>`).join('')}</div>`;
    const kaestchen = (an: boolean) => `<input type="checkbox" id="j"${an ? ' checked' : ''}><label for="j">Jedem den Zugriff gestatten</label>`;
    const fenster = (inhalt: string, name = '\u200eKalender\u200e') => `<div role="dialog" aria-modal="true" aria-label="${name}">${inhalt}</div>`;
    // Native Optionsfelder mit `<label for>`, Gruppe ohne Namen, Fenstername mit Richtungszeichen.
    expect(lies(dom(fenster(kaestchen(true) + gruppe(2))), kal)).toEqual({ token: 'alle' });
    expect(lies(dom(fenster(kaestchen(true) + gruppe(0))), kal)).toEqual({ token: 'frei' });
    // Voraussetzung aus oder fehlt: hier nichts zu lesen (mit Dialog-Schlüssel bleibt es bei der Erklärung).
    expect(lies(dom(fenster(kaestchen(false) + gruppe(2))), kal)).toBeNull();
    expect(lies(dom(fenster(gruppe(2))), kal)).toBeNull();
    expect(lies(dom(fenster(kaestchen(true) + kaestchen(true) + gruppe(2))), kal)).toBeNull();
    // Gesperrtes Voraussetzungs-Häkchen gilt nicht (Freigabe nach außen aus).
    expect(lies(dom(fenster(kaestchen(true).replace('<input', '<input disabled') + gruppe(2))), kal)).toBeNull();
    expect(lies(dom(fenster(kaestchen(true).replace('<input', '<input aria-disabled="true"') + gruppe(2))), kal)).toBeNull();
    // Dieselbe Gruppe außerhalb des Fensters oder in einem anderen Fenster zählt nicht.
    expect(lies(dom(kaestchen(true) + gruppe(2)), kal)).toBeNull();
    expect(lies(dom(fenster(kaestchen(true) + gruppe(2), 'Mail')), kal)).toBeNull();
    // Entra-Kontextfenster: `role=complementary` mit `aria-labelledby`; versteckt zählt es nicht.
    const sd = leser({ art: 'auswahl', rolle: 'combobox', name: { de: ['Sicherheitsstandards'], en: ['Security defaults'] }, werte: { an: ['Aktiviert'], aus: ['Deaktiviert'] }, empfohlen: ['an'], dialog: { de: ['Sicherheitsstandards'], en: ['Security defaults'] } });
    const bereich = (wort: string, extra = '') =>
      `<div role="complementary" aria-labelledby="k"${extra}><h2 id="k">Sicherheitsstandards</h2><label id="l">Sicherheitsstandards</label><div role="combobox" aria-labelledby="l">${wort}</div></div>`;
    expect(lies(dom(bereich('Aktiviert')), sd)).toEqual({ token: 'an' });
    expect(lies(dom(bereich('Deaktiviert')), sd)).toEqual({ token: 'aus' });
    expect(lies(dom(bereich('Aktiviert', ' aria-hidden="true"')), sd)).toBeNull();
    // Per CSS geschlossenes Fenster (Entra: nur eine Klasse sagt „offen“): Der Browser meldet es über `checkVisibility()` als nicht gezeichnet.
    const zu = dom(bereich('Aktiviert'));
    const fensterEl = zu.querySelector('[role="complementary"]') as Element & { checkVisibility?: () => boolean };
    fensterEl.checkVisibility = () => false;
    expect(lies(zu, sd)).toBeNull();
    fensterEl.checkVisibility = () => true;
    expect(lies(zu, sd)).toEqual({ token: 'an' });
    expect(lies(dom('<label id="l">Sicherheitsstandards</label><div role="combobox" aria-labelledby="l">Aktiviert</div>'), sd)).toBeNull();
    // Schema: nurWenn nur mit Dialog-Schlüssel.
    expect(() => leser({ art: 'auswahl', rolle: 'radiogroup', werte: { a: ['A'], b: ['B'] }, empfohlen: ['a'], nurWenn: { de: ['x'], en: ['x'] } })).toThrow();
  });

  describe('U-63 zelle: Wert einer benannten Spalte in benannten Zeilen (H8c)', () => {
    const ein = (w: string) => ({ de: [w], en: [w] });
    const wort = leser({ art: 'zelle', rolle: 'grid', spalte: { de: ['Aktiviert'], en: ['Enabled'] }, zeilen: [ein('SMS'), { de: ['Sprachanruf'], en: ['Voice call'] }], werte: JA_NEIN, empfohlen: ['nein'] });
    // Fluent-Liste wie Entra-Authentifizierungsmethoden: leere Auswahlspalte in Kopf und Zeile, Gruppenzeile ohne Wertzelle.
    const fluent = (sms: string, anruf: string, extra = '') =>
      dom(`<div role="grid" aria-label="Testwert"><div role="row"><div role="columnheader"></div><div role="columnheader">Methode</div><div role="columnheader">Aktiviert</div></div>
        <div role="row"><span role="gridcell"></span><div role="gridcell">Integriert(2)</div></div>
        <div role="row"><span role="gridcell"></span><div role="presentation"><div role="gridcell">SMS</div><div role="gridcell">${sms}</div></div></div>
        <div role="row"><span role="gridcell"></span><div role="presentation"><div role="gridcell">Sprachanruf</div><div role="gridcell">${anruf}</div></div></div>${extra}</div>`);

    test('Wort über werte; passt nur, wenn jede Zeile passt', () => {
      expect(lies(fluent('Nein', 'Nein'), wort)).toEqual({ token: 'nein' });
      expect(lies(fluent('Nein', 'Ja'), wort)).toEqual({ token: 'ja' });
      expect(lies(fluent('Ja', 'Nein'), wort)).toEqual({ token: 'ja' });
      // Seitentext verlässt den Rahmen nie: Unbekanntes Wort wird `unbekannt`.
      expect(lies(fluent('Nein', 'Geheim GmbH'), wort)).toEqual({ token: 'unbekannt' });
    });

    test('Fehlende Zeile oder Spalte = noch nicht da; doppelte = mehrdeutig; versteckte Kopien zählen nicht', () => {
      expect(lies(dom('<div role="grid" aria-label="Testwert"><div role="row"><div role="columnheader">Methode</div><div role="columnheader">Aktiviert</div></div><div role="row"><div role="gridcell">SMS</div><div role="gridcell">Nein</div></div></div>'), wort)).toBeNull();
      expect(lies(dom('<div role="grid" aria-label="Testwert"><div role="row"><div role="columnheader">Methode</div><div role="columnheader">Ziel</div></div><div role="row"><div role="gridcell">SMS</div><div role="gridcell">Nein</div></div></div>'), wort)).toBeNull();
      const doppelt = '<div role="row"><span role="gridcell"></span><div role="gridcell">SMS</div><div role="gridcell">Ja</div></div>';
      expect(lies(fluent('Nein', 'Nein', doppelt), wort)).toEqual({ token: 'mehrdeutig' });
      expect(lies(fluent('Nein<span hidden>Ja</span>', 'Nein'), wort)).toEqual({ token: 'nein' });
      expect(lies(dom('<div role="grid" aria-label="Andere"><div role="row"><div role="columnheader">Aktiviert</div></div></div>'), wort)).toBeNull();
    });

    // Entra-Rollenliste: keine Bezeichnung, Spaltenköpfe in Layout-Tabellen, Zellen verweisen per aria-describedby auf den Kopf.
    const zahl = leser({ art: 'zelle', rolle: 'grid', name: { de: ['Rolle'], en: ['Role'] }, spalte: { de: ['Zuweisungen'], en: ['Assignments'] }, zeilen: [{ de: ['Globaler Administrator'], en: ['Global Administrator'] }], spanne: { max: 4 } });
    const rollen = (n: string) =>
      dom(`<div role="grid"><table role="presentation"><tr role="row"><th role="presentation"></th><th role="presentation"><span id="k1" role="columnheader">Rolle</span></th><th role="presentation"><span id="k2" role="columnheader">Zuweisungen</span></th><th aria-hidden="true"></th></tr></table>
        <table role="presentation"><tr role="row"><td role="presentation"></td><td role="gridcell" aria-describedby="k2">${n}</td><td role="gridcell" aria-describedby="k1">Globaler Administrator</td></tr>
        <tr role="row"><td role="presentation"></td><td role="gridcell" aria-describedby="k2">0</td><td role="gridcell" aria-describedby="k1">Globaler Leser</td></tr></table></div>`);

    test('Tabelle ohne Bezeichnung über den Spaltenkopf, Zelle über aria-describedby, Zahl über die Spanne', () => {
      expect(lies(rollen('3'), zahl)).toEqual({ token: '3' });
      expect(lies(rollen('12'), zahl)).toEqual({ token: '12' });
      expect(lies(rollen('drei'), zahl)).toEqual({ token: 'unbekannt' });
      const lage = (token: string) => bewerten({ leser: zahl, empfehlung: { schwere: 'gelb' } as Eintrag['empfehlung'] }, { token, fristUm: false, aufbauAbweichend: false, andereSprache: false }).art;
      expect([lage('1'), lage('4'), lage('5'), lage('unbekannt')]).toEqual(['passt', 'passt', 'weicht-ab', 'nicht-lesbar']);
    });

    test('nurAbweichung: empfohlener Wert ergibt nie „passt“, Abweichung bleibt Abweichung (Prüfer H8c)', () => {
      const l = { ...zahl, nurAbweichung: true as const };
      const art = (token: string) => bewerten({ leser: l, empfehlung: { schwere: 'gelb' } as Eintrag['empfehlung'] }, { token, fristUm: false, aufbauAbweichend: false, andereSprache: false });
      expect(art('1')).toEqual({ art: 'nur-erklaerung', token: '1' });
      expect(art('5').art).toBe('weicht-ab');
      expect(art('unbekannt').art).toBe('nicht-lesbar');
    });

    test('Zwei Tabellen ohne Bezeichnung mit demselben Kopf = mehrdeutig; Stellung nur bei gleich vielen Köpfen und Zellen', () => {
      const t = '<div role="grid"><div role="row"><div role="columnheader">Rolle</div><div role="columnheader">Zuweisungen</div></div><div role="row"><div role="gridcell">Globaler Administrator</div><div role="gridcell">2</div></div></div>';
      expect(lies(dom(t), zahl)).toEqual({ token: '2' });
      expect(lies(dom(t + t), zahl)).toEqual({ token: 'mehrdeutig' });
      // Azure-Grid: versteckter Kopf über sichtbarer Zelle, kein Verweis → nicht raten.
      const verschoben = '<div role="grid"><div role="row"><div role="columnheader">Rolle</div><div role="columnheader" aria-hidden="true">Typ</div><div role="columnheader">Zuweisungen</div></div><div role="row"><div role="gridcell">Globaler Administrator</div><div role="gridcell">3</div><div role="gridcell">7</div></div></div>';
      expect(lies(dom(verschoben), zahl)).toBeNull();
      // Verweis schlägt aria-colindex.
      const beide = '<div role="grid"><div role="row"><div role="columnheader">Rolle</div><div role="columnheader" id="k" aria-colindex="3">Zuweisungen</div></div><div role="row"><div role="gridcell">Globaler Administrator</div><div role="gridcell" aria-describedby="k">2</div><div role="gridcell" aria-colindex="3">9</div></div></div>';
      expect(lies(dom(beide), zahl)).toEqual({ token: '2' });
      const mitMin = leser({ ...zahl, spanne: { min: 2, max: 4 } });
      const b = (token: string) => bewerten({ leser: mitMin, empfehlung: { schwere: 'gelb' } as Eintrag['empfehlung'] }, { token, fristUm: false, aufbauAbweichend: false, andereSprache: false }).art;
      expect([b('1'), b('2'), b('5')]).toEqual(['weicht-ab', 'passt', 'weicht-ab']);
      expect(() => leserSchema.parse({ ...zahl, spanne: { min: 5, max: 4 } })).toThrow();
    });

    test('aria-colindex vor der Stellung; natives HTML mit th', () => {
      const l = leser({ art: 'zelle', rolle: 'table', spalte: ein('Aktiviert'), zeilen: [ein('SMS')], werte: JA_NEIN, empfohlen: ['nein'] });
      expect(lies(dom('<div role="table" aria-label="Testwert"><div role="row"><div role="columnheader" aria-colindex="3">Aktiviert</div></div><div role="row"><div role="cell" aria-colindex="1">SMS</div><div role="cell" aria-colindex="2">Ja</div><div role="cell" aria-colindex="3">Nein</div></div></div>'), l)).toEqual({ token: 'nein' });
      expect(lies(dom('<table aria-label="Testwert"><thead><tr><th>Methode</th><th>Aktiviert</th></tr></thead><tbody><tr><td>SMS</td><td>Ja</td></tr></tbody></table>'), l)).toEqual({ token: 'ja' });
    });

    test('Schema: spalte und zeilen nur bei zelle, Zahl nur mit genau einer Zeile und ohne empfohlen', () => {
      const roh = { art: 'zelle', rolle: 'grid', name: ein('x'), spalte: ein('s'), zeilen: [ein('z')], rahmen: 'beliebig', dialog: null };
      expect(() => leserSchema.parse({ ...roh, werte: JA_NEIN, empfohlen: ['nein'] })).not.toThrow();
      expect(() => leserSchema.parse({ ...roh, spanne: { max: 4 }, empfohlen: [] })).not.toThrow();
      expect(() => leserSchema.parse({ ...roh, rolle: 'checkbox', werte: JA_NEIN, empfohlen: ['nein'] })).toThrow();
      expect(() => leserSchema.parse({ ...roh, spalte: undefined, werte: JA_NEIN, empfohlen: ['nein'] })).toThrow();
      expect(() => leserSchema.parse({ ...roh, zeilen: undefined, werte: JA_NEIN, empfohlen: ['nein'] })).toThrow();
      expect(() => leserSchema.parse({ ...roh, empfohlen: [] })).toThrow();
      expect(() => leserSchema.parse({ ...roh, spanne: { max: 4 }, empfohlen: ['nein'], werte: JA_NEIN })).toThrow();
      expect(() => leserSchema.parse({ ...roh, spanne: { max: 4 }, empfohlen: [], zeilen: [ein('a'), ein('b')] })).toThrow();
      expect(() => leserSchema.parse({ ...roh, spanne: { max: 4 }, empfohlen: [], leerGilt: true })).toThrow();
      expect(() => leserSchema.parse({ art: 'haekchen', rolle: 'checkbox', name: ein('x'), spalte: ein('s'), empfohlen: ['ja'], rahmen: 'beliebig', dialog: null })).toThrow();
    });

    // Die Mini-DOM-Fälle fanden die Optionsgruppen-Falle in H8b nicht, erst die echte Aufnahme: deshalb auch hier die Fixtures.
    test.skipIf(!MIT_FIXTURES).each([
      ['entra-auth-methoden', 'nein', 'ja'],
      ['entra-rollen', '1', '6'],
      ['entra-benutzereinwilligung', 'verifiziert', 'nicht'],
    ])('Echte Aufnahme %s: liest %s, die konstruierte Fixture %s', (id, aufgenommen, konstruiert) => {
      const e = inhalteLesen().find((x) => x.id === id)!;
      const ordner = new URL(`../fixtures/portale/entra/${id}/`, import.meta.url);
      const ix = JSON.parse(readFileSync(new URL('index.json', ordner), 'utf8')) as { rahmen: { datei: string }[]; abweichung: { datei: string } };
      const lesen = (datei: string) => lies(new JSDOM(readFileSync(new URL(datei, ordner), 'utf8')).window.document, e.leser!);
      expect(ix.rahmen.map((r) => lesen(r.datei)).filter(Boolean)).toEqual([{ token: aufgenommen }]);
      expect(lesen(ix.abweichung.datei)).toEqual({ token: konstruiert });
    });
  });
});

describe('U-22…U-26 Regeln', () => {
  const l = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'] });
  const b = (name: string, w = 'true', extra = '') => `<button role="checkbox" aria-label="${name}" aria-checked="${w}" ${extra}></button>`;

  test('U-22 zwei Treffer im Rahmen und in zwei Rahmen: mehrdeutig', () => {
    expect(lies(dom(b('Testwert') + b('Testwert')), l)).toEqual({ token: 'mehrdeutig' });
    expect(lesungenZusammenfuehren(new Map([[0, { a: 'ja' }], [3, { a: 'ja' }]]))).toEqual({ a: 'mehrdeutig' });
    expect(lesungenZusammenfuehren(new Map<number, Record<string, string>>([[0, {}], [3, { a: 'ja' }]]))).toEqual({ a: 'ja' });
  });

  test('U-23 unbekannter Wert: Teilweise', () => {
    const a = leser({ art: 'auswahl', rolle: 'radiogroup', werte: JA_NEIN, empfohlen: ['ja'] });
    expect(lies(dom('<div role="radiogroup" aria-label="Testwert"><div role="radio" aria-checked="true">Teilweise</div></div>'), a)).toEqual({ token: 'unbekannt' });
    expect(bewerten({ leser: a, empfehlung: { schwere: 'rot' } as Eintrag['empfehlung'] }, { token: 'unbekannt', fristUm: false, aufbauAbweichend: false, andereSprache: false }).art).toBe('nicht-lesbar');
  });

  test('U-24 weiches Trennzeichen, (Vorschau), typografische Anführungszeichen', () => {
    expect(normalisiere('Test­wert  (Vorschau)')).toBe('testwert');
    expect(normalisiere('„Test“ ‘wert’ (Preview)')).toBe('"test" \'wert\'');
    expect(lies(dom(b('Test&shy;wert (Vorschau)')), l)).toEqual({ token: 'ja' });
    const q = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'], name: { de: ['Option „A“'], en: ['Option "A"'] } });
    expect(lies(dom(`<button role="checkbox" aria-label="Option &quot;A&quot;" aria-checked="true"></button>`), q)).toEqual({ token: 'ja' });
  });

  test('U-25 englische Beschriftung; Entra mischt die Sprachen im selben Rahmen (H2)', () =>
    expect(lies(dom(b('Test value')), l)).toEqual({ token: 'ja' }));

  test('U-26 deaktiviertes Bedienelement wird gelesen (Ansicht des Globalen Lesers)', () => {
    expect(lies(dom(b('Testwert', 'false', 'disabled aria-disabled="true"')), l)).toEqual({ token: 'nein' });
  });
});

/** Rahmen mit falscher Uhr: `weiter(ms)` lässt die Zeit laufen und feuert fällige Wecker. */
function pruefstand(html: string, oben = true) {
  const fenster = new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window;
  let t = 1000;
  let n = 0;
  const wecker = new Map<number, { um: number; r: () => void }>();
  const gesendet: LesungMeldung[] = [];
  let hoerer: (m: unknown) => void = () => undefined;
  let ende: () => void = () => undefined;
  const u: RahmenUmgebung = {
    ort: { origin: 'https://entra.microsoft.com', ancestorOrigins: { length: 0 } as DOMStringList },
    oben,
    dokument: fenster.document,
    hoeren: (r) => (hoerer = r),
    senden: (m) => {
      if (m.art === 'lesung') gesendet.push(m);
    },
    gueltig: () => true,
    jetzt: () => t,
    wecken: (r, ms) => (wecker.set(++n, { um: t + ms, r }), n),
    weckerEnde: (k) => void wecker.delete(k as number),
    beiEnde: (r) => (ende = r),
  };
  const weiter = async (ms: number) => {
    const ziel = t + ms;
    for (;;) {
      await new Promise((r) => setTimeout(r, 0)); // Beobachter ausliefern
      const faellig = [...wecker.entries()].filter(([, w]) => w.um <= ziel).sort((a, b) => a[1].um - b[1].um)[0];
      if (!faellig) break;
      wecker.delete(faellig[0]);
      t = Math.max(t, faellig[1].um);
      faellig[1].r();
    }
    t = ziel;
  };
  rahmenStarten(u);
  const auftrag = (l: Leser, frist = FRIST_MS, anfrage = 'a1') => hoerer({ art: 'lies', anfrage, bis: t + frist, leser: [{ id: 'e', leser: l }] });
  return { fenster, gesendet, weiter, auftrag, jetzt: () => t, wecker, u, ende: () => ende() };
}

describe('Rahmen-Maschine: Ruhezeit und Frist (§5.3)', () => {
  const l = leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['nein'] });
  const B = '<button id="b" role="checkbox" aria-label="Testwert" aria-checked="false"></button>';

  test('Portal zeigt erst „aus“, dann den echten Wert (gemessen in Entra): nie ein falsches „nein“', async () => {
    const p = pruefstand(B);
    p.auftrag(l);
    await p.weiter(1800); // bis zu 1,9 s Vorgabewerte
    expect(p.gesendet).toEqual([]);
    p.fenster.document.getElementById('b')!.setAttribute('aria-checked', 'true');
    await p.weiter(RUHE_MS - 100);
    expect(p.gesendet).toEqual([]);
    await p.weiter(200 + TAKT_MS);
    expect(p.gesendet.map((m) => m.token)).toEqual([{ e: 'ja' }]);
  });

  test('Langsame Verbindung: Die Ruhezeit wächst mit der Ladezeit, der späte echte Wert schlägt den Vorgabewert', async () => {
    expect([ruheFuer(0), ruheFuer(7000), ruheFuer(60_000)]).toEqual([RUHE_MS, 7000, RUHE_MAX_MS]);
    const p = pruefstand('');
    p.auftrag(l);
    await p.weiter(7000); // erst nach 7 s erscheint der Regler, mit Vorgabewert
    p.fenster.document.body.insertAdjacentHTML('beforeend', B);
    await p.weiter(6000); // Echter Wert 6 s später: Mit fester Ruhe von 4 s stünde hier schon „nein“ = falsches Passt
    expect(p.gesendet.filter((m) => Object.keys(m.token).length)).toEqual([]);
    p.fenster.document.getElementById('b')!.setAttribute('aria-checked', 'true');
    await p.weiter(7000 + TAKT_MS + 1);
    expect(p.gesendet.filter((m) => Object.keys(m.token).length).map((m) => m.token)).toEqual([{ e: 'ja' }]);
  });

  test('Fehlerhinweis im Rahmen: Der stehen gebliebene Vorgabewert wird nie zur Lesung', async () => {
    const p = pruefstand(`${B}<div role="alert">Daten konnten nicht geladen werden</div>`);
    p.auftrag(l);
    await p.weiter(FRIST_MS + RUHE_MS + 1);
    expect(p.gesendet).toEqual([{ art: 'lesung', anfrage: 'a1', token: {}, anzeige: {}, ende: true }]);
  });

  test('Rahmen geht weg: meldet seine Lesung ab; ohne Lesung bleibt er still', async () => {
    const p = pruefstand(B);
    p.auftrag(l);
    await p.weiter(RUHE_MS + 1);
    p.ende();
    expect(p.gesendet.at(-1)).toEqual({ art: 'lesung', anfrage: 'a1', token: {}, anzeige: {} });
    const q = pruefstand('');
    q.auftrag(l);
    q.ende();
    expect(q.gesendet).toEqual([]);
  });

  test('Rahmen, der erst nach der Frist kommt, liest trotzdem (Entra lädt um)', async () => {
    const p = pruefstand(B, false);
    p.auftrag(l, -5000);
    await p.weiter(RUHE_MS + 1);
    expect(p.gesendet.map((m) => m.token)).toEqual([{ e: 'nein' }]);
  });

  test('Eine Änderung an einem anderen Bedienelement startet die Ruhezeit neu', async () => {
    const p = pruefstand(`${B}<button id="c" role="checkbox" aria-label="Anderes" aria-checked="false"></button>`);
    p.auftrag(l);
    await p.weiter(RUHE_MS - 500);
    p.fenster.document.getElementById('c')!.setAttribute('aria-checked', 'true');
    await p.weiter(1000);
    expect(p.gesendet).toEqual([]);
    await p.weiter(RUHE_MS);
    expect(p.gesendet.map((m) => m.token)).toEqual([{ e: 'nein' }]);
  });

  test('Der Nutzer legt um: Die Lesung folgt dem angezeigten Wert (§5.3)', async () => {
    const p = pruefstand(B);
    p.auftrag(l);
    await p.weiter(RUHE_MS + 1);
    p.fenster.document.getElementById('b')!.setAttribute('aria-checked', 'true');
    await p.weiter(RUHE_MS + TAKT_MS + 1);
    expect(p.gesendet.map((m) => m.token)).toEqual([{ e: 'nein' }, { e: 'ja' }]);
  });

  test('Bedienelement verschwindet: Lesung wird zurückgezogen', async () => {
    const p = pruefstand(B);
    p.auftrag(l);
    await p.weiter(RUHE_MS + 1);
    p.fenster.document.body.textContent = '';
    await p.weiter(TAKT_MS + 1);
    expect(p.gesendet.at(-1)?.token).toEqual({});
  });

  test('U-27 Frist um: oberster Rahmen meldet das Ende, spät auftauchende Werte zählen nicht mehr', async () => {
    const p = pruefstand('');
    p.auftrag(l);
    await p.weiter(FRIST_MS + RUHE_MS + 1);
    expect(p.gesendet).toEqual([{ art: 'lesung', anfrage: 'a1', token: {}, anzeige: {}, ende: true }]);
    p.fenster.document.body.insertAdjacentHTML('beforeend', B);
    await p.weiter(30_000);
    expect(p.gesendet).toHaveLength(1);
  });

  test('Eingebetteter Rahmen meldet kein Ende, leerer Fund bleibt still; Wert kurz vor der Frist wird noch fertig', async () => {
    const p = pruefstand('', false);
    p.auftrag(l);
    await p.weiter(14_000);
    p.fenster.document.body.insertAdjacentHTML('beforeend', B);
    await p.weiter(RUHE_MAX_MS + TAKT_MS + 1);
    expect(p.gesendet.map((m) => m.token)).toEqual([{ e: 'nein' }]);
    expect(p.gesendet.some((m) => m.ende)).toBe(false);
  });

  test('Neuer Auftrag stoppt den alten; gleiche Anfrage läuft nicht doppelt; Leser mit fremdem Rahmen sucht nicht', async () => {
    const p = pruefstand(B);
    p.auftrag(l, FRIST_MS, 'alt');
    p.auftrag(l, FRIST_MS, 'alt');
    p.auftrag(l, FRIST_MS, 'neu');
    await p.weiter(RUHE_MS + 1);
    expect(p.gesendet.map((m) => m.anfrage)).toEqual(['neu']);
    const r = pruefstand(B);
    r.auftrag(l, FRIST_MS, 'neu');
    r.auftrag(l, 10_000, 'ueberholt');
    await r.weiter(RUHE_MS + 1);
    expect(r.gesendet.map((m) => m.anfrage)).toEqual(['neu']);
    expect(zustaendig('oben', true)).toBe(true);
    expect(zustaendig('oben', false)).toBe(false);
    expect(zustaendig('eingebettet', true)).toBe(false);
    expect(zustaendig('eingebettet', false)).toBe(true);
    expect(zustaendig('beliebig', false)).toBe(true);
    const q = pruefstand(B);
    q.auftrag({ ...l, rahmen: 'eingebettet' });
    await q.weiter(RUHE_MS + 1);
    expect(q.gesendet).toEqual([]);
  });

  test('Das DOM wird nicht öfter als alle 500 ms angesehen', async () => {
    const p = pruefstand(B);
    const anfragen = vi.spyOn(p.fenster.document, 'querySelectorAll');
    p.auftrag(l);
    const vorher = anfragen.mock.calls.length;
    for (let i = 0; i < 20; i++) {
      p.fenster.document.body.setAttribute('data-x', String(i));
      await p.weiter(50);
    }
    // 20 Änderungen in 1000 ms: höchstens zwei Lesedurchläufe, je Durchlauf zwei Abfragen (Fehlerhinweis, Bedienelement).
    expect(anfragen.mock.calls.length - vorher).toBeLessThanOrEqual(4);
  });

  test('Rahmen meldet sich beim Start, damit nachgeladene Rahmen den laufenden Auftrag bekommen', () => {
    const senden = vi.fn();
    const d = new JSDOM('').window.document;
    rahmenStarten({ ort: { origin: 'https://entra.microsoft.com', ancestorOrigins: { length: 0 } as DOMStringList }, oben: true, dokument: d, hoeren: () => undefined, senden, gueltig: () => true, jetzt: () => 0, wecken: () => 0, weckerEnde: () => undefined });
    expect(senden).toHaveBeenCalledWith({ art: 'rahmen-bereit' });
  });
});

describe('Nachrichten: was den Rahmen verlässt, ist begrenzt', () => {
  test('Domainnamen nur für Art domains und nur in Domainform; nie für andere Einträge', () => {
    const m = { art: 'lesung', anfrage: 'a', token: { d: '2', e: 'ja' }, anzeige: { d: ['a.de', 'max@a.de', 'Max Muster'], e: ['b.de'] } };
    expect(alsLesungMeldung(m, 'a', ['d', 'e'], ['d'])).toEqual({ art: 'lesung', anfrage: 'a', token: { d: '2', e: 'ja' }, anzeige: { d: ['a.de'] }, ende: false });
    expect(alsLesungMeldung({ ...m, token: { e: 'x'.repeat(41) } }, 'a', ['e'])?.token).toEqual({});
  });
});

describe('Passt nur mit sicherer Lesung (Abnahme H5, §5.4)', () => {
  const LESER: Leser[] = [
    leser({ art: 'schalter', rolle: 'switch', empfohlen: ['ja'] }),
    leser({ art: 'haekchen', rolle: 'checkbox', empfohlen: ['nein'] }),
    leser({ art: 'auswahl', rolle: 'radiogroup', werte: JA_NEIN, empfohlen: ['nein'] }),
    leser({ art: 'text', rolle: 'heading', werte: { an: ['An'], aus: ['Aus'] }, empfohlen: ['an'] }),
    leser({ art: 'anzahl', rolle: 'grid', spanne: { min: 1, max: 4 } }),
    leser({ art: 'domains', rolle: 'grid' }),
    leser({ art: 'zelle', rolle: 'grid', spalte: { de: ['S'], en: ['S'] }, zeilen: [{ de: ['Z'], en: ['Z'] }], werte: JA_NEIN, empfohlen: ['nein'] }),
    leser({ art: 'zelle', rolle: 'grid', spalte: { de: ['S'], en: ['S'] }, zeilen: [{ de: ['Z'], en: ['Z'] }], spanne: { min: 1, max: 4 } }),
    leser({ art: 'zelle', rolle: 'grid', spalte: { de: ['S'], en: ['S'] }, zeilen: [{ de: ['Z'], en: ['Z'] }], werte: JA_NEIN, empfohlen: ['nein'], nurAbweichung: true }),
    leser({ art: 'zelle', rolle: 'grid', spalte: { de: ['S'], en: ['S'] }, zeilen: [{ de: ['Z'], en: ['Z'] }], spanne: { max: 4 }, nurAbweichung: true }),
  ];
  const TOKEN = [undefined, 'ja', 'nein', 'an', 'aus', '0', '3', '9', 'mehrdeutig', 'unbekannt', '', 'constructor', '__proto__', '-1', '3.5', 'Teilweise'];
  const SCHWEREN = ['rot', 'gelb'] as const;
  const JA_NEIN_BOOL = [true, false];

  test('Über alle Lagen: passt genau dann, wenn nichts dagegen spricht und das Token empfohlen ist', () => {
    let geprueft = 0;
    for (const l of LESER)
      for (const token of TOKEN)
        for (const schwere of SCHWEREN)
          for (const fristUm of JA_NEIN_BOOL)
            for (const aufbauAbweichend of JA_NEIN_BOOL)
              for (const andereSprache of JA_NEIN_BOOL)
                for (const bewusst of JA_NEIN_BOOL) {
                  const lage: Lage = { token, fristUm, aufbauAbweichend, andereSprache, bewusst };
                  const b = bewerten({ leser: l, empfehlung: { schwere } as Eintrag['empfehlung'] }, lage);
                  const sicher =
                    !aufbauAbweichend &&
                    !andereSprache &&
                    token !== undefined &&
                    !l.nurAbweichung &&
                    (l.art === 'anzahl' || l.spanne ? token === '3' : l.art !== 'domains' && l.empfohlen.includes(token));
                  geprueft++;
                  expect(b.art === 'passt', JSON.stringify({ art: l.art, lage })).toBe(sicher);
                  if (b.art === 'passt') expect(b).toMatchObject({ form: 'kreis', farbe: 'ok', token });
                }
    expect(geprueft).toBe(5120);
  });

  test('Tabelle §5.4: Form und Farbe je Lage', () => {
    const e = (schwere: 'rot' | 'gelb', l: Leser | null = LESER[1]!) => ({ leser: l, empfehlung: { schwere } as Eintrag['empfehlung'] });
    const g: Lage = { token: 'ja', fristUm: false, aufbauAbweichend: false, andereSprache: false };
    expect(bewerten(e('rot'), g)).toEqual({ art: 'weicht-ab', form: 'quadrat', farbe: 'down', token: 'ja' });
    expect(bewerten(e('gelb'), g)).toEqual({ art: 'weicht-ab', form: 'dreieck', farbe: 'degraded', token: 'ja' });
    expect(bewerten(e('rot'), { ...g, bewusst: true })).toEqual({ art: 'bewusst', form: 'raute', farbe: 'planned', token: 'ja' });
    expect(bewerten(e('rot'), { ...g, token: 'nein' })).toEqual({ art: 'passt', form: 'kreis', farbe: 'ok', token: 'nein' });
    expect(bewerten(e('rot', null), g)).toEqual({ art: 'nur-erklaerung' });
    expect(bewerten(e('rot'), { ...g, token: undefined })).toEqual({ art: 'lese' });
    expect(bewerten(e('rot'), { ...g, token: undefined, fristUm: true })).toEqual({ art: 'nicht-lesbar', grund: 'zeitgrenze', form: 'strich', farbe: 'unknown' });
    expect(bewerten(e('rot'), { ...g, aufbauAbweichend: true }).grund).toBe('aufbau');
    expect(bewerten(e('rot'), { ...g, andereSprache: true }).grund).toBe('sprache');
    expect(bewerten(e('rot'), { ...g, token: 'mehrdeutig' }).grund).toBe('mehrdeutig');
    const dialog = { ...LESER[1]!, dialog: { de: ['D'], en: ['D'] } };
    expect(bewerten(e('rot', dialog), { ...g, token: undefined, fristUm: true })).toEqual({ art: 'nur-erklaerung' });
  });

  test('U-11b Ladefrist (H17c): Sprache/Aufbau vorläufig → „lese“, nach der Frist „nicht lesbar“', () => {
    const e = { leser: LESER[1]!, empfehlung: { schwere: 'rot' } as Eintrag['empfehlung'] };
    const g: Lage = { token: undefined, fristUm: false, aufbauAbweichend: false, andereSprache: false, ladend: true };
    expect(bewerten(e, { ...g, andereSprache: true })).toEqual({ art: 'lese' });
    expect(bewerten(e, { ...g, aufbauAbweichend: true })).toEqual({ art: 'lese' });
    // Auch eine alte Lesung zählt nicht, solange die Seite nicht feststeht — nie „passt“ auf dem Ladebildschirm (U-23).
    expect(bewerten(e, { ...g, aufbauAbweichend: true, token: 'nein' })).toEqual({ art: 'lese' });
    expect(bewerten(e, { ...g, aufbauAbweichend: true, ladend: false }).grund).toBe('aufbau');
    expect(bewerten(e, { ...g, andereSprache: true, ladend: false }).grund).toBe('sprache');
    // Ohne Abweichung ändert die Ladefrist nichts.
    expect(bewerten(e, { ...g, token: 'ja' })).toMatchObject({ art: 'weicht-ab' });
    const dialog = { ...e, leser: { ...LESER[1]!, dialog: { de: ['D'], en: ['D'] } } };
    expect(bewerten(dialog, { ...g, aufbauAbweichend: true })).toEqual({ art: 'nur-erklaerung' });

    const eintrag = () => e;
    const z = { eintraege: ['a'], aufbauAbweichend: ['a'], sprache: 'de' as const, lesungen: {}, fristUm: false, ladeBis: 1_000 };
    expect(tabBewerten(z, eintrag, () => false, 999).a).toEqual({ art: 'lese' });
    expect(tabBewerten(z, eintrag, () => false, 1_000).a?.grund).toBe('aufbau');
    expect(tabBewerten({ ...z, ladeBis: null }, eintrag, () => false, 0).a?.grund).toBe('aufbau');
    expect(tabBewerten({ ...z, aufbauAbweichend: [], sprache: 'andere' }, eintrag, () => false, 999).a).toEqual({ art: 'lese' });
  });

  test('U-11c Ladefrist je Route: beginnt einmal, bleibt (auch abgelaufen), neu nur nach Routenwechsel oder sauberer Seite', () => {
    const b = (x: Partial<Pick<Seitenbefund, 'schluessel' | 'eintraege' | 'aufbauAbweichend' | 'sprache'>> = {}) => ({
      schluessel: 'r1', eintraege: ['a'], aufbauAbweichend: [] as string[], sprache: 'andere' as const, ...x,
    });
    expect(ladeBisFuer(b(), undefined, 100, 30)).toBe(130);
    // Ladebildschirm wechselt erst `lang`, dann den Titel: dieselbe Frist läuft weiter.
    expect(ladeBisFuer(b({ sprache: 'de', aufbauAbweichend: ['a'] }), { schluessel: 'r1', ladeBis: 130 }, 110, 30)).toBe(130);
    // Abgelaufen und weiter fremd: bleibt abgelaufen, kein Rücksprung auf „lese“ bei einer Titeländerung.
    expect(ladeBisFuer(b(), { schluessel: 'r1', ladeBis: 130 }, 500, 30)).toBe(130);
    expect(ladeBisFuer(b(), { schluessel: 'r2', ladeBis: 130 }, 500, 30)).toBe(530);
    expect(ladeBisFuer(b(), { schluessel: 'r1', ladeBis: null }, 500, 30)).toBe(530);
    expect(ladeBisFuer(b({ sprache: 'de' }), { schluessel: 'r1', ladeBis: 130 }, 110, 30)).toBeNull();
    expect(ladeBisFuer(b({ eintraege: [] }), undefined, 100, 30)).toBeNull();
  });

  test('Abzeichen zählt nur „weicht ab“, bewusste Abweichung nicht', () => {
    const eintrag = (id: string) => ({ leser: LESER[1]!, empfehlung: { schwere: id === 'a' ? 'rot' : 'gelb' } as Eintrag['empfehlung'] });
    const z = { eintraege: ['a', 'b', 'c', 'd'], aufbauAbweichend: [], sprache: 'de' as const, lesungen: { a: 'ja', b: 'nein', c: 'ja' }, fristUm: false };
    const b = tabBewerten(z, eintrag, (id) => id === 'c');
    expect(Object.values(b).map((x) => x.art)).toEqual(['weicht-ab', 'passt', 'bewusst', 'lese']);
    expect(abweichungenZaehlen(Object.values(b))).toBe(1);
  });
});

describe('U-30…U-36 Inhaltsdateien', () => {
  const alle = inhalteLesen();
  const LATEIN_TEXTE = (e: Eintrag): string[] => [
    e.titel.de, e.titel.en, e.wasEsTut.de, e.wasEsTut.en, e.empfehlung.kurz.de, e.empfehlung.kurz.en,
    e.empfehlung.wennEsSoBleibt.de, e.empfehlung.wennEsSoBleibt.en, e.empfehlung.vorher?.de ?? '', e.empfehlung.vorher?.en ?? '',
    ...(e.soGehts?.de ?? []), ...(e.soGehts?.en ?? []),
    ...(e.index ?? []).flatMap((s) => [s.satz.de, s.satz.en]),
  ];

  test('U-30 Schema gültig, id eindeutig, die zwei Beispiel-Einträge da, Bündel gleich Datei', () => {
    expect(alle.map((e) => e.id).sort()).toEqual(expect.arrayContaining(['entra-app-registrierung', 'm365-domains']));
    expect(new Set(alle.map((e) => e.id)).size).toBe(alle.length);
    expect(ALLE_EINTRAEGE.map((e) => e.id)).toEqual(alle.map((e) => e.id));
    // „jede route hat ≥ 1 Fixture“ (H6): aufgenommen mit `npm run fixtures`, abgespielt in tests/e2e/fixtures.spec.ts.
    for (const e of alle.filter((x) => MIT_FIXTURES && x.status === 'aktiv')) {
      const pfad = new URL(`../fixtures/portale/${e.portal}/${e.id}/index.json`, import.meta.url);
      expect(existsSync(pfad), `Fixture für ${e.id} fehlt`).toBe(true);
      expect((JSON.parse(readFileSync(pfad, 'utf8')) as { route: string }).route).toBe(e.route);
    }
    expect(() => eintragSchema.parse({ ...alle[0], unbekannt: 1 })).toThrow();
    expect(() => eintragSchema.parse({ ...alle[0], id: 'falsch' })).toThrow();
  });

  test('Schema weist reservierte Token, „passt“ ohne Bezug und Schwere info mit Leser ab', () => {
    const roh = { name: { de: ['x'], en: ['x'] }, rahmen: 'beliebig', dialog: null };
    expect(() => leserSchema.parse({ ...roh, art: 'auswahl', rolle: 'radiogroup', werte: { mehrdeutig: ['x'] }, empfohlen: ['mehrdeutig'] })).toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'auswahl', rolle: 'radiogroup', werte: { a: ['x'] }, empfohlen: ['b'] })).toThrow();
    // H8d: Gruppe über ihre Optionen nur bei Optionsgruppen.
    expect(() => leserSchema.parse({ ...roh, art: 'auswahl', rolle: 'combobox', werte: { a: ['x'] }, empfohlen: ['a'], gruppeUeberOption: true })).toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'auswahl', rolle: 'radiogroup', werte: { a: ['x'] }, empfohlen: ['a'], gruppeUeberOption: true })).not.toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'haekchen', rolle: 'checkbox', empfohlen: [] })).toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'anzahl', rolle: 'grid', empfohlen: [] })).toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'domains', rolle: 'grid', empfohlen: ['x'] })).toThrow();
    expect(() => leserSchema.parse({ ...roh, art: 'haekchen', rolle: 'checkbox', empfohlen: ['ja'], leerGilt: true })).toThrow();
    const e = alle.find((x) => x.id === 'entra-app-registrierung')!;
    expect(() => eintragSchema.parse({ ...e, empfehlung: { ...e.empfehlung, schwere: 'info' } })).toThrow();
    const m = alle.find((x) => x.id === 'm365-domains')!;
    expect(() => eintragSchema.parse({ ...m, index: [{ kennzahl: 'dmarc.wirksam_prozent', satz: { de: 'Es sind 40 %', en: '40%' } }] })).toThrow();
  });

  test('Der Bau prüft mit: Hook in wxt.config.ts', () =>
    expect(readFileSync(new URL('../../wxt.config.ts', import.meta.url), 'utf8')).toMatch(/'build:before': \(\) => void inhalteLesen\(\)/));

  test('zod landet nicht im Bündel: Laufzeit-Code importiert das Schema nur als Typ', () => {
    for (const d of ['lib/inhalte.ts', 'lib/leser.ts', 'lib/zustand.ts', 'lib/nachrichten.ts']) {
      expect(readFileSync(new URL(`../../${d}`, import.meta.url), 'utf8'), d).not.toMatch(/^import \{[^}]*\} from '[^']*schema'/m);
    }
  });

  test.each(alle.map((e) => [e.id, e] as const))('U-31…U-36 %s', (_id, e) => {
    // U-31 verbotene Wörter
    for (const t of LATEIN_TEXTE(e)) {
      expect(t, 'U-31').not.toMatch(/garantiert|guaranteed|100\s*%|absolut|immer sicher|always secure|\d\s*€|€\s*\d|\bEUR\b/i);
    }
    // U-32 Längen und beide Sprachen
    for (const s of ['de', 'en'] as const) {
      expect(e.wasEsTut[s].length, 'U-32 wasEsTut').toBeLessThanOrEqual(320);
      expect(e.empfehlung.kurz[s].length, 'U-32 kurz').toBeLessThanOrEqual(80);
      expect((e.soGehts?.[s] ?? []).length, 'U-32 soGehts').toBeLessThanOrEqual(3);
    }
    expect((e.soGehts?.de ?? []).length).toBe((e.soGehts?.en ?? []).length);
    // U-33 fachlich geprüft vor höchstens 180 Tagen
    if (e.status === 'aktiv') {
      const tage = (Date.now() - new Date(e.inhaltGeprueftAm).getTime()) / 86_400_000;
      expect(tage, 'U-33').toBeLessThanOrEqual(180);
      expect(tage, 'U-33 Datum in der Zukunft').toBeGreaterThan(-1);
    }
    // U-34 kann Nutzer aussperren → „Vorher bedenken“ ist Pflicht
    if (['entra-sicherheitsstandards', 'entra-ca-richtlinien', 'entra-auth-methoden'].includes(e.id)) expect(e.empfehlung.vorher, 'U-34').toBeDefined();
    // U-35 Index-Zahlen aus der Erhebung, nie von Hand
    for (const s of e.index ?? []) {
      expect(kennzahlWert(s.kennzahl), `U-35 ${s.kennzahl}`).toBeTypeOf('number');
      expect(s.satz.de).toContain('{wert}');
      expect(s.satz.en).toContain('{wert}');
    }
    // U-36 Quellen nur von der Positivliste; Learn-Pfade ohne Sprache
    for (const q of e.quellen) {
      // Microsofts Produktblogs (`techcommunity.microsoft.com/blog/…`) nur, wo Learn selbst für den aktuellen Zeitplan dorthin
      // verweist (H7b: Ende der SMTP-Standardauthentifizierung); Foren und Fragen der Community nie.
      if ('url' in q) {
        const u = new URL(q.url);
        expect(u.hostname, 'U-36').toMatch(/^(learn\.microsoft\.com|www\.bsi\.bund\.de|www\.hagel-it\.de|techcommunity\.microsoft\.com)$/);
        if (u.hostname === 'techcommunity.microsoft.com') expect(u.pathname, 'U-36 nur Microsoft-Blog').toMatch(/^\/blog\/[a-z-]+\/[a-z0-9-]+\/\d+$/);
      }
      else expect(q.pfad, 'U-36').not.toMatch(/^(de-de|en-us)\//);
    }
  });

  test('U-35 Zahlen im fertigen Satz gleich ergebnis-2026.json', () => {
    const m = alle.find((x) => x.id === 'm365-domains')!;
    const de = indexSaetze(m, 'de');
    const en = indexSaetze(m, 'en');
    const g = ergebnis.gesamt;
    expect(de[0]).toContain(`${String(g.dmarc.wirksam_prozent).replace('.', ',')}\u00a0% von ${g.mit_mailempfang}`);
    expect(de[0]).toContain(String(ergebnis.jahr));
    expect(de[1]).toContain(`${String(g.spf.streng_prozent).replace('.', ',')}\u00a0%`);
    expect(de.join(' ')).not.toMatch(/\d %/);
    expect(en[0]).toContain(`${g.dmarc.wirksam_prozent}% of ${g.mit_mailempfang}`);
    expect(basisVon('dnssec.prozent')).toBe(g.gemessen);
    expect(basisVon('mta_sts.prozent')).toBe(g.mit_mailempfang);
    expect(kennzahlWert('gibt.es_nicht')).toBeNull();
    expect(kennzahlWert('constructor')).toBeNull();
  });
});
