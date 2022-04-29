// tsup.config.ts
import type { Options } from 'tsup';

export const tsup: Options = {
  splitting: false,
  sourcemap: false,
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  external: [
    './loader/xe-css-loader.ts',
    './presets/index.ts'
  ],
  entryPoints: [
    'packages/xe-css-plugin.ts',
    'packages/loader/xe-css-loader.ts',
    'packages/presets/index.ts'
  ]
};
