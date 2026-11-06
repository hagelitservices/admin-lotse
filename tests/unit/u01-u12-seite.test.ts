// U-01 bis U-12 (Spez. §4, §14.3): Routen-Schlüssel aus den in H2 gemessenen Adressen (docs/messung-portale.md),
// Titel-Gegenprobe, Abbruch fremder Rahmen, Nachrichtenfluss. Mandantenteile sind durch Beispielwerte ersetzt.
import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';
import { seiteAus, spracheAus, vergleichsform } from '../../lib/route';
import { seiteBewerten, type EintragKopf } from '../../lib/seite';
import { obenStarten, TAKT_MS } from '../../lib/oben';
import { obersterRahmenIstPortal, rahmenStarten } from '../../lib/rahmen';
import { abzeichenText, alsLesungMeldung, alsSeiteMeldung, lesungenZusammenfuehren, vomEigenenSkript } from '../../lib/nachrichten';

const GUID = '0f2b8a6c-1d3e-4a5b-9c7d-8e6f5a4b3c2d';
const s = (u: string) => seiteAus(u)?.schluessel;

describe('U-01…U-08 gemessene Adressen → Routen-Schlüssel', () => {
  test.each([
    // U-01 M365 mit Segment `:` (Nr. 4, 5)
    ['https://admin.cloud.microsoft/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy', 'm365:Settings/SecurityPrivacy/Settings/L1/PasswordPolicy'],
    ['https://admin.cloud.microsoft/#/Settings/Services/:/Settings/L1/Calendar', 'm365:Settings/Services/Settings/L1/Calendar'],
    // U-02 M365 mit GUID und Reiter (Nr. 2)
    [`https://admin.cloud.microsoft/#/users/:/UserDetails/${GUID}/Account`, 'm365:users/UserDetails/:id'],
    // U-03 M365 mit Domain (Nr. 11) und Mailadresse
    ['https://admin.cloud.microsoft/#/Domains/Details/beispiel.onmicrosoft.com', 'm365:Domains/Details/:domain'],
    ['https://admin.cloud.microsoft/#/users/:/UserDetails/max%40beispiel.de', 'm365:users/UserDetails/:mail'],
    // U-04 M365 einfache Seiten und Abfrage im Hash
    ['https://admin.cloud.microsoft/#/rbac/directory', 'm365:rbac/directory'],
    ['https://admin.cloud.microsoft/#/licenses?source=homepage', 'm365:licenses'],
    ['https://admin.microsoft.com/AdminPortal/Home#/users', 'm365:users'],
    // U-05 Exchange unter /exchange und alter Host
    ['https://admin.cloud.microsoft/exchange#/remotedomains', 'exo:remotedomains'],
    ['https://admin.cloud.microsoft/exchange#/mailboxes?filter=x', 'exo:mailboxes'],
    ['https://admin.exchange.microsoft.com/#/transportrules', 'exo:transportrules'],
    // U-06 Entra mit Menü, ohne Menü, mit Parameter-Paaren, mit Abfrage vor dem Hash
    ['https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings', 'entra:view:Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings'],
    ['https://entra.microsoft.com/#view/Microsoft_AAD_IAM/TenantProperties.ReactView', 'entra:view:Microsoft_AAD_IAM/TenantProperties.ReactView'],
    ['https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings/menuId~/null', 'entra:view:Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings'],
    [`https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId~/${GUID}/hidePreviewBanner~/true`, 'entra:view:Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview'],
    ['https://entra.microsoft.com/?bundlingKind=DefaultPartitioner&l=de.de-de#view/Microsoft_AAD_IAM/TenantProperties.ReactView', 'entra:view:Microsoft_AAD_IAM/TenantProperties.ReactView'],
    // U-07 `#blade/`-Altform
    ['https://entra.microsoft.com/#blade/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings', 'entra:view:Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings'],
    // U-08 Intune
    ['https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/antivirus', 'intune:view:Microsoft_Intune_Workflows/SecurityManagementMenu/~/antivirus'],
    ['https://intune.microsoft.com/?l=de.de-de#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/compliance', 'intune:view:Microsoft_Intune_DeviceSettings/DevicesMenu/~/compliance'],
  ])('%s', (adresse, erwartet) => expect(s(adresse)).toBe(erwartet));

  test('Portal erkannt, aber keine Route: Startseite, Anmeldung, Fehlerseite', () => {
    for (const u of [
      'https://admin.cloud.microsoft/',
      'https://admin.cloud.microsoft/mfasetup?registered=true#/',
      'https://admin.cloud.microsoft/exchange#/',
      'https://entra.microsoft.com/',
      'https://entra.microsoft.com/auth/login/#code=geheim',
      'https://intune.microsoft.com/#home',
    ]) {
      expect(seiteAus(u)?.portal, u).toBeDefined();
      expect(seiteAus(u)?.schluessel, u).toBeNull();
    }
  });

  test('Entra/Intune: alles hinter Blade bzw. Menü fällt weg (Werte wie Domain, UPN, Name)', () => {
    expect(s('https://entra.microsoft.com/#view/Microsoft_AAD_IAM/DomainDetailBlade/domainName/firma.de')).toBe('entra:view:Microsoft_AAD_IAM/DomainDetailBlade');
    expect(s('https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/max@firma.de/Richtlinie%20Vertrieb')).toBe('entra:view:Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview');
    expect(s('https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/max@firma.de')).toBe('entra:view:Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/:mail');
    expect(s(`https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/compliance/policyName~/Vertrieb/${GUID}`)).toBe('intune:view:Microsoft_Intune_DeviceSettings/DevicesMenu/~/compliance');
  });

  test('Schlüssel tragen nie Mandantendaten', () => {
    for (const u of [`https://admin.cloud.microsoft/#/users/:/UserDetails/${GUID}`, 'https://admin.cloud.microsoft/#/Domains/Details/firma.de', 'https://entra.microsoft.com/auth/login/#code=geheim'])
      expect(String(s(u))).not.toMatch(/0f2b8a6c|firma\.de|geheim/);
  });
});

