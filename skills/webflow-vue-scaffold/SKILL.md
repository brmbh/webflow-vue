---
name: webflow-vue-scaffold
description: Bootstrap or extend a Vue-on-Webflow hybrid mount on a target Webflow page. Reads the published page first with `npx webflow-vue detect` to establish which route the page is already on, then either edits its two CDN script tags in place (route 1) or drives a project — `npx webflow-vue init`, bridge install via Webflow MCP, reactive DOM plus matching Vue code, publish with auto-reload of the local Vite dev server (route 2). Use when the user says "scaffold a Vue mount on Webflow", "set up Webflow Vue on this page", "add a Vue island to my Webflow page", "add reactivity to Webflow", "publish Webflow Vue changes", "bootstrap the Webflow Vue bridge", or asks to continue working on an existing Webflow Vue page.
license: MIT
allowed-tools: Read Edit Bash mcp__claude_ai_Webflow__webflow_guide_tool mcp__claude_ai_Webflow__data_sites_tool mcp__claude_ai_Webflow__data_pages_tool mcp__claude_ai_Webflow__data_scripts_tool mcp__claude_ai_Webflow__data_element_tool mcp__claude_ai_Webflow__data_element_builder mcp__claude_ai_Webflow__data_element_settings_tool mcp__claude_ai_Webflow__data_style_tool mcp__claude_ai_Webflow__data_assets_tool
---

# Webflow Vue Scaffold

Orchestrate Vue-on-Webflow hybrid work: read the page, pick the route, then either
edit page custom code in place or drive a project — bootstrap, bridge install,
mount-point creation, code + DOM co-evolution, publish, and auto-reload of the
local Vite dev server.

**The order is not negotiable.** Read the published page, decide the route from
what it says, and only then pick a track. Most of this file is route 2; a page on
route 1 needs none of it, and scaffolding a project onto one is the failure this
structure exists to prevent.

## Before you start

Both routes need:

- **The Webflow MCP connected and authenticated.** Everything below reads and
  writes through it. If it is not connected, say so and stop — there is no
  useful partial version of this.
- **A published page URL.** Not a Designer link, not a page name: the
  `*.webflow.io` (or custom-domain) URL a browser can fetch. Step 1 needs it, and
  so does every verification step. If the page has never been published, say so
  and treat it as route 0 — a page nobody can fetch is a page you cannot verify.
- **Node, for the CLI.** Route 1 needs it only for `detect`; route 2 needs it for
  the project too.

Route 2 needs more; that list is at the top of the Route 2 section.

## Ask, do not assume

The confirmation gates below ("scaffold", "install bridge", "publish") approve an
*action* that is already decided. These are different: points where more than one
answer is defensible, the user is the only one who knows which, and picking
silently is expensive to undo. Ask, name the default, move on.

| Decision | Default | Ask when |
|---|---|---|
| Which page | — | Always, if no published URL was given. Step 1 cannot run without one, and a page name or a Designer link is not a URL. |
| Route, on a route-0 page | route 1 | Always. Committing someone to a build step, a bundle and a dev server is not an implementation detail. |
| Where the project lives | a fresh directory via `init` | Whenever route 2 starts — Phase 0, or graduation step 1. |
| Whether to graduate at all | stay on the current route | When the user asks for a project, or a second page needs the same island. `detect` reports the route; it does not judge it. Graduation is always the user's call, never a verdict. |

On **where the project lives**: an existing repo is a legitimate answer, and the
CLI half-supports it — `init ./some-dir` succeeds as long as those six files are
not already there. But nothing in this skill covers a nested project inside a
larger build: whose `package.json`, whose `vite.config.js`, who owns the bundle
output and the asset upload. If that is what the user wants, say plainly that it
is undocumented territory and get explicit agreement before improvising.

Same principle as § Designer-only steps: ask, do not engineer around.

## Step 1 — read the published page, before any MCP call

Do not ask the user which route they are on, and do not infer it from the
conversation. The published page is the only artefact that cannot be wrong about
what a page loads, and reading it costs one command:

```bash
npx webflow-vue detect https://<site>.webflow.io/<path>
```

Run this **first**, before `webflow_guide_tool`, before `list_sites`, before
anything. It reports the route, the pinned versions, every `mountIsland()` call
it can read, and the hygiene problems that are visible statically. `--json` if
you want to branch on it programmatically.

**`detect` needs `webflow-vue` ≥ 0.2.0.** If it prints `unknown command: detect`,
the CLI resolved to an older release. Do not skip Step 1 over it — the route
question still has to be answered from the published page. Do it by hand:

```bash
curl -sSL "https://<site>.webflow.io/<path>" -o /tmp/page.html
grep -o 'cdn\.jsdelivr\.net/npm/webflow-vue@[^"]*' /tmp/page.html || echo "no route-1 tag"
grep -o "WEBFLOW_VUE_VERSION *= *'[^']*'"          /tmp/page.html || echo "no bridge"
grep -o 'mountIsland([^)]*'                        /tmp/page.html || echo "no mount calls"
```

