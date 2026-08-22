import { describe, it, expect } from 'vitest';
import { resolveConfig, plan, libraryFrom, DEFAULTS } from '../src/bridge/config.js';

/**
 * The bridge used to be a snippet people pasted into Webflow, which meant its
 * bugs could not be tested and could not be shipped fixes — two real ones were
 * frozen into every page that had already copied it. These are the tests that
 * were impossible before.
 */

const tag = (attrs = {}, src = 'https://cdn.jsdelivr.net/npm/webflow-vue@0.3.0/dist/bridge.global.js') => ({
  src,
  getAttribute: (n) => (n in attrs ? attrs[n] : null),
});

const BUNDLE = 'https://cdn.prod.website-files.com/site123/asset456_main.txt';

describe('deriving the library from the bridge itself', () => {
  it('loads the library version that shipped with this bridge', () => {
    expect(libraryFrom('https://cdn.jsdelivr.net/npm/webflow-vue@0.3.0/dist/bridge.global.js'))
      .toBe('https://cdn.jsdelivr.net/npm/webflow-vue@0.3.0/dist/webflow-vue.global.js');
  });

  it('works from any host, so a self-hosted copy stays self-hosted', () => {
    expect(libraryFrom('https://example.com/vendor/bridge.global.js'))
      .toBe('https://example.com/vendor/webflow-vue.global.js');
  });

  it('returns null when the bridge is not where it expects to be', () => {
    expect(libraryFrom('https://example.com/custom-name.js')).toBeNull();
    expect(libraryFrom(null)).toBeNull();
  });

  it('reports an error rather than guessing a version', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }, 'https://example.com/renamed.js'));
    expect(c.library).toBeNull();
    expect(c.errors.join(' ')).toMatch(/data-library/);
  });

  it('lets data-library override the derivation', () => {
    const c = resolveConfig(tag({ 'data-library': 'https://example.com/pinned.js' }));
    expect(c.library).toBe('https://example.com/pinned.js');
  });
});

describe('what it loads, and in what order', () => {
  it('loads Vue, then the library, then the bundle', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }));
    const { scripts, debug } = plan(c, 'https://site.webflow.io/page');
    expect(debug).toBe(false);
    expect(scripts.map((s) => s.src)).toEqual([
      DEFAULTS.vue,
      'https://cdn.jsdelivr.net/npm/webflow-vue@0.3.0/dist/webflow-vue.global.js',
      BUNDLE,
    ]);
    // The bundle reads the Vue and WebflowVue globals, so nothing may be a module
    // (modules defer) and the order above is a sequence, not a set.
    expect(scripts.every((s) => s.module === false)).toBe(true);
  });

  it('loads the dev server instead when ?debug is present', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }));
    const { scripts, debug } = plan(c, 'https://site.webflow.io/page?debug');
    expect(debug).toBe(true);
    expect(scripts.map((s) => s.src)).toEqual([DEFAULTS.viteClient, DEFAULTS.dev]);
  });

  it('injects no CDN copies in debug — two Vue instances do not share reactivity', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }));
    const { scripts } = plan(c, 'https://site.webflow.io/page?debug');
    expect(scripts.some((s) => s.src.includes('vue.global'))).toBe(false);
    expect(scripts.some((s) => s.src.includes('webflow-vue.global'))).toBe(false);
  });

  it('treats ?debug= with no value as debug', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }));
    expect(plan(c, 'https://site.webflow.io/p?debug=').debug).toBe(true);
    expect(plan(c, 'https://site.webflow.io/p?other=1').debug).toBe(false);
  });
});

describe('staging and production bundles', () => {
  const STAGING = 'https://cdn.prod.website-files.com/site123/staging_main.txt';

  it('prefers the staging bundle on a webflow.io host', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE, 'data-staging-bundle': STAGING }));
    expect(plan(c, 'https://site.webflow.io/p').scripts.at(-1).src).toBe(STAGING);
  });

  it('uses the production bundle on a custom domain', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE, 'data-staging-bundle': STAGING }));
    expect(plan(c, 'https://example.com/p').scripts.at(-1).src).toBe(BUNDLE);
  });

  it('serves both from one bundle when only one is given', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE }));
    expect(plan(c, 'https://site.webflow.io/p').scripts.at(-1).src).toBe(BUNDLE);
    expect(plan(c, 'https://example.com/p').scripts.at(-1).src).toBe(BUNDLE);
  });

  it('does not mistake a lookalike hostname for staging', () => {
    const c = resolveConfig(tag({ 'data-bundle': BUNDLE, 'data-staging-bundle': STAGING }));
    expect(plan(c, 'https://notwebflow.io.example.com/p').scripts.at(-1).src).toBe(BUNDLE);
  });
});

describe('a missing bundle fails loudly', () => {
  /**
   * The pasted bridge shipped SITE_ID / STAGING_ASSET_ID placeholders. Left in,
   * it fetched a 404 — silently, and only outside ?debug. That failure mode is
   * now impossible: there is nothing to leave in, and its absence is an error.
   */
  it('refuses to load anything and says why', () => {
    const c = resolveConfig(tag({}));
    const { scripts, errors } = plan(c, 'https://site.webflow.io/p');
    expect(scripts).toEqual([]);
    expect(errors.join(' ')).toMatch(/data-bundle/);
  });

  it('still works in debug without a bundle, because it needs none', () => {
    const c = resolveConfig(tag({}));
    const { scripts, errors } = plan(c, 'https://site.webflow.io/p?debug');
    expect(errors).toEqual([]);
    expect(scripts).toHaveLength(2);
  });
});

describe('overrides', () => {
  it('accepts a custom dev entry, vite client, Vue build and debug param', () => {
    const c = resolveConfig(tag({
      'data-bundle': BUNDLE,
      'data-dev': 'https://localhost:5173/src/app.js',
      'data-vite-client': 'https://localhost:5173/@vite/client',
      'data-vue': 'https://example.com/vue.js',
      'data-debug-param': 'dev',
    }));
    expect(plan(c, 'https://site.webflow.io/p?dev').scripts.map((s) => s.src))
      .toEqual(['https://localhost:5173/@vite/client', 'https://localhost:5173/src/app.js']);
    expect(plan(c, 'https://site.webflow.io/p').scripts[0].src).toBe('https://example.com/vue.js');
  });

  it('survives a tag with no attributes at all', () => {
    expect(() => resolveConfig(null)).not.toThrow();
    expect(resolveConfig(null).errors.length).toBeGreaterThan(0);
  });
});
