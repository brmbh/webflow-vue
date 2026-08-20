import { createApp } from 'vue';
import { cleanDOMForVue } from './utils/cleanDOMForVue.js';

/**
 * Roots this module has already mounted. A WeakSet, so a root removed from the
 * document (a page-transition library swapping its container, say) is collected
 * along with its entry — the replacement element is a different object and
 * mounts normally.
 */
const mounted = new WeakMap();

/**
 * One createApp per interactive component, mounted on its own root element.
 * Everything outside the islands stays untouched Webflow DOM.
 * NO template option — Vue compiles the Webflow-rendered live DOM.
 *
 * Calling this twice for the same element is a no-op that returns the existing
 * app. That makes it safe to re-run every mount after a client-side navigation
 * (barba, swup, Turbo), which is the only practical way to revive islands whose
 * container was replaced. Without the guard Vue mounts over itself and throws
 * `Cannot read properties of null (reading 'nextSibling')`.
 */
export function mountIsland(selector, label, setup) {
  const root = document.querySelector(selector);
  if (!root) {
    console.log(`[webflow-vue:island] "${label}" skipped — ${selector} not on this page`);
    return null;
  }
  if (mounted.has(root)) {
    console.log(`[webflow-vue:island] "${label}" already mounted on ${selector} — skipped`);
    return mounted.get(root);
  }
  const t0 = performance.now();
  const sweep = cleanDOMForVue(root, label);
  const app = createApp({ setup });
  app.config.errorHandler = (err, _vm, info) =>
    console.error(`[webflow-vue:island] "${label}" runtime error (${info})`, err);
  app.mount(root);
  sweep.restore();
  mounted.set(root, app);
  console.log(
    `[webflow-vue:island] "${label}" mounted on ${selector} in ${(performance.now() - t0).toFixed(1)}ms`
  );
  return app;
}

/**
 * Tear an island down and forget it, so the same element can be mounted again.
 * Useful before a page-transition library removes the container, to avoid
 * leaving a live app attached to detached DOM.
 */
export function unmountIsland(selector) {
  const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!root || !mounted.has(root)) return false;
  mounted.get(root).unmount();
  mounted.delete(root);
  console.log(`[webflow-vue:island] unmounted ${typeof selector === 'string' ? selector : 'element'}`);
  return true;
}
