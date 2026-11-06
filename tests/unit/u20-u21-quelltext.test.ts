// U-20, U-21 (Spez. §4.1, §5.3, §14.3): kein DOM-Pfad als Selektor, kein Eingriff in die Portalseite.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { WURZEL, quelltext } from './hilfen/paket';

const alle = quelltext();
const lesen = (p: string) => readFileSync(p, 'utf8');
const name = (p: string) => relative(WURZEL, p);

const ABFRAGE = /\.(?:querySelectorAll|querySelector|closest|matches)\(\s*/g;

/** Erstes Argument aller DOM-Abfragen. Zeichenkette (auch mit anderen Anführungszeichen darin) → ihr Inhalt, Vorlage →
 *  ihre festen Teile; alles andere (Variable, Ausdruck) → `null`, das ist verboten: Selektoren stehen sichtbar im Code. */
export function selektoren(code: string): (string | null)[] {
  return [...code.matchAll(ABFRAGE)].map((m) => {
    const rest = code.slice((m.index ?? 0) + m[0].length);
    const z = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(rest);
    if (!z) return null;
    return z[1] === '`' ? (z[2] ?? '').replace(/\$\{[^}]*\}/g, 'x') : (z[2] ?? '');
  });
}

/** Klasse (`.x`), `nth-child`/`nth-of-type`, Kind-Kette (`>`), Attribut `class` oder `id`. */
export const istDomPfad = (s: string) => /(^|[\s>+~(])\.[A-Za-z_-]|:nth-|>|\[\s*(class|id)\b|#[A-Za-z]/.test(s);

describe('U-20 keine DOM-Pfade', () => {
  test('Prüfregel erkennt Pfade und lässt semantische Selektoren durch', () => {
    for (const s of ['.ms-Toggle', 'div > span', 'li:nth-child(2)', '[class*="toggle"]', '#pivot', 'div .x']) expect(istDomPfad(s), s).toBe(true);
    for (const s of ['[role="switch"]', '[role="dialog"]', '[aria-checked]', 'input[type="checkbox"]', 'h1']) expect(istDomPfad(s), s).toBe(false);
  });

  test('Herausziehen findet auch Selektoren mit inneren Anführungszeichen, Vorlagen und Variablen', () => {
    expect(selektoren(`d.querySelector('[aria-label="x"] > div.ms-Toggle')`)).toEqual(['[aria-label="x"] > div.ms-Toggle']);
    expect(selektoren('d.querySelectorAll(`[role="${r}"]`)')).toEqual(['[role="x"]']);
    expect(selektoren('d.closest(S)')).toEqual([null]);
  });

  test('Quelltext ist vorhanden', () => expect(alle.length).toBeGreaterThan(0));

  test.each(alle.map((p) => [name(p), p]))('%s', (_n, p) => {
    const code = lesen(p);
    for (const s of selektoren(code)) {
      expect(s, 'Selektor nicht als Zeichenkette im Code').not.toBeNull();
      expect(istDomPfad(s ?? ''), `DOM-Pfad „${s}“`).toBe(false);
    }
    // Einzige erlaubte Kennungs-Abfrage: der ARIA-Bezug in lib/leser.ts (`aria-labelledby` zeigt selbst auf die Kennung).
    const ohneBezug = code.replace(/^.*getElementById\(k\).*\/\/ ARIA-Bezug$/m, '');
    expect(ohneBezug).not.toMatch(/:nth-(child|of-type)|getElementsByClassName|getElementById|\.className\b|\.classList\b/);
  });
});

// Alles, was im Kontext der Portalseite läuft: Inhalts-Skripte und die gemeinsamen Bausteine in lib/.
const seitennah = alle.filter((p) => /\.content\.tsx?$/.test(p) || name(p).startsWith('lib/'));
const EINGRIFFE: [string, RegExp][] = [
  ['.click(', /\.click\(/],
  ['dispatchEvent(', /dispatchEvent\(/],
  ['.checked =', /\.checked\s*=(?!=)/],
  ['.value =', /\.value\s*=(?!=)/],
  ['.submit(', /\.submit\(/],
  ['focus(', /focus\(/],
  ['.value +=', /\.value\s*[-+]=/],
  ['requestSubmit(', /requestSubmit\(/],
  ["['click']", /\[\s*['"`](?:click|submit|focus|dispatchEvent)['"`]\s*\]/],
  ['setAttribute(', /(?:set|remove|toggle)Attribute(?:NS)?\(/],
  ['DOM einfügen/entfernen', /\b(?:appendChild|insertBefore|replaceChild|removeChild|replaceWith|insertAdjacent\w*)\(|\.(?:append|prepend|remove)\(\)/],
  ['postMessage(', /postMessage\(/],
];

describe('U-21 kein Eingriff in die Seite', () => {
  test('Inhalts-Skripte sind erfasst', () => expect(seitennah.some((p) => p.endsWith('.content.ts'))).toBe(true));

  test.each(seitennah.map((p) => [name(p), p]))('%s', (_n, p) => {
    const code = lesen(p);
    for (const [was, muster] of EINGRIFFE) expect(muster.test(code), `${was} in ${name(p)}`).toBe(false);
  });

  test('nirgends innerHTML oder dangerouslySetInnerHTML im eigenen Code (Gegenstück zu U-43)', () => {
    for (const p of alle) expect(lesen(p), name(p)).not.toMatch(/innerHTML|dangerouslySetInnerHTML|outerHTML|insertAdjacentHTML/);
  });
});
