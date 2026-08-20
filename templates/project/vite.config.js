import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

/**
 * Vue and WebflowVue are both externalized: the bridge loads them from a CDN, so
 * this bundle carries only your app code. Upgrading WebflowVue is a version bump
 * in the bridge, not a rebuild here.
 */
export default defineConfig(({ command }) => ({
  plugins: [mkcert()],
  // Islands use the live Webflow DOM as their template, so the runtime
  // compiler must be present. The esm-bundler build ships it.
  resolve:
    command === 'serve'
      ? { alias: { vue: 'vue/dist/vue.esm-bundler.js' } }
      : undefined,
  server: {
    host: 'localhost',
    port: 3000,
    cors: '*',
    hmr: { host: 'localhost', protocol: 'wss' },
  },
  build: {
    minify: false,
    rollupOptions: {
      input: './src/main.js',
      external: ['vue', 'webflow-vue'],
      output: {
        format: 'umd',
        entryFileNames: 'main.js',
        esModule: false,
        compact: false,
        globals: { vue: 'Vue', 'webflow-vue': 'WebflowVue' },
      },
    },
  },
}));
