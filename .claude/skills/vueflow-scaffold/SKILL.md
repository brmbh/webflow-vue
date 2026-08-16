---
name: vueflow-scaffold
description: Bootstrap or extend a Vue-on-Webflow hybrid mount on a target Webflow page. Installs the Vueflow bridge script via Webflow MCP, scaffolds reactive DOM and matching Vue code, and publishes with auto-reload of the local Vite dev server. Use when the user says "scaffold a Vue mount on Webflow", "set up Vueflow on this page", "add a Vue island to my Webflow page", "publish Vueflow changes", or "bootstrap the Vueflow bridge".
license: MIT
allowed-tools: Read Edit Bash mcp__claude_ai_Webflow__webflow_guide_tool mcp__claude_ai_Webflow__data_sites_tool mcp__claude_ai_Webflow__data_pages_tool mcp__claude_ai_Webflow__data_scripts_tool mcp__claude_ai_Webflow__data_element_tool mcp__claude_ai_Webflow__data_element_builder mcp__claude_ai_Webflow__data_element_settings_tool mcp__claude_ai_Webflow__data_style_tool mcp__claude_ai_Webflow__data_assets_tool
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

**Never use `whtml_builder` for markup that carries directives.** It silently drops every `v-*` attribute and `ref`. Classes, `data-*`, text and `{{ }}` survive, so the result looks correct and is inert. Use it only for inert layout, or not at all.

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

**Rule 1 — anything carrying a directive must be a Custom Element, with its
attributes set at creation.** `element_builder`, `type: "DOM"`,
`set_dom_config: { dom_tag: "..." }`, `set_attributes` in the same call.

A Custom Element stores `data.attributes` as a first-class array — that is the
only mechanism that reliably survives publish. On native types (Link, Paragraph,
Heading) arbitrary attributes are a bolt-on, and writing them afterwards with
`set_attributes` fails intermittently and permanently with:

```
MPS rejected update: … [Conflict] The operation could not be applied to the component map
```

It does not clear on retry, cooldown, or re-query. Cause unknown; Rule 1 avoids
it. Verified 2026-08-16, jan-blank-sandbox.

**Rule 2 — long form only.** `v-on:click` ✅ `@click` ❌ · `v-bind:class` ✅ `:class` ❌

**Rule 3 — `ref` does not work. Use `data-vf-ref`.** Webflow stores `ref="x"` in
the Designer (`get_attributes` reads it back) and then strips it at publish, so
it never reaches the page. True on Custom Elements too. `data-*` survives intact.
Refs resolve **after** mount — Vue empties the mount target first, so anything
captured beforehand is detached. Verified 2026-08-16.

**Rule 4 — `{{ }}` survives on any element type.** It is text content, not an
attribute. A plain Text Block can hold a mustache. Only *attributes* force
Custom Element.

**Rule 5 — the Body element** doesn't match a `tag: "body"` filter. Use
`get_all_elements`.

**Rule 6 — a code embed's scripts run at parse time.** An embed that mounts
islands must sit **after** every one of them in the DOM, or `querySelector`
returns null and the mount silently does nothing.

**Rule 7 — CMS parsing happens before any mount**, and the Collection List shell
stays **outside** every island. Vue empties its mount target, so a list inside an
island becomes a render artifact of the thing meant to read it.

**Rule 8 — styling is never Vueflow's.** `vf-` and `data-vf-` name Vueflow's own
contract — mount ids, behavioural hooks. Presentation classes belong to the
project's design system. Never invent `vf-card`-style classes.

### CSS via the API
- `whtml_builder`'s `css` param rejects nested and descendant selectors
  (`.a .b`). Single-class selectors only — flatten, or create the style with
  `data_style_tool`.
- `data_style_tool > create_style` errors if the style already exists. Check
  first, or reuse; never overwrite a shared global from another page.

### Publish + HMR
- ALWAYS `touch src/main.js` immediately after `publish_site` returns success
- Without the touch, the user has to manually reload to see DOM changes
- Only fires when this skill drives the publish — direct publishes from the Webflow Designer UI bypass the trigger

### Failure modes
- Directives missing from the published page but present in the Designer → markup
  was inserted with `whtml_builder`. Rebuild those elements as Custom Elements.
- An island renders nothing and the console is silent → mount target existed but
  `setup()` never supplied what the markup asks for. Check the markup ↔ bundle
  contract before anything else.
- An island renders nothing and no `[vueflow:*]` log appeared at all → the embed
  or bundle ran before the markup existed. See Rule 6.
- 404 on `add_page_script` for a freshly created page → the custom-code block
  doesn't exist yet. Use `set_page_scripts` to create it.
- `update_registered_script` 404s → re-register the same `displayName` with a
  bumped version, then re-apply with `set_page_scripts`.
- 4xx on `add_inline_site_script` → almost always the alphanumeric `displayName` rule
- Designer tool returns "no element selected" or empty tree → Designer not open on the target page; ask user to switch
- Vite dev server not running → tell user to `npm install && npm run dev`
- mkcert cert not trusted by browser → WebSocket fails silently, HMR doesn't fire. Re-run `npm run dev` and accept the cert prompt.

### Companion skills

- `webflow-skills:custom-code-management` — lower-level script CRUD (this skill builds on it)
- `webflow-skills:safe-publish` — for production publish workflows that need plan-confirm-publish gates
- `webflow-skills:site-audit` — sanity-check page state before/after large MCP operations
