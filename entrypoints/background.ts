// Dienstarbeiter (Spez. §3.3, §11.1): Tab-Zustand, Seitenleiste je Tab, Popup außerhalb, Abzeichen, Nachrichtenfluss.
// Zustand je Tab in einer Map, gespiegelt in `storage.session` — übersteht das Schlafen des Dienstarbeiters (T-07).
import { AKTIVE_EINTRAEGE, KOEPFE, eintragMit } from '../lib/inhalte';
import {
  FRIST_MS,
  LADEFRIST_MS,
  PORT_PRAEFIX,
  SPEICHER_PRAEFIX,
  abzeichenText,
  alsLesungMeldung,
  alsSeiteMeldung,
  lesungenZusammenfuehren,
  vomEigenenSkript,
  type LeserAuftrag,
  type LiesAuftrag,
  type TabZustand,
  type ZustandMeldung,
} from '../lib/nachrichten';
import { ausgeblendetLaden, beiAenderung, firmaLaden, nutzerAnzeigeLaden } from '../lib/einstellungen';
import {
  ABGEFRAGT,
  ABSTAND_MIN,
  STAND,
  STATUS_ADRESSE,
  WECKER,
  abzeichenMit,
  anzeigeAn,
  dienstName,
  gespeicherterStand,
  standAus,
  type Stand,
} from '../lib/stoerung';
// Firmenmodus `sprache` (Spez. §10): Der Symboltitel kommt sonst aus dem Manifest in Browsersprache. Nur dieser eine Text
// aus beiden Dateien (benannter JSON-Import, der Rest fällt beim Bau weg); im Dienstarbeiter gibt es kein `import()`.
import { erweiterung_titel as TITEL_DE } from '../public/_locales/de/messages.json';
import { erweiterung_titel as TITEL_EN } from '../public/_locales/en/messages.json';
import { stoerung_symbol as STOERUNG_DE } from '../public/_locales/de/messages.json';
import { stoerung_symbol as STOERUNG_EN } from '../public/_locales/en/messages.json';
import { bewusstVon, OHNE_FIRMA, type Firma } from '../lib/firmenmodus';
import { seiteBewerten } from '../lib/seite';
import { popupFuer, startSeiteBei } from '../lib/flaeche';
import { herkunftVon } from '../lib/zugriff';
import { abweichungenZaehlen, ladeBisFuer, tabBewerten } from '../lib/zustand';

type Port = ReturnType<typeof browser.runtime.connect>;

/** Einträge der Art `domains`: nur deren Meldungen dürfen Namen tragen (§5.3). */
const MIT_ANZEIGE = AKTIVE_EINTRAEGE.filter((e) => e.leser?.art === 'domains').map((e) => e.id);

/** Firmeneinstellungen (§10) und ausgeblendete Hinweise (Z-11); geladen mit `bereit`, nachgezogen bei jeder Änderung. */
let firma: Firma = OHNE_FIRMA;
/** S8: letzter brauchbarer Stand der Störungsanzeige (`null` = aus, nichts gestört bekannt oder veraltet). */
let stand: Stand | null = null;
let anzeige = false;
const titelSetzen = () => {
  const basis =
    firma.sprache === 'de' ? TITEL_DE.message : firma.sprache === 'en' ? TITEL_EN.message : browser.i18n.getMessage('erweiterung_titel');
  const gestoert = stand?.gestoert ?? [];
  if (gestoert.length === 0) return browser.action.setTitle({ title: basis });
  const namen = gestoert.map(dienstName).join(', ');
  const zusatz =
    firma.sprache === 'de'
      ? STOERUNG_DE.message.replace('$1', namen)
      : firma.sprache === 'en'
        ? STOERUNG_EN.message.replace('$1', namen)
        : browser.i18n.getMessage('stoerung_symbol', [namen]);
  return browser.action.setTitle({ title: `${basis} · ${zusatz}` });
};
let ausgeblendet: ReadonlySet<string> = new Set();