A route-1 tag and no bridge is route 1; a bridge and no tag is route 2; both is
`mixed`; neither is route 0. The `|| echo` matters — `grep` exits non-zero when it
finds nothing, so chaining these with `&&` silently abandons the rest of the
check after the first miss.

That is the whole route decision. The rest of what `detect` reports is diagnostics
you can live without for one session.

Two reasons it comes before the MCP and not after:

- **Route-1 code lives in freeform page custom code.** The page element tree does
  not contain it, and neither do registered scripts. `get_page_scripts` returns
  **404 "Custom code block not found"** on a page that has only freeform code, and
  reading that 404 as "no webflow-vue here" is exactly how an agent decides to
  scaffold over a working widget. *(Measured 2026-08-21.)*
- **`get_all_elements` does not expand component instances.** Island markup
  authored inside a Webflow component is invisible in the page tree — a live page
  with three `[data-brew]` roots reported two, because the third sat inside the
  site header component. The published HTML had all three. *(Measured 2026-08-21.)*

If the page is not published yet, say so and treat it as route 0. A page nobody
can fetch is a page you cannot verify, and everything below ends in verification.

## Step 2 — the route gate

`detect` prints one of four verdicts. They are not advisory:

| verdict | what it means | what you do |
|---|---|---|
| **route 1** | CDN tags in the page's own custom code | Work in **Route 1** below. Do **not** run `init`, do **not** install a bridge, do **not** start a dev server. |
| **route 2** | a bridge script, backed by a project bundle | Work in **Route 2** below. |
| **route 0** | neither — a clean page | Choose, with the user, using the table below. Default to route 1. |
| **mixed** | both are installed | A bug, not a configuration. Vue and the library load twice and the two instances do not share reactivity. Fix that before anything else: pick the route the page's code actually uses and remove the other. |

For route 0, the choice:

| | Route 1 — by hand | Route 2 — with a project |
|---|---|---|
| delivery | 2 CDN script tags + page custom code | project, Vite build, bridge script |
| needs this repo | no | yes |
| needs the phases below | Route 1 only, three steps | Route 2, phases 0–6 |
| when | one or two self-contained widgets | version control, a build, multiple pages |

**Do not build route 2 for a counter.** Scaffolding a Vite project for a single
widget is the wrong answer even though most of this skill is about route 2. The
API is identical either way — same `WebflowVue` global, same `mountIsland` — so
moving later costs nothing, and there is a documented procedure for it at the end
of this file.

Before either route, run the **Preflight** in § Guidelines. If the answer is
"just use Finsweet", say so and stop.

---

# Route 1 — two script tags

No project. No bridge. No build. No dev server. Nothing in Route 2 applies.

Assumes only: Webflow MCP connected and authed, and a published page URL.

### R1.1 — Read what is already there

```
data_scripts_tool > get_page_freeform_code(page_id)   # both head and footer
```

This is where route-1 code lives. `set_page_freeform_code` **replaces the entire
block**, so read it before you write it and send back the merged content — a
blind write silently deletes whatever else the page had in that block.

For markup, prefer the `detect` output and the published HTML over the element
tree; use `data_element_tool > get_all_elements(siteId, pageId)` when you need
element IDs to edit. If an island lives inside a component, reach it with
`designer_tool > open_component_view` — the page tree will not show it.

### R1.2 — Plan, and get one confirmation

Present current state, the proposed change, and the order. Require the user to
type **"scaffold"** before any mutation, and **"publish"** before publishing.

### R1.3 — Write the code and the markup

The page code goes in the **footer** freeform block, because a code embed's
scripts run at parse time and must come after the markup they mount (Rule 6):

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webflow-vue@0.1.0/dist/webflow-vue.global.js"></script>
<script>
  const { ref, computed } = Vue;
  const { mountIsland } = WebflowVue;

  mountIsland('[data-counter]', 'counter', () => {
    const cups = ref(1);
    const grams = computed(() => cups.value * 18);
    return { cups, grams };
  });
</script>
```

Pin the version. An unpinned tag is a page whose behaviour changes when the
library publishes.

Markup rules are the same in both routes — see § DOM insert constraints. The one
that bites first: anything carrying a directive must be a **Custom Element** with
its attributes set at creation, in long form (`v-on:click`, never `@click`).

### R1.4 — Publish and verify

```
data_sites_tool > publish_site(site_id, publishToWebflowSubdomain: true)
```

Then **verify against the published page, not against the Designer**:

```bash
npx webflow-vue detect https://<site>.webflow.io/<path>
```

Expect route 1, the version you pinned, your mount call, and no warnings. If
`detect` reports mustaches the page cannot fill, or a directive Vue cannot
resolve, that is your change, and it is visible to visitors right now.

There is no `touch src/main.js` step here. There is no dev server to reload.

---

# Route 2 — a project

Everything below is route 2. If Step 2 said route 1, none of it applies.

Assumes:
- Webflow MCP is connected and authed
- Webflow Designer is open on the target page (required for Designer-side actions in Phase 3 + 4)
- A webflow-vue project in the working directory — **Phase 0 creates one if absent**
- Local Vite dev server is running on `https://localhost:3000` (`npm run dev` in that project)
- The user has the page open with `?debug` appended for live HMR

