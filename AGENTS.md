# Working on webflow-vue

Read this first. It is the entry point; everything else is detail.

## What this is

`webflow-vue` mounts Vue 3 islands on Webflow-rendered DOM. Webflow owns the
markup and styling; Vue owns behaviour. There is no `template` option anywhere —
Vue compiles the live Designer-authored DOM as its template.

The library's justification in one sentence: **Vue's `createApp().mount()`
destroys `<style>` tags and `script.w-json` lightbox configs inside the mount
target, and this is the thin thing that stops it.** Everything else is either
ergonomics on top of that guarantee, or Webflow CMS work that plain Vue cannot do.

## The two routes — establish which one you are in before anything else

| | Route 1 — by hand | Route 2 — with a project |
|---|---|---|
| delivery | 2 CDN script tags + page custom code | project, Vite build, bridge script |
| needs this repo | no | yes |
| needs the skill | no | yes |
| when | one or two self-contained widgets | version control, a build, multiple pages |

**Do not scaffold a project for someone who needs route 1.** Two script tags and
a `mountIsland` call is the whole answer for a single widget. The API is identical
in both routes, so moving later costs nothing (the skill has the migration steps).

**Do not guess which one you are in — read the page:**

```bash
npx webflow-vue detect https://<site>.webflow.io/<path>
```

The published HTML is the only artefact that cannot be wrong about what a page
loads. Asking the user, or inferring it from the working directory, is how a
route-1 page ends up with a Vite project it does not use.

## Current state (2026-08-21)

- **`webflow-vue@0.1.0` is the published version** on npm, public, MIT.
  `WebflowVue` is the browser global. CDN:
  `https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0`
- **0.2.0 is prepared and committed but NOT published** — `npm publish` is Jan's.
  Until he runs it, the CDN still serves 0.1.0, so anything pinned to 0.2.0 (the
  scaffolded bridge included) 404s.
- Repo: `github.com/brmbh/webflow-vue`. Skill installs with
  `npx skills add brmbh/webflow-vue`.
- 53 tests, `npm test` green.
- Shipped: `mountIsland`, `unmountIsland`, `useSharedStore`, `resetSharedStore`,
  `useWebflowCMS`, `parseItemElement`, `loadAllPages`, `fetchCollection`,
  `loadDocument`, `clearCollectionCache`, `useFinsweetList`, `hasFinsweetList`,
  `cleanDOMForVue`, `extractors`, `version`.
- CLI: `init` and `detect`.
- **Not built yet**, despite appearing in `PACKAGE.md`/`PLAN.md`: `auditContract`,
  `verifyMount`, `configure`, and the CLI's `doctor` and `verify` commands.
  `detect` is not `verify`: it reads a page statically and reports the route,
  where `verify` is designed to diff the markup contract against the built bundle
  (`PACKAGE.md` §3).

## Commands

```bash
npm test              # vitest + jsdom
npm run build         # dist/main.js — the DEMO APP bundle, boots the demo apps
npm run build:lib     # dist/webflow-vue.{global,esm}.js — the LIBRARY
npm run dev           # Vite on https://localhost:3000 for the demo pages
npm run verify:live <url> [--local]  # the doctrine, executable — see below
node bin/webflow-vue.js init <dir>   # scaffold a route-2 project
node bin/webflow-vue.js detect <url> # read a published page, report its route
```

`dist/main.js` and `dist/webflow-vue.*.js` are different things. Only the library
build ships to consumers; only it is committed to git.

## How to verify — the project's testing doctrine

Unit tests did not find the four most important bugs in this codebase. **Driving
the real published page against the real published bytes did.** Do this before
claiming anything works:

```bash
npm run verify:live https://<site>.webflow.io/<path>            # against the CDN build
npm run verify:live https://<site>.webflow.io/<path> -- --local # against dist/, the release gate
```

`scripts/verify-live.mjs` does exactly what the doctrine describes: fetches the
page, fetches the scripts *that page* loads, runs them in jsdom in the page's own
order, clicks a `v-on:click` element and asserts on rendered text. `--local`
swaps in `dist/webflow-vue.global.js`, which answers the only question that
matters before a release: does the build about to ship still drive the page the
shipped build drives today? **Run it before every publish.**

Found this way, across two sessions: a line-wrapped `<script src>` silently
404ing; a `mountIsland`/`mountIslands` typo; a double-mount crash; `<style>`
blocks being deleted on mount; and rescued nodes being restored to the island
root instead of their original parent (0.2.0). None were visible to the unit
suite.

Two traps the harness itself walked into, worth not repeating:

- **Vue strips directive attributes when it compiles**, so anything you mean to
  click has to be found *before* the mount. Querying `[v-on\:click]` afterwards
  matches nothing and the check silently skips.
- **Counting blank elements after a mount flags every empty Webflow wrapper on
  the page.** Only the *delta* against a pre-mount count is yours. The first
  version reported a false positive and a real bug with equal confidence.

