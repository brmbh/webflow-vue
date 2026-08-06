/**
 * Pre-mount sweep protecting Webflow's native runtime from Vue's compiler.
 *
 * Vue compiles the island's live DOM as its template and rebuilds it on
 * mount. Webflow machinery caught inside the mount target breaks in the
 * process: lightbox JSON config blocks (`script.w-json`) get destroyed and
 * `<style>` tags end up re-rendered as text. This sweep detaches both
 * before mount and re-attaches the rescued nodes after mount.
 */
export function cleanDOMForVue(rootEl, label = rootEl.id || 'island') {
  const rescued = [];
  const dropped = [];

  for (const node of rootEl.querySelectorAll('script.w-json, script[type="application/json"]')) {
    rescued.push(node);
    node.remove();
  }

  for (const node of rootEl.querySelectorAll('style')) {
    dropped.push(node.textContent.slice(0, 60));
    node.remove();
  }

  if (rescued.length || dropped.length) {
    console.log(
      `[vueflow:clean] "${label}" swept before mount — rescued ${rescued.length} w-json config(s), stripped ${dropped.length} <style> block(s)`,
      { dropped }
    );
  } else {
    console.log(`[vueflow:clean] "${label}" clean — no Webflow runtime nodes inside mount target`);
  }

  return {
    rescuedCount: rescued.length,
    /** Re-attach rescued config nodes after Vue has taken over the subtree. */
    restore() {
      for (const node of rescued) rootEl.appendChild(node);
      if (rescued.length) {
        console.log(`[vueflow:clean] "${label}" restored ${rescued.length} rescued node(s) post-mount`);
      }
    },
  };
}