Call `mcp__claude_ai_Webflow__webflow_guide_tool` once before the first MCP call.

### Phase 0 — Project bootstrap (skip if a project already exists)

A webflow-vue project is a directory carrying **`webflow-vue`** in its
`package.json` dependencies, `src/main.js` as its entry, and
`webflow-vue-bridge.html` beside them.

If it is absent, **ask where it should live** before creating it (see § Ask, do
not assume), then create it with the CLI. **Never hand-write these files** — the
CLI pins the dependency to its own version and points the bridge at the matching
CDN tag, and those two must agree:

```bash
npx webflow-vue init <dir>     # --force to overwrite, --name to override the name
npm install
npm run dev
```

It writes `package.json`, `vite.config.js`, `src/main.js`, `webflow-vue-bridge.html`,
`README.md` and `.gitignore`, and refuses to overwrite existing files unless
forced.

Every reference to `src/main.js` and `webflow-vue-bridge.html` below means **that
project's** files.

### Phase 1 — Discovery

Step 1 already told you the route. This fills in the IDs and the project state.

1. Confirm `site_id` and `page_id` — `data_sites_tool > list_sites`, then
   `data_pages_tool > list_pages(site_id)`. Match on `publishedPath`, which is the
   thing that corresponds to the URL you fetched.
2. In parallel:
   - `data_scripts_tool > get_registered_scripts(site_id)`
   - `data_scripts_tool > get_page_scripts(page_id)` — 404 means no registered
     scripts on this page yet, which is fine
   - `data_scripts_tool > get_page_freeform_code(page_id)` — catches a route-1
     install the bridge would then collide with
   - `designer_tool > get_current_page(siteId)` to confirm Designer position
3. Read the project's `webflow-vue-bridge.html` for the canonical bridge source.
4. Read the project's `src/main.js` for current code state.

### Phase 2 — Plan + Confirm

Present:
- Current state (existing scripts, existing DOM in the mount root, current code)
- Proposed change (bridge install / new variable / new DOM / publish-only)
- Order of operations

Require explicit confirmation before any mutation:
- Bridge install: user types **"install bridge"**
- Code + DOM change: user types **"scaffold"**
- Publish: user types **"publish"**

### Phase 3 — Bridge Install (skip if already present)

Skip if `get_page_scripts(page_id)` already lists the bridge.

1. `data_scripts_tool > register_inline_script` — register at site level
   - `display_name`: alphanumeric only, e.g. `Webflow VueBridge`
   - `version`: `0.1.0` (increment on conflict)
   - `source_code`: contents of the project's `webflow-vue-bridge.html` with
     `<script>` and `<!-- -->` stripped.
     **Replace `SITE_ID`, `STAGING_ASSET_ID` and `PROD_ASSET_ID` first** — the
     scaffolded bridge ships them as placeholders, and a bridge published with
     them intact loads nothing outside `?debug`. `detect` reports this as
     `bridge-placeholders`; it is the most common route-2 failure.
2. `data_scripts_tool > add_page_script` — apply the registered ID to the target
   page, `location: "footer"`, `version` matching what you registered
3. `data_scripts_tool > get_page_scripts(page_id)` — verify

Page level only. Site-level and page-level together mounts Vue twice.

### Phase 4 — Code + DOM Change (parallel)

When adding a reactive variable + display:

1. `Edit src/main.js`:
   - Add ref / computed / method inside `setup()`
   - Add the new key to the returned object
2. `data_element_builder` — append to the mount root. **Default primitive: Custom Element (`type: "DOM"` + `set_dom_config: { dom_tag: "..." }`).** Set `dom_tag: "div"` when nothing more semantic applies. `set_text` carries `{{ interpolation }}`. `set_attributes` carries `v-on:*`, `v-bind:*`, `data-*`, `id`, etc.
   - Long-form Vue directives only: `v-on:click` (NOT `@click`), `v-bind:class` (NOT `:class`)
3. Both edits are independent — run in parallel.

**Never use `data_whtml_builder` for markup that carries directives.** It silently drops every `v-*` attribute and `ref`. Classes, `data-*`, text and `{{ }}` survive, so the result looks correct and is inert. Use it only for inert layout, or not at all.

### Phase 5 — Publish + Auto-Reload

