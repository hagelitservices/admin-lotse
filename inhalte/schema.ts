/**
 * Inhaltsmodell (Spez. §5.1, §6.1). Läuft beim Bau (Hook in `wxt.config.ts`) und im Test (U-30), nie im Paket:
 * Die Erweiterung importiert von hier nur Typen, zod landet nicht im Bündel.
 */
import { z } from 'zod';

/** Vom Leser vergebene Sonder-Token (lib/leser.ts). Ein Eintrag darf sie nicht als eigenen Wert benutzen. */
export const SONDER_TOKEN = ['mehrdeutig', 'unbekannt'] as const;

const zweisprachig = z.strictObject({ de: z.string().min(1), en: z.string().min(1) });
const namen = z.strictObject({ de: z.array(z.string().min(1)).min(1), en: z.array(z.string().min(1)).min(1) });

export const leserSchema = z
  .strictObject({
    art: z.enum(['schalter', 'haekchen', 'auswahl', 'text', 'anzahl', 'domains', 'zelle']),
    rolle: z.enum(['switch', 'checkbox', 'radiogroup', 'combobox', 'heading', 'table', 'grid', 'treegrid']),
    name: namen,
    /** Token → sichtbare Wörter (de und en gemischt). Pflicht bei `auswahl` und `text`. */
    werte: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)).optional(),
    empfohlen: z.array(z.string().min(1)),
    /** Nur `anzahl`: In dieser Spanne gilt der Wert als „passt“ (§6.3 „weniger als fünf“). */
    spanne: z.strictObject({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() }).optional(),
    /** Nur `anzahl`: Null Zeilen sind ein echter Wert. Nur setzen, wenn die Fixture das leere Bild belegt. */
    leerGilt: z.boolean().optional(),
    /**
     * Nur `zelle` (H8c): Kopf der Spalte, deren Wert gelesen wird. Die Tabelle selbst findet `name` über ihre Bezeichnung;
     * hat sie keine (Entra `AllRolesBlade`), zählt ein Spaltenkopf aus `name` (dann ist `name` die Schlüsselspalte).
     */
    spalte: namen.optional(),
    /** Nur `zelle`: Zeilen über den Text einer ihrer Zellen. Mehrere Zeilen: passt nur, wenn jede passt. */
    zeilen: z.array(namen).min(1).optional(),
    /**
     * Der Leser erkennt nur die Abweichung sicher (H8c): Ein empfohlener Wert ergibt kein „passt“, sondern die Erklärung mit
     * dem gelesenen Wert. Für Werte, neben denen eine zweite, hier unsichtbare Einstellung gilt (alte MFA-Richtlinie) oder die
     * mehr zählen, als sie zeigen (Gruppen als eine Rollenzuweisung).
     */
    nurAbweichung: z.literal(true).optional(),
    /**
     * Nur `auswahl` mit `radiogroup` (H8d): Die Gruppe hat keinen zugänglichen Namen (Entra `AllowlistPolicyBlade`, de und en
     * gemessen). Dann zählt eine Gruppe ohne Namen, deren Optionen mindestens zwei verschiedene Wörter aus `werte` tragen; mit Namen weiter nur über `name`.
     * Eindeutigkeit wie immer: Zwei solche Gruppen = mehrdeutig. Die Optionswörter müssen deshalb nur in dieser Gruppe stehen.
     */
    gruppeUeberOption: z.literal(true).optional(),
    /**
     * Voraussetzung (H7b): Name eines Häkchens oder Schalters neben dem Bedienelement (im selben Dialog). Nur wenn es an ist,
     * wird gelesen; sonst gilt die Auswahl nicht und es bleibt bei der Erklärung. Nur mit Dialog-Schlüssel, damit „nichts
     * gelesen“ nie zur Zeitgrenze („nicht lesbar“) wird.
     */
    nurWenn: namen.optional(),
    rahmen: z.enum(['oben', 'eingebettet', 'beliebig']),
    dialog: namen.nullable(),
  })
  .superRefine((l, c) => {
    const melde = (message: string) => c.addIssue({ code: 'custom', message });
    const schluessel = Object.keys(l.werte ?? {});
    for (const s of schluessel) if ((SONDER_TOKEN as readonly string[]).includes(s)) melde(`Token „${s}“ ist reserviert`);
    if (l.art === 'schalter' || l.art === 'haekchen') {
      if (l.rolle !== 'switch' && l.rolle !== 'checkbox') melde('Schalter und Häkchen brauchen die Rolle switch oder checkbox');
      if (l.werte) melde('Schalter und Häkchen haben feste Token ja/nein');
      if (l.empfohlen.length === 0 || l.empfohlen.some((t) => t !== 'ja' && t !== 'nein')) melde('empfohlen muss ja oder nein sein');
    }
    if (l.art === 'auswahl' || l.art === 'text') {
      if (schluessel.length === 0) melde('auswahl und text brauchen werte');
      if (l.art === 'auswahl' && l.rolle !== 'radiogroup' && l.rolle !== 'combobox') melde('auswahl braucht radiogroup oder combobox');
      if (l.art === 'text' && l.rolle !== 'heading') melde('text braucht die Rolle heading');
      if (l.empfohlen.length === 0 || l.empfohlen.some((t) => !schluessel.includes(t))) melde('empfohlen muss in werte stehen');
    }
    if (l.art === 'anzahl' || l.art === 'domains') {
      if (!['table', 'grid', 'treegrid'].includes(l.rolle)) melde('anzahl und domains brauchen eine Tabelle');
      if (l.werte || l.empfohlen.length > 0) melde('anzahl und domains haben keine Wort-Token');
    }
    if (l.art === 'anzahl' && l.spanne?.min === undefined && l.spanne?.max === undefined) melde('anzahl braucht eine spanne');
    if (l.spanne?.min !== undefined && l.spanne.max !== undefined && l.spanne.min > l.spanne.max) melde('spanne: min größer als max');
    if (l.gruppeUeberOption && (l.art !== 'auswahl' || l.rolle !== 'radiogroup')) melde('gruppeUeberOption gibt es nur bei auswahl mit radiogroup');
    if (l.nurAbweichung && l.art === 'domains') melde('domains bewertet nie');
    if (l.nurWenn && !l.dialog) melde('nurWenn braucht einen Dialog-Schlüssel');
    if (l.art === 'zelle') {
      if (!['table', 'grid', 'treegrid'].includes(l.rolle)) melde('zelle braucht eine Tabelle');
      if (!l.spalte) melde('zelle braucht spalte');
      if (!l.zeilen) melde('zelle braucht zeilen');
      const zahl = l.spanne !== undefined;
      if (zahl && l.spanne?.min === undefined && l.spanne?.max === undefined) melde('spanne braucht min oder max');
      if (zahl) {
        if (l.werte) melde('Zahl in der Zelle hat keine Wort-Token');
        if ((l.zeilen ?? []).length !== 1) melde('Zahl in der Zelle liest genau eine Zeile');
      } else {
        if (schluessel.length === 0) melde('zelle mit Wort braucht werte');
        if (l.empfohlen.length === 0 || l.empfohlen.some((t) => !schluessel.includes(t))) melde('empfohlen muss in werte stehen');
      }
      if (zahl && l.empfohlen.length > 0) melde('Zahlen werden über spanne bewertet, nicht über empfohlen');
      if (l.leerGilt !== undefined) melde('leerGilt gibt es nur bei anzahl');
    } else {
      if (l.spalte || l.zeilen) melde('spalte und zeilen gibt es nur bei zelle');
      if (l.art !== 'anzahl' && (l.spanne || l.leerGilt !== undefined)) melde('spanne gibt es nur bei anzahl und zelle, leerGilt nur bei anzahl');
    }
  });