describe('U-09 fremde Herkunft', () => {
  test.each(['https://portal.azure.com/#view/Microsoft_AAD_IAM/TenantProperties.ReactView', 'https://outlook.office.com/mail/', 'https://sandbox-2.reactblade.portal.azure.net/', 'http://entra.microsoft.com/#view/A/B', 'https://entra.microsoft.com.boese.de/#view/A/B', 'kein url'])('%s → kein Portal', (u) =>
    expect(seiteAus(u)).toBeNull());
});

describe('U-10 Schreibweisen', () => {
  const basis = vergleichsform(String(s('https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AllowlistPolicyBlade')));
  test.each([
    'https://ENTRA.microsoft.com/#view/microsoft_aad_iam/allowlistpolicyblade',
    'https://entra.microsoft.com/#view//Microsoft_AAD_IAM//AllowlistPolicyBlade',
    'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AllowlistPolicyBlade?',
    'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/AllowlistPolicyBlade/',
  ])('%s', (u) => expect(vergleichsform(String(s(u)))).toBe(basis));

  test('M365 ebenso', () => {
    const a = vergleichsform(String(s('https://admin.cloud.microsoft/#/Settings/SecurityPrivacy/:/Settings/L1/PasswordPolicy')));
    expect(vergleichsform(String(s('https://admin.cloud.microsoft//#//settings/securityprivacy/:/Settings//L1/PasswordPolicy?')))).toBe(a);
  });
});

const EINTRAG: EintragKopf = {
  id: 'entra-app-registrierung',
  route: 'entra:view:Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings',
  titel: { de: ['Benutzer'], en: ['Users'] },
};
const ADRESSE = 'https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/UserSettings';

