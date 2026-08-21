# Changelog

All notable changes to `webflow-vue`. Versions are `0.0.x` and the API still
moves; pin an exact version.

## 0.2.0 — 2026-08-21

### Added
- **`npx webflow-vue detect <url>`** — fetches a published page and reports which
  delivery route it is on, the pinned versions, the `mountIsland()` calls it can
  read statically, and the failures that are visible without running anything:
  both routes installed at once, a bridge still carrying its `SITE_ID`
  placeholders, `{{ }}` on a page with no Vue, `{{ x.value }}`, foreign `v-*`
  attributes, a line-wrapped `<script src>`. `--json` to branch on it. Takes a
  file path as well as a URL.

  It exists because the route question was being answered by guessing. The skill
  told an agent to decide between "two script tags" and "a whole Vite project"
  and then gave it only route-2 phases, so "continue working on this project" on
  a route-1 page scaffolded a bundle, a bridge and a dev server that the working
  page did not use. The answer was in the published HTML the whole time.

### Fixed
- **Rescued nodes are restored to their original parent**, not appended to the
  island root. `cleanDOMForVue` has detached `<style>` and `script.w-json` before
  mount since 0.0.6, but `restore()` put everything back at the root. A `<style>`
  tolerates that — CSS applies from anywhere — which is why it survived two
  releases; it surfaced as a live page's `w-embed` wrapper left empty with its
  `<style>` reparented. A `script.w-json` does not tolerate it: Webflow's lightbox
  reads the config from inside the link that owns it, so relocating it defeats
  the entire purpose of rescuing it.

  Vue rebuilds the subtree from its compiled render function, so the original
  parent object is gone by the time `restore()` runs. The sweep now marks each
  parent with a `data-webflow-vue-restore` attribute — attributes survive
  compilation — finds it again afterwards, reinserts at the recorded index, and
  removes the marker. If Vue rendered the parent away entirely (`v-if`), the node
  still lands at the root, and the log says so instead of pretending.

### Documentation
- The skill is restructured around the route decision it already documented but
  did not follow. Step 1 reads the published page before any MCP call; Step 2 is
  an explicit gate; the phases are split into a three-step Route 1 track and the
  existing Route 2 phases, each labelled. Adds a graduation procedure from route
  1 to route 2, in an order that keeps the live page working.
- Two measured facts behind that ordering (2026-08-21): `get_page_scripts`
  returns 404 on a page whose only code is freeform custom code, so a route-1
  install is invisible to it — while `get_page_freeform_code` reads it fine; and
  `get_all_elements` does not expand component instances, so island markup
  authored inside a Webflow component is missing from the page tree. A live page
  with three mount roots reported two.
- MCP tool and parameter names in the skill corrected against the live schemas:
  `register_inline_script`, `add_page_script`, `get_registered_scripts`,
  `designer_tool > get_current_page`, `display_name`, `source_code`. The old
  names did not exist.
- The skill's Phase 0 looked for `vueflow` in a project's dependencies. The
  package has been called `webflow-vue` since 0.0.1, so the check never matched
  and every route-2 run re-scaffolded.
- README: the quick-start snippet destructured `Webflow Vue`, with a space —
  a syntax error for anyone who copied it. Adds a CLI section.

### Internal
- `npm run verify:live <url>` — the testing doctrine, executable. Fetches a
  published page, fetches the scripts that page loads, runs them in jsdom in the
  page's own order, clicks a `v-on:click` element and asserts on rendered text.
  `--local` substitutes `dist/webflow-vue.global.js` for the CDN copy, which
  makes it a release gate: does the build about to ship still drive the page the
  shipped build drives today? The restore bug above was found this way, by a
  differential blank-element count, minutes after the harness first ran.

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
