// Typen für crx-signieren.mjs (H18d).
export declare const SCHLUESSELBUND_DIENST: string;
export declare function crxId(spkiDer: Buffer): Buffer;
export declare function crx3(zip: Buffer, privatPem: string): Buffer;