1. `data_sites_tool > publish_site(site_id, publishToWebflowSubdomain: true)`
2. After success: `Bash: touch src/main.js` (from the project root)
3. Vite's file watcher fires → `[vite] full reload` → browser auto-reloads → both code and DOM changes visible in one go.

The `touch` is the trick that ties Webflow publishes to Vite HMR. Without it, the user must manually reload to see DOM changes.

### Phase 6 — Verify

1. `npx webflow-vue detect <published url>` — expect route 2, no warnings.
2. Tell the user to check the `?debug` page on the live URL (the browser should
   already have reloaded).
3. Optional: `element_snapshot_tool` for visual confirmation.

A publish that `detect` cannot confirm is not a publish that worked.

---

## Graduating route 1 → route 2

This is the main path, not an edge case. Route 1 is the on-ramp: two CDN tags and
code typed straight into Webflow's custom code panel, no tooling, no build. When
that is worth keeping, this is the lift — the page's inline code becomes a real
project, and the user gets the live Webflow page running off their local Vite
with `?debug`.

**Migrate when** any of: the code is wanted in version control; two or more pages
share behaviour; the island needs npm dependencies or a build step; more than one
person edits it.

**Do not migrate** for size alone. A single 40-line widget in page custom code is
a feature of route 1, not a symptom. And it is the user's call either way — see
§ Ask, do not assume.

### What `?debug` actually needs

`?debug` is a **bridge feature**. Without the bridge installed on the page,
nothing reads the parameter and nothing loads from `localhost:3000`. You cannot
get HMR against the live page before the bridge exists, so do not promise it
before step 4.

The bridge's `debug` branch loads only Vite's client and `src/main.js`; it never
dereferences `STAGING_BUNDLE` or `PROD_BUNDLE`. So **the placeholders do not block
`?debug`** — a bridge installed with `SITE_ID` intact gives a working dev loop.
They block everyone else: outside `?debug` that bridge loads no bundle at all.

### The two implementations must never overlap — measured 2026-08-21

The route-1 tags and the bridge cannot both be live. Measured in jsdom against
the published `webflow-vue@0.2.0` global build, evaluated twice in one window:

- `A === B` is **false**, and so is `A.mountIsland === B.mountIsland`. Each
  evaluation of the IIFE closes over its own `mounted` WeakMap, so the
  idempotence guard **cannot see across copies**. The second copy does not skip;
  it logs a normal successful mount.
- Mounting the second copy on a root the first already owns throws
  **`Cannot read properties of null (reading 'nextSibling')`**, the island's
  rendered content is destroyed (`textContent` becomes empty), and it is dead —
  a click on a `v-on:click` element changes nothing. Vue additionally warns
  *"There is already an app instance mounted on the host container."*
- Control, same run: **one** copy mounted twice on the same root does not throw,
  the guard skips the second mount, and the island stays reactive. The cause is
  the two copies, not double-mounting as such.

**This shares its signature with the 0.0.4 double-mount bug**, which threw the
same `nextSibling` error before `mountIsland` had a guard at all. Do not read it
as a regression of that fix — the guard is working; it simply has no visibility
into a second copy of the library. The tell is `A === B` being false, not the
error text.

One caveat worth knowing: on a trivial island — interpolation only, no
directives — the same double mount does **not** throw. It silently leaves the
markup looking correct and inert. Absence of the crash is not evidence of
absence of the problem.

Remove the tags in the same sitting you install the bridge. And that is why the
bundle is built and uploaded **before** the tags come out: at the moment you
remove them, the bridge must already have something to load, or every visitor who
is not using `?debug` gets an unmounted page.

### The order

1. **Ask where the project goes** (§ Ask, do not assume) — a fresh directory is
   the default and the only path this procedure covers. Then
   `npx webflow-vue init <dir>` and `npm install`. Pin the same library version
   the page currently loads — `detect` prints it — so the migration changes one
   thing at a time.
2. **Lift the code.** Move the page's island code into `src/main.js` verbatim,
   converting the two globals to imports: `const { ref } = Vue` →
   `import { ref } from 'vue'`, and `const { mountIsland } = WebflowVue` →
   `import { mountIsland } from 'webflow-vue'`. Nothing else changes, and the
   Webflow markup does not change at all. Iterate locally — the live page is
   still serving its route-1 code and cannot see this project yet.
3. **Build and upload the bundle.** `npm run build` produces `dist/main.js`.
   Webflow assets reject `.js`, so upload it renamed to `bundle.txt` via
   `data_assets_tool`, and read back the asset ID. Do this for the staging asset
   at minimum; a prod domain needs its own.
4. **Install the bridge** (Phase 3) with `SITE_ID` and the asset IDs **filled in**.
   Page level only.
5. **Remove the route-1 script tags** from the page's freeform footer block —
   `get_page_freeform_code`, delete only those tags, write the remainder back
   with `set_page_freeform_code`. That block holds other things; a blind write
   destroys them.
