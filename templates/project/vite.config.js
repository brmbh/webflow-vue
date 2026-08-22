import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

/**
 * Vue and WebflowVue are both externalized: the bridge loads them from a CDN, so
 * this bundle carries only your app code. Upgrading WebflowVue is a version bump
 * in the bridge, not a rebuild here.
 */

/**
 * Chrome blocks a PUBLIC origin (your published *.webflow.io page) from loading
 * subresources off a LOCAL address (this dev server) unless the preflight says
 * it is allowed. Vite sends CORS headers but not this one, so `?debug` fails
 * with "Permission was denied for this request to access the `loopback` address
 * space" while every server-side check — port, certificate, CORS, module graph —
 * looks perfectly healthy. Measured against a live Webflow page 2026-08-22.
 *
 * Installed before Vite's own middlewares so the header lands on the response
 * object before the CORS middleware ends the preflight.
 *
 * MEASURED 2026-08-22: with the permission already granted, this header makes
 * no difference — `?debug` loaded all 6 localhost requests and mounted with and
 * without it, in a fresh browser context too. What could NOT be tested is the
 * first-visit path, because a DevTools-driven Chrome auto-grants
 * `local-network-access` in every context. The header is the spec's server-side
 * half of the handshake, so it stays; just do not expect it to fix a denial.
 *
 * THE HEADER IS NOT ENOUGH ON ITS OWN. On Chrome 151 this is a real permission named
 * `local-network-access` (check it with
 * `navigator.permissions.query({name:'local-network-access'})`). Once a profile
 * has stored a denial Chrome does not prompt again, and the page keeps failing
 * with the same message no matter what the server sends. Reset it at
 * chrome://settings/content/all?searchSubpage=<your-site>.webflow.io -> the site
 * -> Local network access -> Allow, then hard-reload. Measured 2026-08-22.
 */
const allowLoopbackFromPublicOrigin = () => ({
  name: 'webflow-vue:allow-loopback',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      next();
    });
  },
});

export default defineConfig(({ command }) => ({
  plugins: [allowLoopbackFromPublicOrigin(), mkcert()],
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