describe('U-11 Route passt, Titel nicht', () => {
  test('Titel passt → wird gelesen', () => {
    const b = seiteBewerten(ADRESSE, 'Benutzer - Microsoft Entra Admin Center', 'de', [EINTRAG]);
    expect(b).toMatchObject({ eintraege: [EINTRAG.id], aufbauAbweichend: [], zuLesen: [EINTRAG.id] });
  });
  test('Titel weicht ab → Erklärung ja, „Aufbau abweichend“, kein Lesen', () => {
    const b = seiteBewerten(ADRESSE, 'Gruppen - Microsoft Entra Admin Center', 'de', [EINTRAG]);
    expect(b).toMatchObject({ eintraege: [EINTRAG.id], aufbauAbweichend: [EINTRAG.id], zuLesen: [] });
  });
  test('englischer Titel bei englischem Portal', () =>
    expect(seiteBewerten(ADRESSE.toLowerCase().replace('https://entra', 'https://entra'), 'Users - Microsoft Entra admin center', 'en-US', [EINTRAG])?.zuLesen).toEqual([EINTRAG.id]));
  test('andere Portalsprache → Erklärung, aber nie lesen (Z-13)', () => {
    const b = seiteBewerten(ADRESSE, 'Utilisateurs', 'fr', [EINTRAG]);
    expect(b?.sprache).toBe('andere');
    expect(b?.eintraege).toEqual([EINTRAG.id]);
    expect(b?.zuLesen).toEqual([]);
  });
  test('ohne Titel (Meldung aus tabs.onUpdated) → noch nicht lesen, nicht abweichend', () =>
    expect(seiteBewerten(ADRESSE, null, 'de', [EINTRAG])).toMatchObject({ aufbauAbweichend: [], zuLesen: [] }));
  test('Sprache', () => {
    expect([spracheAus('de-DE'), spracheAus('de'), spracheAus('en-us'), spracheAus('fr'), spracheAus(''), spracheAus('deu')]).toEqual(['de', 'de', 'en', 'andere', 'andere', 'andere']);
  });
});

describe('U-12 Rahmen mit fremdem obersten Ursprung', () => {
  const ort = (origin: string, kette: string[]) => ({ origin, ancestorOrigins: Object.assign([...kette], { contains: (x: string) => kette.includes(x), item: (i: number) => kette[i] ?? null }) as unknown as DOMStringList });
  test('ancestorOrigins = Azure-Portal → beendet sich ohne Listener', () => {
    const hoeren = vi.fn();
    const ok = rahmenStarten({ ort: ort('https://sandbox-2.reactblade.portal.azure.net', ['https://portal.azure.com']), oben: false, hoeren, senden: vi.fn(), gueltig: () => true, dokument: new JSDOM('').window.document, jetzt: () => 0, wecken: () => 0, weckerEnde: () => undefined });
    expect(ok).toBe(false);
    expect(hoeren).not.toHaveBeenCalled();
  });
  test('ancestorOrigins = Entra → hört zu und antwortet nur auf „lies“', () => {
    let r: (n: unknown) => void = () => undefined;
    const senden = vi.fn();
    expect(rahmenStarten({ ort: ort('https://sandbox-3.reactblade.portal.azure.net', ['https://sandbox-1.reactblade.portal.azure.net', 'https://entra.microsoft.com']), oben: false, hoeren: (f) => (r = f), senden, gueltig: () => true, dokument: new JSDOM('').window.document, jetzt: () => 0, wecken: () => 0, weckerEnde: () => undefined })).toBe(true);
    expect(senden.mock.calls).toEqual([[{ art: 'rahmen-bereit' }]]);
    r({ art: 'anderes' });
    r({ art: 'lies', anfrage: 'a1' });
    r({ art: 'lies', anfrage: 'a1', bis: 'bald', leser: [] });
    expect(senden).toHaveBeenCalledTimes(1);
  });
  test('oberster Rahmen selbst', () => {
    expect(obersterRahmenIstPortal(ort('https://intune.microsoft.com', []), true)).toBe(true);
    expect(obersterRahmenIstPortal(ort('https://portal.azure.com', []), true)).toBe(false);
  });
});

