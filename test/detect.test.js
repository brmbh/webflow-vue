import { describe, it, expect } from 'vitest';
import { detectRoute, registeredScriptUrls } from '../src/cli/detect.js';

/**
 * The route question has to be decided from the published page, because that is
 * the only artefact that cannot lie about what a page loads. These fixtures are
 * trimmed from real Webflow output — including the parts that produced false
 * positives on the first pass.
 */

const page = ({ head = '', body = '', footer = '' } = {}) =>
  `<!DOCTYPE html><html><head>${head}</head><body>${body}${footer}</body></html>`;

const CDN_TAGS = `
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0"></script>
  <script>
    const { ref, computed } = Vue;
    const { mountIsland } = WebflowVue;
    const cups = ref(1);
    mountIsland('[data-brew]', 'brew', () => ({ cups }));
  </script>`;

const BRIDGE = `
  <script>
    var WEBFLOW_VUE_VERSION = '0.1.0';
    function addScript(src, isModule, onload) {}
    var STAGING_BUNDLE = 'https://cdn.prod.website-files.com/abc/def_main.txt';
    var PROD_BUNDLE = 'https://cdn.prod.website-files.com/abc/ghi_main.txt';
  </script>`;

describe('route detection', () => {
  it('reads route 1 off CDN script tags in the page', () => {
    const r = detectRoute(page({ body: '<div data-brew>{{ cups }}</div>', footer: CDN_TAGS }));
    expect(r.route).toBe(1);
    expect(r.scripts.library.version).toBe('0.1.0');
    expect(r.scripts.vue.version).toBe('3');
    expect(r.scripts.bridge).toBeNull();
  });

  it('reads route 2 off the bridge, which loads the library at runtime', () => {
    const r = detectRoute(page({ body: '<div id="counter">{{ cups }}</div>', footer: BRIDGE }));
    expect(r.route).toBe(2);
    expect(r.scripts.bridge.version).toBe('0.1.0');
    expect(r.scripts.library).toBeNull();
  });

  it('reads route 0 for a page that loads none of it', () => {
    expect(detectRoute(page({ body: '<div>hello</div>' })).route).toBe(0);
  });

  it('flags both routes installed at once as a bug', () => {
    const r = detectRoute(page({ footer: CDN_TAGS + BRIDGE }));
    expect(r.route).toBe('mixed');
    expect(r.warnings.map((w) => w.code)).toContain('mixed-routes');
  });

  it('reads the mount calls, selector and label', () => {
    const r = detectRoute(page({ footer: CDN_TAGS }));
    expect(r.mounts).toEqual([{ selector: '[data-brew]', label: 'brew' }]);
  });

  it('reports a mount whose selector it cannot read statically', () => {
    const r = detectRoute(page({ footer: `${CDN_TAGS}<script>mountIsland(sel, 'dyn', s)</script>` }));
    expect(r.warnings.map((w) => w.code)).toContain('dynamic-mount');
  });
});

describe('warnings that come from real failures', () => {
  it('catches a bridge still carrying its init placeholders', () => {
    const withPlaceholders = BRIDGE.replace('abc/def', 'SITE_ID/STAGING_ASSET_ID');
    const r = detectRoute(page({ footer: withPlaceholders }));
    expect(r.warnings.map((w) => w.code)).toContain('bridge-placeholders');
  });

  it('catches a line-wrapped script src, which 404s in silence', () => {
    const r = detectRoute(page({
      footer: '<script src="https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0/dist/\n  webflow-vue.global.js"></script>',
    }));
    expect(r.warnings.map((w) => w.code)).toContain('wrapped-src');
  });

  it('catches the library loaded without Vue', () => {
    const r = detectRoute(page({
      footer: '<script src="https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0"></script>',
    }));
    expect(r.warnings.map((w) => w.code)).toContain('no-vue');
  });

  it('catches mustaches on a page with no Vue at all — the site-wide component leak', () => {
    const r = detectRoute(page({ body: '<header data-brew="1"><p>{{cups}}</p></header>' }));
    expect(r.route).toBe(0);
    const leak = r.warnings.find((w) => w.code === 'mustaches-without-library');
    expect(leak.message).toContain('{{cups}}');
  });

  it('catches `.value` in markup, which renders nothing', () => {
    const r = detectRoute(page({ body: '<div data-brew>{{ cups.value }}</div>', footer: CDN_TAGS }));
    expect(r.warnings.map((w) => w.code)).toContain('value-in-markup');
  });

  it('catches a foreign v- attribute from another Webflow library', () => {
    const r = detectRoute(page({ body: '<div data-brew v-expand="1">{{ cups }}</div>', footer: CDN_TAGS }));
    const foreign = r.warnings.find((w) => w.code === 'foreign-directive');
    expect(foreign.message).toContain('v-expand');
  });

  it('does not mistake a hyphenated attribute for a directive', () => {
    // `subnav-expand="1"` contains the substring `v-expand`. Scanning raw HTML
    // for /v-[a-z]+/ reports a foreign directive on a page that has none, and
    // this exact false positive was hit against a live page.
    const r = detectRoute(page({ body: '<div data-brew subnav-expand="1">{{ cups }}</div>', footer: CDN_TAGS }));
    expect(r.markup.directives).toEqual([]);
    expect(r.warnings.map((w) => w.code)).not.toContain('foreign-directive');
  });

  it('reads v-on:click as a real Vue directive, not a foreign one', () => {
    const r = detectRoute(page({ body: '<div data-brew><a v-on:click="cups++">+</a></div>', footer: CDN_TAGS }));
    expect(r.markup.directives).toEqual([{ name: 'v-on:click', base: 'v-on', foreign: false }]);
  });

  it('ignores mustaches that only appear inside script bodies', () => {
    const r = detectRoute(page({ footer: `${CDN_TAGS}<script>const t = "{{ notMarkup }}"</script>` }));
    expect(r.markup.mustaches).toEqual([]);
  });
});

