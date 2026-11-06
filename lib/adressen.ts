/** Startadressen der Portale und die Adresse einer Route (Umkehrung von `lib/route.ts`). Gemeinsam für Aufnahme (scripts/) und Seitenleiste (Z-3). */
export const PORTAL_START: Record<string, string> = {
  m365: 'https://admin.cloud.microsoft/',
  entra: 'https://entra.microsoft.com/',
  intune: 'https://intune.microsoft.com/',
  // Die alte Adresse admin.exchange.microsoft.com leitet hierher um (H2); die Aufnahme vergleicht den Host (H10).
  exo: 'https://admin.cloud.microsoft/exchange',
};

/** Adresse einer Route (Umkehrung von `lib/route.ts`; Formen aus der H2-Messung). */
export function adresseVon(portal: string, route: string): string {
  const start = PORTAL_START[portal];
  if (!start) throw new Error(`unbekanntes Portal ${portal}`);
  if (portal === 'entra' || portal === 'intune') {
    if (!route.startsWith('view:')) throw new Error(`Route ${route} ist keine Ansicht`);
    return `${start}#view/${route.slice(5)}`;
  }
  // Org-Einstellungen: Der Routen-Schlüssel lässt das Segment `:` weg (`lib/route.ts`), die Adresse braucht es
  // (`#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy`, H2-Messung); ohne fällt das Portal auf die Liste zurück.
  if (portal === 'm365') return `${start}#/${route.replace(/^(Settings\/[^/]+)\/(Settings\/)/, '$1/:/$2')}`;
  return `${start}#/${route}`;
}

