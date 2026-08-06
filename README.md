# Vueflow AI

White-label boilerplate for Vue-on-Webflow hybrid sites. Vue runtime from CDN, app code bundled with Vite, served via a debug-aware bridge script in Webflow custom code. Driven end-to-end by Claude + the Webflow MCP — bridge install, DOM scaffold, code edit, publish, and HMR auto-reload all from one chat session.

**Project dashboard (single source of truth):** `~/Development/haufe/Haufe Brain/Automatic-Brain/Projects/Vueflow-AI/dashboard.md`

## Why islands

Wrapping a whole Webflow page in one Vue app breaks Webflow's runtime: Vue's compiler rebuilds the mount target, destroying lightbox JSON configs (`script.w-json`), slider DOM, and native interactions. Vueflow mounts **one `createApp` per interactive component** on its own root element — everything outside the islands stays untouched Webflow DOM.

## Setup

```bash
npm install
npm run dev    # https://localhost:3000 — local dev harness with HMR
npm run build  # dist/main.js — UMD bundle for Webflow asset upload
```

`mkcert` generates a trusted local cert on first run so the dev server can be loaded into HTTPS Webflow pages without mixed-content errors.

## Architecture

- **Vue runtime** loaded from CDN (`vue.global.js`, ships the template compiler). In dev, Vite aliases `vue` → `vue/dist/vue.esm-bundler.js` (see `vite.config.js`) — islands compile the live Webflow DOM as their template, so the runtime compiler must always be present.
- **App code** in `src/`, bundled with Vite as a UMD `main.js`. Vue is externalized to the CDN global in builds.
- **Mount strategy**: `mountIsland(selector, label, setup)` (`src/mountIsland.js`) — NO template option; Vue uses the live Webflow-rendered DOM as its template. Islands skip themselves when their mount point isn't on the current page, so one bundle serves the whole site.
- **Bridge script** (`webflow-bridge.html`) goes in Webflow page custom code. Routes the bundle source by env: `?debug` → local Vite with HMR, `*.webflow.io` → staging asset, prod host → prod asset. **Apply at page level only** — site + page double-mounts Vue.

### Core modules

| Module | Job |
| --- | --- |
| `src/mountIsland.js` | One `createApp` per island, pre-mount sweep, error handler, timing logs |
| `src/composables/useSharedStore.js` | Cross-island state: named module-scoped `reactive()` singletons, optional `sessionStorage` persistence for **cross-page** state |
| `src/composables/useWebflowCMS.js` | Parses Webflow-rendered Collection List data into a reactive `collections` object |
| `src/utils/cleanDOMForVue.js` | Rescues `script.w-json` configs and strips `<style>` blocks inside a mount target before Vue compiles it |

### Shared state between islands

```js
const store = useSharedStore('cart', { items: [] }, { persist: true });
```

Every island calling `useSharedStore('cart')` gets the same reactive object — module scope is the singleton boundary, no Pinia needed. With `persist: true` the state survives reloads and page navigation (badge in the navbar keeps its count on every page).

## Conventions (verified live)

- **Custom Element is the default scaffolding primitive.** Create elements via `element_builder` `type: "DOM"` + `set_dom_config: { dom_tag: "..." }` — including plain `div`s. Pick the semantically correct tag (real `<button>`, not `<a href="#">`).
- **Long-form Vue directives only on Webflow-rendered DOM:** `v-on:click` ✅ (`@click` ❌), `v-bind:class` ✅ (`:class` ❌). `v-model` works. Inside `.vue` SFCs shorthand is fine.
- **CMS data — two conventions, freely mixable per item** (both parsed by `useWebflowCMS()`; grouping key is always the attribute `data-field-collection="beans"`):
  1. **Attribute fields** — `data-field-name="…"` on the Collection Item element. Designer-authored; bind values by hand in the Designer.
  2. **Field elements** — `<span data-field="name">…</span>` children whose *text* is CMS-bound. This is the **API-scaffoldable** variant: the Webflow MCP can bind CMS fields to element text (`set_settings` key `"text"` + cms binding) but not to attribute values.
- **Collection List via MCP**: the list's `source` setting takes `static_json` `{"collectionId":"…"}` on the DynamoWrapper element.
- **Styles via MCP**: `set_style`'s `style_names` array resolves as a **combo-class chain**, not stacked globals — register shared modifiers (e.g. `gutter-medium`) as combos under each base class.

## Case studies (live on the sandbox)

Both wireframe-styled, built 100% through the Webflow MCP from one chat session, `console.log`-instrumented (`[vueflow:*]` prefixes) and verified by driving a real browser.

1. **Vueflow Islands** — `/vue/vueflow-islands?debug`
   The mechanics: counter island + status island sharing one store across page regions, CMS filter island, sessionStorage hydration, `cleanDOMForVue` rescuing a lightbox config.
2. **Brew Lab** — `/brew-lab?debug` + `/brew-lab-about?debug`
   The product-shaped demo: bean grid from a real, MCP-bound CMS Collection List with reactive facets; subscription configurator (grind/size/frequency → live price + discount); **navbar cart badge that persists across pages**; origin island fetching live Open-Meteo weather for the selected bean's growing region. DOM classed per the Semantic Framework (composition owns spacing, BEM components, `is-*` combos) so a design pass needs zero DOM/code changes.

## Demo flow

1. Open the Webflow page with `?debug` → bridge loads Vue from CDN + bundle from `localhost:3000` with HMR
2. Webflow Designer open on the same page → enables Designer-side MCP calls (headless `data_*` tools work without it)
3. Ask Claude: scaffold a variable + matching DOM. Claude edits `src/` AND inserts Custom Elements via MCP, then publishes
4. Vite HMR auto-reloads the live page (the scaffold skill `touch`es `src/main.js` after `publish_site`) → code + DOM changes appear together

**Stakeholder demo runbook:** `demo/filter-showoff.md`

## Companion Skills

Install the upstream skill pack:

```bash
claude plugin marketplace add webflow/webflow-skills
claude plugin install webflow-skills@webflow-skills
```

- **Required:** `webflow-skills:custom-code-management` — bridge registration + page apply
- **Recommended:** `safe-publish`, `site-audit`, `link-checker`
- **Local:** `.claude/skills/vueflow-scaffold` — orchestrates bridge install, code + DOM co-evolution, publish + auto-reload

### Planned / Wanted

- **`vueflow-data-bridge`** — scaffold a CMS-bound reactive list end-to-end (the Brew Lab beans pipeline, generalized)
- **`vueflow-verify`** — diff the Vue contract (mount selectors, `v-*` directives, refs) against live Webflow DOM, report drift
