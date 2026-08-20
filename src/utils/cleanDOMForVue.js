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
 */
export function cleanDOMForVue(rootEl, label = rootEl.id || 'island') {
  const rescued = [];

  for (const node of rootEl.querySelectorAll(
    'script.w-json, script[type="application/json"], style'
  )) {
    rescued.push(node);
    node.remove();
  }

  if (rescued.length) {
    const counts = rescued.reduce((acc, n) => {
      const kind = n.tagName === 'STYLE' ? 'style' : 'w-json';
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
      for (const node of rescued) rootEl.appendChild(node);
      if (rescued.length) {
        console.log(`[webflow-vue:clean] "${label}" restored ${rescued.length} node(s) post-mount`);
      }
    },
  };
}
