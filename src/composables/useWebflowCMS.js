import { ref } from 'vue';

const FIELD_PREFIX = 'field';
const GROUP_KEY = 'collection';
const GROUP_CLASS_PREFIX = 'vf-c-';
const FIELD_CLASS_PREFIX = 'vf-f-';
const GROUP_SELECTOR = `[data-field-collection],[class*="${GROUP_CLASS_PREFIX}"]`;
const FIELD_SELECTOR = `[data-field],[class*="${FIELD_CLASS_PREFIX}"]`;

/**
 * Class-based markers exist because Webflow gives no way to put an attribute on
 * an element inside a Collection Item: native elements expose no `attributes`
 * setting, and a custom element breaks the CMS context for everything below it,
 * so its children can no longer bind a field. A class is the only marker that
 * survives both constraints. Verified against the live API 2026-08-19.
 */
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

/** A broad selector can over-match, e.g. a class merely containing the prefix. */
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

/**
 * Direct children groups only — a nested Collection List inside this item.
 * `closest()` from the candidate must land back on `el` for it to count as
 * ours; anything deeper belongs to an intermediate group.
 */
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

/**
 * Field elements belonging to THIS item and not to a nested one.
 *
 * The unscoped version of this — a plain `querySelectorAll('[data-field]')` —
 * silently merged a nested list's fields into the parent entry, last one
 * winning. Scoping is the whole reason this helper exists.
 */
function ownFieldElements(el) {
  return [...el.querySelectorAll(FIELD_SELECTOR)].filter(
    (fieldEl) => fieldNameOf(fieldEl) != null && closestGroup(fieldEl) === el
  );
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
function parseEntry(el, extractors) {
  const entry = {};

  for (const [key, value] of Object.entries(el.dataset)) {
    const fieldKey = stripFieldPrefix(key);
    if (fieldKey) entry[fieldKey] = value;
  }

  const groupName = groupNameOf(el);
  if (groupName) entry[GROUP_KEY] = groupName;

  const elementsByKey = new Map();
  for (const fieldEl of ownFieldElements(el)) {
    const key = kebabToCamel(fieldNameOf(fieldEl));
    if (!elementsByKey.has(key)) elementsByKey.set(key, fieldEl);
    entry[key] = fieldEl.textContent.trim();
  }

  // Extractors run for every declared key, present or not — that is what makes
  // boolean-by-presence work at all.
  for (const [key, extract] of Object.entries(extractors)) {
    const element = elementsByKey.get(key) ?? null;
    entry[key] = extract({ raw: entry[key], element, item: el, key });
  }

  // Nested Collection Lists become arrays on the parent, keyed by their group.
  for (const groupEl of childGroups(el)) {
    const nested = parseEntry(groupEl, extractors);
    const group = nested[GROUP_KEY];
    if (!group) continue;
    const key = kebabToCamel(group);
    (entry[key] ||= []).push(nested);
  }

  return entry;
}

/**
 * Parses Webflow-rendered Collection Lists into a reactive `collections` object.
 *
 * @param {object}   [options]
 * @param {string}   [options.selector]   root item selector
 * @param {object}   [options.extractors] field key → extractor, see src/extractors.js
 */
export function useWebflowCMS({ selector = GROUP_SELECTOR, extractors = {}, root = document } = {}) {
  const collections = ref({});
  const all = [...root.querySelectorAll(selector)];

  // Only top-level items — nested ones are parsed as part of their parent.
  const roots = all.filter((el) => isGroup(el) && closestGroup(el.parentElement) == null);

  for (const el of roots) {
    const entry = parseEntry(el, extractors);
    const group = entry[GROUP_KEY];
    if (!group) continue;
    const key = kebabToCamel(group);
    (collections.value[key] ||= []).push(entry);
  }

  console.log(
    `[vueflow:cms] parsed ${roots.length} item element(s)` +
      (all.length !== roots.length ? ` (+${all.length - roots.length} nested)` : '') +
      ' into collections:',
    Object.fromEntries(Object.entries(collections.value).map(([k, v]) => [k, v.length]))
  );

  return { collections };
}

/**
 * Parses ONE Collection Item element (or a group element itself) into an entry.
 *
 * Exists for the compose path: Finsweet hands us `ListItem.element` nodes, and we
 * want the same field conventions applied to them without re-scanning the page.
 */
export function parseItemElement(el, extractors = {}) {
  const group =
    el.matches(GROUP_SELECTOR) && isGroup(el)
      ? el
      : [...el.querySelectorAll(GROUP_SELECTOR)].find(isGroup);
  return group ? parseEntry(group, extractors) : null;
}
