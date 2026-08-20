import { ref, shallowRef } from 'vue';

/**
 * Fetches a Webflow-rendered page and parses it with the same conventions as
 * `useWebflowCMS`. Same output shape, different source.
 *
 * Exists because of a hard Webflow ceiling: a nested Collection List renders
 * about five items. The same relation on the item's own template page is a
 * TOP-LEVEL list, so it renders up to 100 — the relation doesn't shrink, it
 * moves. This is the FJC `fetchModulesForOrderable` trick, generalised.
 *
 * Rule this helper does NOT relax: filter-relevant data still belongs on the
 * page synchronously. Only detail belongs behind a fetch.
 */

/** URL → Promise<Document>. Shared, so N callers wanting one page make one request. */
const inFlight = new Map();
/** URL → Document. Resolved pages, kept for the session. */
const documents = new Map();

export function clearCollectionCache() {
  inFlight.clear();
  documents.clear();
}

export async function loadDocument(url, { signal } = {}) {
  if (documents.has(url)) return documents.get(url);
  if (inFlight.has(url)) return inFlight.get(url);

  const promise = fetch(url, { signal, headers: { Accept: 'text/html' } })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    })
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      documents.set(url, doc);
      inFlight.delete(url);
      return doc;
    })
    .catch((error) => {
      inFlight.delete(url);
      throw error;
    });

  inFlight.set(url, promise);
  return promise;
}

/**
 * @param {string} url      page to fetch, same-origin
 * @param {object} options
 * @param {Function} options.parse  (documentOrRoot) => entries — pass a
 *                                  `useWebflowCMS`-style parser bound to the doc
 * @returns {{ entries, pending, error, load }}
 */
export function fetchCollection(url, { parse, signal } = {}) {
  const entries = shallowRef([]);
  const pending = ref(false);
  const error = ref(null);

  const load = async () => {
    pending.value = true;
    error.value = null;
    try {
      const doc = await loadDocument(url, { signal });
      entries.value = parse ? parse(doc) : [];
      console.log(
        `[webflow-vue:fetch] ${url} → ${entries.value.length} entr${entries.value.length === 1 ? 'y' : 'ies'}` +
          (documents.has(url) ? ' (cached after first hit)' : '')
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
