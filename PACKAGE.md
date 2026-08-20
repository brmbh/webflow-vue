# @vueflow/core — package surface (draft)

Draft for review. Nothing here is built yet except the pieces that already exist
in `src/` and in `haufe-fjc/src/`.

---

## 1. The boundary

**Vueflow owns what is only true because Webflow is underneath. Vue stays Vue.**

The test any proposed export has to pass:

> A Vue developer reads a Vueflow island and sees plain Vue — `setup()`, `ref`,
> `computed`, composables. Vueflow supplied the mount and the Webflow plumbing,
> nothing else.

| In | Out |
|---|---|
| Mounting onto Designer-rendered DOM | Anything wrapping `ref` / `computed` / `watch` |
| Protecting Webflow's runtime from Vue's compiler | Presentation classes or a stylesheet |
| Reading Webflow CMS out of the DOM | A component library |
| Cross-island state (forced by islands) | A router, a build tool, an SSR story |
| The markup ↔ bundle contract | Anything that makes people learn Vueflow instead of Vue |

**No presentation classes ship.** Styling belongs to the Semantic Framework. A
package that ships CSS is a UI kit, which is a different product.

**Functions, not a class.** There is no instance state to hold. `Vueflow.init()`
would be ceremony around three named imports.

### Alongside Finsweet Attributes — compose, and collaborate

Established 2026-08-19 by reading their source. Finsweet's `list` package ships
`combine`, `filter`, `sort`, `load`, `nest`, `pagination`, `tabs`, `select` —
no-code, free, mature, and internally powered by `@vue/reactivity` ^3.5.13.

This is not a competitive position. Vueflow is the FJC hybrid pattern extracted
and open-sourced; it isn't sold, so there is no market to defend. Finsweet solved
the CMS list plumbing well, and reaching for it where it fits is the correct
engineering call, not a concession. Collaboration is welcome wherever it helps.

The split that holds:

| | Owner |
|---|---|
| Loading past 100 items, combining lists, nesting past 5, pagination | **Finsweet** |
| Everything derived from those items, and every interaction | **Vueflow** |

Their ceiling is that you get the behaviours they shipped, configured by
attributes. The moment a requirement isn't in the attribute list — pricing that
depends on the filter, a configurator, a cart surviving navigation, conditional
UI — you leave their system and write JS against someone else's DOM. That gap is
what this package covers.

The skill decides per project (see the preflight table in `SKILL.md`), and is
expected to answer "just use Finsweet, you don't need this" when that's true.


---

## 2. Exports

```js
import {
  mountIsland,
  useSharedStore,
  useWebflowCMS,
  fetchCollection,
  useFinsweetList,
  cleanDOMForVue,
  auditContract,
  verifyMount,
  configure,
} from '@vueflow/core';
```

### `mountIsland(target, options)`

One `createApp` per interactive region. Skips itself when the mount point is not
on the current page, so one bundle serves a whole site.

```js
mountIsland('#vf-cart', {
  label: 'cart',                 // console identity, defaults to the selector
  setup: () => { … },            // ordinary Vue setup
  audit: true,                   // contract audit at mount (default: debug only)
});
```

Does, in order: resolve target → bail if absent → `cleanDOMForVue` sweep →
`auditContract` → `createApp` with reporting handlers → mount → restore swept
nodes → `verifyMount`.

### `useSharedStore(name, initialState, { persist })`

Named module-scoped `reactive()` singletons. Same name → same object. Optional
`sessionStorage` persistence for cross-page state.

Exists because islands are separate apps with separate scopes: a store neither
app owns is the only thing they can share. It is the price of islands, not an
independent feature.

### `useWebflowCMS({ selector, extractors })`

Parses Webflow-rendered Collection Lists into a reactive `collections` object.

Three conventions, freely mixable:

| Marker | Where it works |
|---|---|
| `data-field-collection` / `data-field` attributes | static markup, outside Collection Lists |
| `vf-c-<collection>` / `vf-f-<field>` **classes** | everywhere, and the **only** option inside a Collection Item |
| nested groups | a nested Collection List becomes an array on the parent entry |

Both marker styles work inside a Collection Item. The class convention is the
**default**, not a necessity: it needs one API call per field instead of two,
and a class cannot be stripped at publish.

The one hard constraint, measured 2026-08-19: **a custom element inside a
Collection Item breaks the CMS context**, so nothing below it can bind a field
("Element is not inside a CMS context"). The field wrapper must therefore be a
native element. Attributes on native elements inside a CMS item are fine — they
just need `set_attributes` as a second pass, since native elements expose no
`attributes` *setting* at creation time.

`extractors` covers what an attribute cannot hold or what a string is the wrong
type for, generalised from FJC's `collectionChildExtractors`: rich text,
booleans-by-presence, numbers, delimited lists. Without them every field is a
string, and the app ends up re-parsing prices and dates out of rendered text on
every keystroke — the pathology `/filter-multiple-collections` shows with its
hand-written AM/PM date splitter.

Field lookup is scoped to the item's own subtree. A nested Collection List
inside an item is a separate group, not extra fields on the parent — an
unscoped `querySelectorAll('[data-field]')` silently merges child fields into
the parent and the last one wins.

