/**
 * Route detection for a published Webflow page.
 *
 * The skill's first move is "which route is this page already on?", and that
 * question is answered by evidence in the published HTML, not by asking the
 * user. Route 1 loads the library from a CDN tag in the page's own custom code;
 * route 2 loads a bridge that injects everything at runtime. The two look
 * nothing alike on the wire, so this is a decidable question — which is exactly
 * why it belongs here rather than in skill prose that cannot be tested.
 *
 * Everything in this file works on an HTML *string*. No DOM, no dependencies:
 * the published package has none and this must not be the thing that adds one.
 * That bounds what can be checked — selectors are not resolved against the
 * document, and identifier-level contract diffing is `verify`'s job
 * (PACKAGE.md §3), not this command's.
 */

/** Directives Vue resolves itself. Anything else `v-*` fails at runtime. */
const VUE_DIRECTIVES = new Set([
  'v-text', 'v-html', 'v-show', 'v-if', 'v-else', 'v-else-if', 'v-for',
  'v-on', 'v-bind', 'v-model', 'v-slot', 'v-pre', 'v-once', 'v-memo', 'v-cloak',
]);

/**
 * Client-side page-transition libraries: they replace the island's container.
 *
 * Loaded is not the same as active. These are usually installed site-wide in
 * the footer, and a page opts out by not carrying the container attribute —
 * or, as seen in the wild, by suffixing it (`data-barbax`) so nothing matches.
 * `active` is what decides whether the island is actually at risk here.
 */