describe('page transitions', () => {
  const BARBA = '<script src="https://unpkg.com/@barba/core"></script>';

  it('warns when a transition library owns a container on this page', () => {
    const r = detectRoute(page({
      body: '<div data-barba="wrapper"><div data-barba="container"><div data-brew>{{ cups }}</div></div></div>',
      footer: CDN_TAGS + BARBA,
    }));
    expect(r.transitions).toEqual([{ name: 'barba', active: true }]);
    expect(r.warnings.map((w) => w.code)).toContain('page-transitions');
  });

  it('stays quiet when the library is loaded site-wide but this page opts out', () => {
    // Seen in the wild: the attributes are suffixed (`data-barbax`) so nothing
    // matches and barba never takes over. Warning here would be crying wolf.
    const r = detectRoute(page({
      body: '<div data-barbax="wrapper"><div data-brew>{{ cups }}</div></div>',
      footer: CDN_TAGS + BARBA,
    }));
    expect(r.transitions).toEqual([{ name: 'barba', active: false }]);
    expect(r.warnings.map((w) => w.code)).not.toContain('page-transitions');
  });
});

/**
 * Webflow publishes a script registered as "inline" through the Data API as a
 * hosted FILE, not inline. The bridge's whole signature is its source, so it is
 * invisible in the page HTML — the first real route-2 cutover this tool watched
 * reported as route 0 while the page worked perfectly.
 */
describe('a bridge hosted by Webflow rather than inlined', () => {
  const HOSTED = '<script src="https://cdn.prod.website-files.com/670a%2F689e%2F6a88%2Fwebflow_vuebridge-0.2.1.js" type="text/javascript"></script>';
  const BRIDGE_BODY = `
    function addScript(src, isModule, onload) {}
    var WEBFLOW_VUE_VERSION = '0.2.1';
    var STAGING_BUNDLE = 'https://cdn.prod.website-files.com/site/asset_main.txt';
  `;

  it('reads route 2 when the hosted body is supplied', () => {
    const r = detectRoute(page({ footer: HOSTED }), { extraScripts: [BRIDGE_BODY] });
    expect(r.route).toBe(2);
    expect(r.scripts.bridge.version).toBe('0.2.1');
    expect(r.scripts.bridge.unconfirmed).toBeUndefined();
  });

  it('still reports route 2 from the filename when the body cannot be fetched', () => {
    const r = detectRoute(page({ footer: HOSTED }));
    expect(r.route).toBe(2);
    expect(r.scripts.bridge.unconfirmed).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('bridge-unread');
  });

  it('exposes the registered-script URLs, percent-decoded', () => {
    expect(registeredScriptUrls(page({ footer: HOSTED }))).toEqual([
      'https://cdn.prod.website-files.com/670a/689e/6a88/webflow_vuebridge-0.2.1.js',
    ]);
  });

  it('does not mistake an ordinary Webflow-hosted script for a bridge', () => {
    const other = '<script src="https://cdn.prod.website-files.com/a/b/some_analytics-1.0.0.js"></script>';
    const r = detectRoute(page({ footer: other }));
    expect(r.route).toBe(0);
    expect(r.scripts.bridge).toBeNull();
  });

  it('finds the placeholders in a hosted bridge body too', () => {
    const r = detectRoute(page({ footer: HOSTED }), {
      extraScripts: [BRIDGE_BODY.replace('site/asset', 'SITE_ID/STAGING_ASSET_ID')],
    });
    expect(r.warnings.map((w) => w.code)).toContain('bridge-placeholders');
  });
});
