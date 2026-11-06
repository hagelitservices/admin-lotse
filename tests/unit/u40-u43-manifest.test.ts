// U-40 bis U-43 (Spez. §8, §14.3, Rahmen E3) gegen die gebauten Pakete beider Browser (und die Store-ZIPs, wenn da).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BERECHTIGUNGEN, CSP, MINDESTVERSION, PORTAL_HOSTS, RAHMEN_HERKUNFT, VERBOTEN } from '../../manifest';
import { PAKETE, WURZEL, dateien, manifestAus } from './hilfen/paket';

const zeilen = readFileSync(`${WURZEL}store/berechtigungen.md`, 'utf8')
  .split('\n')
  .map((z) => z.trim())
  .filter((z) => /^\| (?:Host |Rahmen-Herkunft )?`[^`]+`/.test(z));
/** Recht = erstes Code-Stück der ersten Spalte (`| Host \`https://…\` | …`). */
const begruendet = new Set(zeilen.map((z) => /`([^`]+)`/.exec(z)?.[1] ?? ''));
const SPEZ = `${WURZEL}../../SPEC-PLUGINS-HAGELIT.md`;

test('U-40 jede Zeile von store/berechtigungen.md steht wortgleich in Spez. §8', () => {
  expect(zeilen.length).toBe(6);
  // Im öffentlichen Quelltext-Spiegel (H21) fehlt die Spezifikation; dort entfällt der Abgleich.
  if (!existsSync(SPEZ)) return;
  const p8 = readFileSync(SPEZ, 'utf8').split('## 8. Berechtigungen')[1]?.split('## 9.')[0] ?? '';
  for (const z of zeilen) expect(p8.split('\n').map((l) => l.trim()), z.slice(0, 60)).toContain(z);
});

type Skript = { matches?: string[]; all_frames?: boolean; run_at?: string; world?: string; js?: string[] };
const liste = (m: Record<string, unknown>, k: string) => (m[k] as string[] | undefined) ?? [];

const zips = existsSync(`${WURZEL}.output`)
  ? readdirSync(`${WURZEL}.output`).filter((d) => d.endsWith('.zip') && !d.includes('sources')).map((d) => [`ZIP ${d}`, `${WURZEL}.output/${d}`] as const)
  : [];
const quellen = [...Object.entries(PAKETE).map(([b, o]) => [`Ordner ${b}`, o] as const), ...zips];

describe.each(quellen)('Manifest %s', (_n, quelle) => {
  const m = quelle.endsWith('.zip')
    ? (JSON.parse(execFileSync('unzip', ['-p', quelle, 'manifest.json'], { encoding: 'utf8' })) as Record<string, unknown>)
    : manifestAus(quelle);
  const skripte = (m.content_scripts as Skript[] | undefined) ?? [];
  const herkuenfte = [...new Set(skripte.flatMap((s) => s.matches ?? []))];
  const alles = [...liste(m, 'permissions'), ...liste(m, 'host_permissions'), ...herkuenfte];

  test('U-40 jedes Recht und jede Herkunft ist in store/berechtigungen.md begründet', () => {
    for (const r of alles) expect(begruendet.has(r), `Begründung fehlt für ${r}`).toBe(true);
  });

  test('U-40 keine Begründung ohne Recht im Manifest', () => {
    for (const r of begruendet) expect(alles, `${r} steht in berechtigungen.md, aber nicht im Manifest`).toContain(r);
  });

  test('U-40 genau die Rechte und Herkünfte aus §8 und H2', () => {
    expect([...liste(m, 'permissions')].sort()).toEqual([...BERECHTIGUNGEN].sort());
    expect([...liste(m, 'host_permissions')].sort()).toEqual([...PORTAL_HOSTS].sort());
    expect(herkuenfte.sort()).toEqual([...PORTAL_HOSTS, RAHMEN_HERKUNFT].sort());
    expect(liste(m, 'host_permissions')).not.toContain(RAHMEN_HERKUNFT);
    expect(m.minimum_chrome_version).toBe(MINDESTVERSION);
    expect(m.manifest_version).toBe(3);
    expect((m.storage as { managed_schema?: string } | undefined)?.managed_schema).toBe('managed_schema.json');
  });

  test('U-40 Inhalts-Skripte: Welt ISOLATED, document_idle; nur rahmen.js in allen Rahmen', () => {
    expect(skripte.length).toBe(2);
    for (const s of skripte) {
      expect(s.world ?? 'ISOLATED').toBe('ISOLATED');
      expect(s.run_at).toBe('document_idle');
    }
    const oben = skripte.find((s) => s.js?.includes('content-scripts/oben.js'));
    const rahmen = skripte.find((s) => s.js?.includes('content-scripts/rahmen.js'));
    expect(oben?.all_frames ?? false).toBe(false);
    expect(oben?.matches?.sort()).toEqual([...PORTAL_HOSTS].sort());
    expect(rahmen?.all_frames).toBe(true);
  });

  test('U-41 verbotene Rechte fehlen', () => {
    for (const r of VERBOTEN) expect(alles, r).not.toContain(r);
    for (const k of ['optional_permissions', 'optional_host_permissions', 'externally_connectable', 'web_accessible_resources', 'key'])
      expect(m, k).not.toHaveProperty(k);
  });

  test('U-42 CSP der Erweiterungsseiten mit connect-src none', () => {
    const csp = (m.content_security_policy as { extension_pages?: string } | undefined)?.extension_pages ?? '';
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toBe(CSP);
  });
});

/** Preact setzt `innerHTML` ausschließlich im Zweig für `dangerouslySetInnerHTML` (`…innerHTML=p.__html`).
 *  Der eigene Quelltext verbietet beides (U-21); im Bündel ist genau diese Stelle erlaubt, jede andere nicht. */
const PREACT_INNERHTML = /\.innerHTML(?:==?)?[A-Za-z_$][\w$]*\.__html|__html==[A-Za-z_$][\w$]*\.innerHTML/g;
const NETZ_UND_CODE: [string, RegExp][] = [
  ['fetch(', /\bfetch\(/],
  ['Function(', /\bFunction\(/],
  ['(0,eval)', /\(0,\s*eval\)/],
  ['setTimeout/setInterval mit Text', /set(?:Timeout|Interval)\(\s*['"`]/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['sendBeacon', /sendBeacon/],
  ['EventSource', /EventSource/],
  ['importScripts', /importScripts/],
  ['eval', /\beval\(/],
  ['new Function', /new\s+Function\b/],
  // H13, Bedrohungsmodell §2: Fremde Erweiterungen und Seiten erreichen den Lotsen nicht — kein Empfang von außen.
  ['onMessageExternal', /onMessageExternal/],
  ['onConnectExternal', /onConnectExternal/],
];

