// Symbole der Oberfläche als SVG (keine Bildschrift, keine Emojis). Namen bewusst nicht `Symbol` (Rahmen §10, WXT-Autoimport).
import type { Farbe, Form } from '../lib/zustand';

/** Lotse-Zeichen: Signalflagge „H“ — „Ich habe einen Lotsen an Bord.“ Links weiß, rechts Orange, auf navy-950 (§11.4). */
export function LotsenZeichen({ klasse }: { klasse?: string }) {
  return (
    <svg class={klasse} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#0F2440" />
      <rect x="6" y="8" width="10" height="16" fill="#FFFFFF" />
      <rect x="16" y="8" width="10" height="16" fill="#E8621A" />
    </svg>
  );
}

const FORMEN: Record<Form, preact.JSX.Element> = {
  kreis: <circle cx="6" cy="6" r="5" fill="currentColor" />,
  quadrat: <rect x="1" y="1" width="10" height="10" fill="currentColor" />,
  dreieck: <path d="M6 0.8 11.5 11H0.5Z" fill="currentColor" />,
  strich: <rect x="0.5" y="4.5" width="11" height="3" rx="1" fill="currentColor" />,
  raute: <path d="M6 0.5 11.5 6 6 11.5 0.5 6Z" fill="currentColor" />,
};

/** Statuspunkt: Form und Farbe; das Wort steht immer daneben (nie nur Farbe, TOOLS-SPEC §2.1). */
export function Punkt({ form, farbe }: { form: Form; farbe: Farbe }) {
  return (
    <svg class="punkt" data-form={form} data-farbe={farbe} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {FORMEN[form]}
    </svg>
  );
}

export function Pfeil({ klasse }: { klasse?: string }) {
  return (
    <svg class={klasse} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function Zahnrad() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
