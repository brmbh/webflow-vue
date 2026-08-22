/**
 * Drive a real published Webflow page against the real published CDN bytes.
 *
 * This is the project's testing doctrine, executable. The unit suite mounts
 * hand-written fixtures against the local source and has never found the bugs
 * that mattered — a line-wrapped `<script src>`, a `mountIsland`/`mountIslands`
 * typo, a double-mount crash, `<style>` blocks deleted on mount. All four were
 * only visible when the actual page met the actual bytes.
 *
 * So: fetch the page, fetch every script the page itself loads, run them in
 * jsdom in the page's own order, then click things and assert on rendered text.
 * Nothing here is a stand-in for anything.
 *
 *   node scripts/verify-live.mjs <url> [--quiet] [--local]
 *
 * `--local` swaps the CDN copy of the library for `dist/webflow-vue.global.js`,
 * which is the release gate: it answers "does the build I am about to publish
 * still drive the page that the published build drives today?"
 *
 * Exits non-zero if an island fails to render, so it can gate a release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { detectRoute, registeredScriptUrls } from '../src/cli/detect.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_BUILD = path.resolve(HERE, '../dist/webflow-vue.global.js');

const [, , url, ...rest] = process.argv;
const quiet = rest.includes('--quiet');
const useLocal = rest.includes('--local');

if (!url) {
  console.error('usage: node scripts/verify-live.mjs <published-url> [--quiet]');
  process.exit(1);
}

const checks = [];
const check = (ok, name, detail = '') => {
  checks.push({ ok, name, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n          ${detail}` : ''}`);
};

async function get(target) {
  const res = await fetch(target, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${target} responded ${res.status}`);
  return res.text();
}

console.log(`\nverify-live — ${url}\n`);

// --- 1. the page --------------------------------------------------------
const html = await get(url);
const report = detectRoute(html, { url });
console.log(`  route ${report.route}, ${report.mounts.length} mount call(s), ${report.markup.mustaches.length} mustache(s)\n`);

if (report.route === 0) {
  console.log('  nothing to verify: this page loads no webflow-vue.\n');
  process.exit(0);
}

// --- 2. the bytes the page itself asks for ------------------------------
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const externals = [];
for (const [, attrs] of scriptTags) {
  const src = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!src) continue;
  const href = (src[1] ?? src[2]).trim();
  if (/vue\.global|webflow-vue/.test(href)) externals.push(href);
}
// The page's own island code: inline, and it calls mountIsland.
const inlineIslandCode = scriptTags
  .filter(([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && /mountIsland\s*\(/.test(body))
  .map(([, , body]) => body);

/**
 * On route 2 the page carries none of that. It carries a bridge, which decides
 * at runtime what to load and injects it — so the only way to verify a route-2
 * page is to run the bridge and follow the scripts it appends, exactly as a
 * browser does. Before this, the gate crashed on `window.Vue` being undefined
 * the moment the reference page graduated to route 2.
 */
