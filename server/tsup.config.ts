import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  esbuildOptions(options) {
    options.alias = {
      '@shared': path.resolve('..', 'shared'),
      '@engine': path.resolve('..', 'src', 'engine'),
    };
  },
  // Don't bundle node_modules (express, prisma, etc.)
  external: [
    /node_modules/,
  ],
  noExternal: [
    /^@shared/,
    /^@engine/,
  ],
});
