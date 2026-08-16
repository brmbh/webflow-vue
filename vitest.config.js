import { defineConfig } from 'vitest/config';

/**
 * Loop A + Loop B harness (see PLAN.md).
 *
 * jsdom, not a browser: every helper here is DOM code, so islands can be really
 * mounted, really clicked, and really asserted without driving Chrome. Vue runs
 * fine in jsdom as long as the full build is used — the template is the live
 * DOM, so the runtime compiler has to be present.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    // Islands compile the live Webflow-rendered DOM as their template, so the
    // runtime compiler must be present in tests exactly as it is in the browser.
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
  },
});
