import { defineConfig } from 'tsup';

// Two entries, one door: the dependency-free kernel and the React bricks.
// ESM only — the package is `type: module` and React hosts bundle anyway.
export default defineConfig({
  entry: { index: 'src/index.ts', 'ui/index': 'ui/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react/jsx-runtime'],
});
