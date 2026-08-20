import { ref, computed, watch } from 'vue';
import { mountIsland } from './mountIsland.js';
import { useWebflowCMS } from './composables/useWebflowCMS.js';
import { useSharedStore } from './composables/useSharedStore.js';
import './apps/hello.js';
import './apps/brewlab.js';
import './apps/filterlab.js';

console.log('[vueflow] main.js loaded', new Date().toISOString());

// ---------------------------------------------------------------------------
// Islands demo page (/vue/vueflow-islands) — each island skips itself when
// its mount point isn't on the current page.
// ---------------------------------------------------------------------------
const demoStore = useSharedStore('demo', { count: 0 }, { persist: true });

watch(
  () => demoStore.count,
  (next, prev) =>
    console.log(`[vueflow:debug] shared count ${prev} → ${next} (all islands re-render from one mutation)`)
);

mountIsland('#vf-counter', 'counter', () => {
  const store = useSharedStore('demo');
  const localClicks = ref(0);
  const bump = (n) => {
    store.count += n;
    localClicks.value += 1;
    console.log(`[vueflow:island] "counter" bump(${n}) — shared=${store.count}, local=${localClicks.value}`);
  };
  return { store, localClicks, bump };
});

mountIsland('#vf-status', 'status', () => {
  const store = useSharedStore('demo');
  const doubled = computed(() => store.count * 2);
  const status = computed(() =>
    store.count === 0 ? 'idle' : store.count > 0 ? 'positive' : 'negative'
  );
  return { store, doubled, status };
});

mountIsland('#vf-cms', 'cms-filter', () => {
  const { collections } = useWebflowCMS();
  const query = ref('');
  const courses = computed(() => {
    const list = collections.value.courses || [];
    const q = query.value.trim().toLowerCase();
    return q ? list.filter((c) => (c.name || '').toLowerCase().includes(q)) : list;
  });
  return { collections, query, courses };
});

console.log('[vueflow] boot complete — islands mounted, everything else is untouched Webflow DOM');
