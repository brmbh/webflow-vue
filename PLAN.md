# Vueflow — public launch plan

Target: skill + package shippable — date reopened 2026-08-19, see RESUME.
Written 2026-08-16.

---

## ▶ RESUME HERE (last touched 2026-08-19)

**Phase 1 complete, gate green.** `npm test` → 5/5 passing.

### 2026-08-19 — Finsweet Attributes read, strategy changed

Read `github.com/finsweet/attributes` at source. Four findings that move the plan:

1. **They run on `@vue/reactivity` ^3.5.13** — `ref`, `computed`, `effect`,
   `watch`, `shallowRef`, `triggerRef`, across 21 files of `packages/list`.
   The market-leading Webflow filter library chose Vue's reactivity core. That
   is the answer to "why not vanilla JS", and it's citable from their
   `package.json`.
2. **`combine`, `load`, `nest` already ship.** `src/combine/index.ts` merges
   several Collection Lists in 44 lines. `src/load/load.ts` walks Webflow's
   native pagination via `fetchPage`, breaking the 100-item ceiling.
   `src/nest/index.ts` breaks the ~5-item nested limit. Filtering is not our
   differentiator — **compose, don't compete** (see `PACKAGE.md` §1).
3. **Their nested-limit workaround has a no-request path**: an item carrying a
   comma-separated slug list (`nest-slugs`) is matched against another list
   already on the page and cloned in. Fetching the item's template page is only
   the fallback. The slug field is hand-maintained — our skill can generate and
   drift-check it through the MCP.
4. **`fetchPage` caching is worth copying**: in-flight dedupe, IndexedDB
   persistence, and an IndexedDB version equal to the site's last-publish
   timestamp, so republishing wipes the cache. Plus `attachExternalStylesheets`,
   because Webflow's per-page CSS splitting means fetched markup arrives
   unstyled.

**Ship date reopened.** The launch is now a dependency of the demo video (which
opens with installing the skill), not a competitor to it. Sequence agreed with
Jan: helpers → installable package → CMS → wireframe → Figma → record.

**Decisions locked:**

| | |
|---|---|
| npm | **`vueflow`** — unscoped. Flagship packages go unscoped (`vite`, `vitest`, `prettier`); scopes are for satellites. Name verified available 2026-08-16. |
| GitHub | **`brmbh/vueflow`** — brmbh pivots from "agentic WordPress suite" to general agentic tool supply. Needs a one-line rebrand on `brmbh/site`. |
| Structure | **One package with a `bin`.** No separate CLI package — no version coordination for zero benefit. |
| `doctor` target | jan-blank-sandbox for our runs; `--site` flag for users. |

**Done today:** `PACKAGE.md` (surface + drift design), `PLAN.md`, skill rewritten
with 8 dated rules + failure modes, vitest/jsdom harness, `test/mountIsland.test.js`.
Superseded v-scope sweep files deleted.

**Live on jan-blank-sandbox:**
- `/vue/simple` — two islands, shared store, derived value. Markup is Designer
  elements; embed holds only the Vue code. **This is the canonical example.**
- `/vue/scopes` — the rejected v-scope sweep experiment. Delete or keep as a probe.

**Next: phase 2** — port helpers from `vueflow-ai` + `haufe-fjc`, better half of
each, now plus `fetchCollection` and `useFinsweetList` (see `PACKAGE.md` §2).
Also outstanding: `parseEntry` must scope field lookup to the item's own subtree
— today's unscoped `querySelectorAll('[data-field]')` merges nested-list child
fields into the parent. Two calls already made, flagged and unobjected:
1. `useWebflowCMS` takes FJC's extractor config — vueflow-ai's version can't do
   rich text or boolean-by-presence, which is why FJC needed its own parser.
2. `appGuards`' reporting handlers become the default, not opt-in. Silent failure
   is the documented outage mode; the package shouldn't ship the setting that caused it.

Gate: Loop A green. Then phase 3 (contract scanner) → Loop B.