Rules about Webflow's own behaviour are **undocumented and can change silently**.
Never assert one without verifying it, and date it when you write it down.

## Releasing

1. Bump the version in **two** places: `package.json` and `src/index.js`
   (there is a test asserting they match — it exists because they drifted).
2. `npm run build:lib` — the library build is committed, so this must be in the
   commit.
3. `npm test`, then `npm run verify:live <a real published page> -- --local`.
   The unit suite cannot tell you whether the build you are about to publish
   still drives a real page; that command can, and it is the whole reason the
   doctrine exists.
4. Add a CHANGELOG entry. Say what broke and why, not just what changed.
5. Commit, `git tag -a vX.Y.Z`, push both.
6. **`npm publish` must be run by Jan.** It is blocked for agents, and it needs
   his 2FA-bypass token. Hand him the command; do not try to work around it.
7. Verify after: registry version, the jsDelivr URL returning 200, and its
   sha256 matching the local build. jsDelivr lags the registry by about a minute.

## Invariants

- **No presentation CSS ships. Ever.** A package that ships CSS is a UI kit,
  which is a different product.
- **Nothing wraps `ref` / `computed` / `watch`.** A Vue developer must read an
  island and see plain Vue, with only the mount and the Webflow plumbing supplied.
- **The boundary:** own what is only true because Webflow is underneath. Vue
  stays Vue.
- **Compose with Finsweet Attributes, do not compete.** Their `list` package
  already ships combine / load-past-100 / nest-past-5, and runs on
  `@vue/reactivity`. The skill is expected to answer "just use Finsweet" when
  that is honest.
- **Deterministic work belongs in the CLI, not in skill prose.** Markdown
  templates drift and cannot be tested. That is why `init` exists.
- **Ask before merging to main, deploying, or publishing.**

## Map

| path | what |
|---|---|
| `src/index.js` | the public surface; the only thing consumers import |
| `src/mountIsland.js` | mount + unmount, the WeakMap guard |
| `src/utils/cleanDOMForVue.js` | the sweep — the load-bearing part |
| `src/composables/` | shared store, CMS parsing, fetching, Finsweet interop |
| `src/apps/`, `src/main.js` | demo apps; **not** shipped to npm |
| `bin/`, `src/cli/`, `templates/project/` | the CLI and what it scaffolds |
| `src/cli/detect.js` | route detection from published HTML; pure, no DOM, no deps |
| `scripts/verify-live.mjs` | the doctrine, executable; not shipped to npm |
| `skills/webflow-vue-scaffold/SKILL.md` | agent-facing rules; `.claude/skills/` symlinks here |
| `README.md` | user-facing API + scope rules |
| `CHANGELOG.md` | why each version exists |
| `PACKAGE.md`, `PLAN.md`, `SCAFFOLDING.md` | design history. Predate the rename in places — trust this file and the README over them |

Project status, session records and reference IDs live in Jan's vault at
`Automatic-Brain/Projects/Vueflow-AI/` (`dashboard.md` and `index.md`).

## Known open work

- **Publish 0.2.0.** Prepared, committed and tagged; `npm publish` is Jan's.
  Until then the CDN serves 0.1.0 and the scaffolded bridge pins a version that
  does not exist yet.
- The bridge template ships `SITE_ID` / asset-ID placeholders that are filled by
  hand. Route 2 has not been driven end to end by an agent yet — and it is the
  only route whose failure mode (`bridge-placeholders`) is now detectable but
  still not preventable.
- `contract` scanner work (`auditContract`, `verifyMount`, `webflow-vue verify`)
  is designed in `PACKAGE.md` §3 and unbuilt. `detect` covers the static half of
  layer 4; the identifier-level diff against the built bundle is the rest.
- `detect` resolves no selectors against the document — it has no DOM parser,
  because the published package has zero runtime dependencies and this is not
  worth changing that for. So it reports the mount calls it finds but not how
  many elements each one matches. `verify:live` does resolve them, in jsdom.

### Closed 2026-08-21

- ~~The skill's phases ignore its own route decision.~~ The file now opens with
  `detect`, gates on the result, and splits into a Route 1 track and the Route 2
  phases. Example 3 is the "continue working on this project" case specifically.
- ~~Phase 1 should read the published page first.~~ It does, via `detect`, before
  any MCP call. The guess that "the MCP may not be able to read freeform code at
  all" was wrong — `get_page_freeform_code` reads it fine. What is actually true
  is narrower and more dangerous: `get_page_scripts` **404s** on such a page, and
  an agent reading that 404 as "nothing installed" is how the failure happened.
- ~~No graduation procedure from route 1 to route 2.~~ Six ordered steps at the
  end of the skill, with the route-1 teardown *after* the bridge install so the
  live page keeps working, and a `detect` check that the result is not `mixed`.
