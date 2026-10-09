import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs', 'esm'],
  noExternal: ['@design-review/shared'],
});
