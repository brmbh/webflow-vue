/**
 * The bridge's decision logic, as pure functions.
 *
 * The bridge chooses where a page's island code comes from — a local dev server
 * or a built bundle — and in what order the pieces load. That is all it does,
 * and all of it is decidable from two inputs: the attributes on its own script
 * tag, and the current URL. Keeping that here, separate from the DOM appending,
 * is what makes it testable; the previous bridge was a template people pasted,
 * so its bugs could not be tested and could not be shipped fixes.
 */

/** Where the library sits next to the bridge in the same published package. */
const BRIDGE_FILE = 'bridge.global.js';
const LIBRARY_FILE = 'webflow-vue.global.js';

export const DEFAULTS = {
  vue: 'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  dev: 'https://localhost:3000/src/main.js',
  viteClient: 'https://localhost:3000/@vite/client',
  debugParam: 'debug',
};

/**
 * Derive the library URL from the bridge's own URL.
 *
 * This is the point of shipping the bridge in the package. A pasted bridge
 * carried its own `WEBFLOW_VUE_VERSION` while the project's package.json carried
 * another, and nothing kept them in step — two pins that could drift silently.
 * Here the tag that loads the bridge *is* the version, and the library is its
 * sibling, so "which version is this page on" has exactly one answer.
 *
 * @param {string|null} bridgeSrc the bridge's own `src`
 * @returns {string|null} the sibling library URL, or null if it cannot be derived
 */
export function libraryFrom(bridgeSrc) {
  if (!bridgeSrc || !bridgeSrc.includes(BRIDGE_FILE)) return null;
  return bridgeSrc.replace(BRIDGE_FILE, LIBRARY_FILE);
}

/**
 * Read the bridge's configuration off its own script tag.
 *
 * @param {{getAttribute: (n: string) => string|null, src?: string}|null} el
 * @returns {object} config, with `errors` listing anything unusable
 */
export function resolveConfig(el) {
  const attr = (name) => (el && el.getAttribute ? el.getAttribute(name) : null) || null;
  const src = (el && el.src) || null;

  const config = {
    bundle: attr('data-bundle'),
    stagingBundle: attr('data-staging-bundle'),
    dev: attr('data-dev') || DEFAULTS.dev,
    viteClient: attr('data-vite-client') || DEFAULTS.viteClient,
    vue: attr('data-vue') || DEFAULTS.vue,
    library: attr('data-library') || libraryFrom(src),
    debugParam: attr('data-debug-param') || DEFAULTS.debugParam,
    errors: [],
  };

  if (!config.library) {
    config.errors.push(
      'cannot work out which webflow-vue build to load: the bridge was not served as ' +
        `.../${BRIDGE_FILE}, and no data-library was given`
    );
  }
  return config;
}

/**
 * Decide what to load, in order. Each entry must finish before the next starts —
 * the bundle references the `Vue` and `WebflowVue` globals, and dynamically
 * appended scripts do not otherwise execute in order.
 *
 * @param {object} config from `resolveConfig`
 * @param {string} href the current page URL
 * @returns {{debug: boolean, scripts: Array<{src: string, module: boolean}>, errors: string[]}}
 */
export function plan(config, href) {
  const url = new URL(href);
  const debug = url.searchParams.get(config.debugParam) !== null;
  const errors = [...config.errors];

  if (debug) {
    // Vite owns the dependency graph here. Injecting the CDN copies as well
    // would put two Vue instances on the page, whose reactivity does not
    // interoperate — the measured two-copies failure, arrived at sideways.
    return {
      debug: true,
      errors: [],
      scripts: [
        { src: config.viteClient, module: true },
        { src: config.dev, module: true },
      ],
    };
  }

  // Staging and production can differ; if only one bundle is given it serves both.
  const isStaging = /\.webflow\.io$/i.test(url.hostname);
  const bundle = (isStaging && config.stagingBundle) || config.bundle || config.stagingBundle;

  if (!bundle) {
    // The old bridge shipped placeholder URLs, so this case 404'd in silence and
    // only outside ?debug — the hardest possible way to notice. Now it says so.
    errors.push(
      'no bundle to load: set data-bundle="<your built bundle URL>" on the bridge ' +
        'script tag (add ?debug to the page URL to use a local dev server instead)'
    );
  }

  return {
    debug: false,
    errors,
    scripts: errors.length
      ? []
      : [
          { src: config.vue, module: false },
          { src: config.library, module: false },
          { src: bundle, module: false },
        ],
  };
}