function leserFuer(z: TabZustand): LeserAuftrag[] {
  // Z-15: Hat die Firma das Lesen abgeschaltet, geht kein Auftrag an die Seite.
  if (!firma.werteLesen) return [];
  return z.zuLesen.flatMap((id) => {
    const leser = eintragMit(id)?.leser;
    return leser ? [{ id, leser }] : [];
  });
}

const auftragFuer = (z: TabZustand & { anfrage: string; bis: number }): LiesAuftrag => ({
  art: 'lies',
  anfrage: z.anfrage,
  bis: z.bis,
  leser: leserFuer(z),
});

export default defineBackground(() => {
  const zustaende = new Map<number, TabZustand>();
  const leisten = new Map<number, Set<Port>>();
  /** Lesungen je Rahmen des laufenden Auftrags je Tab (nur Arbeitsspeicher; der Auftrag selbst steht im Zustand). */
  const jeRahmen = new Map<number, Map<number, Record<string, string>>>();
  /** Domainnamen je Tab und Eintrag: nur Arbeitsspeicher, nie `storage.session` (§3.3). Nach einem Neustart neu gelesen. */
  const anzeigen = new Map<number, Map<number, Record<string, string[]>>>();
  /** Werte von vor dem Neustart: Sie gelten, bis die Rahmen des neuen Auftrags fertig sind (Ende der Frist), damit nichts flackert. */
  const uebernommen = new Map<number, Record<string, string>>();

  /** M-8: Seitenleiste fehlt (Edge mit abgeschalteter Leiste) → Popup mit derselben Oberfläche (§11.1). */
  let ohneLeiste = typeof browser.sidePanel?.open !== 'function';

  /** Spiegel der erteilten Herkünfte (Z-12), nachgezogen bei `permissions.onAdded/onRemoved`. */
  let erlaubt: ReadonlySet<string> = new Set();
  const rechteLaden = async () => {
    erlaubt = new Set((await browser.permissions.getAll()).origins ?? []);
  };

  const bereit = (async () => {
    await rechteLaden();
    [firma, ausgeblendet] = await Promise.all([firmaLaden(), ausgeblendetLaden().then((l) => new Set(l))]);
    const alles = await browser.storage.session.get(null);
    stand = gespeicherterStand(alles[STAND], Date.now());
    void titelSetzen();
    for (const [k, v] of Object.entries(alles)) {
      if (k.startsWith(SPEICHER_PRAEFIX)) zustaende.set(Number(k.slice(SPEICHER_PRAEFIX.length)), v as TabZustand);
    }
  })();
  // Nach einem Neustart neu lesen: Die Zuordnung Rahmen → Lesung und die Domainnamen lagen nur im Arbeitsspeicher, und
  // ohne sie fiele ein Treffer in zwei Rahmen nicht mehr auf. Die Werte bleiben stehen, bis die neuen da sind (T-07).
  void bereit.then(() => {
    for (const [tabId, z] of zustaende) {
      if (z.anfrage) void lesenAnfordern(tabId, z, true);
      // Laufende Ladefrist: Der Wecker lag nur im Arbeitsspeicher (H17c); ist sie inzwischen um, gleich neu bewerten.
      else if (typeof z.ladeBis === 'number') void setzen(tabId, z);
    }
  });

  // S8 Störungsanzeige: Standard aus. An → Wecker alle fünf Minuten und ein `GET` auf genau `STATUS_ADRESSE`; aus → Wecker
  // weg, Stand gelöscht. Nichts aus den Portalen geht mit (kein Tab, kein Schlüssel, keine Lesung) — Prüfung U-43c.
  // Abzeichen aller Tabs neu setzen: Tab-eigene Texte (Portal-Zahl, '' außerhalb) überdecken das globale, und ein Merkzettel im
  // Arbeitsspeicher wäre nach dem Schlafen leer (Prüfer S8). `tabs.query` liefert ohne `tabs`-Recht die Kennungen.
  async function stoerungZeigen() {
    void titelSetzen();
    await browser.action.setBadgeText({ text: abzeichenMit('', stand) });
    for (const tab of await browser.tabs.query({})) {
      if (tab.id === undefined) continue;
      const z = zustaende.get(tab.id);
      await browser.action.setBadgeText({ tabId: tab.id, text: abzeichenMit(z ? abzeichenText(z.abweichungen) : '', stand) }).catch(() => undefined);
    }
  }

  /** `zwingend` nur vom Wecker; sonst (Aufwachen, Einstellungsänderung) nur, wenn die letzte eigene Abfrage ≥ 5 Min. her ist. */
  async function stoerungAbfragen(zwingend: boolean) {
    if (!anzeige) return;
    const zuletzt = (await browser.storage.session.get(ABGEFRAGT))[ABGEFRAGT];
    if (!zwingend && typeof zuletzt === 'number' && Date.now() - zuletzt < ABSTAND_MIN * 60_000 - 5_000) return stoerungZeigen();
    await browser.storage.session.set({ [ABGEFRAGT]: Date.now() });
    let neu: Stand | null = null;
    try {
      const antwort = await fetch(STATUS_ADRESSE, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' });
      if (antwort.ok) neu = standAus(await antwort.json(), Date.now());
    } catch {
      // Kein Netz oder Website nicht erreichbar: alter Stand gilt, solange er frisch ist.
    }
    if (!anzeige) return;
    stand = neu ?? gespeicherterStand(stand, Date.now());
    await (stand ? browser.storage.session.set({ [STAND]: stand }) : browser.storage.session.remove(STAND));
    await stoerungZeigen();
  }

  // Nacheinander, nie parallel (Start und Speicheränderung können sich sonst überholen und einen Wecker übrig lassen).
  let anpassenKette: Promise<void> = Promise.resolve();
  const anzeigeAnpassen = () => (anpassenKette = anpassenKette.then(anpassen, anpassen));
  async function anpassen() {
    anzeige = anzeigeAn(firma.stoerungsanzeige, await nutzerAnzeigeLaden());
    if (anzeige) {
      if (!(await browser.alarms.get(WECKER))) await browser.alarms.create(WECKER, { periodInMinutes: ABSTAND_MIN });
      await stoerungAbfragen(false);
    } else {
      await browser.alarms.clear(WECKER);
      // Nach dem Schlafen weiß der Dienstarbeiter nicht, ob vorher ein Punkt stand — der Speicher weiß es (Prüfer S8).
      const war = Object.keys(await browser.storage.session.get([STAND, ABGEFRAGT])).length > 0;
      stand = null;
      await browser.storage.session.remove([STAND, ABGEFRAGT]);
      if (war) await stoerungZeigen();
    }
  }
  void bereit.then(anzeigeAnpassen);

  browser.alarms.onAlarm.addListener((w) => {
    if (w.name === WECKER) void bereit.then(() => stoerungAbfragen(true));
  });

  async function lesenAnfordern(tabId: number, z: TabZustand, behalten = false) {
    if (leserFuer(z).length === 0) return setzen(tabId, { ...z, anfrage: null, bis: null });
    // Nach einem Neustart zählt die Frist weiter: „Nicht lesbar“ springt nicht auf „Lese …“ zurück (bei jedem Aufwachen sonst).
    const neu = { ...z, anfrage: crypto.randomUUID(), bis: Date.now() + FRIST_MS, fristUm: behalten && z.fristUm, lesungen: behalten ? z.lesungen : {} };
    if (behalten) uebernommen.set(tabId, z.lesungen);
    else uebernommen.delete(tabId);
    jeRahmen.set(tabId, new Map());
    anzeigen.set(tabId, new Map());
    // Zustand und Auftrag im selben Schritt, sonst überholen sich zwei Aufträge: Der Rahmen arbeitete dann am alten, und
    // seine Antworten fielen durch (gemessen unter Last: „Lese …“ ohne Ende). `setzen` schreibt die Map synchron.
    const fertig = setzen(tabId, neu);
    // An alle Rahmen des Tabs; jeder Rahmen antwortet mit eigener Meldung (Spez. §3.3).
    void browser.tabs.sendMessage(tabId, auftragFuer(neu)).catch(() => undefined);
    await fertig;
  }

  /**
   * Ein Rahmen, der ohne Abmeldung verschwunden ist, darf keine Lesung hinterlassen. Ein neuer Rahmen ist der Anlass zum
   * Nachsehen: Antwortet ein bekannter Rahmen nicht mehr, fällt seine Lesung weg.
   */
  async function toteRahmenEntfernen(tabId: number) {
    const rahmen = jeRahmen.get(tabId);
    if (!rahmen) return;
    let tot = false;
    for (const frameId of [...rahmen.keys()]) {
      if (frameId === 0) continue;
      await browser.tabs.sendMessage(tabId, { art: 'da' }, { frameId }).catch(() => {
        rahmen.delete(frameId);
        anzeigen.get(tabId)?.delete(frameId);
        tot = true;
      });
    }
    const z = zustaende.get(tabId);
    if (tot && z) await setzen(tabId, { ...z, lesungen: { ...uebernommen.get(tabId), ...lesungenZusammenfuehren(rahmen) } });
  }

  const bewertungenVon = (z: TabZustand) =>
    tabBewerten(
      z,
      (id) => {
        const e = eintragMit(id);
        return e && !firma.werteLesen ? { ...e, leser: null } : e;
      },
      (id) => bewusstVon(firma, ausgeblendet, id),
    );

  // Firma oder Nutzer ändert etwas: alle Tabs neu bewerten (Abzeichen, Leisten); kommt das Lesen zurück, neu lesen.
  beiAenderung(() => {
    void (async () => {
      await bereit;
      [firma, ausgeblendet] = await Promise.all([firmaLaden(), ausgeblendetLaden().then((l) => new Set(l))]);
      void titelSetzen();
      await anzeigeAnpassen();
      // Über die Kennungen gehen und je Tab frisch lesen: Zwischen zwei `await` können Lesungen ankommen oder Tabs schließen
      // (Prüfer H11b). Entschieden wird am Zustand selbst, nicht am Vorher-Wert der Firma — der ist nach dem Aufwachen schon neu.
      for (const tabId of [...zustaende.keys()]) {
        const z = zustaende.get(tabId);
        if (!z) continue;
        if (!firma.werteLesen && z.anfrage) {
          // Lesen aus: laufenden Auftrag und alte Lesungen verwerfen.
          jeRahmen.delete(tabId);
          anzeigen.delete(tabId);
          uebernommen.delete(tabId);
          await setzen(tabId, { ...z, anfrage: null, bis: null, lesungen: {}, fristUm: false });
        } else if (firma.werteLesen && !z.anfrage && leserFuer(z).length > 0) await lesenAnfordern(tabId, z);
        else await setzen(tabId, z);
      }
    })();
  });

  function anzeigeVon(tabId: number): Record<string, string[]> {
    return Object.assign({}, ...(anzeigen.get(tabId)?.values() ?? [])) as Record<string, string[]>;
  }

  // H17d: Chrome und Edge verstecken das Symbol neuer Erweiterungen im Puzzle-Menü — einmal zeigen, wie man es anheftet.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== 'install') return;
    void browser.management
      .getSelf()
      .then((ich) => {
        const seite = startSeiteBei(reason, ich.installType);
        if (seite) return browser.tabs.create({ url: browser.runtime.getURL(seite) });
      })
      .catch(() => undefined);
  });

  // Global: Seitenleiste aus, Popup „außerhalb“. Je Portal-Tab schaltet `oberflaeche()` um.
  if (!ohneLeiste) void browser.sidePanel.setOptions({ enabled: false }).catch(() => undefined);
  void browser.action.setPopup({ popup: 'ausserhalb.html' });
  void browser.action.setBadgeBackgroundColor({ color: '#B91C1C' });

  async function oberflaeche(tabId: number, z: TabZustand | null) {
    try {
      if (z) {
        if (!ohneLeiste) await browser.sidePanel.setOptions({ tabId, path: `seitenleiste.html?tab=${tabId}`, enabled: true });
        await browser.action.setPopup({ tabId, popup: popupFuer(tabId, ohneLeiste) });
        await browser.action.setBadgeText({ tabId, text: abzeichenMit(abzeichenText(z.abweichungen), stand) });
      } else {
        if (!ohneLeiste) await browser.sidePanel.setOptions({ tabId, enabled: false });
        await browser.action.setPopup({ tabId, popup: 'ausserhalb.html' });
        await browser.action.setBadgeText({ tabId, text: abzeichenMit('', stand) });
      }
    } catch {
      // Tab inzwischen geschlossen.
    }
  }

  function meldungFuer(tabId: number): ZustandMeldung {
    const z = zustaende.get(tabId) ?? null;
    return { art: 'zustand', zustand: z, bewertungen: z ? bewertungenVon(z) : {}, anzeige: z ? anzeigeVon(tabId) : {} };
  }

  function verteilen(tabId: number) {
    for (const p of leisten.get(tabId) ?? []) p.postMessage(meldungFuer(tabId));
  }

  /** Ende der Ladefrist je Tab: dann einmal neu bewerten, damit aus „lese“ das endgültige „nicht lesbar“ wird (H17c). */
  const ladeWecker = new Map<number, ReturnType<typeof setTimeout>>();
  function ladeWeckerStellen(tabId: number, z: TabZustand | null) {
    clearTimeout(ladeWecker.get(tabId));
    ladeWecker.delete(tabId);
    const bis = z?.ladeBis;
    if (typeof bis !== 'number' || bis <= Date.now()) return;
    ladeWecker.set(
      tabId,
      setTimeout(() => {
        ladeWecker.delete(tabId);
        const jetzt = zustaende.get(tabId);
        if (jetzt?.ladeBis === bis) void setzen(tabId, jetzt);
      }, bis - Date.now() + 50),
    );
  }

  async function setzen(tabId: number, roh: TabZustand | null) {
    const z = roh && { ...roh, abweichungen: abweichungenZaehlen(Object.values(bewertungenVon(roh))) };
    ladeWeckerStellen(tabId, z);
    if (z) {
      zustaende.set(tabId, z);
      await browser.storage.session.set({ [SPEICHER_PRAEFIX + tabId]: z });
    } else {
      zustaende.delete(tabId);
      jeRahmen.delete(tabId);
      anzeigen.delete(tabId);
      uebernommen.delete(tabId);
      await browser.storage.session.remove(SPEICHER_PRAEFIX + tabId);
    }
    verteilen(tabId);
    await oberflaeche(tabId, z);
  }

  /** Neuer Befund für einen Tab. `titel === null`: Meldung aus `tabs.onUpdated`, noch ohne Inhalts-Skript. */
  async function seiteGemeldet(tabId: number, adresse: string, titel: string | null, lang: string | null) {
    await bereit;
    // Z-12: Ein schon geladenes Inhalts-Skript meldet weiter, auch wenn der Nutzer den Zugriff entzogen hat — ohne Recht kein
    // Zustand. Erst der Spiegel; fehlt die Herkunft dort, frisch nachsehen (beim allerersten Start meldet `getAll` die Host-Rechte
    // gemessen noch nicht). Vor dem Lesen von `alt`, damit danach alles bis `setzen` synchron bleibt.
    const herkunft = herkunftVon(adresse);
    if (herkunft && !erlaubt.has(herkunft)) {
      await rechteLaden();
      if (!erlaubt.has(herkunft)) return setzen(tabId, null);
    }
    const alt = zustaende.get(tabId);
    const befund = seiteBewerten(adresse, titel, lang ?? alt?.sprache ?? null, KOEPFE);
    if (!befund) return setzen(tabId, null);
    // Z-12: Ein schon geladenes Inhalts-Skript meldet weiter, auch wenn der Nutzer den Zugriff entzogen hat — ohne Recht kein Zustand.

    const skript = titel !== null || (alt?.skript ?? false);
    // H17c: Weicht Sprache oder Aufbau ab, kann das noch der Ladebildschirm sein (Regel in `ladeBisFuer`).
    const ladeBis = ladeBisFuer(befund, alt, Date.now(), LADEFRIST_MS);
    // Gleiche Seite aus tabs.onUpdated nach der Skript-Meldung: nichts verlieren.
    if (titel === null && alt?.skript && alt.schluessel === befund.schluessel) return;
    // Gleiche Seite, gleiche Einträge (etwa nur der Titel nachgezogen): Der laufende Auftrag gilt weiter, sonst begänne
    // die Ruhezeit bei jeder Titeländerung von vorn.
    if (alt?.anfrage && alt.schluessel === befund.schluessel && alt.zuLesen.join() === befund.zuLesen.join()) {
      return setzen(tabId, { ...alt, ...befund, skript, ladeBis });
    }
    // Neuer Befund verwirft den alten Auftrag: späte Antworten der vorigen Seite zählen nicht mehr (T-05).
    jeRahmen.delete(tabId);
    anzeigen.delete(tabId);
    uebernommen.delete(tabId);
    const z: TabZustand = { ...befund, skript, anfrage: null, bis: null, fristUm: false, ladeBis, lesungen: {}, abweichungen: 0, stand: Date.now() };
    if (z.zuLesen.length) await lesenAnfordern(tabId, z);
    else await setzen(tabId, z);
  }

  browser.runtime.onMessage.addListener((n, sender) => {
    if (!vomEigenenSkript(sender, browser.runtime.id)) return;
    // T-19: Messpunkte der Inhalts-Skripte, nur im Testbau (U-43b hält den Zweig aus dem Store-Paket).
    if (__LOTSE_MUSTER__ && (n as { art?: unknown } | null)?.art === 'messpunkt') {
      const ms = (n as { ms?: unknown }).ms;
      const g = globalThis as { __lotseMesspunkte?: number[] };
      if (typeof ms === 'number') (g.__lotseMesspunkte ??= []).push(ms);
      return;
    }
    const tabId = sender.tab.id;
    const seite = alsSeiteMeldung(n, sender);
    if (seite) {
      void seiteGemeldet(tabId, seite.href, seite.titel, seite.lang);
      return;
    }
    void bereit.then(() => {
      const z = zustaende.get(tabId);
      if (!z) return;
      const rahmenId = sender.frameId ?? -1;
      if ((n as { art?: unknown } | null)?.art === 'rahmen-bereit') {
        if (!z.anfrage || z.bis === null) return;
        // Oberster Rahmen = die Seite wurde neu geladen, die alte Frist gilt nicht mehr. Sonst: nachgeladener Rahmen.
        if (rahmenId === 0) return lesenAnfordern(tabId, z);
        void toteRahmenEntfernen(tabId);
        return browser.tabs.sendMessage(tabId, auftragFuer({ ...z, anfrage: z.anfrage, bis: z.bis }), { frameId: rahmenId }).catch(() => undefined);
      }
      const lesung = alsLesungMeldung(n, z.anfrage, z.zuLesen, MIT_ANZEIGE);
      if (!lesung) return;
      const rahmen = jeRahmen.get(tabId) ?? new Map<number, Record<string, string>>();
      rahmen.set(rahmenId, lesung.token);
      jeRahmen.set(tabId, rahmen);
      const namen = anzeigen.get(tabId) ?? new Map<number, Record<string, string[]>>();
      namen.set(rahmenId, lesung.anzeige ?? {});
      anzeigen.set(tabId, namen);
      if (lesung.ende) uebernommen.delete(tabId);
      return setzen(tabId, { ...z, lesungen: { ...uebernommen.get(tabId), ...lesungenZusammenfuehren(rahmen) }, fristUm: z.fristUm || lesung.ende === true });
    });
  });

  // Ohne `tabs`-Recht liefert onUpdated die Adresse nur für Hosts mit Host-Recht (H2) — genau die Portale.
  // Verlässt der Tab die Portale, kommt keine URL (fremder Host) und kein Skript: beim Laden ohne sichtbare URL abschalten.
  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url !== undefined) void seiteGemeldet(tabId, info.url, null, null);
    else if (info.status === 'loading' && tab.url === undefined)
      void bereit.then(() => (zustaende.has(tabId) ? setzen(tabId, null) : undefined));
  });

  // Z-12: Zugriff eingeschränkt → betroffene Tabs verlieren die Leiste (Popup erklärt es); Zugriff erteilt → offene
  // Portal-Tabs sofort erkennen (ohne Inhalts-Skript bis zum Neuladen: Z-14).
  browser.permissions.onRemoved.addListener(() => {
    void bereit.then(async () => {
      await rechteLaden();
      for (const tabId of [...zustaende.keys()]) {
        const tab = await browser.tabs.get(tabId).catch(() => undefined);
        if (tab?.url === undefined) await setzen(tabId, null);
      }
    });
  });
  browser.permissions.onAdded.addListener(() => {
    void bereit.then(async () => {
      await rechteLaden();
      for (const tab of await browser.tabs.query({})) {
        if (tab.id !== undefined && tab.url && !zustaende.has(tab.id)) await seiteGemeldet(tab.id, tab.url, null, null);
      }
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    leisten.delete(tabId);
    jeRahmen.delete(tabId);
    anzeigen.delete(tabId);
    uebernommen.delete(tabId);
    void bereit.then(() => {
      zustaende.delete(tabId);
      return browser.storage.session.remove(SPEICHER_PRAEFIX + tabId);
    });
  });

  // Nur in Portal-Tabs (Popup dort leer). `sidePanel.open()` braucht die Geste: ohne vorheriges await aufrufen.
  browser.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    if (tabId === undefined) return;
    // Lehnt Edge die Leiste ab (M-8), gilt ab jetzt das Popup; dieses eine Mal öffnet es `openPopup` (noch in der Geste).
    void browser.sidePanel.open({ tabId }).catch(async () => {
      ohneLeiste = true;
      await browser.action.setPopup({ tabId, popup: popupFuer(tabId, true) });
      await browser.action.openPopup?.().catch(() => undefined);
    });
  });

  browser.runtime.onConnect.addListener((port) => {
    // Nur eigene Erweiterungsseiten (Seitenleiste; im Test auch als Tab geöffnet), nie ein Inhalts-Skript.
    const eigen = port.sender?.id === browser.runtime.id && (port.sender.url ?? '').startsWith(browser.runtime.getURL('/'));
    if (!port.name.startsWith(PORT_PRAEFIX) || !eigen) return port.disconnect();
    const tabId = Number(port.name.slice(PORT_PRAEFIX.length));
    if (!Number.isInteger(tabId)) return port.disconnect();
    const menge = leisten.get(tabId) ?? new Set<Port>();
    menge.add(port);
    leisten.set(tabId, menge);
    port.onDisconnect.addListener(() => menge.delete(port));
    port.onMessage.addListener((m: unknown) => {
      if ((m as { art?: unknown } | null)?.art !== 'erneut') return;
      void bereit.then(() => {
        const z = zustaende.get(tabId);
        return z ? lesenAnfordern(tabId, z) : undefined;
      });
    });
    void bereit.then(() => port.postMessage(meldungFuer(tabId)));
  });
});
