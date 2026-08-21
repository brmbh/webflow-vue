# Filter Showoff — Live Demo Runbook

The signature Webflow Vue demo: ask Claude in chat to add a live filter input over the existing CMS list. Claude scaffolds via Webflow MCP + edits the Vue source, publishes, the page auto-reloads via Vite HMR, and the list filters as you type. **No manual Designer edits, no manual reload.**

---

## Pre-flight (do before the meeting)

Verify the page is in the **clean post-rollback state** (no filter present yet):

- Open `https://accessible-components-site-bdd137.webflow.io/vue-mcp?debug` in a browser
- Page should show: counter, +1/-1/+5 buttons, Doubled, Status, "From useWebflowCMS() — 10 posts" with the unfiltered v-for list, greeting line
- **No `<input>` element above the list** — that's the rollback marker
- Vite dev server running: `cd ~/Development/personal/vueflow-ai && npm run dev`
- Webflow Designer open on the VUE MCP page (required for `element_builder` calls)
- Local repo is on the right branch / commit (whatever is "clean Webflow Vue demo state")

---

## The prompt to give Claude

Type this verbatim in a Claude Code session inside `~/Development/personal/vueflow-ai`:

> Add a live filter input above the blog post list on the VUE MCP page of Accessible Components. Use a Custom Element `<input>` with `v-model` bound to a new `query` ref, add a `filteredPosts` computed that case-insensitive-filters `collections.blogPosts` by name, repoint the v-for to `filteredPosts`, and update the h3 count to show `filtered / total`. Publish + HMR reload as usual.

Optional shorter form once the boilerplate's idioms are well-known:

> Scaffold the filter showoff on VUE MCP.

---

## What Claude should do (verification cheat sheet)

If Claude diverges from this, redirect it. Expected MCP call sequence:

1. **Discovery** (queries — no mutations):
   - `mcp__webflow__element_tool > query_elements` against the v-for wrapper to grab IDs of the wrapper `<div>`, the `<ul>`, the `<li>` (with `v-for`), and the `<h3>`.
2. **Code edit** (`Edit src/main.js`): inside the existing `setup()`, add:
   ```js
   const query = ref('');
   const filteredPosts = computed(() => {
     const list = collections.value.blogPosts || [];
     const q = query.value.trim().toLowerCase();
     return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
   });
   ```
   And add `query, filteredPosts` to the returned object.
3. **DOM scaffold** (`mcp__webflow__element_builder`): insert a Custom Element input as a sibling **before the `<ul>`**:
   ```js
   {
     type: "DOM",
     set_dom_config: { dom_tag: "input" },
     set_attributes: { attributes: [
       { name: "v-model", value: "query" },
       { name: "type", value: "text" },
       { name: "placeholder", value: "Filter posts…" },
       { name: "data-webflow-vue-bind", value: "query" }
     ]}
   }
   ```
4. **Update v-for source** (`mcp__webflow__element_tool > add_or_update_attribute`): on the `<li>`, set `v-for` value to `post in filteredPosts`.
5. **Update h3 text** (`mcp__webflow__element_tool > set_text`): change to `From useWebflowCMS() — {{ filteredPosts.length }} / {{ collections.blogPosts ? collections.blogPosts.length : 0 }} posts`.
6. **Publish**: `mcp__webflow__data_sites_tool > publish_site` with `publishToWebflowSubdomain: true`.
7. **Poll until the new HTML is live** (curl + grep for `v-model="query"` and `v-for="post in filteredPosts"`).
8. **Trigger HMR reload**: `touch src/main.js`.

---

## Expected live result

After the auto-reload:

- New `<input>` above the post list with placeholder `"Filter posts…"`
- The h3 reads `From useWebflowCMS() — 10 / 10 posts`
- Typing in the input filters the list as you type (case-insensitive substring match on `name`)
- Counter still works (clicking +1/-1/+5 updates the count + greeting line; the filter is independent state)

**Try while presenting:**
- Type `"cms"` → filters to posts containing "cms" (8/10 posts)
- Type `"security"` → filters to 1 post
- Clear the input → list returns to all 10
- Click +1 a few times to demonstrate Vue reactivity is intact and orthogonal

---

## Talking points for the demo

- **One prompt** scaffolded both the Webflow Designer DOM (input, v-for source, count) AND the Vue source (ref + computed). Codebase is the source of truth for behavior; Webflow stays the source of truth for layout.
- **No manual Designer touches** — Claude drove `element_builder` over MCP.
- **No manual reload** — Vite HMR fires the full-reload after the publish completes (`touch src/main.js` is the trigger).
- **Custom Element default** — the input is a `type: "DOM"` Custom Element with `dom_tag: "input"`, not a Webflow Form Input. Gives clean tag preservation, no native-element baggage. (Optional: contrast with the WHTML `<button>` → `<a>` rewrite pitfall we avoided.)
- **CMS data flows in via convention** — `useWebflowCMS()` parses `data-field-*` attrs from the rendered Webflow Collection List into a reactive `collections` object. The filter's `filteredPosts` computed reads from `collections.blogPosts` like any other Vue source.

---

## Rollback (run after the demo or pre-next-meeting)

To restore the clean pre-demo state:

1. Capture the input element ID via `query_elements` filter on `v-model="query"`.
2. `element_tool > remove_element` on that input.
3. `element_tool > add_or_update_attribute` on the v-for `<li>`: set `v-for` back to `post in collections.blogPosts`.
4. `element_tool > set_text` on the `<h3>`: revert to `From useWebflowCMS() — {{ collections.blogPosts ? collections.blogPosts.length : 0 }} posts`.
5. Edit `src/main.js`: remove `query`, `filteredPosts`, and the corresponding return-object keys.
6. `data_sites_tool > publish_site`.
7. Poll for the input + filteredPosts markers to disappear from live HTML.
8. `touch src/main.js`.

---

## Notes & known caveats

- The new `<button>`s render without `.w-button` styling (browser defaults). Doesn't affect the filter demo, but worth styling later.
- `v-model` works on Webflow-rendered DOM (verified live 2026-05-05). Long-form `v-bind:value` + `v-on:input` is a fallback if Vue version mismatch ever causes issues.
- The orphan `#vue-test` div outside `#app` is harmless leftover from earlier directive testing — leave it.