export const eintragSchema = z
  .strictObject({
    id: z.string().regex(/^(m365|entra|intune|exo)-[a-z0-9-]+$/),
    portal: z.enum(['m365', 'entra', 'intune', 'exo']),
    route: z.string().min(1),
    titelProbe: namen,
    titel: zweisprachig,
    wasEsTut: zweisprachig,
    empfehlung: z.strictObject({
      kurz: zweisprachig,
      wennEsSoBleibt: zweisprachig,
      vorher: zweisprachig.optional(),
      schwere: z.enum(['rot', 'gelb', 'info']),
    }),
    soGehts: z.strictObject({ de: z.array(z.string().min(1)), en: z.array(z.string().min(1)) }).optional(),
    lizenz: z.string().min(1).nullable(),
    quellen: z
      .array(
        z.union([
          z.strictObject({ pfad: z.string().regex(/^[a-z0-9][a-z0-9/_.-]*$/), titel: zweisprachig }),
          z.strictObject({ url: z.url({ protocol: /^https$/ }), titel: zweisprachig }),
        ]),
      )
      .min(1),
    /** Ein Satz je Kennzahl; `{wert}`, `{basis}`, `{jahr}` füllt der Bau aus `ergebnis-<Jahr>.json`, nie von Hand (§6.1). */
    index: z.array(z.strictObject({ kennzahl: z.string().min(1), satz: zweisprachig })).min(1).nullable(),
    leser: leserSchema.nullable(),
    herkunft: z.array(z.string().min(1)),
    inhaltGeprueftAm: z.iso.date(),
    status: z.enum(['aktiv', 'entwurf', 'ausgesetzt']),
  })
  .superRefine((e, c) => {
    if (!e.id.startsWith(`${e.portal}-`)) c.addIssue({ code: 'custom', message: 'id muss mit dem Portal beginnen' });
    if (e.leser && e.leser.art !== 'domains' && e.empfehlung.schwere === 'info') {
      c.addIssue({ code: 'custom', message: 'Ein bewertender Leser braucht die Schwere rot oder gelb (§5.4)' });
    }
    for (const s of e.index ?? []) {
      if (/\d/.test(s.satz.de + s.satz.en)) c.addIssue({ code: 'custom', message: 'Zahlen im Index-Satz stehen nie von Hand (§6.1)' });
    }
  });

export const inhaltsdateiSchema = z.array(eintragSchema);
export type Eintrag = z.infer<typeof eintragSchema>;
export type Leser = z.infer<typeof leserSchema>;
