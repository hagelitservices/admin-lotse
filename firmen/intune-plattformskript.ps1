# Admin-Lotse (hagel IT) in Chrome und Edge installieren und Firmeneinstellungen setzen (Spezifikation §10).
# Intune: Geräte › Skripts und Korrekturen › Plattformskripts, als System, 64-Bit. Anleitung: LIESMICH.md.
# Platzhalter in spitzen Klammern durch die Store-Kennungen ersetzen; Werte unten anpassen.

# --- Schalter ---
# $true: alles zurücknehmen (Kopie dieses Skripts als eigenes Plattformskript zuweisen).
$Entfernen = $false
# $false, wenn Ihre IT ExtensionSettings schon zentral setzt (Einstellungskatalog, Gruppenrichtlinie). Dann den Eintrag
# aus chrome-erzwingen.json bzw. edge-erzwingen.json dort ergänzen; dieses Skript setzt nur die Firmeneinstellungen.
$ExtensionSettingsSetzen = $true

$ErrorActionPreference = 'Stop'
if ('lcfimfdbdclcdnphmkhikfcimamodphf' -like '<*') { Write-Error 'Store-Kennung fehlt (chrome).'; exit 1 }
if ('hkpgjiooldogphbobmhbkmkkgjdgneei' -like '<*') { Write-Error 'Store-Kennung fehlt (edge).'; exit 1 }

# Google Chrome
$id = 'lcfimfdbdclcdnphmkhikfcimamodphf'
$basis = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
$policy = "$basis\3rdparty\extensions\$id\policy"
if (Test-Path $policy) { Remove-Item -Path $policy -Recurse -Force }
if (-not $Entfernen) {
  New-Item -Path "$policy" -Force | Out-Null
  Set-ItemProperty -Path "$policy" -Name 'hilfeAusblenden' -Value 0 -Type DWord
  Set-ItemProperty -Path "$policy" -Name 'werteLesen' -Value 1 -Type DWord
  Set-ItemProperty -Path "$policy" -Name 'sprache' -Value 'auto' -Type String
  New-Item -Path "$policy\hilfeKontakt" -Force | Out-Null
  Set-ItemProperty -Path "$policy\hilfeKontakt" -Name 'name' -Value 'IT-Team Musterfirma' -Type String
  Set-ItemProperty -Path "$policy\hilfeKontakt" -Name 'url' -Value 'mailto:it@musterfirma.de' -Type String
  New-Item -Path "$policy\bewussteAbweichungen\1" -Force | Out-Null
  Set-ItemProperty -Path "$policy\bewussteAbweichungen\1" -Name 'eintrag' -Value 'entra-app-registrierung' -Type String
  Set-ItemProperty -Path "$policy\bewussteAbweichungen\1" -Name 'begruendung' -Value 'Apps registriert bei uns nur die IT, per Rollenzuweisung.' -Type String
}
if ($Entfernen) {
  foreach ($k in @("$basis\3rdparty\extensions\$id", "$basis\3rdparty\extensions", "$basis\3rdparty")) {
    if ((Test-Path $k) -and -not (Get-ChildItem -Path $k) -and -not (Get-Item -Path $k).Property) { Remove-Item -Path $k -Force }
  }
}
if ($ExtensionSettingsSetzen) {
  $alt = (Get-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue).ExtensionSettings
  $e = if ($alt) { $alt | ConvertFrom-Json } else { [pscustomobject]@{} }
  $e.PSObject.Properties.Remove($id)
  if (-not $Entfernen) { $e | Add-Member -NotePropertyName $id -NotePropertyValue ('{"installation_mode":"force_installed","update_url":"https://clients2.google.com/service/update2/crx","toolbar_pin":"force_pinned"}' | ConvertFrom-Json) }
  if (-not (Test-Path $basis)) { New-Item -Path $basis -Force | Out-Null }
  if ($e.PSObject.Properties.Count -gt 0) { Set-ItemProperty -Path $basis -Name ExtensionSettings -Value ($e | ConvertTo-Json -Compress -Depth 5) -Type String }
  else { Remove-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue }
}

# Microsoft Edge
$id = 'hkpgjiooldogphbobmhbkmkkgjdgneei'
$basis = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
$policy = "$basis\3rdparty\extensions\$id\policy"
if (Test-Path $policy) { Remove-Item -Path $policy -Recurse -Force }
if (-not $Entfernen) {
  New-Item -Path "$policy" -Force | Out-Null
  Set-ItemProperty -Path "$policy" -Name 'hilfeAusblenden' -Value 0 -Type DWord
  Set-ItemProperty -Path "$policy" -Name 'werteLesen' -Value 1 -Type DWord
  Set-ItemProperty -Path "$policy" -Name 'sprache' -Value 'auto' -Type String
  New-Item -Path "$policy\hilfeKontakt" -Force | Out-Null
  Set-ItemProperty -Path "$policy\hilfeKontakt" -Name 'name' -Value 'IT-Team Musterfirma' -Type String
  Set-ItemProperty -Path "$policy\hilfeKontakt" -Name 'url' -Value 'mailto:it@musterfirma.de' -Type String
  New-Item -Path "$policy\bewussteAbweichungen\1" -Force | Out-Null
  Set-ItemProperty -Path "$policy\bewussteAbweichungen\1" -Name 'eintrag' -Value 'entra-app-registrierung' -Type String
  Set-ItemProperty -Path "$policy\bewussteAbweichungen\1" -Name 'begruendung' -Value 'Apps registriert bei uns nur die IT, per Rollenzuweisung.' -Type String
}
if ($Entfernen) {
  foreach ($k in @("$basis\3rdparty\extensions\$id", "$basis\3rdparty\extensions", "$basis\3rdparty")) {
    if ((Test-Path $k) -and -not (Get-ChildItem -Path $k) -and -not (Get-Item -Path $k).Property) { Remove-Item -Path $k -Force }
  }
}
if ($ExtensionSettingsSetzen) {
  $alt = (Get-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue).ExtensionSettings
  $e = if ($alt) { $alt | ConvertFrom-Json } else { [pscustomobject]@{} }
  $e.PSObject.Properties.Remove($id)
  if (-not $Entfernen) { $e | Add-Member -NotePropertyName $id -NotePropertyValue ('{"installation_mode":"force_installed","update_url":"https://edge.microsoft.com/extensionwebstorebase/v1/crx","toolbar_state":"force_shown"}' | ConvertFrom-Json) }
  if (-not (Test-Path $basis)) { New-Item -Path $basis -Force | Out-Null }
  if ($e.PSObject.Properties.Count -gt 0) { Set-ItemProperty -Path $basis -Name ExtensionSettings -Value ($e | ConvertTo-Json -Compress -Depth 5) -Type String }
  else { Remove-ItemProperty -Path $basis -Name ExtensionSettings -ErrorAction SilentlyContinue }
}

exit 0
