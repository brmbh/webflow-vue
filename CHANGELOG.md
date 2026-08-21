# Changelog

All notable changes to `webflow-vue`. Versions are `0.0.x` and the API still
moves; pin an exact version.

## 0.1.0 — 2026-08-20

### Changed — breaking
- **`mountIslands` is gone; `mountIsland` now mounts every match** and returns an
  array of apps. Two mount functions separated by one letter was a typo trap —
  it caught the author of the docs within an hour of shipping — and the singular
  form's `querySelector` behaviour had no legitimate use: it mounted the first
  match, left the rest rendering raw `{{ }}`, and still logged success.
  With an `#id` selector "every match" is "the one match", so the only code that
  changes behaviour is code that was silently under-mounting.
  An island is a component *definition* that may appear in several places.
- `unmountIsland` unmounts every match and returns the count rather than a
  boolean.
- Both accept a selector, an element, or a list of elements.

## 0.0.7 — 2026-08-20

### Documentation
- README gains a full API listing and the scope rules: one element vs many,
  where to declare state, when `useSharedStore` is *not* needed, and page
  transitions. It had documented only `mountIsland` since 0.0.2, so three
  releases of new API were undiscoverable to anyone installing from npm.
- The skill gains an "Islands, state, and scope" section with the same rules,
  measured rather than asserted, plus the foreign-`v-*`-attribute failure mode
  and mount-root sizing guidance.
- This changelog.

## 0.0.6 — 2026-08-20

### Fixed
- `<style>` blocks inside an island are restored after mount instead of being
  dropped. `cleanDOMForVue` detached them and only ever re-attached `w-json`
  nodes, so mounting on a section containing a Webflow custom-style embed
  silently unstyled part of the page. Found on a live page whose header carried
  the breadcrumb CSS.

## 0.0.5 — 2026-08-20

### Added
- `mountIslands(selector, label, setup)` mounts every match, one app per
  element, and reports the count. `mountIsland` uses `querySelector`, so a class
  or attribute selector previously mounted the first match and left the rest
  rendering raw `{{ }}` while still logging success.
- `setup` receives `(el, index)`, so an instance can read its own configuration
  off the DOM.
- `mountIsland` accepts an element as well as a selector, which `unmountIsland`
  already did.

## 0.0.4 — 2026-08-20

### Fixed
- Mounting the same element twice threw `Cannot read properties of null
  (reading 'nextSibling')`. `mountIsland` now records its roots and returns the
  existing app, which makes it safe to re-run every mount after a client-side
  page transition (barba, swup, Turbo) — the only practical way to revive
  islands whose container was replaced.

### Added
- `unmountIsland(target)` tears an island down so its element can be mounted
  again, for use before a transition library destroys the container.

## 0.0.3 — 2026-08-20

Renamed from `vueflow` to **`webflow-vue`**. npm rejects `vueflow` as too
similar to `vue-flow`, and `@vue-flow/core` (vueflow.dev) is an established Vue
library for node-based diagrams — an ecosystem collision, not just a registry
rule. The browser global is `WebflowVue`; the CLI is `npx webflow-vue`.

## 0.0.2 — 2026-08-20

First publishable package: `npx webflow-vue init` scaffolds a project from real
template files, and the bridge loads the library from the CDN so an app bundle
carries only app code.

## 0.0.1 — 2026-08-20

First CDN release of the library build, extracted from the Haufe FJC hybrid
pattern. Never published to npm.