> **Rule:** parse at boot, before any mount, and keep the Collection List shell
> **outside every island**. Vue empties its mount target — a list inside an
> island becomes a render artifact of the thing that was supposed to read it.

### `fetchCollection(url, { selector, extractors, cache })`

Fetches a Webflow-rendered page, parses it with the same conventions as
`useWebflowCMS`, and returns the entries. Same output shape, different source.

```js
const { entries, pending, error } = fetchCollection(`/beans/${slug}`, {
  selector: '[data-field-collection="guides"]',
  extractors: { steps: richText('.w-richtext') },
});
```

Origin: FJC's `fetchModulesForOrderable`, itself a hardened version of the
jQuery trick every Webflow filter build uses —
`$(target).load('/collection/slug .fragment')`.

**Cache design, taken from Finsweet** (`@finsweet/attributes-utils`,
`helpers/fetch.ts`, Apache-2.0 — read 2026-08-19, worth copying rather than
reinventing):

- an in-flight `Map` keyed by URL, so N callers wanting one page make one request
- IndexedDB persistence, so the cache survives navigation and sessions
- **the IndexedDB version number is the site's last-publish timestamp**, scraped
  from the `<!-- Last Published: … -->` comment Webflow injects into every page.
  Republish → version bumps → the store is wiped. Cache invalidation with zero
  configuration and no way to serve content from before the last publish.

> **Gotcha:** Webflow now splits CSS per page, so markup fetched from another
> page can arrive unstyled. Finsweet carries an `attachExternalStylesheets()`
> step for exactly this. Anything we inject from a fetched document needs the
> same treatment.

Exists because of a hard Webflow ceiling: a Collection List renders at most 100
items, a *nested* list about five. A collection template page has neither limit
for the item it belongs to — so a relation too large for the list page moves to
its own page and is pulled in on demand.

> **Rule:** filter-relevant data belongs on the page, synchronously. Only detail
> belongs behind a fetch. The standard failure — live on the sandbox at
> `/filter-multiple-collections` — is AJAX-ing per item what should have been
> rendered once: 24 uncached requests before filtering can begin, and a
> two-second timer hoping they finished.

When a relation must be fetched for a *facet*, fetch the small side. Forty beans
asking which methods they have is forty requests; six methods asking which beans
they have is six.

### `useFinsweetList(instance)`

Mirrors a Finsweet Attributes list instance into a Vueflow shared store, so
islands can read and drive a list that Finsweet owns.

```js
const { items, filters } = useFinsweetList('beans');
```

Finsweet's `list` package already solves the Webflow plumbing properly: loading
past 100 items by walking native pagination, combining several Collection Lists,
nesting past the five-item limit, load-more and infinite scroll. Rebuilding that
to own it would be vanity.

Their seam is public and documented:

```js
window.FinsweetAttributes.push(['list', (listInstances) => { … }]);
listInstance.addHook('afterRender', (items) => { … });   // subscribe
listInstance.filters.value.groups[0].conditions.push({ … });  // drive
listInstance.sorting.value = { fieldKey: 'price', direction: 'asc' };
```

> **Constraint:** Finsweet bundles its own `@vue/reactivity`; we load Vue from
> the CDN. Two copies, two dependency-tracking contexts — a `computed` of ours
> reading a `ref` of theirs evaluates once and never invalidates. So the bridge
> must be explicit: subscribe with `addHook`, write into our own `reactive()`.
> Never assume transparent interop. *(Reasoned from their bundling, not yet
> measured — verify before relying on it.)*

### `cleanDOMForVue(root, label)`

Pre-mount sweep. Detaches `script.w-json` lightbox configs and `<style>` blocks
before Vue compiles, re-attaches the rescued nodes after mount.

### `auditContract(root, exposed, options)` · `verifyMount(el, label)` · `configure(opts)`

See §3.

---

## 3. Markup drift and error handling

This is the part worth arguing about. The 2026-08-11 FJC outage was not a
missing helper — it was the markup and the bundle disagreeing, silently. No
convenience helper fixes that.

### Why it cannot be fixed the way petite-vue fixes it

petite-vue wraps **every individual expression** in try/catch, so a broken
binding kills one binding. Vue's render function is monolithic: one bad
expression renders nothing. That is structural and not retrofittable.

`guardTemplateApi` in FJC gets close, and documents its own hole: a missing
*value* (`v-if="missingFlag"`) resolves to a no-op **function**, functions are
truthy, so it takes the wrong branch. You cannot have one value be both callable
and falsy.

**But that hole only exists because the guard doesn't know how the key is used.**
It is not a language limitation — it is missing information. And the information
is sitting right there in the markup.

### The design: one scanner, three places

At mount time — *before* Vue compiles and wipes — `mountIsland` holds both sides
of the contract: the untouched markup, and the object `setup()` returned. So it
can diff them.

```js
scanContract(root)
// → Map<identifier, { usage: 'call' | 'value', nodes: Element[] }>
```

