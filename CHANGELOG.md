# Changelog

All notable changes to `webflow-vue`. Versions are `0.0.x` and the API still
moves; pin an exact version.

## 0.2.3 — 2026-08-22

Everything here came out of driving the route-2 dev loop against a live page for
the first time. None of it was reachable from the unit suite or from inspecting
the dev server.

### Fixed
- **`?debug` was unreachable from a published page.** Chrome gates a *public*
  origin loading a subresource from a *local* one behind the
  `local-network-access` permission. The scaffolded `vite.config.js` now sends
  `Access-Control-Allow-Private-Network: true` on the preflight.

  Measured honestly: with the permission granted the header changes nothing —
  `?debug` mounted identically with and without it, including in a fresh browser
  context. **The permission is the gate.** The first-visit path could not be
  tested, because a DevTools-driven Chrome auto-grants the permission everywhere.
  The header is the protocol's server-side half so it ships, but the thing that
  actually unblocks a user is resetting the permission, and the docs say so.

  The failure signature is the worst part: port, certificate, CORS headers and
  module graph all pass while the page stays broken, because the request never
  reaches the server. The skill now says to read the browser console first and
  not to debug this by inspecting Vite.

### Changed
- **The bridge belongs in the page's own custom code, not in an App-registered
  script.** Webflow's docs: *"any custom code added by that App is removed when
  you next publish your site"* once its access is revoked — so an API-installed
  bridge makes a page's **production** code path depend on an OAuth grant staying
  alive, and it appears in neither custom-code box, so nobody can find it. Phase 3
  now defaults to pasting, with the API route as a documented opt-in for
  agent-driven iteration and its cost stated up front.
- Swapping between the two is atomic if both edits are staged before a single
  publish; the skill says so, because doing it in two publishes puts two bridges
  live, which throws and destroys the islands.

### Internal
- **`verify:live` could not verify a route-2 page** — it followed the page's own
  script tags, which route 2 does not have, and crashed on `window.Vue` being
  undefined the moment the reference page graduated. It now finds the bridge
  (inline or Webflow-hosted), runs it, and follows the scripts it injects in the
  bridge's own order, exactly as a browser does.
- **`--local` silently verified nothing on route 2.** The substitution of the
  about-to-ship build lived only in the route-1 path, so the release gate was
  loading the *published* library while claiming to test the local one. It now
  substitutes inside the bridge chain too.
- The pre-mount snapshot moved above everything that mounts, and falls back to a
  mustache scan when no selectors are visible in the page — which is always the
  case on route 2, where the mount calls live in the bundle.

### Documentation
- **App-registered scripts**, researched against Webflow's docs: register vs
  apply, `display_name`+`version` immutability (which is why
  `update_registered_script` 404s), and the fact that *"even inline scripts have
  `hostedLocation` URLs"* — Webflow uploads them and serves a `<script src>`,
  which is why `detect` could not see one before 0.2.2. Includes where a user can
  actually find them: Site settings → Integrations → Authorized apps.
- The 2000-character inline limit is the **MCP tool's**, not Webflow's, which
  allows 10,000. The skill had recorded the tool limit as a platform limit.

## 0.2.2 — 2026-08-21

Found by running the first real route-1 → route-2 graduation end to end, against
a live page. Both bugs were invisible until an actual cutover happened.

### Fixed
- **`detect` could not see a bridge.** A script registered through the Data API
  as "inline" is not published inline — Webflow hosts it as a file and emits a
  plain `<script src>`. The bridge's entire signature is its source, so it was
  absent from the page HTML and a working route-2 page reported as **route 0**,
  complete with a `mustaches-without-library` warning telling the user their
  visitors were seeing raw braces. They were not.

  `detect` now collects Webflow-hosted registered-script URLs, the CLI fetches
  their bodies, and they are analysed exactly as if inline — so version and
  placeholder detection work on the real source rather than a filename guess.
  When the bodies cannot be fetched (offline, or a local file) it falls back to
  the filename and marks the bridge `unconfirmed` with a `bridge-unread` warning,
  rather than silently reporting the page as bare.

