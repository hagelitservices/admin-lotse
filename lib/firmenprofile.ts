/**
 * Beispielprofile für Firmen (Spez. §10, Rahmen E5): eine Quelle für `firmen/*`. Erzeugt mit `npm run firmen`;
 * U-47 hält die eingecheckten Dateien gleich mit dieser Quelle und mit `public/managed_schema.json`.
 *
 * Die Erweiterung hat je Store eine eigene Kennung (§10 „Falle“, kjello PL-28.2: Edge nimmt die Chrome-Store-Adresse
 * nicht). Bis zur Einreichung (H18) stehen Platzhalter da; das Plattformskript bricht dann mit `exit 1` ab, statt still
 * einen falschen Pfad zu schreiben.
 */
export const STORE_ID = { chrome: '<chrome-store-id>', edge: 'hkpgjiooldogphbobmhbkmkkgjdgneei' } as const;
export type Browser = keyof typeof STORE_ID;

const UPDATE_URL: Record<Browser, string> = {
  chrome: 'https://clients2.google.com/service/update2/crx',
  edge: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx',
};
const RICHTLINIE: Record<Browser, string> = { chrome: 'SOFTWARE\\Policies\\Google\\Chrome', edge: 'SOFTWARE\\Policies\\Microsoft\\Edge' };

/** Musterwerte: alle fünf Schlüssel aus §10, damit jede Firma sieht, wie sie aussehen. */
export const MUSTER_EINSTELLUNGEN = {
  hilfeKontakt: { name: 'IT-Team Musterfirma', url: 'mailto:it@musterfirma.de' },
  hilfeAusblenden: false,
  bewussteAbweichungen: [{ eintrag: 'entra-app-registrierung', begruendung: 'Apps registriert bei uns nur die IT, per Rollenzuweisung.' }],
  werteLesen: true,
  sprache: 'auto',
} as const;

/** `ExtensionSettings` (Wert als JSON, wie im Intune-Einstellungskatalog und in der Gruppenrichtlinie eingetragen). */
export function erzwingen(b: Browser): Record<string, unknown> {
  return {
    [STORE_ID[b]]: {
      installation_mode: 'force_installed',
      update_url: UPDATE_URL[b],
      ...(b === 'edge' ? { toolbar_state: 'force_shown' } : { toolbar_pin: 'force_pinned' }),
    },
  };
}

type Wert = string | number | boolean | readonly Wert[] | { readonly [k: string]: Wert };
/** Ein Registrierungsschlüssel mit seinen Werten: Text als REG_SZ, Wahrheitswert als REG_DWORD 1/0. */
interface Schluessel {
  pfad: string;
  werte: [string, string | number][];
}

/**
 * Chromium liest `3rdparty\extensions\<id>\policy` gegen das `managed_schema`: Objekte und Listen sind Unterschlüssel,
 * Listeneinträge heißen 1, 2, … (so auf `win11test` für Chrome gemessen, kjello PL-28.4).
 */
function schluesselVon(pfad: string, wert: { readonly [k: string]: Wert }): Schluessel[] {
  const eigen: Schluessel = { pfad, werte: [] };
  const unter: Schluessel[] = [];
  for (const [k, v] of Object.entries(wert)) {
    if (typeof v === 'string') eigen.werte.push([k, v]);
    else if (typeof v === 'boolean') eigen.werte.push([k, v ? 1 : 0]);
    else if (typeof v === 'number') eigen.werte.push([k, v]);
    else if (Array.isArray(v)) {
      const liste = v as readonly Wert[];
      const objekte = liste.filter((x): x is { readonly [k: string]: Wert } => typeof x === 'object' && !Array.isArray(x));
      if (objekte.length === liste.length) objekte.forEach((o, i) => unter.push(...schluesselVon(`${pfad}\\${k}\\${i + 1}`, o)));
      else unter.push({ pfad: `${pfad}\\${k}`, werte: liste.map((x, i) => [String(i + 1), String(x)]) });
    } else unter.push(...schluesselVon(`${pfad}\\${k}`, v as { readonly [k: string]: Wert }));
  }
  return [eigen, ...unter];
}

export const einstellungsPfad = (b: Browser) => `${RICHTLINIE[b]}\\3rdparty\\extensions\\${STORE_ID[b]}\\policy`;
const schluesselFuer = (b: Browser) => schluesselVon(einstellungsPfad(b), MUSTER_EINSTELLUNGEN as unknown as { readonly [k: string]: Wert });

const regText = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** `.reg` für Doppelklick oder Gruppenrichtlinie. UTF-16 LE mit BOM schreibt `scripts/firmen.ts` (Umlaute in regedit). */
export function regDatei(b: Browser): string {
  const zeilen = [
    'Windows Registry Editor Version 5.00',
    '',
    `; Admin-Lotse (hagel IT): Firmeneinstellungen für ${b === 'edge' ? 'Microsoft Edge' : 'Google Chrome'} (Spezifikation §10).`,
    `; ${STORE_ID[b]} durch die Kennung aus dem ${b === 'edge' ? 'Edge-Add-ons-Store' : 'Chrome Web Store'} ersetzen. Werte anpassen, nicht Benötigtes löschen.`,
    '; Vorher entfernen: den Schlüssel …\\policy mit einem Minus davor eintragen ([-HKEY_…\\policy]).',
    '',
  ];
  for (const s of schluesselFuer(b)) {
    zeilen.push(`[HKEY_LOCAL_MACHINE\\${s.pfad}]`);
    for (const [n, v] of s.werte) zeilen.push(`${regText(n)}=${typeof v === 'number' ? `dword:${v.toString(16).padStart(8, '0')}` : regText(v)}`);
    zeilen.push('');
  }
  return zeilen.join('\r\n');
}

