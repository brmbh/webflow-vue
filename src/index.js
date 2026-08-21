/**
 * WebflowVue — public library surface.
 *
 * This is the entry point for consumers: the npm package and the CDN build.
 * It exports helpers only and mounts nothing. The demo apps under `src/apps/`
 * are reachable through `src/main.js`, which is a separate, app-shaped bundle.
 */

// Mounting
export { mountIsland, unmountIsland } from './mountIsland.js';
export { cleanDOMForVue } from './utils/cleanDOMForVue.js';

// Cross-island and cross-page state
export { useSharedStore, resetSharedStore } from './composables/useSharedStore.js';

// Webflow CMS, read out of the rendered DOM
export { useWebflowCMS, parseItemElement } from './composables/useWebflowCMS.js';
export { loadAllPages } from './composables/loadAllPages.js';
export {
  fetchCollection,
  loadDocument,
  clearCollectionCache,
} from './composables/fetchCollection.js';

// Compose with Finsweet Attributes where its list behaviours already fit
export { useFinsweetList, hasFinsweetList } from './composables/useFinsweetList.js';

// Field extractors for the CMS parsers
export * as extractors from './extractors.js';

export const version = '0.2.2';
