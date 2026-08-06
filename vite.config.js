import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig(({ command }) => ({
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
  build: {
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