It walks the subtree collecting expressions from `v-*` attributes and `{{ }}`
interpolation, extracts root identifiers, and records **how each is used** —
followed by `(` means call, otherwise value.

Subtract, so false positives stay near zero:

- keys of the `setup()` return
- `v-for` aliases introduced by any ancestor (`(item, i) in items` → `item`, `i`)
- JS ambients — `Math`, `JSON`, `Object`, `Number`, `String`, `Date`, `console`, `window`
- Vue template globals — `$event`, `$refs`, `$el`, `$slots`

What survives is a genuine disagreement.

**Layer 1 — report.** Name the missing key, its usage, and what the bundle does
expose. Precise enough to fix without a debugger:

```
[vueflow:contract] "configurator" — markup calls hasSequenceConflict(), which this
  bundle does not expose. Exposed: courses, selected, total, hasSelectionWarning.
  3 elements affected. Run `npx vueflow verify` before deploying.
```

**Layer 2 — degrade correctly.** The audit knows the usage, so the fallback can
match it. This closes the hole FJC documented as unfixable:

| Markup | Fallback | Result |
|---|---|---|
| `v-if="missingHelper(x)"` | `() => false` | else-branch renders |
| `v-if="missingFlag"` | `undefined` | **correct** branch renders |
| `{{ missingValue }}` | `undefined` | renders empty |

Same Proxy mechanism already proven in `appGuards.js`. The only change is that
the audit tells it what shape to return.

**Layer 3 — canary.** `verifyMount(el, label)`: if a mount produced no children,
say so loudly. Catches whatever the first two layers miss.

**Layer 4 — pre-deploy.** `npx vueflow verify` runs **the same scanner** against
published pages in CI. One definition of "the contract", not two implementations
that drift apart.

```
npx vueflow verify --site <id> --pages /brew-lab,/vue/simple
```

Fetches published markup, loads the built bundle, diffs, exits non-zero on
mismatch. This is the layer that would have caught 2026-08-11 before deploy.

### Error handling

- `warnHandler` **filters, never silences.** Template-contract failures escalate
  to `console.error`; expected hybrid noise stays suppressed. (FJC's
  `reportingWarnHandler` already does this — lift it.)
- `errorHandler` always reports, with island label and lifecycle phase.
- `configure({ onError })` pipes both to Sentry or anywhere else.
- All console output stays prefixed `[vueflow:*]`.

---

## 4. The skill

Agent-facing rules. Every one cost real debugging time to find and is
undiscoverable from docs.

| # | Rule | Established |
|---|---|---|
| 1 | Any element carrying a Vue directive must be a **Custom Element** (`type: "DOM"`), attributes set at creation | 2026-08-16 |
| 2 | **Long-form directives only** — `v-on:click`, `v-bind:class`. Shorthands are stripped | pre-existing |
| 3 | **`ref` is unusable** — Webflow stores it, then strips it at publish. Use `data-vf-ref` | 2026-08-16 |
| 4 | `{{ }}` survives on **any** element type — only attributes force Custom Element | 2026-08-16 |
| 5 | **Never `whtml_builder`** for directive-carrying markup — it silently drops every `v-*` | 2026-08-16 |
| 6 | A code embed's scripts run at parse time → the embed must sit **after** every island it mounts | 2026-08-16 |
| 7 | CMS parse happens **before any mount**; Collection List shell stays **outside** every island | pre-existing |
| 8 | Apply the bridge **page-level only** — site + page double-mounts Vue | pre-existing |
| 9 | Fresh pages 404 on `add_page_script` → use `set_page_scripts` to create the block | pre-existing |
| 10 | Webflow assets reject `.js` → upload the bundle as `.txt` | pre-existing |

**Unresolved:** `set_attributes` on native element types (Link, Paragraph)
intermittently fails with `MPS rejected update … [Conflict]` and does not clear
on retry or cooldown. Rule 1 avoids it rather than explaining it.

### Why the rules must be dated

These encode **undocumented Webflow behaviour**. Rule 3 is written down nowhere —
it was found by reading an attribute back and diffing against published HTML.
Webflow can change any of it in a release, silently.

A package asserting stale workarounds is worse than no package, because people
stop checking. So:

- every rule carries the date and the observation that established it
- `npx vueflow doctor` re-verifies each rule against a live Webflow site by
  building a probe page, publishing, fetching, and asserting. `/vue/simple` is
  already the shape of that probe.

---

## 5. CLI

```
npx vueflow init      # scaffold config + install the agent skill into .claude/skills
npx vueflow verify    # diff published markup against the built bundle (CI gate)
npx vueflow doctor    # re-verify the §4 rules against live Webflow behaviour
npx vueflow deploy    # build → upload .txt asset → bump bridge → apply → publish
```

`deploy` automates the loop currently written out by hand in the vault dashboard.

---

## 6. Build order

Ranked by value per line, which is roughly the inverse of effort:

1. **The skill** — highest value, lowest effort. Pure encoded knowledge.
2. **`verify` + the scanner** — addresses the failure mode that actually costs money.
3. **The helpers** — real but ordinary. Two codebases already converged on them.
4. **`deploy`** — convenience.

Helpers first is the tempting order and probably the wrong one.
