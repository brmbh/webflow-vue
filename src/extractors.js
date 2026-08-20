/**
 * Field extractors — turn a rendered Webflow field into a usable value.
 *
 * Without these every CMS field is a string, and an app ends up re-parsing
 * prices and dates out of rendered text on every keystroke. Generalised from
 * FJC's `collectionChildExtractors`; the type set mirrors what Finsweet's
 * `fieldtype` covers (text | number | date) plus the two Webflow-specific
 * cases an attribute cannot hold: rich text and boolean-by-presence.
 *
 * An extractor receives one context object:
 *   raw     — the field element's trimmed textContent, or undefined if absent
 *   element — the `[data-field]` element, or null if absent
 *   item    — the Collection Item element the field belongs to
 *   key     — the field key
 */

/**
 * Strips currency symbols, thousands separators and stray whitespace.
 * Handles both `1.234,56` and `1,234.56` by treating the LAST separator as the
 * decimal point.
 */
export function normalizeNumber(input) {
  if (input == null) return undefined;
  const cleaned = String(input).replace(/[^\d.,-]/g, '');
  if (!cleaned) return undefined;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);

  let normalized;
  if (decimalAt === -1) {
    normalized = cleaned;
  } else {
    const intPart = cleaned.slice(0, decimalAt).replace(/[.,]/g, '');
    const fracPart = cleaned.slice(decimalAt + 1).replace(/[.,]/g, '');
    normalized = `${intPart}.${fracPart}`;
  }

  const value = Number.parseFloat(normalized);
  return Number.isNaN(value) ? undefined : value;
}

/** `price: number()` → 14.5 instead of "€ 14,50" */
export const number = () => ({ raw }) => normalizeNumber(raw);

/**
 * `decaf: bool()` — true when the field element is present and does not say no.
 *
 * Boolean-by-presence exists because Webflow's Switch field renders nothing
 * when false: the only signal is whether the element made it into the HTML.
 */
export const bool = () => ({ raw, element }) => {
  if (!element) return false;
  const text = (raw ?? '').trim().toLowerCase();
  return !['false', 'no', 'off', '0'].includes(text);
};

/** `methods: list()` → ['aeropress', 'v60'] from "aeropress, v60" */
export const list = (separator = ',') => ({ raw }) =>
  (raw ?? '')
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * `notes: richText()` — markup, not text.
 *
 * With no selector it takes the field element's own innerHTML. With one it
 * looks that selector up inside the item, for the common case where the rich
 * text sits in a `.w-richtext` sibling rather than on the field element.
 */
export const richText = (selector) => ({ element, item }) => {
  const target = selector ? item.querySelector(selector) : element;
  return target ? target.innerHTML.trim() : '';
};

/** `date: date()` → a Date, or undefined when unparseable. */
export const date = () => ({ raw }) => {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