async function findBridgeSource() {
  const inline = scriptTags.find(
    ([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && /WEBFLOW_VUE_VERSION/.test(body) && /addScript/.test(body)
  );
  if (inline) return { source: inline[2], from: 'page custom code' };
  for (const u of registeredScriptUrls(html)) {
    const body = await get(u);
    if (/WEBFLOW_VUE_VERSION/.test(body) && /addScript/.test(body)) return { source: body, from: u };
  }
  return null;
}

const isRoute2 = report.route === 2 || report.route === 'mixed';
let bridge = null;
if (isRoute2) {
  bridge = await findBridgeSource();
  check(!!bridge, 'bridge source located', bridge ? `from ${bridge.from}` : 'route 2 reported but no bridge source found');
} else {
  check(externals.length >= 2, 'page loads both Vue and webflow-vue', externals.join('  ·  '));
  check(inlineIslandCode.length > 0, 'page carries inline island code');
}

const sources = [];
for (const href of isRoute2 ? [] : externals) {
  if (useLocal && /webflow-vue/.test(href)) {
    const code = fs.readFileSync(LOCAL_BUILD, 'utf8');
    sources.push({ href: LOCAL_BUILD, code });
    check(code.length > 1000, `substituted local build for ${href}`, `${LOCAL_BUILD} — ${code.length} bytes`);
    continue;
  }
  const code = await get(href);
  sources.push({ href, code });
  check(code.length > 1000, `fetched ${href}`, `${code.length} bytes`);
}

// --- 3. run them in jsdom, in the page's order --------------------------
const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

const vueWarnings = [];
const islandLogs = [];
window.console.warn = (...args) => vueWarnings.push(args.join(' '));
window.console.error = (...args) => vueWarnings.push(args.join(' '));
const render = (a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a));
window.console.log = (...args) => {
  const line = args.map(render).join(' ');
  if (!line.startsWith('[webflow-vue')) return;
  islandLogs.push(line);
  if (!quiet) console.log(`          ${line}`);
};

// Snapshot the pre-mount DOM. Vue strips directive attributes and replaces the
// subtree when it compiles, so anything we want to interact with afterwards has
// to be identified now — and an "element rendered blank" verdict is only
// meaningful against the number of blank elements the page already had.
const blanks = (el) =>
  [...el.querySelectorAll('*')].filter((n) => n.children.length === 0 && !n.textContent.trim()).length;

// Route 1 names its selectors in the page. Route 2 hides them in the bundle, so
// fall back to "every element that still shows a mustache", which is the same
// set from the outside and is what a visitor would be looking at.
const mountTargets = report.mounts.length
  ? report.mounts
  : [...new Set(
      [...window.document.querySelectorAll('*')]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && /\{\{/.test(n.data)))
        .map((el) => el.closest('[data-brew],[id]') ?? el)
    )].map((el, i) => ({ selector: el, label: `island${i}`, resolved: true }));

const preMount = mountTargets.flatMap((mount) => {
  try {
    const found = mount.resolved ? [mount.selector] : [...window.document.querySelectorAll(mount.selector)];
    return found.map((el, i) => ({
      el,
      mount,
      i,
      blanks: blanks(el),
      asks: [...el.innerHTML.matchAll(/\{\{([^{}]+)\}\}/g)].map(([, e]) => e.trim()),
    }));
  } catch {
    return [];
  }
});
const clickTargets = [...window.document.querySelectorAll('[v-on\\:click]')].map((el) => ({
  handler: el.getAttribute('v-on:click'),
  text: el.textContent.replace(/\s+/g, ' ').trim(),
  root: preMount.find((p) => p.el.contains(el))?.el ?? window.document.body,
}));

for (const code of inlineIslandCode) {
  try {
    window.eval(code);
  } catch (err) {
    check(false, 'evaluating the page\'s island code', err.message);
  }
}

// Route 2: run the bridge and follow what it injects, in its own order.
if (isRoute2 && bridge) {
  const injected = [];
  const append = window.document.body.appendChild.bind(window.document.body);
  window.document.body.appendChild = (node) => {
    if (node.tagName === 'SCRIPT' && node.src) injected.push(node);
    return append(node);
  };
  try {
    window.eval(bridge.source);
  } catch (err) {
    check(false, 'evaluating the bridge', err.message);
  }
  let guard = 0;
  const chain = [];
  while (injected.length && guard++ < 12) {
    const node = injected.shift();
    if (/localhost/.test(node.src)) {
      check(false, 'bridge chose the dev server', `${node.src} — run this without ?debug, or start the dev server`);
      continue;
    }
    // --local is the release gate, so it has to reach the route-2 path too:
    // substitute the build we are about to publish for the CDN copy the bridge
    // asked for. Without this, --local quietly verified nothing on route 2.
    if (useLocal && /webflow-vue/.test(node.src)) {
      const code = fs.readFileSync(LOCAL_BUILD, 'utf8');
      check(code.length > 1000, `substituted local build for ${node.src}`, `${code.length} bytes`);
      chain.push('[local build]');
      try { window.eval(code); } catch (err) { check(false, 'evaluating the local build', err.message); }
      if (node.onload) node.onload();
      continue;
    }
    let res;
    try {
      res = await fetch(node.src, { redirect: 'follow' });
    } catch (err) {
      check(false, `fetching ${node.src}`, err.message);
      continue;
    }
    if (!res.ok) { check(false, `bridge asked for ${node.src}`, `responded ${res.status}`); continue; }
    chain.push(node.src.replace(/^https:\/\/[^/]+/, ''));
    try { window.eval(await res.text()); } catch (err) { check(false, `evaluating ${node.src}`, err.message); }
    if (node.onload) node.onload();
  }
  check(chain.length >= 3, 'bridge loaded Vue, the library and the bundle', chain.join('  →  '));
}

for (const { href, code } of sources) {
  try {
    window.eval(code);
  } catch (err) {
    check(false, `evaluating ${href}`, err.message);
  }
}
check(typeof window.Vue === 'object', 'Vue global is defined');
check(typeof window.WebflowVue === 'object', 'WebflowVue global is defined');
check(
  typeof window.WebflowVue?.mountIsland === 'function',
  'WebflowVue.mountIsland exists',
  `exports: ${Object.keys(window.WebflowVue ?? {}).join(', ')}`
);

await new Promise((r) => setTimeout(r, 50));

// --- 4. assert on what is actually rendered -----------------------------
check(islandLogs.some((l) => l.includes('mounted')), 'at least one island mounted', islandLogs.at(-1) ?? 'no [webflow-vue:*] output at all');

check(preMount.length > 0, 'island roots located before mount',
  report.mounts.length
    ? report.mounts.map((m) => `${m.selector} → ${preMount.filter((p) => p.mount === m).length}`).join(', ')
    : `${preMount.length} root(s) found by mustache scan (route 2: selectors live in the bundle)`);

for (const { el, mount, i, asks } of preMount) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  const leftover = text.match(/\{\{[^}]*\}\}/g);
  check(!leftover, `island ${mount.label}[${i}] rendered — no raw mustaches left`,
    leftover ? `still showing ${leftover.join(', ')}` : `asked for ${asks.join(', ') || 'nothing'} → "${text.slice(0, 70)}"`);
}

