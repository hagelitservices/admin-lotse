// Wo die Oberfläche eines Portal-Tabs erscheint (Spez. §11.1): Seitenleiste, oder — fehlt sie (Edge, M-8) — das Popup mit
// derselben Komponente in 400 px. Leerer Popup-Pfad heißt: Klick aufs Symbol öffnet die Seitenleiste (`action.onClicked`).
export const popupFuer = (tabId: number, ohneLeiste: boolean): string => (ohneLeiste ? `seitenleiste.html?tab=${tabId}&als=popup` : '');

/** Die Seitenleisten-Seite erkennt am Parameter, dass sie als Popup läuft (feste Breite 400 px). */
export const alsPopup = (suche: string): boolean => new URLSearchParams(suche).get('als') === 'popup';

/**
 * H17d: Nur bei der Erstinstallation einmal die Einstellungen mit „So öffnen Sie den Lotsen“ zeigen (Spez. §14.5 Nr. 3).
 * Nie bei einer Installation per Richtlinie (`installType` `admin`): Dort heftet das Firmenprofil das Symbol fest an (§10),
 * sonst ginge beim Rollout auf jedem Rechner und in jedem Profil ungefragt ein Tab auf.
 */
export const startSeiteBei = (grund: string, installType: string): '/optionen.html#start' | null =>
  grund === 'install' && installType !== 'admin' ? '/optionen.html#start' : null;

/** Kasten „So öffnen Sie den Lotsen“ in den Einstellungen: nur, wenn das Symbol nicht schon per Richtlinie angeheftet ist. */
export const startKastenZeigen = (installType: string | undefined) => installType !== 'admin';
