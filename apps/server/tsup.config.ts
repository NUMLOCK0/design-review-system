import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/image-studio-worker-main.ts'],
  format: ['cjs', 'esm'],
  noExternal: ['@design-review/shared'],
});