// An interpolation the bundle does not expose renders as empty text. Counting
// blank elements outright flags every empty Webflow wrapper on the page, so
// compare against the count taken before the mount: only the delta is ours.
// This is the contract failure PACKAGE.md §3 is about, caught from the outside
// and without relying on Vue's dev-build warnings — the bridge ships prod Vue,
// which emits none.
for (const { el, mount, i, blanks: before, asks } of preMount) {
  const after = blanks(el);
  check(after <= before, `island ${mount.label}[${i}] — nothing rendered blank`,
    after > before
      ? `${after - before} element(s) went empty on mount; markup asks for ${asks.join(', ')}, so setup() is missing one of those keys`
      : `${after} blank element(s), unchanged by the mount`);
}

// --- 5. click something and prove reactivity is live --------------------
// Vue removed the `v-on:click` attribute when it compiled, so the handler is
// found by the text it carried before the mount, not by the directive.
if (clickTargets.length) {
  const target = clickTargets[0];
  const rendered = [...target.root.querySelectorAll('*')].find(
    (n) => n.textContent.replace(/\s+/g, ' ').trim() === target.text
  );
  if (!rendered) {
    check(false, `clicking "${target.text}" (${target.handler})`, 'the element did not survive the mount');
  } else {
    const read = () => target.root.textContent.replace(/\s+/g, ' ').trim();
    const before = read();
    rendered.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await window.Vue.nextTick();
    const after = read();
    check(before !== after, `clicking "${target.text}" (${target.handler}) changes rendered text`,
      before === after
        ? 'text unchanged — the handler never ran, or it mutates state this island does not read'
        : `"${before.slice(0, 55)}" → "${after.slice(0, 55)}"`);
  }
} else {
  console.log('  SKIP  no v-on:click element on this page');
}

// --- 6. anything Vue complained about -----------------------------------
const realWarnings = vueWarnings.filter((w) => w.includes('[Vue warn]') || w.includes('[webflow-vue'));
check(realWarnings.length === 0, 'no Vue warnings during mount',
  realWarnings.map((w) => w.split('\n')[0].slice(0, 160)).join('\n          '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n  ${checks.length - failed.length}/${checks.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
