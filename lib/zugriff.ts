// Seitenzugriff (Spez. §11.3 Z-12, T-08): Stellt der Nutzer den Website-Zugriff auf „Bei Klick“, hält Chrome das Host-Recht
// zurück. Dann erkennt der Lotse die Seite nicht; das Popup erklärt es und fragt per `permissions.request` genau die
// fehlende Herkunft an. Die Liste muss `host_permissions` im Manifest entsprechen (U-40 prüft das Manifest, Test hier).
export const HERKUENFTE = ['https://admin.cloud.microsoft/*', 'https://entra.microsoft.com/*', 'https://intune.microsoft.com/*'] as const;
export type Herkunft = (typeof HERKUENFTE)[number];

export const hostVon = (h: Herkunft) => new URL(h.replace('/*', '/')).host;

/** Herkunft, unter die eine Adresse fällt; `undefined` außerhalb der Portale. */
export function herkunftVon(adresse: string | undefined): Herkunft | undefined {
  if (!adresse) return undefined;
  try {
    const host = new URL(adresse).host;
    return HERKUENFTE.find((h) => hostVon(h) === host);
  } catch {
    return undefined;
  }
}

/**
 * Welche Herkünfte das Popup anbietet. Kennt es den Tab und ist er ein Portal: nur dessen Herkunft (oder nichts, wenn
 * erlaubt). Ist er sicher eine fremde Website: nichts (Z-16). Sieht es die Adresse nicht (so ist es ohne Zugriff): alle fehlenden.
 */
export function fehlendeHerkuenfte(tabAdresse: string | undefined, erlaubt: Readonly<Record<Herkunft, boolean>>): Herkunft[] {
  const hier = herkunftVon(tabAdresse);
  if (hier) return erlaubt[hier] ? [] : [hier];
  // Eine sichtbare Webadresse außerhalb der Portale: Z-16. Erweiterungs- und Browserseiten zählen wie „unsichtbar“.
  if (tabAdresse && /^https?:/.test(tabAdresse)) return [];
  return HERKUENFTE.filter((h) => !erlaubt[h]);
}