6. **Publish, then `npx webflow-vue detect <url>`.** Expect route **2** and no
   warnings. `mixed` means step 5 did not take. `bridge-placeholders` means step 4
   went in unfilled, and the page is now blank for real visitors.
7. **Now the dev loop.** `npm run dev`, open the live page with `?debug`, and the
   page runs off local Vite with HMR. This is the payoff moment and the first
   point at which it is available.

Steps 4–6 are the only window where the page can be inconsistent, so do them in
one sitting and verify immediately.

**On a page with real traffic**, offer to do the whole thing on a duplicate page
first (`data_pages_tool > create_page` with `duplicateOf`), verify route 2 there,
and only then repeat steps 4–6 on the original. Costs one publish; removes the
window entirely.

## Examples

### Example 1: A single counter on a fresh page

**User:** "Set up Webflow Vue on the VUE MCP page of the Accessible Components site."

1. `detect` → route 0, no mustaches, nothing installed
2. One widget, one page → **route 1**. Say so, and say why, so the user can
   disagree before anything is written.
3. Plan: two script tags plus a mount call in the page footer block; insert
   `<div data-counter>{{ cups }}</div>` with a `v-on:click` Custom Element
4. Wait for "scaffold" → write freeform footer + insert markup
5. Wait for "publish" → `publish_site`
6. `detect` again → route 1, mount found, no warnings

### Example 2: Add a reactive variable to an existing route-2 mount

**User:** "Add a `status` computed that flips with `count`, and show it in the page."

1. `detect` → route 2, bridge pinned at 0.1.0
2. Discovery → bridge installed, mount root exists with the counter
3. Plan: add `status` computed in `main.js`, append `<p>Status: {{ status }}</p>` inside the root
4. Wait for "scaffold"
5. `Edit src/main.js` + `data_element_builder` in parallel
6. Wait for "publish"
7. `publish_site` + `touch src/main.js`
8. `detect` → no warnings; verify on the `?debug` URL

### Example 3: "Continue working on this project"

The prompt that this skill's structure exists to survive. There is no project in
the working directory and no context about one.

1. `detect` on the page the user names → **route 1**, webflow-vue@0.1.0, one mount
2. **Stop.** Do not run `init`. The correct answer is to edit the page's freeform
   footer block, and scaffolding a Vite project here would leave the user with a
   dev server, a bundle and a bridge that their working page does not use.
3. Route 1, R1.1 onward.

### Example 4: Publish-only

**User:** "Publish the changes I just made in Designer."

1. `detect` → confirm the route and that nothing is already broken
2. Plan: publish only, no mutations
3. Wait for "publish"
4. `publish_site` (+ `touch src/main.js` on route 2 only)
5. `detect` again

## Guidelines

### Building a CMS data shell — measured rules (2026-08-19, live API)

**The hard rule: never use a custom element as a wrapper inside a Collection
Item.** A `DOM` / `BY_CUSTOM_TAG` element there *breaks the CMS context* — every
descendant fails to bind with "Element is not inside a CMS context". Field
wrappers must be native (DivBlock etc.).

**Attributes inside a Collection Item do work** — verified live: `fs-list-field`
on a native DivBlock and `fs-list-element` on the DynamoItem both published.
They need `set_attributes` as a **second pass**, because native elements expose
no `attributes` setting at creation. (This also means Finsweet's per-item
attributes are fully scaffoldable through the API.)

**Default to class markers anyway:** `vf-c-<collection>` on the item wrapper,
`vf-f-<field>` on each field element, value via a bound `text`. One API call per
field instead of two, and a class cannot be stripped at publish. `data-field`
remains supported where it reads better.

```
DynamoItem
  DivBlock .vf-c-beans
    DivBlock .vf-f-name          ← text bound to Beans → Name
    DivBlock .vf-f-price         ← text bound to Beans → Price
    CMSCollection (multi-ref)    ← nested, see limit below
      DivBlock .vf-c-methods
        DivBlock .vf-f-name
```

**Nested Collection Lists render 5 items, measured.** A bean with six linked
brew methods published exactly five. Six top-level + 36 links became 41 rendered
groups, not 42. Anything past five must move to the item's template page and be
fetched.

**Multi-reference source** on a nested list:
`static_json` `{"collectionId":"<target>","fieldId":"<multiref field on parent>"}`
on the nested DynamoWrapper.

### Paginated lists: the parse must wait (measured 2026-08-19)

With 120 items in the collection:

| list config | rendered | reachable |
|---|---|---|
| no pagination, `limit 100` | 100 | 100 — the other 20 unreachable, **no** page links emitted |
| pagination on, 25/page | 25 | all 120, via `?<token>_page=N` |

Both states make a boot-time parse lie. Unpaginated it reported "100 of 100";
paginated it reported "25 of 25". Silent under-reporting is the default failure.

