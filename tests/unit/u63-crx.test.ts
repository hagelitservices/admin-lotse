// U-63 (H18d): Signiertes CRX3 für „Verified CRX uploads“ — Aufbau nach Chromium crx3.proto, Signatur prüfbar,
// CRX-ID passt zum Schlüssel, ZIP unverändert am Ende.
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { crx3, crxId } from '../../scripts/crx-signieren.mjs';

/** Minimaler Protobuf-Leser: nur length-delimited Felder (mehr kommt im CRX-Kopf nicht vor). */
function felder(b: Buffer): Array<[number, Buffer]> {
  const out: Array<[number, Buffer]> = [];
  let i = 0;
  const varint = () => {
    let n = 0;
    let f = 1;
    for (;;) {
      const x = b[i++]!;
      n += (x & 0x7f) * f;
      if (x < 0x80) return n;
      f *= 128;
    }
  };
  while (i < b.length) {
    const schluessel = varint();
    expect(schluessel % 8).toBe(2);
    const laenge = varint();
    out.push([Math.floor(schluessel / 8), b.subarray(i, i + laenge)]);
    i += laenge;
  }
  return out;
}

describe('U-63 CRX3-Signatur', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const zip = Buffer.from('PK\x03\x04 Testinhalt eines ZIP', 'binary');
  const crx = crx3(zip, pem);

  it('Kopf: Cr24, Version 3, Kopflänge, danach das ZIP unverändert', () => {
    expect(crx.subarray(0, 4).toString('binary')).toBe('Cr24');
    expect(crx.readUInt32LE(4)).toBe(3);
    const laenge = crx.readUInt32LE(8);
    expect(crx.subarray(12 + laenge).equals(zip)).toBe(true);
  });

  it('Beweis sha256_with_rsa prüft gegen den eigenen Schlüssel, CRX-ID = SHA-256(SPKI)[0..16]', () => {
    const kopf = felder(crx.subarray(12, 12 + crx.readUInt32LE(8)));
    const beweise = kopf.filter(([nr]) => nr === 2);
    expect(beweise).toHaveLength(1);
    const signed = kopf.find(([nr]) => nr === 10000)?.[1];
    expect(signed).toBeDefined();
    const [[nrKey, spki], [nrSig, signatur]] = felder(beweise[0]![1]) as [[number, Buffer], [number, Buffer]];
    expect([nrKey, nrSig]).toEqual([1, 2]);
    const spkiErwartet = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    expect(spki.equals(spkiErwartet)).toBe(true);
    const [[nrId, id]] = felder(signed!) as [[number, Buffer]];
    expect(nrId).toBe(1);
    expect(id.equals(crxId(spki))).toBe(true);
    const laengeSigned = Buffer.alloc(4);
    laengeSigned.writeUInt32LE(signed!.length);
    const daten = Buffer.concat([Buffer.from('CRX3 SignedData\x00', 'binary'), laengeSigned, signed!, zip]);
    expect(verify('sha256', daten, createPublicKey(privateKey), signatur)).toBe(true);
    // Manipuliertes ZIP fällt durch
    const falsch = Buffer.concat([daten.subarray(0, daten.length - 1), Buffer.from('X')]);
    expect(verify('sha256', falsch, createPublicKey(privateKey), signatur)).toBe(false);
  });
});
