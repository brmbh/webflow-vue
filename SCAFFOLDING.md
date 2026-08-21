# Webflow Vue Scaffolding Workflow

The steps we ran to get a Vue-on-Webflow hybrid round-trip working end-to-end. Captures the **exact MCP calls, the constraints we hit, and the gotchas worth remembering**. Use as a checklist when bootstrapping a new Webflow page or a new Webflow Vue demo. Operationalised in the companion skill at `.claude/skills/webflow-vue-scaffold/SKILL.md`.

---

## Default scaffolding primitive

**Always use Webflow's Custom Element (`type: "DOM"` in the MCP) as the default building block, regardless of the desired HTML tag.** When nothing more semantic applies, set `dom_tag: "div"`. This is the universal shape — gives explicit tag control, no native-element baggage (no surprise `<button>` → `<a>` conversion), uniform across the boilerplate.

Concretely:

```js
mcp__webflow__element_builder({
  parent_element_id: { component, element },
  creation_position: "append",
  element_schema: {
    type: "DOM",
    set_dom_config: { dom_tag: "div" },           // or "section", "vue-card", etc.
    set_text: { text: "{{ greeting }}" },         // works on DOM type
    set_attributes: { attributes: [
      { name: "v-on:click", value: "count++" },
      { name: "data-webflow-vue-bind", value: "greeting" }
    ]}
  }
})
```

`whtml_builder` remains available for cases where pasting an existing HTML tree is genuinely simpler — but prefer `element_builder` for any clean scaffold. WHTML rewrites some tags (notably `<button>` → Webflow Link `<a>`); element_builder with `type: "DOM"` does not.

---

## Prerequisites

- Webflow MCP connected and authed in Claude Code
- Webflow site + a target page to mount on
- Local clone of this repo

You'll need to know the **Site ID** and **Page ID** for the target. Get them from `data_sites_tool > list_sites` and `data_pages_tool > list_pages`.

---

## Phase 1 — Bridge install (Data MCP, headless)

The bridge script lives at `webflow-bridge.html` (source of truth). It dynamically injects Vue from CDN, then routes the app bundle by environment.

### 1.1 Discovery (read current state)

```
data_scripts_tool {
  list_registered_scripts(site_id),
  list_applied_scripts(site_id),
  get_page_script(page_id)
}
```

Expect 404s on `list_applied_scripts` and `get_page_script` if the page has no custom code yet. That's fine.

### 1.2 Register the bridge as a site-level inline script

```
data_scripts_tool > add_inline_site_script {
  site_id,
  request: {
    displayName: "Webflow VueBridge",   // alphanumeric only, 1-50 chars (NO hyphens)
    version: "0.1.0",
    location: "footer",
    canCopy: true,
    sourceCode: <contents of webflow-bridge.html, scripts only, no <script> wrapper>
  }
}
```

Returns a script `id` (lowercase displayName, e.g. `webflowvuebridge`). Remember it.

### 1.3 Apply the registered script to the target page

```
data_scripts_tool > upsert_page_script {
  page_id,
  scripts: [{ id: "webflowvuebridge", version: "0.1.0", location: "footer" }]
}
```

### 1.4 Verify

```
data_scripts_tool > get_page_script(page_id)
```

Should return the registered script.

### Constraints we hit

- **2000-char limit** on inline source code → keep the bridge tight
- **No `<script>` tags** in `sourceCode` — Webflow wraps it itself
- **No external `<script src=...>`** — that's why the bridge injects Vue dynamically via `addScript()` rather than as a separate tag
- **`displayName` must be alphanumeric only** — no hyphens, dots, or underscores. `Webflow VueBridge` works; `vueflow-bridge` will reject.
- Page-level scripts can't be installed directly with raw source. They reference site-registered scripts by ID. Always register first, then `upsert_page_script`.

---

## Phase 2 — Mount point creation (Designer MCP, requires Designer open)

This is the magic step: Claude scaffolds the matching DOM contract in the Webflow Designer to align with the Vue runtime in the bundle.

### 2.1 Confirm Designer is on the right page

```
de_page_tool > get_current_page (siteId)
```

If wrong page → `de_page_tool > switch_page(page_id)`.

### 2.2 Find the Body element

```
element_tool > get_all_elements
```

Returns the Body element ID at the root. The body's `id.element` is what you'll use as `parent_element_id`.

(Querying by `tag: "body"` returns nothing — the Body is its own type, not a tag-matched element. Use `get_all_elements`.)

### 2.3 Insert the mount-point as a Custom Element

