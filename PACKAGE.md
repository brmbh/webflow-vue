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

---

## 2. Exports

```js
import {
  mountIsland,
  useSharedStore,
  useWebflowCMS,
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
Supports both conventions — `data-field-*` attributes on the item, and
`<span data-field="name">` children whose text is CMS-bound.

`extractors` covers what an attribute cannot hold, generalised from FJC's
`collectionChildExtractors`: rich text, booleans-by-presence.

> **Rule:** parse at boot, before any mount, and keep the Collection List shell
> **outside every island**. Vue empties its mount target — a list inside an
> island becomes a render artifact of the thing that was supposed to read it.

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