- **The bridge template contradicted itself about the bundle filename.** Its
  comment said to upload `dist/main.js` renamed to `bundle.txt`; its code builds
  the URL as `…/<asset-id>_main.txt`. A Webflow asset's URL embeds its filename,
  so following the comment produces `_bundle.txt` and the bridge fetches a 404 —
  silently, and only outside `?debug`, which is the hardest possible way to
  notice. The skill repeated the comment's version. Both now say `main.txt` and
  explain why the name is load-bearing. *(Verified against a real upload,
  2026-08-21.)*

### Documentation
- The skill's upload step now carries the measured mechanics: `create_asset`
  wants the **MD5** as 32 lowercase hex, returns `uploadUrl` + `uploadDetails`,
  the bytes go to S3 as multipart form-data with the file field last, and a
  **201** means success — then confirm `hostedUrl` returns 200 and its checksum
  matches the local build.
- On route 2 the report no longer prints a bare `mounts —`, which read as "no
  mounts found" when the mount calls simply live in the bundle rather than the
  page.

## 0.2.1 — 2026-08-21

Everything here landed after 0.2.0 was packed, so the published 0.2.0 tarball is
a mid-edit snapshot missing all of it.

### Fixed
- **A cold install no longer hard-fails when `detect` is unavailable.** The skill
  ships from GitHub via `npx skills add`; the CLI it calls ships from npm. They
  release on independent timelines, so a consumer who installs the skill before
  the matching package is published gets a Step 1 that prints
  `unknown command: detect` — and Step 1 gates everything below it. Step 1 now
  states its version floor and falls back to `curl` + `grep`, verified against a
  live route-1 page and a live route-0 page. The `|| echo` in that snippet is
  load-bearing: `grep` exits non-zero on no match, so chaining the checks with
  `&&` abandons them after the first miss. 0.2.0 shipped the earlier form, which
  had that flaw.
- **The skill's prerequisites are stated before Step 1**, not inside the Route 2
  section. The 0.2.0 restructure left them there, so a route-1 consumer never saw
  "you need the Webflow MCP connected" or "you need a published URL" — both of
  which Step 1 itself depends on.
- **`detect` says why a fetch failed.** Node's fetch throws a bare `fetch failed`
  and hides the reason — DNS, TLS, offline — in `err.cause`. It is the first
  command a new user runs, so an opaque failure there is the worst place for one.

### Documentation
- **§ Ask, do not assume.** The skill had approval gates ("scaffold", "publish")
  but no decision points, so *where the project goes* was decided silently by
  `init <dir>` in both Phase 0 and the graduation. Names the four decisions with
  more than one defensible answer, each with its default, and says plainly that a
  nested project inside an existing repo is undocumented territory.
- **The graduation order was wrong in three ways**, all found by describing the
  intended journey out loud — prototype in Webflow custom code, then have the
  agent lift it into a project and hand back the live page on local Vite:
  it told the agent to open the page with `?debug` before installing the bridge
  (`?debug` *is* a bridge feature; with no bridge nothing reads it); it never
  built or uploaded the bundle the placeholders point at; and installing the
  bridge before removing the route-1 tags left every non-`?debug` visitor with an
  unmounted page. The bundle now exists before the tags come out, so there is no
  dark window. Adds a duplicate-page variant for pages with real traffic.
- **The two-copies constraint, measured (2026-08-21)** rather than reasoned.
  Against the published 0.2.0 global build evaluated twice in one jsdom window:
  `A === B` is false, each copy closes over its own `mounted` WeakMap, and the
  guard cannot see across them. The second mount throws `Cannot read properties
  of null (reading 'nextSibling')`, destroys the island's rendered content and
  leaves it dead. Control in the same run: one copy mounted twice does not throw
  and stays reactive, so the cause is the two copies, not double-mounting.
  It shares its signature with the 0.0.4 double-mount bug and should not be read
  as a regression of it — the tell is `A === B`, not the error text. On a trivial
  island with no directives the same double mount is silent and merely inert.

### Internal
- Release order is now **push, then publish**, so the published tarball always
  corresponds to a public commit. The window that creates is handled by requiring
  every skill step that calls a new CLI feature to state a version floor and
  degrade without it, not by reversing the order.

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
