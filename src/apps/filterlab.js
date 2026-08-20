import { computed, reactive, ref, shallowRef } from 'vue';
import { mountIsland } from '../mountIsland.js';
import { useWebflowCMS } from '../composables/useWebflowCMS.js';
import { fetchCollection } from '../composables/fetchCollection.js';
import { loadAllPages } from '../composables/loadAllPages.js';
import { useFinsweetList, hasFinsweetList } from '../composables/useFinsweetList.js';
import { number } from '../extractors.js';

/**
 * /vue/filter-lab — three Webflow Collection Lists joined in the browser.
 *
 * Three kinds of state, deliberately:
 *   reactive  the filter inputs
 *   derived   results, counts, chips — including facet counts that respect the
 *             OTHER active filters, which Webflow cannot do natively
 *   async     the rest of the paginated catalog, and per-bean brew guides
 *
 * The async part is not a flourish. A paginated Collection List puts one page in
 * the initial HTML, so every number here is provisional until `loadAllPages`
 * finishes. That is why `catalogPending` exists and why the UI says so.
 */

const slugify = (s) =>
  (s ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const EXTRACTORS = { price: number() };

// Parsed at boot, outside every island — Vue empties its mount target, so a
// Collection List inside an island would be destroyed by the thing reading it.
const { collections } = useWebflowCMS({ extractors: EXTRACTORS });

/** The slider's own max is the contract for the price cap — the markup decides. */
const PRICE_CAP = (() => {
  const el = document.querySelector('#vf-filters input[type="range"]');
  const max = Number(el?.getAttribute('max'));
  return Number.isFinite(max) && max > 0 ? max : 18;
})();

const originBySlug = computed(() =>
  Object.fromEntries((collections.value.origins ?? []).map((o) => [o.slug, o]))
);

/** Recomputes when later pages land, which is the whole point. */
const beans = computed(() =>
  (collections.value.beans ?? []).map((b) => ({
    ...b,
    originMeta: originBySlug.value[slugify(b.origin)] ?? {},
    methods: b.methods ?? [],
    methodNames: (b.methods ?? []).map((m) => m.name),
  }))
);

const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const ALL = {
  roast: computed(() => uniq(beans.value.map((b) => b.roastLevel))),
  origin: computed(() => uniq(beans.value.map((b) => b.origin))),
  method: computed(() => uniq(beans.value.flatMap((b) => b.methodNames))),
};

const filters = reactive({ q: '', roast: [], origin: [], method: [], maxPrice: PRICE_CAP });
const sort = ref('name');
const catalogPending = ref(false);

/** `skip` leaves one dimension out, which is what makes cross-facet counts work. */
function matches(bean, skip) {
  if (skip !== 'q' && filters.q.trim()) {
    const haystack = `${bean.name} ${bean.tastingNotes} ${bean.origin}`.toLowerCase();
    if (!haystack.includes(filters.q.trim().toLowerCase())) return false;
  }
  if (skip !== 'roast' && filters.roast.length && !filters.roast.includes(bean.roastLevel)) return false;
  if (skip !== 'origin' && filters.origin.length && !filters.origin.includes(bean.origin)) return false;
  if (skip !== 'method' && filters.method.length) {
    if (!filters.method.some((m) => bean.methodNames.includes(m))) return false;
  }
  if (skip !== 'price' && (bean.price ?? 0) > filters.maxPrice) return false;
  return true;
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
};

const results = computed(() => beans.value.filter((b) => matches(b)).sort(SORTS[sort.value]));

function facetFor(dimension, valuesOf) {
  return computed(() => {
    const pool = beans.value.filter((b) => matches(b, dimension));
    const counts = new Map(ALL[dimension].value.map((v) => [v, 0]));
    for (const bean of pool) {
      for (const value of valuesOf(bean)) {
        if (counts.has(value)) counts.set(value, counts.get(value) + 1);
      }
    }
    return [...counts].map(([value, count]) => ({ value, count }));
  });
}

// reactive(), not a plain object: Vue only unwraps refs at the top level of a
// setup() return, so `facets.roast` would reach the template as a raw ComputedRef
// and `v-for` would iterate the ref instead of the array.
const facets = reactive({
  roast: facetFor('roast', (b) => [b.roastLevel]),
  origin: facetFor('origin', (b) => [b.origin]),
  method: facetFor('method', (b) => b.methodNames),
});

const activeChips = computed(() => {
  const chips = [];
  if (filters.q.trim()) {
    chips.push({ id: 'q', label: `"${filters.q.trim()}"`, clear: () => (filters.q = '') });
  }
  for (const dimension of ['roast', 'origin', 'method']) {
    for (const value of filters[dimension]) {
      chips.push({
        id: `${dimension}:${value}`,
        label: value,
        clear: () => (filters[dimension] = filters[dimension].filter((v) => v !== value)),
      });
    }
  }
  if (filters.maxPrice < PRICE_CAP) {
    chips.push({ id: 'price', label: `bis ${filters.maxPrice} €`, clear: () => (filters.maxPrice = PRICE_CAP) });
  }
  return chips;
});

function reset() {
  filters.q = '';
  filters.roast = [];
  filters.origin = [];
  filters.method = [];
  filters.maxPrice = PRICE_CAP;
}

/**
 * Detail panel — per-bean brew guides.
 *
 * Too long for the card and, past five methods, not renderable in a nested list
 * at all. On the bean's own template page the same relation is a top-level list
 * with no such cap, so it is fetched on demand: one request per bean the user
 * actually opens, cached after.
 */
const selected = ref(null);
const guides = shallowRef([]);
const detailPending = ref(false);

async function openDetail(bean) {
  selected.value = bean;
  guides.value = [];
  const { entries, load } = fetchCollection(`/beans/${bean.slug}`, {
    parse: (doc) => useWebflowCMS({ root: doc }).collections.value.guides ?? [],
  });
  detailPending.value = true;
  await load();
  guides.value = entries.value;
  detailPending.value = false;
}

function closeDetail() {
  selected.value = null;
  guides.value = [];
}

mountIsland('#vf-filters', 'filters', () => ({ filters, facets, reset, catalogPending }));
mountIsland('#vf-results', 'results', () => ({
  beans,
  results,
  activeChips,
  sort,
  filters,
  catalogPending,
  selected,
  guides,
  detailPending,
  openDetail,
  closeDetail,
}));

/**
 * Completing the catalog.
 *
 * A paginated Collection List puts one page in the initial HTML, so until this
 * resolves every count is a subset — hence `catalogPending`, and hence the UI
 * saying so instead of quietly under-reporting.
 *
 * Two routes, and the markup decides which:
 *
 *   compose  the list carries `fs-list-element` → Finsweet owns the loading.
 *            It fetches pages in parallel when a page-count element exists and
 *            caches them in IndexedDB keyed to the site's last publish, so the
 *            cache survives navigation. We take the finished items.
 *   build    no Finsweet markup → our own `loadAllPages` walks the pagination.
 *            Sequential, in-memory cache only, but zero dependencies.
 *
 * Neither removes the pending window: both fetch after boot. The choice is about
 * breadth and cache lifetime, not about getting past the 100-item render cap.
 */
const started = performance.now();
const route = hasFinsweetList() ? 'compose' : 'build';
catalogPending.value = true;

if (route === 'compose') {
  const { entries, ready } = useFinsweetList({ extractors: EXTRACTORS });
  ready
    .then(() => {
      if (entries.value.length) {
        collections.value = { ...collections.value, beans: entries.value };
      }
      console.log(
        `[webflow-vue:catalog] compose (Finsweet) — ${beans.value.length} beans in ${Math.round(performance.now() - started)}ms`
      );
    })
    .finally(() => {
      catalogPending.value = false;
    });
} else {
  loadAllPages(collections, { extractors: EXTRACTORS })
    .then(({ pagesFetched }) => {
      console.log(
        `[webflow-vue:catalog] build (own walker) — ${beans.value.length} beans after ${pagesFetched} sequential fetch(es) in ${Math.round(performance.now() - started)}ms`
      );
    })
    .finally(() => {
      catalogPending.value = false;
    });
}
