var WebflowVue = function(exports, vue) {
  "use strict";
  const RESTORE_MARK = "data-webflow-vue-restore";
  const SWEEP_SELECTOR = 'script.w-json, script[type="application/json"], style';
  function cleanDOMForVue(rootEl, label = rootEl.id || "island") {
    const rescued = [];
    const marked = /* @__PURE__ */ new Map();
    for (const node of rootEl.querySelectorAll(SWEEP_SELECTOR)) {
      const parent = node.parentElement;
      let key = null;
      if (parent && parent !== rootEl) {
        key = marked.get(parent) ?? String(marked.size);
        if (!marked.has(parent)) {
          marked.set(parent, key);
          parent.setAttribute(RESTORE_MARK, key);
        }
      }
      rescued.push({ node, key, index: parent ? [...parent.childNodes].indexOf(node) : 0 });
      node.remove();
    }
    if (rescued.length) {
      const counts = rescued.reduce((acc, { node }) => {
        const kind = node.tagName === "STYLE" ? "style" : "w-json";
        acc[kind] = (acc[kind] || 0) + 1;
        return acc;
      }, {});
      console.log(
        `[webflow-vue:clean] "${label}" swept ${rescued.length} node(s) before mount — restored after`,
        counts
      );
    } else {
      console.log(`[webflow-vue:clean] "${label}" clean — no Webflow runtime nodes inside mount target`);
    }
    return {
      rescuedCount: rescued.length,
      /** Re-attach rescued nodes after Vue has taken over the subtree. */
      restore() {
        let displaced = 0;
        for (const { node, key, index } of rescued) {
          const parent = key === null ? rootEl : rootEl.querySelector(`[${RESTORE_MARK}="${key}"]`);
          if (!parent) {
            rootEl.appendChild(node);
            displaced += 1;
            continue;
          }
          const at = parent.childNodes[index];
          parent.insertBefore(node, at ?? null);
        }
        for (const parent of rootEl.querySelectorAll(`[${RESTORE_MARK}]`)) {
          parent.removeAttribute(RESTORE_MARK);
        }
        if (rescued.length) {
          console.log(
            `[webflow-vue:clean] "${label}" restored ${rescued.length} node(s) post-mount` + (displaced ? ` — ${displaced} to the island root, original parent gone` : "")
          );
        }
      }
    };
  }
  const mounted = /* @__PURE__ */ new WeakMap();
  function resolveRoots(target) {
    if (typeof target === "string") return [...document.querySelectorAll(target)];
    if (!target) return [];
    if (target.nodeType === 1) return [target];
    return [...target];
  }
  function mountOne(root, label, setup, index) {
    if (mounted.has(root)) {
      console.log(`[webflow-vue:island] "${label}" already mounted — skipped`);
      return mounted.get(root);
    }
    const t0 = performance.now();
    const sweep = cleanDOMForVue(root, label);
    const app = vue.createApp({ setup: () => setup(root, index) });
    app.config.errorHandler = (err, _vm, info) => console.error(`[webflow-vue:island] "${label}" runtime error (${info})`, err);
    app.mount(root);
    sweep.restore();
    mounted.set(root, app);
    console.log(`[webflow-vue:island] "${label}" mounted in ${(performance.now() - t0).toFixed(1)}ms`);
    return app;
  }
  function mountIsland(target, label, setup) {
    const roots = resolveRoots(target);
    const where = typeof target === "string" ? target : "<element>";
    if (!roots.length) {
      console.log(`[webflow-vue:island] "${label}" skipped — nothing matches ${where}`);
      return [];
    }
    const many = roots.length > 1;
    const apps = roots.map((root, i) => mountOne(root, many ? `${label}[${i}]` : label, setup, i)).filter(Boolean);
    if (many) {
      console.log(`[webflow-vue:island] "${label}" mounted on ${apps.length}/${roots.length} match(es) of ${where}`);
    }
    return apps;
  }
  function unmountIsland(target) {
    let n = 0;
    for (const root of resolveRoots(target)) {
      if (!mounted.has(root)) continue;
      mounted.get(root).unmount();
      mounted.delete(root);
      n += 1;
    }
    if (n) console.log(`[webflow-vue:island] unmounted ${n} island(s)`);
    return n;
  }
  const STORAGE_PREFIX = "webflow-vue:store:";
  const registry = /* @__PURE__ */ new Map();
  function hydrate(name) {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + name);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      console.log(`[webflow-vue:store] "${name}" hydrated from sessionStorage`, parsed);
      return parsed;
    } catch (err) {
      console.warn(`[webflow-vue:store] "${name}" hydration failed — starting fresh`, err);
      return null;
    }
  }
  function useSharedStore(name = "default", initialState = {}, options = {}) {
    const { persist = false } = options;
    if (registry.has(name)) {
      console.log(`[webflow-vue:store] "${name}" → existing instance reused (cross-island link established)`);
      return registry.get(name);
    }
    const persisted = persist ? hydrate(name) : null;
    const store = vue.reactive({ ...initialState, ...persisted });
    registry.set(name, store);
    console.log(`[webflow-vue:store] "${name}" created`, JSON.parse(JSON.stringify(store)), { persist });
    vue.watch(
      store,
      (state) => {
        const snapshot = JSON.parse(JSON.stringify(state));
        console.log(`[webflow-vue:store] "${name}" mutated →`, snapshot);
        if (!persist) return;
        try {
          sessionStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(snapshot));
        } catch (err) {
          console.warn(`[webflow-vue:store] "${name}" persist failed`, err);
        }
      },
      { deep: true }
    );
    return store;
  }
  function resetSharedStore(name = "default") {
    sessionStorage.removeItem(STORAGE_PREFIX + name);
    console.log(`[webflow-vue:store] "${name}" sessionStorage cleared — reload to re-init`);
  }
  const FIELD_PREFIX = "field";
  const GROUP_KEY = "collection";
  const GROUP_CLASS_PREFIX = "vf-c-";
  const FIELD_CLASS_PREFIX = "vf-f-";
  const GROUP_SELECTOR = `[data-field-collection],[class*="${GROUP_CLASS_PREFIX}"]`;
  const FIELD_SELECTOR = `[data-field],[class*="${FIELD_CLASS_PREFIX}"]`;
  function markerFrom(el, prefix) {
    for (const cls of el.classList) {
      if (cls.startsWith(prefix) && cls.length > prefix.length) return cls.slice(prefix.length);
    }
    return null;
  }
  function groupNameOf(el) {
    return el.dataset.fieldCollection || markerFrom(el, GROUP_CLASS_PREFIX);
  }
  function fieldNameOf(el) {
    return el.dataset.field || markerFrom(el, FIELD_CLASS_PREFIX);
  }
  function isGroup(el) {
    return groupNameOf(el) != null;
  }
  function stripFieldPrefix(datasetKey) {
    if (!datasetKey.startsWith(FIELD_PREFIX) || datasetKey.length === FIELD_PREFIX.length) {
      return null;
    }
    const rest = datasetKey.slice(FIELD_PREFIX.length);
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  function kebabToCamel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  function closestGroup(el) {
    for (let node = el; node; node = node.parentElement) {
      if (node.matches(GROUP_SELECTOR) && isGroup(node)) return node;
    }
    return null;
  }
  function childGroups(el) {
    return [...el.querySelectorAll(GROUP_SELECTOR)].filter(
      (candidate) => isGroup(candidate) && closestGroup(candidate.parentElement) === el
    );
  }
  function ownFieldElements(el) {
    return [...el.querySelectorAll(FIELD_SELECTOR)].filter(
      (fieldEl) => fieldNameOf(fieldEl) != null && closestGroup(fieldEl) === el
    );
  }
  function parseEntry(el, extractors2) {
    const entry = {};
    for (const [key, value] of Object.entries(el.dataset)) {
      const fieldKey = stripFieldPrefix(key);
      if (fieldKey) entry[fieldKey] = value;
    }
    const groupName = groupNameOf(el);
    if (groupName) entry[GROUP_KEY] = groupName;
    const elementsByKey = /* @__PURE__ */ new Map();
    for (const fieldEl of ownFieldElements(el)) {
      const key = kebabToCamel(fieldNameOf(fieldEl));
      if (!elementsByKey.has(key)) elementsByKey.set(key, fieldEl);
      entry[key] = fieldEl.textContent.trim();
    }
    for (const [key, extract] of Object.entries(extractors2)) {
      const element = elementsByKey.get(key) ?? null;
      entry[key] = extract({ raw: entry[key], element, item: el, key });
    }
    for (const groupEl of childGroups(el)) {
      const nested = parseEntry(groupEl, extractors2);
      const group = nested[GROUP_KEY];
      if (!group) continue;
      const key = kebabToCamel(group);
      (entry[key] || (entry[key] = [])).push(nested);
    }
    return entry;
  }
  function useWebflowCMS({ selector = GROUP_SELECTOR, extractors: extractors2 = {}, root = document } = {}) {
    var _a;
    const collections = vue.ref({});
    const all = [...root.querySelectorAll(selector)];
    const roots = all.filter((el) => isGroup(el) && closestGroup(el.parentElement) == null);
    for (const el of roots) {
      const entry = parseEntry(el, extractors2);
      const group = entry[GROUP_KEY];
      if (!group) continue;
      const key = kebabToCamel(group);
      ((_a = collections.value)[key] || (_a[key] = [])).push(entry);
    }
    console.log(
      `[webflow-vue:cms] parsed ${roots.length} item element(s)` + (all.length !== roots.length ? ` (+${all.length - roots.length} nested)` : "") + " into collections:",
      Object.fromEntries(Object.entries(collections.value).map(([k, v]) => [k, v.length]))
    );
    return { collections };
  }
  function parseItemElement(el, extractors2 = {}) {
    const group = el.matches(GROUP_SELECTOR) && isGroup(el) ? el : [...el.querySelectorAll(GROUP_SELECTOR)].find(isGroup);
    return group ? parseEntry(group, extractors2) : null;
  }
  const inFlight = /* @__PURE__ */ new Map();
  const documents = /* @__PURE__ */ new Map();
  function clearCollectionCache() {
    inFlight.clear();
    documents.clear();
  }
  async function loadDocument(url, { signal } = {}) {
    if (documents.has(url)) return documents.get(url);
    if (inFlight.has(url)) return inFlight.get(url);
    const promise = fetch(url, { signal, headers: { Accept: "text/html" } }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    }).then((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      documents.set(url, doc);
      inFlight.delete(url);
      return doc;
    }).catch((error) => {
      inFlight.delete(url);
      throw error;
    });
    inFlight.set(url, promise);
    return promise;
  }
  function fetchCollection(url, { parse, signal } = {}) {
    const entries = vue.shallowRef([]);
    const pending = vue.ref(false);
    const error = vue.ref(null);
    const load = async () => {
      pending.value = true;
      error.value = null;
      try {
        const doc = await loadDocument(url, { signal });
        entries.value = parse ? parse(doc) : [];
        console.log(
          `[webflow-vue:fetch] ${url} → ${entries.value.length} entr${entries.value.length === 1 ? "y" : "ies"}` + (documents.has(url) ? " (cached after first hit)" : "")
        );
      } catch (err) {
        error.value = err;
        console.error(`[webflow-vue:fetch] ${url} failed`, err);
      } finally {
        pending.value = false;
      }
    };
    return { entries, pending, error, load };
  }
  const PAGE_LINK = ".w-pagination-next, .w-pagination-previous";
  const LIST_WRAPPER = ".w-dyn-list";
  function parseToken(href) {
    const match = /([0-9a-f]{8})_page=(\d+)/.exec(href || "");
    return match ? { token: match[1], page: Number(match[2]) } : null;
  }
  function paginationLinkFor(root, token) {
    var _a;
    for (const link of root.querySelectorAll(PAGE_LINK)) {
      if (((_a = parseToken(link.getAttribute("href"))) == null ? void 0 : _a.token) === token) return link;
    }
    return null;
  }
  function nextLinkFor(root, token) {
    var _a;
    for (const link of root.querySelectorAll(".w-pagination-next")) {
      if (((_a = parseToken(link.getAttribute("href"))) == null ? void 0 : _a.token) === token) return link;
    }
    return null;
  }
  function tokensIn(root) {
    const tokens = /* @__PURE__ */ new Set();
    for (const link of root.querySelectorAll(PAGE_LINK)) {
      const parsed = parseToken(link.getAttribute("href"));
      if (parsed) tokens.add(parsed.token);
    }
    return [...tokens];
  }
  async function loadAllPages(collections, { extractors: extractors2 = {}, root = document, maxPages = 50 } = {}) {
    const tokens = tokensIn(root);
    if (!tokens.length) {
      console.log("[webflow-vue:pages] no pagination on this page — nothing to walk");
      return { pagesFetched: 0, added: {} };
    }
    const merged = { ...collections.value };
    const added = {};
    let pagesFetched = 0;
    for (const token of tokens) {
      let current = root;
      for (let guard = 0; guard < maxPages; guard += 1) {
        const next = nextLinkFor(current, token);
        if (!next) break;
        const href = next.getAttribute("href");
        const doc = await loadDocument(new URL(href, window.location.href).href);
        pagesFetched += 1;
        const anchor = paginationLinkFor(doc, token);
        const scope = (anchor == null ? void 0 : anchor.closest(LIST_WRAPPER)) ?? doc;
        const { collections: page } = useWebflowCMS({ root: scope, extractors: extractors2 });
        for (const [group, entries] of Object.entries(page.value)) {
          merged[group] = [...merged[group] ?? [], ...entries];
          added[group] = (added[group] ?? 0) + entries.length;
        }
        current = doc;
      }
    }
    collections.value = merged;
    console.log(
      `[webflow-vue:pages] walked ${pagesFetched} page(s), added`,
      added,
      "→ totals",
      Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.length]))
    );
    return { pagesFetched, added };
  }
  const DEFAULT_TIMEOUT = 15e3;
  function hasFinsweetList(root = document) {
    return root.querySelector("[fs-list-element]") != null;
  }
  function awaitInstances(timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Finsweet list did not initialise within ${timeout}ms`)),
        timeout
      );
      window.FinsweetAttributes || (window.FinsweetAttributes = []);
      window.FinsweetAttributes.push([
        "list",
        (instances) => {
          clearTimeout(timer);
          resolve(instances ?? []);
        }
      ]);
    });
  }
  function useFinsweetList({ instance, extractors: extractors2 = {}, timeout = DEFAULT_TIMEOUT } = {}) {
    const entries = vue.shallowRef([]);
    const pending = vue.ref(true);
    const error = vue.ref(null);
    const read = (list2) => {
      entries.value = list2.items.value.map((item) => parseItemElement(item.element, extractors2)).filter(Boolean);
    };
    const ready = (async () => {
      try {
        const instances = await awaitInstances(timeout);
        const list2 = (instance ? instances.find((l) => l.instance === instance) : instances[0]) ?? null;
        if (!list2) throw new Error("no Finsweet list instance found");
        await list2.loadingPaginatedItems;
        read(list2);
        list2.addHook("afterRender", () => {
          read(list2);
        });
        console.log(
          `[webflow-vue:finsweet] list "${list2.instance ?? "(default)"}" ready — ${entries.value.length} item(s) parsed`
        );
        return list2;
      } catch (err) {
        error.value = err;
        console.error("[webflow-vue:finsweet] compose path failed", err);
        return null;
      } finally {
        pending.value = false;
      }
    })();
    return { entries, pending, error, ready };
  }
  function normalizeNumber(input) {
    if (input == null) return void 0;
    const cleaned = String(input).replace(/[^\d.,-]/g, "");
    if (!cleaned) return void 0;
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalAt = Math.max(lastComma, lastDot);
    let normalized;
    if (decimalAt === -1) {
      normalized = cleaned;
    } else {
      const intPart = cleaned.slice(0, decimalAt).replace(/[.,]/g, "");
      const fracPart = cleaned.slice(decimalAt + 1).replace(/[.,]/g, "");
      normalized = `${intPart}.${fracPart}`;
    }
    const value = Number.parseFloat(normalized);
    return Number.isNaN(value) ? void 0 : value;
  }
  const number = () => ({ raw }) => normalizeNumber(raw);
  const bool = () => ({ raw, element }) => {
    if (!element) return false;
    const text = (raw ?? "").trim().toLowerCase();
    return !["false", "no", "off", "0"].includes(text);
  };
  const list = (separator = ",") => ({ raw }) => (raw ?? "").split(separator).map((part) => part.trim()).filter(Boolean);
  const richText = (selector) => ({ element, item }) => {
    const target = selector ? item.querySelector(selector) : element;
    return target ? target.innerHTML.trim() : "";
  };
  const date = () => ({ raw }) => {
    if (!raw) return void 0;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? void 0 : parsed;
  };
  const extractors = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    bool,
    date,
    list,
    normalizeNumber,
    number,
    richText
  }, Symbol.toStringTag, { value: "Module" }));
  const version = "0.2.3";
  exports.cleanDOMForVue = cleanDOMForVue;
  exports.clearCollectionCache = clearCollectionCache;
  exports.extractors = extractors;
  exports.fetchCollection = fetchCollection;
  exports.hasFinsweetList = hasFinsweetList;
  exports.loadAllPages = loadAllPages;
  exports.loadDocument = loadDocument;
  exports.mountIsland = mountIsland;
  exports.parseItemElement = parseItemElement;
  exports.resetSharedStore = resetSharedStore;
  exports.unmountIsland = unmountIsland;
  exports.useFinsweetList = useFinsweetList;
  exports.useSharedStore = useSharedStore;
  exports.useWebflowCMS = useWebflowCMS;
  exports.version = version;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({}, Vue);
