# Vueflow

Vue 3 islands on Webflow-rendered DOM. Webflow owns the markup and the styling;
Vue owns the behaviour. No build step required, and no page-wide takeover — the
rest of the page stays untouched Webflow, with its own runtime intact.

> **Status: `0.0.2`, unstable.** The API still moves. Pin a tag; expect
> signatures to change before `0.1.0`.

## Quick start — two script tags

Paste into your Webflow page's **custom code (head)**:

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vueflow@0.0.2/dist/vueflow.global.js"></script>
```

Give any element an id — that is your island. Then add an **embed placed after
it** (a code embed's scripts run at parse time, so an embed above the island
mounts nothing):

```html
<script>
  const { ref, computed } = Vue
  const { mountIsland } = Vueflow

  mountIsland('#counter', 'counter', () => {
    const cups = ref(1)
    const grams = computed(() => cups.value * 18)
    return { cups, grams }
  })
</script>
```

```html
<!-- the island itself, built in the Designer -->
<div id="counter">
  <button v-on:click="cups++">+</button>
  <span>{{ cups }} cups = {{ grams }} g</span>
</div>
```

`vue.global.js` is required rather than the runtime-only build: an island's
template *is* the live Webflow DOM, so the template compiler has to be present.

### Agent skill

```bash
npx skills add brmbh/vueflow
```

Installs `vueflow-scaffold`, which drives the Webflow MCP to build islands for
you — bridge install, DOM scaffold, matching Vue code, publish.

## Why islands

Wrapping a whole Webflow page in one Vue app breaks Webflow's runtime: Vue's compiler rebuilds the mount target, destroying lightbox JSON configs (`script.w-json`), slider DOM, and native interactions. Vueflow mounts **one `createApp` per interactive component** on its own root element — everything outside the islands stays untouched Webflow DOM.

## Setup

```bash
npm install
npm run dev    # https://localhost:3000 — local dev harness with HMR
npm run build      # dist/main.js — demo app bundle, for Webflow asset upload
npm run build:lib  # dist/vueflow.global.js + .esm.js — the library
npm test           # vitest + jsdom
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
- **Bundle hosting**: Webflow assets reject `.js` — upload `dist/main.js` renamed to `bundle.txt`; the asset CDN serves it without `X-Content-Type-Options`, so a classic `<script src>` executes it. Update the bridge by re-registering the same `displayName` with a bumped version (`update_registered_script` 404s) and re-applying via `set_page_scripts`.
- **Known MCP limits**: native Lightbox media items aren't writable (Designer only); `set_text` HTML-escapes (no JSON payloads — use an HtmlEmbed's `code` setting); body elements reject classes (scope body styles with `body:has(#your-island)` CSS in head code).

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