const TRANSITION_LIBRARIES = [
  [/@barba\/core|barba(?:\.min)?\.js/i, 'barba', /\bdata-barba\s*=/i],
  [/\bswup(?:@|\/|\.min\.js)/i, 'swup', /\bdata-swup\b|id\s*=\s*["']swup["']/i],
  // Turbo needs no markup opt-in; loading it is enough to take over navigation.
  [/@hotwired\/turbo|turbo(?:\.min)?\.js/i, 'turbo', null],
];

/** Placeholders `webflow-vue init` writes into the bridge for hand-filling. */
const BRIDGE_PLACEHOLDERS = ['SITE_ID', 'STAGING_ASSET_ID', 'PROD_ASSET_ID'];

/**
 * Webflow-hosted registered scripts. A script registered through the Data API
 * as "inline" is NOT published inline — Webflow hosts it as a file and emits a
 * plain `<script src>`. So the bridge, whose whole signature is its source, is
 * invisible in the page HTML. Measured on a real route-2 page, 2026-08-21:
 * the first cutover this tool watched was reported as route 0.
 *
 * These URLs are collected so the CLI can fetch their bodies and hand them back
 * as `extraScripts`, which makes the ordinary inline detection work on the real
 * source instead of guessing from a filename.
 */
const REGISTERED_SCRIPT = /cdn\.prod\.website-files\.com\/[^"'\s]+\.js/i;

/** Last-resort signal when the bodies cannot be fetched (offline, a file path). */
const BRIDGE_FILENAME = /vue.?bridge[^/"']*?(?:-(\d+\.\d+\.\d+))?\.js/i;

/** `<script …>…</script>`, attributes and body captured separately. */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Any opening tag, for attribute-name scanning that cannot match mid-word. */
const OPEN_TAG = /<[a-zA-Z][^>]*>/g;
const ATTR_NAME = /(?:^|\s)([a-zA-Z_:@][-a-zA-Z0-9_:.]*)/g;

const MUSTACHE = /\{\{([^{}]+)\}\}/g;

/** `mountIsland('sel', 'label'` with both arguments literal. */
const MOUNT_CALL = /mountIsland\s*\(\s*(['"`])([\s\S]*?)\1\s*,\s*(['"`])([\s\S]*?)\3/g;
/** Any call at all, so a non-literal selector can still be reported. */
const MOUNT_CALL_ANY = /mountIsland\s*\(/g;

const LIBRARY_CDN = /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/webflow-vue(?:@([^/"'\s]+))?/i;
const VUE_CDN = /vue(?:@([^/"'\s]+))?\/dist\/vue(?:\.esm-browser|\.runtime)?\.global(?:\.prod)?\.js/i;

function collectScripts(html) {
  const scripts = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT_TAG)) {
    const src = attrs.match(SRC_ATTR);
    scripts.push({
      attrs,
      body,
      src: src ? (src[1] ?? src[2] ?? src[3]).trim() : null,
      rawSrc: src ? (src[1] ?? src[2] ?? src[3]) : null,
    });
  }
  return scripts;
}

/** Markup with script and style bodies removed, so scans see only real DOM. */
function markupOnly(html) {
  return html
    .replace(SCRIPT_TAG, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Attribute names starting `v-`, read from opening tags only.
 *
 * Scanning raw HTML for `/v-[a-z]+/` instead finds `v-expand` inside
 * `subnav-expand="1"` and reports a foreign directive that does not exist.
 * Attribute names are only ever matched from the start of an attribute.
 */
function collectDirectives(markup) {
  const found = new Map();
  for (const [tag] of markup.matchAll(OPEN_TAG)) {
    for (const [, name] of tag.matchAll(ATTR_NAME)) {
      if (!name.startsWith('v-')) continue;
      const base = name.split(':')[0];
      if (!found.has(name)) found.set(name, { name, base, foreign: !VUE_DIRECTIVES.has(base) });
    }
  }
  return [...found.values()];
}

function collectMounts(scripts) {
  const mounts = [];
  let total = 0;
  for (const { body } of scripts) {
    if (!body) continue;
    total += [...body.matchAll(MOUNT_CALL_ANY)].length;
    for (const [, , selector, , label] of body.matchAll(MOUNT_CALL)) {
      mounts.push({ selector, label });
    }
  }
  return { mounts, unparsed: total - mounts.length };
}

/**
 * Read the route and the page's island hygiene out of published HTML.
 *
 * @param {string} html the published page, exactly as served
 * @param {{url?: string, extraScripts?: string[]}} [meta] `extraScripts` are the
 *   bodies of Webflow-hosted registered scripts, fetched by the caller; they are
 *   analysed exactly as if the page had carried them inline.
 * @returns {object} report — `route` is 1, 2, 0 (neither) or 'mixed' (both)
 */
export function detectRoute(html, { url = null, extraScripts = [] } = {}) {
  const scripts = [
    ...collectScripts(html),
    ...extraScripts.map((body) => ({ attrs: '', body, src: null, rawSrc: null })),
  ];
  const markup = markupOnly(html);
  const warnings = [];
  const warn = (code, message) => warnings.push({ code, message });

  // --- what the page loads ------------------------------------------------
  let library = null;
  let vue = null;
  let bridge = null;
  const loadedTransitions = new Set();

  for (const script of scripts) {
    if (script.src) {
      const lib = script.src.match(LIBRARY_CDN);
      if (lib) library = { src: script.src, version: lib[1] ?? null };
      const v = script.src.match(VUE_CDN);
      if (v) vue = { src: script.src, version: v[1] ?? null, prod: /\.prod\.js/.test(script.src) };
      for (const [re, name] of TRANSITION_LIBRARIES) {
        if (re.test(script.src)) loadedTransitions.add(name);
      }
      // A `src` carrying whitespace was line-wrapped by an editor. The browser
      // requests the mangled URL and 404s in silence. This has happened here.
      if (/\s/.test(script.rawSrc)) {
        warn('wrapped-src', `a <script src> contains whitespace and will 404: ${JSON.stringify(script.rawSrc.slice(0, 80))}`);
      }
      continue;
    }
    if (!script.body) continue;
    if (script.body.includes('WEBFLOW_VUE_VERSION') && script.body.includes('addScript')) {
      const version = script.body.match(/WEBFLOW_VUE_VERSION\s*=\s*['"]([^'"]+)['"]/);
      const placeholders = BRIDGE_PLACEHOLDERS.filter((p) => script.body.includes(p));
      bridge = { version: version ? version[1] : null, placeholders, hosted: false };
    }
    for (const [re, name] of TRANSITION_LIBRARIES) {
      if (re.test(script.body)) loadedTransitions.add(name);
    }
  }

  // Nothing inline said "bridge", but a Webflow-hosted registered script whose
  // filename looks like one is strong enough to report — flagged as unconfirmed,
  // because its source was not read.
  if (!bridge) {
    const candidate = registeredScriptUrls(html).find((u) => BRIDGE_FILENAME.test(u));
    if (candidate) {
      const v = candidate.match(BRIDGE_FILENAME);
      bridge = { version: v?.[1] ?? null, placeholders: [], hosted: true, unconfirmed: true };
    }
  }

  const transitions = TRANSITION_LIBRARIES
    .filter(([, name]) => loadedTransitions.has(name))
    .map(([, name, container]) => ({ name, active: container ? container.test(markup) : true }));

  // --- what the markup asks for -------------------------------------------
  const mustaches = [...new Set([...markup.matchAll(MUSTACHE)].map(([, e]) => e.trim()))];
  const directives = collectDirectives(markup);
  const { mounts, unparsed } = collectMounts(scripts);

  // --- the route ----------------------------------------------------------
  let route;
  if (bridge && library) route = 'mixed';
  else if (bridge) route = 2;
  else if (library) route = 1;
  else route = 0;

  // --- warnings -----------------------------------------------------------
  if (route === 'mixed') {
    warn('mixed-routes', 'a bridge and a static CDN tag are both present — Vue and the library load twice, and two Vue instances do not share reactivity');
  }
  if (bridge?.unconfirmed) {
    warn('bridge-unread', 'the bridge is a Webflow-hosted registered script and its source was not fetched — version and placeholder state are unverified');
  }
  if (bridge?.placeholders.length) {
    warn('bridge-placeholders', `the bridge still carries ${bridge.placeholders.join(', ')} — outside ?debug it loads no bundle at all`);
  }
  if (library && !vue) {
    warn('no-vue', 'webflow-vue is loaded but the Vue global build is not — `Vue` is undefined and nothing mounts');
  }
  if (mustaches.length && route === 0) {
    warn('mustaches-without-library', `${mustaches.length} mustache(s) in the markup and no Vue on the page — visitors see the braces as literal text (${mustaches.slice(0, 3).map((m) => `{{${m}}}`).join(', ')})`);
  } else if (mustaches.length && !mounts.length && !unparsed && route === 1) {
    warn('mustaches-without-mount', `${mustaches.length} mustache(s) in the markup but no mountIsland() call on the page — nothing will replace them`);
  }
  for (const m of mustaches) {
    if (/\.value\b/.test(m)) {
      warn('value-in-markup', `{{ ${m} }} — refs unwrap in the template; \`.value\` renders nothing`);
    }
  }
  for (const d of directives.filter((x) => x.foreign)) {
    warn('foreign-directive', `${d.name} is not a Vue directive — Vue fails with "Failed to resolve directive" and the whole island renders nothing`);
  }
  for (const d of directives.filter((x) => !x.foreign && /^[@:]/.test(x.name))) {
    warn('shorthand-directive', `${d.name} — Webflow does not reliably publish shorthand; use the long form`);
  }
  const activeTransitions = transitions.filter((t) => t.active).map((t) => t.name);
  if (activeTransitions.length && mounts.length) {
    warn('page-transitions', `${activeTransitions.join(', ')} replaces the container on navigation — re-run the mounts from its after-enter hook or the new markup never mounts`);
  }
  if (unparsed) {
    warn('dynamic-mount', `${unparsed} mountIsland() call(s) use a non-literal selector or label and could not be read statically`);
  }

  return {
    url,
    route,
    scripts: { vue, library, bridge },
    mounts,
    markup: { mustaches, directives },
    transitions,
    warnings,
  };
}

const ROUTE_LABEL = {
  1: 'route 1 — CDN tags in the page\'s own custom code. No project needed.',
  2: 'route 2 — a bridge script, backed by a project bundle.',
  0: 'no webflow-vue on this page yet.',
  mixed: 'BOTH routes are installed. This is a bug, not a configuration.',
};

/** Human-readable report. `--json` skips this and prints the object. */
export function formatReport(report) {
  const out = [];
  const { scripts, mounts, markup, warnings } = report;

  out.push('');
  out.push(`  ${ROUTE_LABEL[report.route]}`);
  if (report.url) out.push(`  ${report.url}`);
  out.push('');

  const row = (k, v) => out.push(`    ${k.padEnd(13)}${v}`);
  row('vue', scripts.vue ? `${scripts.vue.version ?? 'unpinned'}${scripts.vue.prod ? ' (prod build)' : ''} — ${scripts.vue.src}` : '—');
  row('webflow-vue', scripts.library ? `${scripts.library.version ?? 'unpinned'} — ${scripts.library.src}` : '—');
  row('bridge', scripts.bridge ? `pins webflow-vue@${scripts.bridge.version ?? '?'}` : '—');
  row('mounts', mounts.length
    ? mounts.map((m) => `${m.label} → ${m.selector}`).join('\n' + ' '.repeat(17))
    : report.route === 2
      ? '— (route 2: the mount calls live in the bundle, not the page)'
      : '—');
  row('markup', `${markup.mustaches.length} mustache(s), ${markup.directives.length} directive(s)`);
  if (report.transitions.length) {
    row('transitions', report.transitions.map((t) => `${t.name}${t.active ? '' : ' (loaded, no container on this page — inert)'}`).join(', '));
  }
  out.push('');

  if (!warnings.length) {
    out.push('    no warnings');
  } else {
    out.push(`    ${warnings.length} warning(s)`);
    for (const w of warnings) {
      out.push(`      ! ${w.code}`);
      out.push(`        ${w.message}`);
    }
  }
  out.push('');
  return out.join('\n');
}

/**
 * Webflow-hosted registered-script URLs in a page, deduped and unescaped.
 * The published HTML percent-encodes the slashes in these `src` values.
 */
export function registeredScriptUrls(html) {
  const urls = new Set();
  for (const [, attrs] of html.matchAll(SCRIPT_TAG)) {
    const m = attrs.match(SRC_ATTR);
    if (!m) continue;
    const raw = (m[1] ?? m[2] ?? m[3]).trim();
    if (REGISTERED_SCRIPT.test(raw)) urls.add(decodeURIComponent(raw));
  }
  return [...urls];
}

/** Fetch a published page, or read it off disk when the arg is a path. */
export async function loadPage(target, { readFile } = {}) {
  if (/^https?:\/\//i.test(target)) {
    let res;
    try {
      res = await fetch(target, { redirect: 'follow' });
    } catch (err) {
      // Node's fetch throws a bare `fetch failed` and hides the reason — DNS,
      // TLS, offline — in err.cause. Unwrapped, this is the first thing a new
      // user sees and it tells them nothing.
      const why = err.cause?.message ?? err.message;
      throw new Error(`could not fetch ${target} — ${why}\n  (transient? try again; the page must be published and reachable)`);
    }
    if (!res.ok) {
      const hint = res.status === 404 ? ' — is the page published, and is the path right?' : '';
      throw new Error(`${target} responded ${res.status} ${res.statusText}${hint}`);
    }
    return res.text();
  }
  if (!readFile) throw new Error(`not a URL: ${target}`);
  return readFile(target);
}