describe('Nachrichtenfluss (Spez. §3.3)', () => {
  const ID = 'eigene-id';
  test('nur eigene Inhalts-Skripte in Portal-Tabs', () => {
    expect(vomEigenenSkript({ id: ID, url: ADRESSE, frameId: 0, tab: { id: 3 } }, ID)).toBe(true);
    expect(vomEigenenSkript({ id: ID, url: 'https://sandbox-1.reactblade.portal.azure.net/x', frameId: 5, tab: { id: 3 } }, ID)).toBe(true);
    expect(vomEigenenSkript({ id: 'fremd', url: ADRESSE, tab: { id: 3 } }, ID)).toBe(false);
    expect(vomEigenenSkript({ id: ID, url: 'chrome-extension://eigene-id/seitenleiste.html' }, ID)).toBe(false);
    expect(vomEigenenSkript({ id: ID, url: 'https://portal.azure.com/', tab: { id: 3 } }, ID)).toBe(false);
  });
  test('Seiten-Meldung nur aus dem obersten Rahmen eines Portals, Längen begrenzt', () => {
    const m = { art: 'seite', href: ADRESSE, titel: 'x', lang: 'de' };
    // sender.url steht nach Hash-Wechsel noch auf der Ladeadresse (H4) — gleicher Ursprung genügt.
    expect(alsSeiteMeldung(m, { url: 'https://entra.microsoft.com/#view/Alt', frameId: 0 })).toEqual(m);
    expect(alsSeiteMeldung({ ...m, href: 'https://intune.microsoft.com/#view/A' }, { url: ADRESSE, frameId: 0 })).toBeNull();
    expect(alsSeiteMeldung(m, { url: 'https://sandbox-1.reactblade.portal.azure.net/', frameId: 0 })).toBeNull();
    expect(alsSeiteMeldung(m, { url: ADRESSE, frameId: 4 })).toBeNull();
    expect(alsSeiteMeldung({ ...m, titel: 1 }, { url: ADRESSE, frameId: 0 })).toBeNull();
    expect(alsSeiteMeldung({ ...m, titel: 'x'.repeat(5000) }, { url: ADRESSE, frameId: 0 })?.titel.length).toBe(400);
  });
  test('zwei Rahmen mit Treffer → mehrdeutig', () =>
    expect(lesungenZusammenfuehren(new Map<number, Record<string, string>>([[0, { a: "ja" }], [4, { a: "nein", b: "3" }]]))).toEqual({ a: 'mehrdeutig', b: '3' }));
  test('Lesung nur für den laufenden Auftrag und nur für Einträge aus zuLesen', () => {
    const m = { art: 'lesung', anfrage: 'neu', token: { a: 'ja', fremd: 'firma.de' } };
    expect(alsLesungMeldung(m, 'neu', ['a'])).toEqual({ art: 'lesung', anfrage: 'neu', token: { a: 'ja' }, anzeige: {}, ende: false });
    expect(alsLesungMeldung({ ...m, anfrage: 'alt' }, 'neu', ['a'])).toBeNull();
    expect(alsLesungMeldung(m, null, ['a'])).toBeNull();
  });
  test('Abzeichen', () => expect([abzeichenText(0), abzeichenText(2), abzeichenText(140)]).toEqual(['', '2', '99']));

  test('oberer Rahmen meldet Hash-Wechsel, Sekundenprüfung und Titel; nach Abbruch nichts mehr', () => {
    vi.useFakeTimers();
    const ort = { href: 'a', titel: 't', lang: 'de' };
    const senden = vi.fn();
    const ziel = new EventTarget() as unknown as Window;
    const abbruch = new AbortController();
    obenStarten({ ort: () => ({ ...ort }), senden, ziel, signal: abbruch.signal, gueltig: () => true, takt: (r, ms) => setInterval(r, ms), taktEnde: (k) => clearInterval(k as number) });
    expect(senden).toHaveBeenCalledTimes(1);
    ort.href = 'b';
    (ziel as unknown as EventTarget).dispatchEvent(new Event('hashchange'));
    expect(senden).toHaveBeenCalledTimes(2);
    ort.href = 'c'; // pushState ohne Ereignis (Entra)
    vi.advanceTimersByTime(TAKT_MS);
    expect(senden).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(TAKT_MS * 4); // nichts geändert
    expect(senden).toHaveBeenCalledTimes(3);
    ort.titel = 'neu';
    vi.advanceTimersByTime(TAKT_MS);
    expect(senden).toHaveBeenCalledTimes(4);
    abbruch.abort();
    ort.href = 'd';
    vi.advanceTimersByTime(TAKT_MS * 2);
    (ziel as unknown as EventTarget).dispatchEvent(new Event('popstate'));
    expect(senden).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
