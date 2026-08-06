import { ref } from 'vue';

const FIELD_PREFIX = 'field';
const GROUP_KEY = 'collection';

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

/**
 * Two conventions, freely mixable per item element:
 *   1. Attribute fields: data-field-name="…" on the item element itself
 *      (Designer-authored; supports any value).
 *   2. Field elements: <span data-field="name">…</span> children whose text
 *      is CMS-bound (API-scaffoldable — the Webflow MCP can bind text but
 *      not attribute values).
 * The grouping key stays an attribute: data-field-collection="beans".
 */
function parseEntry(el) {
  const entry = {};
  for (const [key, value] of Object.entries(el.dataset)) {
    const fieldKey = stripFieldPrefix(key);
    if (fieldKey) entry[fieldKey] = value;
  }
  for (const fieldEl of el.querySelectorAll('[data-field]')) {
    entry[kebabToCamel(fieldEl.dataset.field)] = fieldEl.textContent.trim();
  }
  return entry;
}

export function useWebflowCMS(selector = '[data-field-collection]') {
  const collections = ref({});
  const elements = document.querySelectorAll(selector);

  for (const el of elements) {
    const entry = parseEntry(el);
    const group = entry[GROUP_KEY];
    if (!group) continue;
    const key = kebabToCamel(group);
    if (!collections.value[key]) collections.value[key] = [];
    collections.value[key].push(entry);
  }

  console.log(
    `[vueflow:cms] parsed ${elements.length} item element(s) into collections:`,
    Object.fromEntries(Object.entries(collections.value).map(([k, v]) => [k, v.length]))
  );

  return { collections };
}
