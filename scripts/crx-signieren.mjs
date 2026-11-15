#!/usr/bin/env node
// Signiertes CRX für „Verified CRX uploads“ im Chrome Web Store (Spez. §17.1 Nr. 6, BAU-PLUGINS H18d).
// Ist die Option im Dashboard eingeschaltet, nimmt der Store nur noch Pakete an, die mit dem dort hinterlegten Schlüssel
// signiert sind — ein ZIP wird dann abgelehnt. `npm run zip` ruft dieses Skript nach dem Packen auf und legt neben
// `admin-lotse-<version>-chrome.zip` die Datei `admin-lotse-<version>-chrome.crx` ab; hochgeladen wird dann das CRX.
//
// Schlüssel: privater RSA-Schlüssel (PEM, base64 in einer Zeile) im macOS-Schlüsselbund, Dienst
// `admin-lotse-crx-signatur`. Der öffentliche Teil liegt in `store/crx-oeffentlich.pem` (den trägt man im Dashboard ein).
// Fehlt der Schlüssel (anderer Rechner, Quelltext-Spiegel), überspringt das Skript still mit Exit 0.
//
// Format CRX3 (Chromium components/crx_file/crx3.proto): "Cr24", Version 3, Kopflänge, CrxFileHeader, ZIP.
// Signiert wird "CRX3 SignedData\0" + Länge(signed_header_data) + signed_header_data + ZIP, RSA-SHA256 (PKCS#1 v1.5).
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SCHLUESSELBUND_DIENST = 'admin-lotse-crx-signatur';

function varint(n) {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
}
/** Protobuf-Feld vom Typ „length-delimited“ (bytes/Nachricht). */
const feld = (nr, daten) => Buffer.concat([varint(nr * 8 + 2), varint(daten.length), daten]);
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

/** CRX-ID = erste 16 Byte von SHA-256 über den öffentlichen Schlüssel (SubjectPublicKeyInfo, DER). */
export const crxId = (spkiDer) => createHash('sha256').update(spkiDer).digest().subarray(0, 16);

/** Baut ein CRX3 aus ZIP-Bytes und privatem Schlüssel (PEM). */
export function crx3(zip, privatPem) {
  const privat = createPrivateKey(privatPem);
  const spki = createPublicKey(privat).export({ type: 'spki', format: 'der' });
  const signedHeaderData = feld(1, crxId(spki)); // SignedData { bytes crx_id = 1; }
  const signiert = Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'binary'), u32(signedHeaderData.length), signedHeaderData, zip]);
  const signatur = sign('sha256', signiert, privat);
  const kopf = Buffer.concat([
    feld(2, Buffer.concat([feld(1, spki), feld(2, signatur)])), // sha256_with_rsa = 2 { public_key = 1; signature = 2; }
    feld(10000, signedHeaderData), // signed_header_data = 10000
  ]);
  return Buffer.concat([Buffer.from('Cr24', 'binary'), u32(3), u32(kopf.length), kopf, zip]);
}

function schluesselAusBund() {
  try {
    const b64 = execFileSync('security', ['find-generic-password', '-s', SCHLUESSELBUND_DIENST, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const WURZEL = fileURLToPath(new URL('..', import.meta.url));
  const { version } = JSON.parse(readFileSync(`${WURZEL}package.json`, 'utf8'));
  const pem = schluesselAusBund();
  if (!pem) {
    console.log(`crx: kein Signierschlüssel im Schlüsselbund (${SCHLUESSELBUND_DIENST}) — CRX übersprungen`);
    process.exit(0);
  }
  // Gegenprobe: der Schlüssel muss zu dem passen, der im Dashboard hinterlegt ist (store/crx-oeffentlich.pem).
  const oeffentlich = `${WURZEL}store/crx-oeffentlich.pem`;
  const aktuell = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'pem' });
  if (existsSync(oeffentlich) && readFileSync(oeffentlich, 'utf8').trim() !== String(aktuell).trim()) {
    console.error('crx: Schlüssel im Schlüsselbund passt nicht zu store/crx-oeffentlich.pem — abgebrochen');
    process.exit(1);
  }
  const zip = `${WURZEL}.output/admin-lotse-${version}-chrome.zip`;
  const ziel = zip.replace(/\.zip$/, '.crx');
  writeFileSync(ziel, crx3(readFileSync(zip), pem));
  console.log(`crx: ${ziel.slice(WURZEL.length)} signiert`);
}
