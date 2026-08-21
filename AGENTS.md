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
in both routes, so moving later costs nothing.

## Current state (2026-08-20)

- **`webflow-vue@0.1.0` is published** on npm, public, MIT. `WebflowVue` is the
  browser global. CDN: `https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0`
- Repo: `github.com/brmbh/webflow-vue`. Skill installs with
  `npx skills add brmbh/webflow-vue`.
- 31 tests, `npm test` green.
- Shipped: `mountIsland`, `unmountIsland`, `useSharedStore`, `resetSharedStore`,
  `useWebflowCMS`, `parseItemElement`, `loadAllPages`, `fetchCollection`,
  `loadDocument`, `clearCollectionCache`, `useFinsweetList`, `hasFinsweetList`,
  `cleanDOMForVue`, `extractors`, `version`.
- **Not built yet**, despite appearing in `PACKAGE.md`/`PLAN.md`: `auditContract`,
  `verifyMount`, `configure`, and the CLI's `doctor` and `verify` commands. The
  CLI has `init` only.

## Commands

```bash
npm test              # vitest + jsdom
npm run build         # dist/main.js — the DEMO APP bundle, boots the demo apps
npm run build:lib     # dist/webflow-vue.{global,esm}.js — the LIBRARY
npm run dev           # Vite on https://localhost:3000 for the demo pages
node bin/webflow-vue.js init <dir>   # scaffold a route-2 project
```

`dist/main.js` and `dist/webflow-vue.*.js` are different things. Only the library
build ships to consumers; only it is committed to git.

## How to verify — the project's testing doctrine

Unit tests did not find the four most important bugs in this codebase. **Driving
the real published page against the real published bytes did.** Do this before
claiming anything works:

```js
// 1. fetch the actual published page
//    curl -sSL "https://<site>.webflow.io/<path>" -o page.html
// 2. extract the island markup and the inline script from it
// 3. load real Vue + the real CDN library + that markup into jsdom
// 4. click things and assert on rendered text
```

Found this way, in one session: a line-wrapped `<script src>` silently 404ing; a
`mountIsland`/`mountIslands` typo; a double-mount crash; and `<style>` blocks
being deleted on mount. None were visible to the unit suite.

Rules about Webflow's own behaviour are **undocumented and can change silently**.
Never assert one without verifying it, and date it when you write it down.

## Releasing

1. Bump the version in **two** places: `package.json` and `src/index.js`
   (there is a test asserting they match — it exists because they drifted).
2. `npm run build:lib` — the library build is committed, so this must be in the
   commit.
3. `npm test`.
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
| `skills/webflow-vue-scaffold/SKILL.md` | agent-facing rules; `.claude/skills/` symlinks here |
| `README.md` | user-facing API + scope rules |
| `CHANGELOG.md` | why each version exists |
| `PACKAGE.md`, `PLAN.md`, `SCAFFOLDING.md` | design history. Predate the rename in places — trust this file and the README over them |

Project status, session records and reference IDs live in Jan's vault at
`Automatic-Brain/Projects/Vueflow-AI/` (`dashboard.md` and `index.md`).

## Known open work

- **The skill's phases ignore its own route decision.** Phase 0–6 are route 2
  only (bridge, bundle, dev server), while the top of the file establishes that
  route 1 needs none of it. An agent told "continue working on this project" for
  a route-1 page would wrongly scaffold a project.
- **Phase 1 should read the published page first**, before any MCP call, and
  branch on what it finds: a `cdn.jsdelivr.net/npm/webflow-vue` tag in the head
  means route 1 is already in play; a registered bridge script means route 2.
  Route-1 code lives in freeform page custom code, which the MCP may not be able
  to read at all — the published HTML is ground truth.
- **No graduation procedure** from route 1 to route 2: when to migrate, and how
  to do it without breaking the live page.
- The bridge template ships `SITE_ID` / asset-ID placeholders that are filled by
  hand. Route 2 has not been driven end to end by an agent yet.
- `contract` scanner work (`auditContract`, `verifyMount`, `vueflow verify`) is
  designed in `PACKAGE.md` §3 and unbuilt.
