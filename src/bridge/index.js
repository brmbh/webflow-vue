/**
 * The bridge, as a shipped artifact.
 *
 *   <script src="https://cdn.jsdelivr.net/npm/webflow-vue@X/dist/bridge.global.js"
 *           data-bundle="https://cdn.prod.website-files.com/SITE/ASSET_main.txt"></script>
 *
 * One line in Webflow page custom code, in the FOOTER, after the islands.
 *
 * Why this exists rather than a snippet people paste: a pasted bridge freezes.
 * Two real bugs — a bundle filename that contradicted its own comment, and a
 * load order that left a dark window — were baked into every page that had
 * already copied it, with no way to ship a fix. As a versioned file, a fix is a
 * version bump.
 *
 * It deliberately does NOT import the library. It is the thing that loads the
 * library, and it works out which one from its own URL.
 */
import { resolveConfig, plan } from './config.js';

const LOG = '[webflow-vue:bridge]';

/**
 * `document.currentScript` is the bridge's own tag while it executes. It is null
 * for module scripts and for anything re-executed later, so fall back to finding
 * a tag that looks like ours.
 */
function ownScript(doc) {
  if (doc.currentScript) return doc.currentScript;
  return (
    doc.querySelector('script[data-bundle]') ||
    doc.querySelector('script[src*="bridge.global.js"]') ||
    null
  );
}

function addScript(doc, { src, module }, onload) {
  const s = doc.createElement('script');
  s.setAttribute('type', module ? 'module' : 'text/javascript');
  s.setAttribute('src', src);
  s.onerror = () => console.error(`${LOG} failed to load ${src}`);
  if (onload) s.onload = onload;
  (doc.body || doc.head).appendChild(s);
  return s;
}

/** Load in sequence: each one must finish before the next begins. */
function chain(doc, scripts) {
  const next = (i) => {
    if (i >= scripts.length) return;
    addScript(doc, scripts[i], () => next(i + 1));
  };
  next(0);
}

export function boot(doc = document, href = window.location.href) {
  const config = resolveConfig(ownScript(doc));
  const { debug, scripts, errors } = plan(config, href);

  for (const message of errors) console.error(`${LOG} ${message}`);
  if (!scripts.length) return { debug, scripts: [], errors };

  console.log(
    `${LOG} ${debug ? 'debug — loading from the dev server' : 'loading the built bundle'}: ` +
      scripts.map((s) => s.src).join(' → ')
  );
  chain(doc, scripts);
  return { debug, scripts, errors };
}

// Self-executing: this file is only ever loaded as a script tag on a page.
if (typeof document !== 'undefined') boot();
