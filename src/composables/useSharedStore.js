import { reactive, watch } from 'vue';

/**
 * Cross-island shared state.
 *
 * Every island that calls useSharedStore('name') gets THE SAME reactive
 * object — module scope is the singleton boundary, no Pinia needed.
 * Optional sessionStorage persistence carries state across page loads
 * (and pages, since the bundle is site-wide).
 */

const STORAGE_PREFIX = 'webflow-vue:store:';
const registry = new Map();

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

/**
 * Get (or lazily create) a named shared store.
 * @param {string} name - store identity; same name → same reactive object
 * @param {Object} initialState - defaults used on first creation only
 * @param {Object} [options]
 * @param {boolean} [options.persist=false] - mirror state to sessionStorage
 * @returns {Object} reactive store shared by all islands
 */
export function useSharedStore(name = 'default', initialState = {}, options = {}) {
  const { persist = false } = options;

  if (registry.has(name)) {
    console.log(`[webflow-vue:store] "${name}" → existing instance reused (cross-island link established)`);
    return registry.get(name);
  }

  const persisted = persist ? hydrate(name) : null;
  const store = reactive({ ...initialState, ...persisted });
  registry.set(name, store);

  console.log(`[webflow-vue:store] "${name}" created`, JSON.parse(JSON.stringify(store)), { persist });

  watch(
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

/** Wipe a persisted store (debug helper, callable from the console). */
export function resetSharedStore(name = 'default') {
  sessionStorage.removeItem(STORAGE_PREFIX + name);
  console.log(`[webflow-vue:store] "${name}" sessionStorage cleared — reload to re-init`);
}
