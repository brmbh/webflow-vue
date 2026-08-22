import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import mkcert from 'vite-plugin-mkcert';

/**
 * Two build shapes from one config:
 *
 *   vite build                 → dist/main.js            the demo *app* bundle
 *   vite build --mode lib      → dist/webflow-vue.*.js   the *library* (exports only)
 *   vite build --mode bridge   → dist/bridge.global.js   the *bridge* (loads the others)
 *
 * The bridge is built separately and bundles nothing: it is the script that
 * decides what to load, so it cannot import what it loads.
 *
 * Both externalize Vue: the CDN global `vue.global.js` ships the runtime
 * compiler, which islands need because their template is the live Webflow DOM.
 */
export default defineConfig(({ command, mode }) => ({
  plugins: [vue(), mkcert()],
  // Dev only: islands compile the live Webflow DOM as their template, so the
  // runtime compiler must be present. In build, `external: ['vue']` maps
  // imports to the CDN global (vue.global.js), which ships the compiler.
  resolve:
    command === 'serve'
      ? { alias: { vue: 'vue/dist/vue.esm-bundler.js' } }
      : undefined,
  server: {
    host: 'localhost',
    cors: '*',
    port: 3000,
    hmr: {
      host: 'localhost',
      protocol: 'wss',
    },
  },
  build:
    mode === 'bridge'
      ? {
          minify: true,
          emptyOutDir: false,
          lib: {
            entry: './src/bridge/index.js',
            name: 'WebflowVueBridge',
            formats: ['iife'],
            fileName: () => 'bridge.global.js',
          },
          rollupOptions: { external: [] },
        }
      : mode === 'lib'
      ? {
          minify: false,
          // Keep dist/main.js from the app build alongside these.
          emptyOutDir: false,
          lib: {
            entry: './src/index.js',
            name: 'WebflowVue',
            formats: ['iife', 'es'],
            fileName: (format) =>
              format === 'iife' ? 'webflow-vue.global.js' : 'webflow-vue.esm.js',
          },
          rollupOptions: {
            external: ['vue'],
            output: { globals: { vue: 'Vue' } },
          },
        }
      : {
          minify: false,
          rollupOptions: {
            input: './src/main.js',
            output: {
              format: 'umd',
              entryFileNames: 'main.js',
              esModule: false,
              compact: false,
              globals: { vue: 'Vue' },
            },
            external: ['vue'],
          },
        },
}));
