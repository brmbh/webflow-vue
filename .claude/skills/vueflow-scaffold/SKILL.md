---
name: vueflow-scaffold
description: Bootstrap or extend a Vue-on-Webflow hybrid mount on a target Webflow page. Installs the Vueflow bridge script via Webflow MCP, scaffolds reactive DOM and matching Vue code, and publishes with auto-reload of the local Vite dev server. Use when the user says "scaffold a Vue mount on Webflow", "set up Vueflow on this page", "add a Vue island to my Webflow page", "publish Vueflow changes", or "bootstrap the Vueflow bridge".
license: MIT
allowed-tools: Read Edit Bash mcp__webflow__webflow_guide_tool mcp__webflow__data_sites_tool mcp__webflow__data_pages_tool mcp__webflow__data_scripts_tool mcp__webflow__de_page_tool mcp__webflow__element_tool mcp__webflow__element_builder mcp__webflow__whtml_builder mcp__webflow__element_snapshot_tool
---

# Vueflow Scaffold

Orchestrate Vue-on-Webflow hybrid scaffolding: bridge install, mount-point creation, code + DOM co-evolution, publish, and auto-reload of the local Vite dev server.

Source of truth narrative: `SCAFFOLDING.md`. Canonical bridge content: `webflow-bridge.html`. Boilerplate entry: `src/main.js`.

## Important Note

Assumes:
- Webflow MCP is connected and authed
- Webflow Designer is open on the target page (required for Designer-side actions in Phase 3 + 4)
- Local Vite dev server is running on `https://localhost:3000` (`npm run dev` from the repo root)
- The user has the page open with `?debug` appended for live HMR

ALWAYS call `mcp__webflow__webflow_guide_tool` first.

## Instructions

### Phase 1 — Discovery

1. Confirm `site_id` and `page_id`. If not provided, ask.
2. Call `webflow_guide_tool`.
3. In parallel:
   - `data_scripts_tool > list_registered_scripts(site_id)`
   - `data_scripts_tool > get_page_script(page_id)` (404 = no scripts yet, fine)
   - `de_page_tool > get_current_page(siteId)` to confirm Designer position
4. Read `webflow-bridge.html` for the canonical bridge source.
5. Read `src/main.js` for current code state.

### Phase 2 — Plan + Confirm

Present:
- Current state (existing scripts, existing DOM in `#app`, current code)
- Proposed change (bridge install / new variable / new DOM / publish-only)
- Order of operations

Require explicit confirmation before any mutation:
- Bridge install: user types **"install bridge"**
- Code + DOM change: user types **"scaffold"**
- Publish: user types **"publish"**

### Phase 3 — Bridge Install (skip if already present)

Skip if `get_page_script(page_id)` already lists the bridge.

1. `data_scripts_tool > add_inline_site_script` — register at site level
   - `displayName`: alphanumeric only, e.g. `VueflowBridge`
   - `version`: `0.1.0` (increment on conflict)
   - `location`: `footer`
   - `canCopy`: `true`
   - `sourceCode`: contents of `webflow-bridge.html` with `<script>` and `<!-- -->` stripped
2. `data_scripts_tool > upsert_page_script` — apply registered ID to target page footer
3. `data_scripts_tool > get_page_script(page_id)` — verify

### Phase 4 — Code + DOM Change (parallel)

When adding a reactive variable + display:

1. `Edit src/main.js`:
   - Add ref / computed / method inside `setup()`
   - Add the new key to the returned object
2. `element_builder` — append to the `#app` element. **Default primitive: Custom Element (`type: "DOM"` + `set_dom_config: { dom_tag: "..." }`).** Set `dom_tag: "div"` when nothing more semantic applies. `set_text` carries `{{ interpolation }}`. `set_attributes` carries `v-on:*`, `v-bind:*`, `data-*`, `id`, etc.
   - Long-form Vue directives only: `v-on:click` (NOT `@click`), `v-bind:class` (NOT `:class`)
3. Both edits are independent — run in parallel.

Use `whtml_builder` only when pasting an existing HTML tree is genuinely simpler than describing it as element_builder children. WHTML rewrites some tags (notably `<button>` → `<a>`); element_builder with `type: "DOM"` does not.