**`pagination` IS writable through the API** — shape `{ "itemsPerPage": N }`,
confirmed by reading it back after a Designer toggle and getting the identical
shape. What the API does **not** do is insert the Previous/Next elements, and
Webflow emits no `…_page` token and no `w-pagination-next` without them. So the
Designer toggle is required for its *elements*, not for its setting. Ask the user
to flip it (see § Designer-only steps).

**Then walk the pages before trusting any number.** `loadAllPages(collections)`
follows `.w-pagination-next`, fetches each page through the shared document
cache, and appends. Scope each page's parse to the list that owns the token —
otherwise every fetch re-ingests the other Collection Lists on the page and their
entries multiply.

**Consequence for the app:** anything derived from a paginated list is provisional
until the walk resolves. Hold a `catalogPending` flag, bind it in the UI, and
build the data as a `computed` over the collections ref so late pages flow
through. A one-shot `const beans = [...]` at module scope silently freezes the
first page.

**Alternative:** Finsweet's `load` does the same walk (`src/load/load.ts`) and is
the better choice once the item count makes our own walk unreasonable. It has the
same prerequisite — it returns early when no pagination elements exist.

### data_element_builder quirks that cost real time

- **`set_text` and `settings` inside `children[]` are silently ignored.** The
  element is created, the text is not applied — every TextBlock ends up holding
  "This is some text inside of a div block." Always do a second pass.
- **Children created in the same call as their parent are not yet in CMS
  context**, so their bindings fail. Create the parent, then the children.
- **The text setting key is `text`** (its *valueType* is `textContent`). Passing
  `textContent` as the key is rejected. Read the keys with
  `get_settings type:"query_settings"` rather than guessing from
  `get_bindable_sources`, which reports value types.
- **`set_text` (element tool) fails on Block-type elements** with "This element
  doesn't support text" — those need `set_settings` key `text` with
  `static_text`. It works on Heading, Paragraph and Link.
- **`type` is a reserved attribute name** on `BY_CUSTOM_TAG` `button` (it is
  accepted on `input`).
- **`BY_CUSTOM_TAG` `button` becomes a Link element**, published as `<a>`.

### Directives that survive publish — verified live 2026-08-19

On custom elements created via `BY_CUSTOM_TAG` with `set_attributes` at creation,
all of these reached the published page intact: `v-for`, `v-if`, `v-model`,
`v-model.number`, `v-bind:value`, `v-bind:key`, `v-on:click`, and `{{ }}` in
bound text. The earlier "Webflow strips every `v-*`" rule applies to
`data_whtml_builder`, not to this path.

### Designer-only steps: ask, do not engineer around (added 2026-08-19)

Some Webflow capabilities have no API surface. When one blocks the build, **stop
and ask the user for the one Designer action**, then continue. Do not invent a
workaround that changes the architecture without surfacing the choice — a
ten-second toggle beats a structural compromise the user never agreed to.

Known Designer-only actions:

| Need | Why the API can't | Ask the user to |
|---|---|---|
| Pagination **elements** on a Collection List | the `pagination` *setting* is writable via API (`{itemsPerPage:N}`) and takes effect, but `data_element_builder` has no pagination element type, so no `…_page` token and no `w-pagination-next` are emitted | select the Collection List → Settings (D) → Collection List Settings → **Paginate Items**, set items per page |
| Native Lightbox media items | not writable through any MCP surface | select each Lightbox link → Settings → add media |

How to ask: name the element, give the exact click path, say what you will do
once it exists, and then **verify by re-fetching the published page** rather than
trusting that it was done.

If the user declines or is unavailable, only then propose the workaround — and
state its cost explicitly (for pagination: offset-stacked lists cost one
duplicated item shell per 100 items).

### Preflight — decide whether to build at all (added 2026-08-19)

Run this before scaffolding anything. Finsweet Attributes (`list`) already ships
`combine`, `filter`, `sort`, `load`, `nest`, `pagination`, `select` — no-code and
free. Webflow Vue's value is custom logic, not CMS list plumbing. Webflow Vue is not sold
and competes with nothing, so reaching for Finsweet where it fits is the correct
call, never a concession.

Item count is **not** the trigger. Getting past the 100-item render cap is the one
thing our own `loadAllPages` does just as well. The real questions are how many
list behaviours the project needs, and whether the cache must survive navigation.

| What the project needs | Decision |
|---|---|
| Users navigate around the site, or several list behaviours (combine + nest + load + sort) | **Compose** — Finsweet owns the list; islands read it via `useFinsweetList` |
| One list, one behaviour, single-page visit, no dependency wanted | **Build** — `loadAllPages`, ~90 lines, zero dependencies |
| Both | Compose for the list, islands for the logic |
| Plain filter/sort and nothing else | **Recommend Finsweet alone and stop.** Say so plainly. |

