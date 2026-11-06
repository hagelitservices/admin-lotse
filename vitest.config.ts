import { defineConfig } from 'vitest/config';

// Unit-Tests (Spez. §14.3). U-40 bis U-44 lesen die gebauten Pakete — `npm run pruefen` baut vorher Chrome und Edge.
export default defineConfig({
  define: { __LOTSE_MUSTER__: 'false' },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