### Phase 5 — Publish + Auto-Reload

1. `data_sites_tool > publish_site(site_id, publishToWebflowSubdomain: true)`
2. After success: `Bash: touch <repo>/src/main.js`
3. Vite's file watcher fires → `[vite] full reload` → browser auto-reloads → both code and DOM changes visible in one go.

The `touch` is the trick that ties Webflow publishes to Vite HMR. Without it, the user must manually reload to see DOM changes.

### Phase 6 — Verify

1. Tell the user to check the `?debug` page on the live URL (the browser should already have reloaded).
2. Optional: `element_snapshot_tool` for visual confirmation.

## Examples

### Example 1: Bootstrap a counter island on a fresh page

**User:** "Set up Vueflow on the VUE MCP page of the Accessible Components site."

1. Discovery → no scripts, empty body
2. Plan: register `VueflowBridge`, insert `<div id="app">{{ count }}</div>` with +1/-1 buttons
3. Wait for "install bridge" + "scaffold"
4. Register + apply + insert (parallel where possible)
5. Wait for "publish"
6. `publish_site` + `touch src/main.js`
7. Verify on `?debug` URL

### Example 2: Add a reactive variable to an existing mount

**User:** "Add a `status` computed that flips with `count`, and show it in the page."

1. Discovery → bridge installed, `#app` exists with counter
2. Plan: add `status` computed in `main.js`, append `<p>Status: {{ status }}</p>` inside `#app`
3. Wait for "scaffold"
4. `Edit main.js` + `whtml_builder` in parallel
5. Wait for "publish"
6. `publish_site` + `touch src/main.js`
7. Verify on `?debug` URL

### Example 3: Publish-only

**User:** "Publish the changes I just made in Designer."

1. Discovery → confirm scripts present
2. Plan: publish only, no mutations to scripts or DOM
3. Wait for "publish"
4. `publish_site` + `touch src/main.js`
5. Verify

## Guidelines

### Bridge install constraints
- 2000-char limit on inline `sourceCode`
- No `<script>` tags or external `<script src=...>` allowed inside `sourceCode` — Webflow wraps it in a `<script>` itself
- `displayName` must be alphanumeric only (1–50 chars). No hyphens, dots, underscores.
- Page-level scripts must reference site-registered scripts by ID; always register first

### DOM insert constraints
- **Default to Custom Element** via `element_builder` `type: "DOM"` + `set_dom_config: { dom_tag: "..." }`. Universal building block, no native-element baggage.
- `whtml_builder` requires a single root element AND rewrites `<button>` → Webflow Link (`<a>`). Click handlers still fire. Add `v-on:click.prevent` if unwanted navigation appears. Avoid WHTML for clean scaffolds — element_builder gives explicit control.
- The Body element doesn't match a `tag: "body"` query filter — use `get_all_elements` to locate it
- Long-form Vue directives only on Webflow-rendered DOM:
  - `v-on:click` ✅, `@click` ❌
  - `v-bind:class` ✅, `:class` ❌
- `{{ interpolation }}` survives both element_builder `set_text` and the WHTML round-trip as text content

### Publish + HMR
- ALWAYS `touch src/main.js` immediately after `publish_site` returns success
- Without the touch, the user has to manually reload to see DOM changes
- Only fires when this skill drives the publish — direct publishes from the Webflow Designer UI bypass the trigger

### Failure modes
- 4xx on `add_inline_site_script` → almost always the alphanumeric `displayName` rule
- Designer tool returns "no element selected" or empty tree → Designer not open on the target page; ask user to switch
- Vite dev server not running → tell user to `npm install && npm run dev`
- mkcert cert not trusted by browser → WebSocket fails silently, HMR doesn't fire. Re-run `npm run dev` and accept the cert prompt.

### Companion skills

- `webflow-skills:custom-code-management` — lower-level script CRUD (this skill builds on it)
- `webflow-skills:safe-publish` — for production publish workflows that need plan-confirm-publish gates
- `webflow-skills:site-audit` — sanity-check page state before/after large MCP operations