**Uncommitted.** Nothing committed yet, branch `concept/markup-declared-scopes`
has zero commits. `src/main.js`, `hello.html`, `src/apps/hello.js` are Jan's own
pre-existing work — untouched.

---

## 0. Decisions — settled, see RESUME above

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 1 | npm name | `vueflow` · `@vueflow/core` · `@brmbh/vueflow` — **all four checked, all available** | `@vueflow/core`, scope reserved now. Room for `@vueflow/cli` later without renaming. |
| 2 | GitHub repo | `Schmandarine/vueflow` public · private-then-flip | Public from the first commit. History is clean; nothing to hide. |
| 3 | `doctor` target site | jan-blank-sandbox · a throwaway site | Sandbox for our runs; `doctor` takes `--site` so users point it at their own. |

Everything below assumes yes to all three. Say otherwise and I adjust.

---

## 1. Scope — what v0.1 is, and is not

**Ships:**

- `@vueflow/core` — `mountIsland`, `useSharedStore`, `useWebflowCMS`, `cleanDOMForVue`, `auditContract`, `verifyMount`, `configure`
- `npx vueflow` — `init`, `doctor`, `verify`
- `vueflow-scaffold` skill, rules dated and attributed
- Two live examples + one local harness
- README, LICENSE, CHANGELOG

**Explicitly not in v0.1:**

- `vueflow deploy` (build → upload → bump bridge → publish). Convenience, not differentiation. v0.2.
- Any presentation CSS. Ever.
- Anything wrapping `ref` / `computed` / `watch`.

---

## 2. The verification loops

Five loops, fastest first. Each has a green condition; nothing proceeds past a red one.

### Loop A — helpers (seconds, continuous)

`vitest` + `jsdom`. Real mounting, real clicks, real assertions — not shape checks.

- `mountIsland` skips cleanly when the target is absent
- `cleanDOMForVue` rescues `script.w-json` and restores it post-mount
- `useSharedStore` returns the identical object for the same name; `persist` survives a simulated reload
- `useWebflowCMS` parses both conventions and the extractor cases from FJC (rich text, boolean-by-presence)
- Two islands mounted separately, one store: mutation in A re-renders B

**Green:** all pass, coverage on every exported function.

### Loop B — the contract scanner (seconds, fixture-driven)

The differentiated piece, so it gets the harshest loop. **False positives kill trust faster than false negatives** — a linter that cries wolf gets disabled.

Fixtures = HTML snippet + exposed keys + expected findings. Must-cover cases:

- `v-for="item in items"` → `item` is NOT missing
- `v-for="(item, i) in items"` → neither `item` nor `i`
- nested `v-for`, aliases from ancestors only
- JS ambients — `Math`, `JSON`, `Date`, `Object`, `console` — never reported
- Vue globals — `$event`, `$refs`, `$el` — never reported
- `missingHelper(x)` → reported as `usage: 'call'`
- `missingFlag` in `v-if` → reported as `usage: 'value'`
- mustache expressions, not just bare identifiers
- member access: `store.missing` reports `store` only if `store` itself is absent

**Green:** zero false positives across the fixture set; every planted defect caught.

### Loop C — Webflow behaviour rules (minutes, live, the anti-rot loop)

`npx vueflow doctor` — the loop that keeps the package from silently rotting as
Webflow changes. For each rule in the skill, build a probe on a scratch page,
publish, fetch the **published** HTML, assert.

| Probe | Asserts |
|---|---|
| Custom Element with `v-on:click` | attribute present in published HTML |
| Native Paragraph + `set_attributes` afterwards | documents whether the MPS conflict still reproduces |
| Custom Element with `ref="x"` | still stripped at publish |
| Custom Element with `data-vf-ref="x"` | still survives |
| `whtml_builder` with `v-if` | still stripped |
| `{{ }}` in a native Text Block | still survives |
| Embed placed before vs after an island | mount succeeds only when after |

**Green:** every rule reproduces, or the rule text is corrected and re-dated.
This is the loop I run before shipping and that users run when something feels off.