Default — use `element_builder` with `type: "DOM"` (Webflow's Custom Element):

```
element_builder > {
  parent_element_id: <body element id>,
  creation_position: "append",
  element_schema: {
    type: "DOM",
    set_dom_config: { dom_tag: "div" },
    set_attributes: { attributes: [{ name: "id", value: "app" }] }
  }
}
```

Then add children (counter UI, v-for blocks, etc.) the same way — each as a DOM-type element with `set_text` for interpolation and `set_attributes` for `v-on:*` / `v-bind:*` / `data-*`.

**Fallback (WHTML, only when pasting a tree is simpler):**

```
whtml_builder > {
  parent_element_id: <body element id>,
  creation_position: "append",
  html: '<div id="app">...your reactive template...</div>'
}
```

WHTML rewrites `<button>` → `<a>`. Custom Element does not.

### Directive contract surface (verified survives round-trip)

- `{{ interpolation }}` — preserved as text content
- `v-on:event` — preserved as attribute (use `v-on:click`, **NOT** `@click`)
- `v-bind:attr` — preserved (use `v-bind:class`, **NOT** `:class`)
- `v-scope`, `v-if`, `v-for`, `data-*` — all preserved

The `@` and `:` shorthands are stripped by Webflow's custom-element handling — long form only on Webflow-rendered DOM. Inside `.vue` SFCs (precompiled), shorthand is fine.

### Constraints we hit

- `<button>` tags get converted to Webflow **Link elements** (`<a>` tags). Click handlers still fire (Vue intercepts), and an `<a>` without `href` won't navigate. If you see unwanted page jumps, add the `.prevent` modifier: `v-on:click.prevent="..."`.
- `whtml_builder` requires a **single root element** — wrap everything in one outer `<div id="app">` (or whatever the mount selector is).

---

## Phase 3 — Publish + dev round-trip

### 3.1 Publish the Webflow site

Either:
- In Designer: hit Publish
- Or via MCP: `data_sites_tool > publish_site(site_id)`

### 3.2 Local dev server

```bash
cd vueflow-ai
npm install
npm run dev
```

First run prompts mkcert HTTPS install — accept it. Server runs on `https://localhost:3000`.

### 3.3 Test on the live page

Open the published page with `?debug`:

```
https://<site>.webflow.io/<slug>?debug
```

The bridge sees the `?debug` param → loads Vue from CDN → loads `https://localhost:3000/src/main.js` → Vue mounts on `#app` → reactivity works.

Edit `src/main.js` → HMR pushes the change live on the Webflow page.

---

## Recap: full flow for a new Webflow page

1. Get `site_id` + `page_id`
2. `add_inline_site_script` (register bridge)
3. `upsert_page_script` (apply to target page) — **page-level only, do not also apply site-level** (renders the bridge twice → double Vue mount)
4. `get_current_page` / `switch_page` to target
5. `get_all_elements` → grab Body ID
6. `element_builder` → append `type: "DOM"` Custom Element with `dom_tag: "div"` and `id="app"` attribute (Custom Element default; WHTML as fallback)
7. Publish site
8. `npm run dev` locally
9. Open `?debug` URL → verify reactivity

---

## CMS data round-trip

`useWebflowCMS()` (composable at `src/composables/useWebflowCMS.js`) parses Webflow Collection List output into a reactive `collections` object.

**Convention:** every CMS attribute on the rendered Webflow item uses the `data-field-*` prefix, **including the grouping key**. The grouping attribute is `data-field-collection` (e.g. `data-field-collection="blog-posts"`); other fields follow the same pattern (`data-field-name`, `data-field-slug`, etc.). The parser:

1. Walks `document.querySelectorAll('[data-field-collection]')`
2. Strips the `field` prefix from each dataset key
3. Uses the `collection` value (camelCased) as the group key
4. Returns `{ collections }` as a `ref` — usable in templates as `collections.blogPosts`, etc.

The Webflow Collection List can sit anywhere on the page — the parser walks the whole document. Don't impose structural placement on it.

Render a v-for inside `#app` against the parsed data:

```
element_builder > {
  parent_element_id: <#app id>,
  creation_position: "append",
  element_schema: {
    type: "DOM",
    set_dom_config: { dom_tag: "ul" },
    set_attributes: { attributes: [{ name: "v-for", value: "post in collections.blogPosts" }] }
    // …li children with v-bind:key + interpolation
  }
}
```

---

## Companion skill

The procedure above is operationalised in `.claude/skills/webflow-vue-scaffold/SKILL.md`. The skill orchestrates the same phases with explicit confirmation gates ("install bridge", "scaffold", "publish") and ties the publish step to a `touch src/main.js` so Vite HMR auto-reloads the live `?debug` page.

This MD remains the human-readable narrative and the SOT for the gotchas — the skill references it.

## Pitfalls verified live

- **Bridge double-apply**: applying the bridge at both site-level (`add_inline_site_script` + auto-apply to footer) AND page-level (`upsert_page_script`) renders two `<script>` tags → two Vue mounts on `#app` → second mount fights the first. Apply page-level only. If you've drifted into double-apply, `delete_all_site_scripts` is safe when only the bridge is site-applied (verify via `list_applied_scripts` first).
- **Site shortName ≠ displayName**: the live URL uses Webflow's `shortName` (e.g. `accessible-components-site-bdd137.webflow.io`), not the displayName. Get it from `data_sites_tool > get_site` before constructing demo URLs.
