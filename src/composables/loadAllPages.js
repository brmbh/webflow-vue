import { loadDocument } from './fetchCollection.js';
import { useWebflowCMS } from './useWebflowCMS.js';

/**
 * Walks Webflow's native pagination and appends every remaining page's items
 * into an existing `collections` ref.
 *
 * Why this has to exist: a paginated Collection List renders only one page into
 * the initial HTML. `useWebflowCMS()` parses at boot, so it sees 25 of 120 items
 * and the app reports "25 of 25" — confidently wrong. Anything that filters a
 * paginated list MUST wait for this to finish before its numbers mean anything.
 *
 * Webflow emits pagination links as `?<token>_page=N`, where the 8-hex token
 * identifies which list on the page is being paged. The token is what lets us
 * follow one list's pages without re-ingesting the other lists on every fetch.
 *
 * Requires pagination to be enabled on the Collection List. That toggle is
 * Designer-only: the `pagination` setting is writable through the API (shape
 * `{ itemsPerPage: N }`, verified 2026-08-19) but the API does not insert the
 * Previous/Next elements, and without them Webflow emits no page links at all.
 */

const PAGE_LINK = '.w-pagination-next, .w-pagination-previous';
const LIST_WRAPPER = '.w-dyn-list';

function parseToken(href) {
  const match = /([0-9a-f]{8})_page=(\d+)/.exec(href || '');
  return match ? { token: match[1], page: Number(match[2]) } : null;
}

/** Any pagination link for `token` — next OR previous, because the last page has no next. */
function paginationLinkFor(root, token) {
  for (const link of root.querySelectorAll(PAGE_LINK)) {
    if (parseToken(link.getAttribute('href'))?.token === token) return link;
  }
  return null;
}

function nextLinkFor(root, token) {
  for (const link of root.querySelectorAll('.w-pagination-next')) {
    if (parseToken(link.getAttribute('href'))?.token === token) return link;
  }
  return null;
}

/** Distinct pagination tokens present in a document. */
function tokensIn(root) {
  const tokens = new Set();
  for (const link of root.querySelectorAll(PAGE_LINK)) {
    const parsed = parseToken(link.getAttribute('href'));
    if (parsed) tokens.add(parsed.token);
  }
  return [...tokens];
}

/**
 * @param {import('vue').Ref} collections  the ref from `useWebflowCMS()`
 * @param {object} [options]
 * @param {object} [options.extractors]    same extractors as the boot parse
 * @param {Document|Element} [options.root]
 * @param {number} [options.maxPages]      runaway guard
 * @returns {Promise<{pagesFetched:number, added:object}>}
 */
export async function loadAllPages(collections, { extractors = {}, root = document, maxPages = 50 } = {}) {
  const tokens = tokensIn(root);
  if (!tokens.length) {
    console.log('[webflow-vue:pages] no pagination on this page — nothing to walk');
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

      const href = next.getAttribute('href');
      const doc = await loadDocument(new URL(href, window.location.href).href);
      pagesFetched += 1;

      // Scope the parse to the list this token belongs to, so the other
      // Collection Lists on the page are not ingested again on every fetch.
      const anchor = paginationLinkFor(doc, token);
      const scope = anchor?.closest(LIST_WRAPPER) ?? doc;
      const { collections: page } = useWebflowCMS({ root: scope, extractors });

      for (const [group, entries] of Object.entries(page.value)) {
        merged[group] = [...(merged[group] ?? []), ...entries];
        added[group] = (added[group] ?? 0) + entries.length;
      }

      current = doc;
    }
  }

  collections.value = merged;
  console.log(
    `[webflow-vue:pages] walked ${pagesFetched} page(s), added`,
    added,
    '→ totals',
    Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.length]))
  );
  return { pagesFetched, added };
}