### Loop D — end-to-end example (minutes)

`/vue/simple` rebuilt to consume the **published** package, not local source.
Fetch the published page in jsdom, load the bundle, mount, drive it:

- click `+` → island 1 shows `2`
- island 2's derived total updates to `€98` without island 2 knowing island 1 exists
- console carries zero `[vueflow:contract]` errors

**Green:** passes against the real published URL.

### Loop E — the skill (per change)

A skill nobody tested is a wish. Use the `skill-creator` eval harness: give an
agent a fresh task ("add a reactive island to this page") with only the skill,
then assert the produced page mechanically — the same assertions as Loop C.

- every directive-carrying element is a Custom Element
- no shorthand directives
- no bare `ref`
- embed placed after all islands
- no `vf-`-prefixed presentation classes invented

**Green:** clean run on a scratch page from a cold start.

### The insight that makes `verify` cheap

`vueflow verify` is **not** a second implementation. It is Loop D's harness
pointed at any page: fetch published HTML → jsdom → load bundle → let
`mountIsland` run its normal audit → collect `[vueflow:contract]` output → exit
non-zero if non-empty.

One scanner, three surfaces: browser console, CI gate, `doctor`. No drift
between them, because there is only one of them.

---

## 3. Phases and gates

| # | Phase | Gate to proceed |
|---|---|---|
| 1 | Repo prep — clean branch, delete the dead sweep files, vitest+jsdom harness, tsconfig/JSDoc types, CI workflow | `npm test` runs green on an empty suite |
| 2 | Port helpers from `vueflow-ai` + `haufe-fjc`, taking the better of each. FJC's `reportingWarnHandler` and extractor config are the better halves | **Loop A green** |
| 3 | `auditContract` + tailored fallbacks + `verifyMount` | **Loop B green** |
| 4 | CLI: `init`, `doctor`, `verify` | **Loop C green** on the sandbox |
| 5 | Rebuild `/vue/simple` on the published package; keep `/vue/scopes` as-is or delete | **Loop D green** |
| 6 | Skill rewrite for public use — no vault paths, no repo-relative assumptions | **Loop E green** |
| 7 | README, LICENSE, CHANGELOG, `npm pack` dry-run, README scrub for vault paths | dry-run tarball inspected, no private paths |
| 8 | Ship — npm publish, repo public, skill install line | **your explicit go** |

Phases 2 and 3 are the bulk. 4 depends on live Webflow and is the slowest wall-clock.

---

## 4. Where I stop and ask

Autonomous through phases 1–7. Hard stops:

1. **npm publish** — outward-facing and effectively irreversible
2. **Making the repo public**
3. **Merging to `main`** — per standing rule
4. **Driving a browser** — per standing rule. Loops A/B/D run in jsdom and need no browser; only a final visual check would.
5. **Deleting anything of yours** — `hello.html`, `src/apps/hello.js`, `src/main.js` are untouched
6. **Any rule that fails Loop C** — I correct the rule and flag it rather than quietly rewording

I'll report at each gate with the loop output, not a summary of it.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Webflow rules are sample-of-one — verified on one site, one plan tier | `doctor` runs on the user's own site; rules carry dates + the observation behind them |
| The MPS `[Conflict]` failure is unexplained | Loop C probes whether it still reproduces; skill avoids rather than explains it. Documented as open. |
| Scanner false positives make the audit untrusted | Loop B's green condition is zero false positives, not high recall |
| A one-week window with live-Webflow dependencies | Phase 4 is the only wall-clock-bound phase; phases 1–3 and 6 need no Webflow |
| `README`/vault-path leakage into a public repo | Phase 7 scrub is an explicit gate; dashboard already tracks this as a todo |

---

## 6. Honest call on sequencing

Value per line runs **skill → verify → helpers**, which is the inverse of effort.
But helpers are the dependency for both others, so they get built first for
mechanical reasons — not because they're the valuable part. If the week runs
short, the thing to cut is `useWebflowCMS` extractor breadth, not the audit.