**Measured on 120 beans in Chrome, 2026-08-19** — this is why cache lifetime is the
deciding factor:

| | first visit | return visit |
|---|---|---|
| Finsweet `fs-list-load="all"` | 5 fetches (a `?…_page=9999` probe to discover the total, then pages 2–5), **3052 ms** | **0 fetches, 26 ms** |
| our `loadAllPages` | 4 sequential fetches | 4 fetches again — its cache is an in-memory `Map` that dies with the page |

Their persistence is an IndexedDB store named after the site ID, versioned by the
site's last-publish timestamp (observed: db name = the Webflow site id, version
`1787153753000`). Republishing bumps the version and wipes it, so it cannot serve
stale content. We have no equivalent, and a 117× difference on a return visit is
not something to hand-wave.

Composing means depending on a third-party hosted script. State that cost to the
user rather than hiding it, and keep the build-from-scratch path real.

**Bridging constraint:** Finsweet bundles its own `@vue/reactivity` and we load
Vue from the CDN — two tracking contexts. A `computed` of ours reading a `ref` of
theirs evaluates once and never invalidates. Always bridge explicitly:
`listInstance.addHook('afterRender', …)` in, direct mutation of
`listInstance.filters.value` / `.sorting.value` / `.items.value` out.

### Relation modelling — when a loader is unavoidable (added 2026-08-19)

| Relation | Rendered where | Sync | Loader |
|---|---|---|---|
| Single reference | fields inline on the item | yes | no |
| Multi-ref, ≤5 targets | nested Collection List | yes | no |
| Multi-ref, >5, needed for **filtering** | fetch at boot, or restructure as a join collection, or a hand-maintained comma-separated slug field | no / yes | yes / no |
| Multi-ref, >5, needed only in **detail** | item template page, fetched on demand | no | yes, in the panel only |

Rules that follow:

- Nothing the filter reads may arrive after boot. A filter-level spinner is a
  symptom of the content being modelled wrong, not a feature.
- Request count must scale with user actions, not dataset size. Fetching per item
  at load is the standard failure (see `/filter-multiple-collections` on
  jan-blank-sandbox: 24 uncached requests plus a `setTimeout(…, 2000)`).
- When a relation must be fetched for a facet, **fetch the small side**. 40 beans
  asking for their methods is 40 requests; 6 methods asking for their beans is 6.
- Fetched markup can arrive unstyled — Webflow splits CSS per page. Carry the
  stylesheets over from the fetched document.


### Islands, state, and scope — decision rules (measured 2026-08-20)

The numbers below were measured with three islands on one page, against the
published build. Do not re-derive them; do not guess at them.

**One island per mount root, and a root is one element.** IDs are unique by
definition, so an island cannot be "reused" on a second element. If the same
thing appears in more than one place, that is the same `mountIsland` call with a
selector that matches more than once.

**There is one mount function.** `mountIsland(target, label, setup)` mounts
**every** match and returns an array, so `#id` matching once and `[data-x]`
matching three times are the same operation — nothing can silently under-mount.
`target` accepts a selector, an element, or a list of elements.

Whenever more than one element participates, prefer an attribute (`data-brew`)
over IDs: adding a fourth participant is then a Designer action with no code
change. (Before 0.1.0 there was also a `mountIslands`; it is gone — a one-letter
difference between two mount functions was a typo trap.)

**The setup callback runs once per island.** This is the rule everything else
follows from:

| declared | outside the callback | inside the callback |
|---|---|---|
| plain `const` | once | once per island — harmless |
| `computed` over shared state | 1 evaluation | N evaluations, identical values |
| **`ref`** | **shared** by every island | **independent** per island |
| anything using `el` / `index` | not available | required |

Measured with three islands: a `computed` declared outside ran its getter once
at mount and once per change; declared inside it ran three times and three
times, for the same rendered output.

> **outside = properties of the thing · inside = properties of this instance**

Privacy comes from *not returning* a value, not from where it is declared. A
constant belongs outside; per-card configuration read from `el.dataset` belongs
inside.

**Do not reach for `useSharedStore` by default.** Within a single script block a
plain `ref` declared outside the callback is already shared by every island —
they close over the same object. Recommending the store there teaches a concept
the user does not need. It earns its place in exactly three cases:

1. **Separate `<script>` blocks or embeds** — no shared lexical scope, and the
   named registry avoids hanging state off `window`.
2. **Separate files** in a bundled project that you would rather not couple with
   imports.
3. **Persistence** — `{ persist: true }` mirrors to sessionStorage, so state
   survives a page load or a client-side navigation. A plain ref resets.