const psText = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Intune-Plattformskript (als System): setzt die Firmeneinstellungen beider Browser und installiert per `ExtensionSettings`.
 * Plattformskripte nehmen keine Parameter (Prüfer H12) — darum Schalter als Variablen oben: Rücknahme = Kopie mit
 * `$Entfernen = $true` als eigenes Skript zuweisen. Setzt die Firma `ExtensionSettings` schon zentral, überschriebe die
 * nächste Synchronisierung den hier zusammengeführten Wert: dann `$ExtensionSettingsSetzen = $false`.
 */
export function plattformskript(): string {
  const z: string[] = [
    '# Admin-Lotse (hagel IT) in Chrome und Edge installieren und Firmeneinstellungen setzen (Spezifikation §10).',
    '# Intune: Geräte › Skripts und Korrekturen › Plattformskripts, als System, 64-Bit. Anleitung: LIESMICH.md.',
    '# Platzhalter in spitzen Klammern durch die Store-Kennungen ersetzen; Werte unten anpassen.',
    '',
    '# --- Schalter ---',
    '# $true: alles zurücknehmen (Kopie dieses Skripts als eigenes Plattformskript zuweisen).',
    '$Entfernen = $false',
    '# $false, wenn Ihre IT ExtensionSettings schon zentral setzt (Einstellungskatalog, Gruppenrichtlinie). Dann den Eintrag',
    '# aus chrome-erzwingen.json bzw. edge-erzwingen.json dort ergänzen; dieses Skript setzt nur die Firmeneinstellungen.',
    '$ExtensionSettingsSetzen = $true',
    '',
    "$ErrorActionPreference = 'Stop'",
    // Beide Kennungen vorher prüfen: sonst wäre Chrome geschrieben und Edge nicht.
    ...(['chrome', 'edge'] as const).map((b) => `if (${psText(STORE_ID[b])} -like '<*') { Write-Error 'Store-Kennung fehlt (${b}).'; exit 1 }`),
    '',
  ];
  for (const b of ['chrome', 'edge'] as const) {
    const id = STORE_ID[b];
    z.push(`# ${b === 'edge' ? 'Microsoft Edge' : 'Google Chrome'}`);
    z.push(`$id = ${psText(id)}`);
    z.push(`$basis = ${psText(`HKLM:\\${RICHTLINIE[b]}`)}`);
    z.push('$policy = "$basis\\3rdparty\\extensions\\$id\\policy"');
    z.push('if (Test-Path $policy) { Remove-Item -Path $policy -Recurse -Force }');
    z.push('if (-not $Entfernen) {');
    for (const s of schluesselFuer(b)) {
      const rel = s.pfad.slice(einstellungsPfad(b).length);
      z.push(`  New-Item -Path "$policy${rel}" -Force | Out-Null`);
      for (const [n, v] of s.werte)
        z.push(`  Set-ItemProperty -Path "$policy${rel}" -Name ${psText(n)} -Value ${typeof v === 'number' ? v : psText(v)} -Type ${typeof v === 'number' ? 'DWord' : 'String'}`);
    }
    z.push('}');
    // ExtensionSettings ist ein JSON-Text; fremde Erweiterungen darin bleiben stehen.
    z.push('if ($ExtensionSettingsSetzen) {');
    z.push('  $alt = (Get-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue).ExtensionSettings');
    z.push('  $e = if ($alt) { $alt | ConvertFrom-Json } else { [pscustomobject]@{} }');
    z.push('  $e.PSObject.Properties.Remove($id)');
    z.push(`  if (-not $Entfernen) { $e | Add-Member -NotePropertyName $id -NotePropertyValue (${psText(JSON.stringify(erzwingen(b)[id]))} | ConvertFrom-Json) }`);
    z.push('  if (-not (Test-Path $basis)) { New-Item -Path $basis -Force | Out-Null }');
    z.push('  if ($e.PSObject.Properties.Count -gt 0) { Set-ItemProperty -Path $basis -Name ExtensionSettings -Value ($e | ConvertTo-Json -Compress -Depth 5) -Type String }');
    z.push('  else { Remove-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue }');
    z.push('}');
    z.push('');
  }
  z.push('exit 0', '');
  return z.join('\r\n');
}

/** Kennungen für `bewussteAbweichungen` (Prüfer H12: ohne sie kann keine Firma den Schlüssel füllen). */
export function eintragsListe(eintraege: readonly { id: string; portal: string; titel: { de: string; en: string } }[]): string {
  const z = [
    '# Kennungen der Einträge (für `bewussteAbweichungen`)',
    '',
    'Erzeugt aus den Inhaltsdateien des Admin-Lotsen (`npm run firmen`). Unbekannte Kennungen ignoriert der Lotse still.',
    '',
    '| Kennung | Portal | Titel | Title |',
    '|---|---|---|---|',
    ...eintraege.map((e) => `| \`${e.id}\` | ${e.portal} | ${e.titel.de} | ${e.titel.en} |`),
    '',
  ];
  return z.join('\n');
}
