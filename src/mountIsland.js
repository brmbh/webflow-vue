import { createApp } from 'vue';
import { cleanDOMForVue } from './utils/cleanDOMForVue.js';

/**
 * Roots already mounted, and the app that owns each. A WeakMap, so a root
 * removed from the document — a page-transition library swapping its container,
 * say — is collected along with its entry, and the replacement element mounts
 * normally because it is a different object.
 */
const mounted = new WeakMap();

/** A selector string, a single element, or anything list-like, as an array. */
function resolveRoots(target) {
  if (typeof target === 'string') return [...document.querySelectorAll(target)];
  if (!target) return [];
  if (target.nodeType === 1) return [target];
  return [...target];
}

function mountOne(root, label, setup, index) {
  if (mounted.has(root)) {
    console.log(`[webflow-vue:island] "${label}" already mounted — skipped`);
    return mounted.get(root);
  }
  const t0 = performance.now();
  const sweep = cleanDOMForVue(root, label);
  const app = createApp({ setup: () => setup(root, index) });
  app.config.errorHandler = (err, _vm, info) =>
    console.error(`[webflow-vue:island] "${label}" runtime error (${info})`, err);
  app.mount(root);
  sweep.restore();
  mounted.set(root, app);
  console.log(`[webflow-vue:island] "${label}" mounted in ${(performance.now() - t0).toFixed(1)}ms`);
  return app;
}

/**
 * Mount an island on EVERY element matching `target` — one `createApp` each.
 * Everything outside the islands stays untouched Webflow DOM.
 *
 * An island is a component *definition*; it may appear in several places. One
 * `#id` matches once, `[data-cart]` may match three times, and both are the
 * same operation — so adding another mount point is a Designer action with no
 * code change. Nothing here can silently under-mount.
 *
 * NO template option: Vue compiles the Webflow-rendered live DOM as the
 * template. `setup` is Vue's `setup()`, called once per element and receiving
 * `(el, index)`, so an instance can read its own configuration off the DOM.
 * Whatever it returns becomes the vocabulary the markup can reference.
 *
 * Calling this again for an element already mounted returns the existing app
 * rather than mounting over itself, which makes it safe to re-run every mount
 * after a client-side navigation (barba, swup, Turbo) — the only practical way
 * to revive islands whose container was replaced. Without that guard Vue throws
 * `Cannot read properties of null (reading 'nextSibling')`.
 *
 * @param {string|Element|Iterable<Element>} target selector, element, or list
 * @param {string} label name used in every console line for this island
 * @param {(el: Element, index: number) => object} setup Vue setup, per element
 * @returns {Array} the mounted apps, in document order — empty if nothing matched
 */
export function mountIsland(target, label, setup) {
  const roots = resolveRoots(target);
  const where = typeof target === 'string' ? target : '<element>';
  if (!roots.length) {
    console.log(`[webflow-vue:island] "${label}" skipped — nothing matches ${where}`);
    return [];
  }
  const many = roots.length > 1;
  const apps = roots
    .map((root, i) => mountOne(root, many ? `${label}[${i}]` : label, setup, i))
    .filter(Boolean);
  if (many) {
    console.log(`[webflow-vue:island] "${label}" mounted on ${apps.length}/${roots.length} match(es) of ${where}`);
  }
  return apps;
}

/**
 * Tear islands down and forget their roots, so the same elements can be mounted
 * again. Useful before a page-transition library destroys a container, to avoid
 * leaving live apps attached to detached DOM.
 *
 * @param {string|Element|Iterable<Element>} target selector, element, or list
 * @returns {number} how many islands were unmounted
 */
export function unmountIsland(target) {
  let n = 0;
  for (const root of resolveRoots(target)) {
    if (!mounted.has(root)) continue;
    mounted.get(root).unmount();
    mounted.delete(root);
    n += 1;
  }
  if (n) console.log(`[webflow-vue:island] unmounted ${n} island(s)`);
  return n;
}
