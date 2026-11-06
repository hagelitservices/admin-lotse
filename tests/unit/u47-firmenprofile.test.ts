// U-47 (Spez. §10): Beispielprofile in `firmen/` = Erzeugnis aus lib/firmenprofile.ts, passend zu managed_schema.json.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { firmaAus } from '../../lib/firmenmodus';
import { eintragsListe, einstellungsPfad, erzwingen, MUSTER_EINSTELLUNGEN, plattformskript, regDatei, STORE_ID } from '../../lib/firmenprofile';
import { AKTIVE_EINTRAEGE } from '../../lib/inhalte';

const datei = (n: string) => readFileSync(new URL(`../../firmen/${n}`, import.meta.url));
const schema = JSON.parse(readFileSync(new URL('../../public/managed_schema.json', import.meta.url), 'utf8')) as { properties: Record<string, unknown> };
const IDS = new Set(AKTIVE_EINTRAEGE.map((e) => e.id));

/** `.reg` zurück in ein Objekt: Unterschlüssel = Objekt, Namen 1, 2, … = Liste (wie Chromium mit dem Schema liest). */
function regLesen(text: string, wurzel: string): Record<string, unknown> {
  const aus: Record<string, unknown> = {};
  let ziel: Record<string, unknown> | null = null;
  for (const z of text.split('\r\n')) {
    const k = /^\[HKEY_LOCAL_MACHINE\\(.+)\]$/.exec(z);
    if (k) {
      const rest = k[1]!.slice(wurzel.length).split('\\').filter(Boolean);
      ziel = aus;
      for (const teil of rest) ziel = ((ziel as Record<string, unknown>)[teil] ??= {}) as Record<string, unknown>;
      continue;
    }
    const w = /^"(.+?)"=(?:dword:([0-9a-f]{8})|"(.*)")$/.exec(z);
    if (w && ziel) ziel[w[1]!] = w[2] !== undefined ? parseInt(w[2], 16) === 1 : w[3]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  const listen = (o: unknown): unknown => {
    if (!o || typeof o !== 'object') return o;
    const e = Object.entries(o as Record<string, unknown>);
    if (e.length > 0 && e.every(([k], i) => k === String(i + 1))) return e.map(([, v]) => listen(v));
    return Object.fromEntries(e.map(([k, v]) => [k, listen(v)]));
  };
  return listen(aus) as Record<string, unknown>;
}

describe('U-47 Beispielprofile für Firmen', () => {
  test('eingecheckte Dateien = Erzeugnis (`npm run firmen`), .reg in UTF-16 LE mit BOM, .ps1 in UTF-8 mit BOM', () => {
    for (const b of ['chrome', 'edge'] as const) {
      expect(datei(`${b}-erzwingen.json`).toString('utf8')).toBe(`${JSON.stringify(erzwingen(b))}\n`);
      const reg = datei(`${b}-firmeneinstellungen.reg`);
      expect([...reg.subarray(0, 2)]).toEqual([0xff, 0xfe]);
      expect(reg.subarray(2).toString('utf16le')).toBe(regDatei(b));
    }
    const ps = datei('intune-plattformskript.ps1');
    expect([...ps.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(ps.subarray(3).toString('utf8')).toBe(plattformskript());
    expect(datei('eintraege.md').toString('utf8')).toBe(eintragsListe(AKTIVE_EINTRAEGE));
  });
  test('eintraege.md nennt jede aktive Kennung genau einmal (Prüfer H12)', () => {
    const md = eintragsListe(AKTIVE_EINTRAEGE);
    for (const e of AKTIVE_EINTRAEGE) expect(md.split(`| \`${e.id}\` |`).length - 1, e.id).toBe(1);
  });
  test('je Browser die Kennung und Update-Adresse seines Stores, nie die des anderen', () => {
    expect(Object.keys(erzwingen('chrome'))).toEqual([STORE_ID.chrome]);
    expect(Object.keys(erzwingen('edge'))).toEqual([STORE_ID.edge]);
    expect(JSON.stringify(erzwingen('edge'))).toContain('edge.microsoft.com/extensionwebstorebase/v1/crx');
    expect(JSON.stringify(erzwingen('chrome'))).toContain('clients2.google.com/service/update2/crx');
    expect(regDatei('edge')).not.toContain(STORE_ID.chrome);
    expect(regDatei('chrome')).not.toContain(STORE_ID.edge);
    expect(einstellungsPfad('edge')).toBe(`SOFTWARE\\Policies\\Microsoft\\Edge\\3rdparty\\extensions\\${STORE_ID.edge}\\policy`);
  });
  test('die .reg ergibt zurückgelesen genau die Musterwerte, nur Schlüssel aus dem Schema', () => {
    for (const b of ['chrome', 'edge'] as const) {
      const werte = regLesen(regDatei(b), einstellungsPfad(b));
      expect(werte).toEqual(MUSTER_EINSTELLUNGEN);
      for (const k of Object.keys(werte)) expect(schema.properties, k).toHaveProperty(k);
    }
  });
  test('Musterwerte wirken: Band an, Begründung für einen echten Eintrag', () => {
    const f = firmaAus(MUSTER_EINSTELLUNGEN, IDS);
    expect(f.verwaltet).toBe(true);
    expect(Object.keys(f.bewusst)).toEqual(['entra-app-registrierung']);
    expect(f.hilfeKontakt).toEqual(MUSTER_EINSTELLUNGEN.hilfeKontakt);
  });
  test('Plattformskript: bricht ohne Kennung ab, bevor es schreibt; Rücknahme vorhanden', () => {
    const ps = plattformskript();
    const abbruch = ps.indexOf("-like '<*'");
    expect(abbruch).toBeGreaterThan(0);
    expect(abbruch).toBeLessThan(ps.indexOf('Set-ItemProperty'));
    // Plattformskripte nehmen keine Parameter: Schalter als Variablen, Standard = installieren und ExtensionSettings setzen.
    expect(ps).not.toContain('param(');
    expect(ps).toContain('\r\n$Entfernen = $false\r\n');
    expect(ps).toContain('\r\n$ExtensionSettingsSetzen = $true\r\n');
    expect(ps).toContain('$e.PSObject.Properties.Remove($id)');
    // Ohne ExtensionSettings-Schalter wird dort nichts gelesen oder geschrieben.
    for (const block of ps.split('if ($ExtensionSettingsSetzen) {').slice(1)) expect(block.indexOf('ExtensionSettings')).toBeGreaterThan(-1);
    expect(ps.split('if ($ExtensionSettingsSetzen) {')[0]).not.toMatch(/-Name ExtensionSettings/);
  });
});
