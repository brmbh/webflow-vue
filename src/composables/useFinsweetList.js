import { ref, shallowRef } from 'vue';
import { parseItemElement } from './useWebflowCMS.js';

/**
 * Compose path: let Finsweet Attributes own the Collection List, read the result.
 *
 * Finsweet's `list` solution already solves the Webflow plumbing properly —
 * walking native pagination past the 100-item render cap (`fs-list-load="all"`),
 * combining lists, nesting past the ~5-item limit. Rebuilding that to own it is
 * vanity. What Vueflow wants from it is the finished item set.
 *
 * Their public surface (verified against source, @finsweet/attributes 2.7.x):
 *   window.FinsweetAttributes.push(['list', (instances) => …])   — init queue
 *   list.loadingPaginatedItems : Promise<void>                   — load-all done
 *   list.addHook('afterRender', cb)                              — per-render event
 *   list.items : ShallowRef<ListItem[]>, each with `.element`
 *
 * We deliberately do NOT read their refs inside our `computed`s. They bundle their
 * own copy of `@vue/reactivity` and we load Vue from the CDN — two dependency
 * tracking contexts, so a `computed` of ours reading a `ref` of theirs would
 * evaluate once and never invalidate. The boundary is explicit on purpose: their
 * event in, our `shallowRef` out.
 */

const DEFAULT_TIMEOUT = 15000;

/** True when the page is marked up for Finsweet's list solution. */
export function hasFinsweetList(root = document) {
  return root.querySelector('[fs-list-element]') != null;
}

function awaitInstances(timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Finsweet list did not initialise within ${timeout}ms`)),
      timeout
    );
    window.FinsweetAttributes ||= [];
    window.FinsweetAttributes.push([
      'list',
      (instances) => {
        clearTimeout(timer);
        resolve(instances ?? []);
      },
    ]);
  });
}

/**
 * @param {object}  [options]
 * @param {string}  [options.instance]   Finsweet instance name, when several lists exist
 * @param {object}  [options.extractors] same extractors as the boot parse
 * @param {number}  [options.timeout]
 * @returns {{ entries, pending, error, ready }}
 */
export function useFinsweetList({ instance, extractors = {}, timeout = DEFAULT_TIMEOUT } = {}) {
  const entries = shallowRef([]);
  const pending = ref(true);
  const error = ref(null);

  const read = (list) => {
    entries.value = list.items.value
      .map((item) => parseItemElement(item.element, extractors))
      .filter(Boolean);
  };

  const ready = (async () => {
    try {
      const instances = await awaitInstances(timeout);
      const list =
        (instance ? instances.find((l) => l.instance === instance) : instances[0]) ?? null;
      if (!list) throw new Error('no Finsweet list instance found');

      // Load-all resolves once every paginated page has been fetched and merged.
      await list.loadingPaginatedItems;
      read(list);

      // Keep following it: any later render (filter, sort, load-more) re-emits.
      list.addHook('afterRender', () => {
        read(list);
      });

      console.log(
        `[vueflow:finsweet] list "${list.instance ?? '(default)'}" ready — ${entries.value.length} item(s) parsed`
      );
      return list;
    } catch (err) {
      error.value = err;
      console.error('[vueflow:finsweet] compose path failed', err);
      return null;
    } finally {
      pending.value = false;
    }
  })();

  return { entries, pending, error, ready };
}