/** Inhalts-Skripte laufen in der Portalseite: nichts, was die Seite sieht (Prüferbefund H3: WXTs Startereignisse). */
const SEITENEREIGNIS = /postMessage\(|dispatchEvent\(|CustomEvent|content-script-started/;

describe.each(Object.entries(PAKETE))('U-43 Bündel %s', (_b, ordner) => {
  const js = dateien(ordner, /\.(js|html)$/);

  test('Bündel ist gebaut', () => expect(js.length).toBeGreaterThan(3));

  test('innerHTML nur an genau den zwei Stellen in Preacts __html-Zweig', () => {
    const treffer = js.reduce((n, p) => n + (readFileSync(p, 'utf8').match(PREACT_INNERHTML)?.length ?? 0), 0);
    expect(treffer).toBe(2);
  });

  // H11b: Der Ersatz für `storage.managed` (T-11) gehört nur in den Testbau; im Store-Paket gilt allein die Richtlinie.
  test('U-43b kein Testersatz für Firmeneinstellungen, keine Musterseite und kein Messpunkt (T-19) im Paket', () => {
    for (const p of js) expect(readFileSync(p, 'utf8'), relative(ordner, p)).not.toMatch(/test:verwaltet|muster\.html|messpunkt|__lotseMesspunkte/);
  });

  test.each(js.filter((p) => p.includes('/content-scripts/')).map((p) => [relative(ordner, p), p]))(
    '%s schickt nichts in die Seite',
    (_n, p) => expect(readFileSync(p, 'utf8')).not.toMatch(SEITENEREIGNIS),
  );

  test.each(js.map((p) => [relative(ordner, p), p]))('%s', (_n, p) => {
    const code = readFileSync(p, 'utf8');
    for (const [was, muster] of NETZ_UND_CODE) expect(muster.test(code), `${was} in ${relative(ordner, p)}`).toBe(false);
    const rest = code.replace(PREACT_INNERHTML, '');
    expect(rest, 'innerHTML außerhalb des Preact-Zweigs für __html').not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
});
