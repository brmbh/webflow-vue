import { createApp } from 'vue';
import { cleanDOMForVue } from './utils/cleanDOMForVue.js';

/**
 * One createApp per interactive component, mounted on its own root element.
 * Everything outside the islands stays untouched Webflow DOM.
 * NO template option — Vue compiles the Webflow-rendered live DOM.
 */
export function mountIsland(selector, label, setup) {
  const root = document.querySelector(selector);
  if (!root) {
    console.log(`[webflow-vue:island] "${label}" skipped — ${selector} not on this page`);
    return null;
  }
  const t0 = performance.now();
  const sweep = cleanDOMForVue(root, label);
  const app = createApp({ setup });
  app.config.errorHandler = (err, _vm, info) =>
    console.error(`[webflow-vue:island] "${label}" runtime error (${info})`, err);
  app.mount(root);
  sweep.restore();
  console.log(
    `[webflow-vue:island] "${label}" mounted on ${selector} in ${(performance.now() - t0).toFixed(1)}ms`
  );
  return app;
}