**Client-side page transitions (barba, swup, Turbo).** The container is
replaced, so islands inside it are destroyed and the new markup is never
mounted — the page shows raw `{{ }}` after any in-site navigation. Wrap the
mounts in a function, call it once directly and again from the library's
after-enter hook. `mountIsland` records its roots and returns the existing apps
rather than mounting twice, so re-running is safe; without that guard Vue mounts
over itself and throws `Cannot read properties of null (reading 'nextSibling')`.
Island state resets across a transition because the elements are genuinely new —
use a persisted store for anything that must survive.

**The `=>` return trap.** `() => ({ cups })` and `() => { return { cups } }` are
equivalent. `() => { cups }` is a block, returns `undefined`, and the island
renders empty with only a `[Vue warn]` in the console. Prefer the explicit
`{ return { … } }` form in generated code.

**Refs need `.value` in the callback and never in the markup.** `{{ cups.value }}`
in a Designer text block renders nothing.

**Keep the mount root tight.** `<style>` blocks and `script.w-json` configs
inside a root are detached before mount and restored after (fixed in 0.0.6;
before that, styles were dropped and part of the page silently lost its CSS).
Sliders, lightboxes, dropdowns, nav and IX2 interactions are *not* protected —
never let an island wrap them. Check the subtree before choosing a root.

**Foreign `v-*` attributes break islands.** Any attribute starting with `v-` is
treated as a Vue directive. Other Webflow libraries use that prefix — socks-ui's
accordion ships `v-expand` — and Vue fails with "Failed to resolve directive"
and renders nothing. Check the subtree for `v-` attributes that are not yours.

### Bridge install constraints
- 2000-char limit on inline `source_code`
- No `<script>` tags or external `<script src=...>` allowed inside `source_code` — Webflow wraps it in a `<script>` itself
- `display_name` must be alphanumeric only (1–50 chars). No hyphens, dots, underscores.
- Page-level scripts must reference site-registered scripts by ID; always register first

### DOM insert constraints

**Rule 1 — anything carrying a directive must be a Custom Element, with its
attributes set at creation.** `data_element_builder`, `type: "DOM"`,
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

**Rule 8 — styling is never Webflow Vue's.** `vf-` and `data-vf-` name Webflow Vue's own
contract — mount ids, behavioural hooks. Presentation classes belong to the
project's design system. Never invent `vf-card`-style classes.

### CSS via the API
- `data_whtml_builder`'s `css` param rejects nested and descendant selectors
  (`.a .b`). Single-class selectors only — flatten, or create the style with
  `data_style_tool`.
- `data_style_tool > create_style` errors if the style already exists. Check
  first, or reuse; never overwrite a shared global from another page.

### Publish + HMR
- ALWAYS `touch src/main.js` immediately after `publish_site` returns success
- Without the touch, the user has to manually reload to see DOM changes
- Only fires when this skill drives the publish — direct publishes from the Webflow Designer UI bypass the trigger

### Failure modes

Run `npx webflow-vue detect <url>` before diagnosing any of these. It names most
of them from the published HTML alone, and it is faster than reasoning about what
the Designer shows.

- Visitors see literal `{{ braces }}` on a page → that markup is inside a Webflow
  **component**, so it ships on every page using that component, while the mount
  call only exists on one. `detect` reports `mustaches-without-library` on the
  other pages. Either move the markup out of the component, or load the island
  code site-wide.
- Directives missing from the published page but present in the Designer → markup
  was inserted with `data_whtml_builder`. Rebuild those elements as Custom Elements.
- An island renders empty text where the markup asked for a value → `setup()` does
  not return that key. Vue's dev build says so (`Property "x" was accessed during
  render but is not defined`); the prod build the bridge ships says nothing, so
  check the markup ↔ bundle contract directly.
- State does not sync between two islands that should share it → two Vue instances.
  `detect` reports `mixed`: a bridge and a static CDN tag are both installed.
- An island renders nothing and the console is silent → mount target existed but
  `setup()` never supplied what the markup asks for. Check the markup ↔ bundle
  contract before anything else.
- An island renders nothing and no `[webflow-vue:*]` log appeared at all → the embed
  or bundle ran before the markup existed. See Rule 6.
- 404 on `add_page_script` for a freshly created page → the custom-code block
  doesn't exist yet. Use `set_page_scripts` to create it.
- `update_registered_script` 404s → re-register the same `display_name` with a
  bumped version, then re-apply with `set_page_scripts`.
- 4xx on `register_inline_script` → almost always the alphanumeric `display_name` rule
- Designer tool returns "no element selected" or empty tree → Designer not open on the target page; ask user to switch
- Vite dev server not running → tell user to `npm install && npm run dev`
- mkcert cert not trusted by browser → WebSocket fails silently, HMR doesn't fire. Re-run `npm run dev` and accept the cert prompt.

### Companion skills

- `webflow-skills:custom-code-management` — lower-level script CRUD (this skill builds on it)
- `webflow-skills:safe-publish` — for production publish workflows that need plan-confirm-publish gates
- `webflow-skills:site-audit` — sanity-check page state before/after large MCP operations
