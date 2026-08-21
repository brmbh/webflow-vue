/**
 * Pre-mount sweep protecting Webflow's native runtime from Vue's compiler.
 *
 * Vue compiles the island's live DOM as its template and rebuilds it on mount.
 * Webflow machinery caught inside the mount target does not survive that:
 * lightbox JSON config blocks (`script.w-json`) are destroyed, and `<style>`
 * tags are re-rendered as text. Both are detached before mount and re-attached
 * afterwards, outside the subtree Vue manages.
 *
 * `<style>` blocks matter more than they look: a Webflow embed carrying CSS is
 * a normal thing to have inside a section, and dropping one silently unstyles
 * part of the page.
 *
 * **Position is part of the contract.** Until 0.2.0 `restore()` appended every
 * rescued node to the island root, which is not where it came from. A `<style>`
 * survives that — CSS applies from anywhere — so it went unnoticed until a live
 * page showed a `w-embed` wrapper left empty with its `<style>` reparented to
 * the island root. A `script.w-json` is read by Webflow's lightbox relative to
 * the link that owns it, so for that node type the position is the whole point
 * of rescuing it.
 *
 * Vue rebuilds the subtree from its compiled render function, so the original
 * parent *object* is gone by the time `restore()` runs. What survives compilation
 * is the parent's attributes — so the sweep marks each parent, and the restore
 * finds it again by that marker.
 */

/** Marker written on a rescued node's parent, read back after the mount. */
const RESTORE_MARK = 'data-webflow-vue-restore';

const SWEEP_SELECTOR = 'script.w-json, script[type="application/json"], style';

export function cleanDOMForVue(rootEl, label = rootEl.id || 'island') {
  const rescued = [];
  const marked = new Map();

  for (const node of rootEl.querySelectorAll(SWEEP_SELECTOR)) {
    const parent = node.parentElement;
    // The root keeps its own attributes across the mount (Vue renders *into*
    // it), so it needs no marker — and must not be given one.
    let key = null;
    if (parent && parent !== rootEl) {
      key = marked.get(parent) ?? String(marked.size);
      if (!marked.has(parent)) {
        marked.set(parent, key);
        parent.setAttribute(RESTORE_MARK, key);
      }
    }
    rescued.push({ node, key, index: parent ? [...parent.childNodes].indexOf(node) : 0 });
    node.remove();
  }

  if (rescued.length) {
    const counts = rescued.reduce((acc, { node }) => {
      const kind = node.tagName === 'STYLE' ? 'style' : 'w-json';
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});
    console.log(
      `[webflow-vue:clean] "${label}" swept ${rescued.length} node(s) before mount — restored after`,
      counts
    );
  } else {
    console.log(`[webflow-vue:clean] "${label}" clean — no Webflow runtime nodes inside mount target`);
  }

  return {
    rescuedCount: rescued.length,
    /** Re-attach rescued nodes after Vue has taken over the subtree. */
    restore() {
      let displaced = 0;
      for (const { node, key, index } of rescued) {
        const parent = key === null ? rootEl : rootEl.querySelector(`[${RESTORE_MARK}="${key}"]`);
        if (!parent) {
          // Vue rendered the original parent away entirely — v-if, v-for, or a
          // markup change. The node still belongs on the page, so it lands at
          // the root, but that is a fallback and worth saying out loud.
          rootEl.appendChild(node);
          displaced += 1;
          continue;
        }
        const at = parent.childNodes[index];
        parent.insertBefore(node, at ?? null);
      }
      for (const parent of rootEl.querySelectorAll(`[${RESTORE_MARK}]`)) {
        parent.removeAttribute(RESTORE_MARK);
      }
      if (rescued.length) {
        console.log(
          `[webflow-vue:clean] "${label}" restored ${rescued.length} node(s) post-mount` +
            (displaced ? ` — ${displaced} to the island root, original parent gone` : '')
        );
      }
    },
  };
}
