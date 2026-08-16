import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountIsland } from '../src/mountIsland.js';
import { ref, computed } from 'vue';

/**
 * Loop A — the helpers, really mounted and really clicked.
 *
 * These assert behaviour a Webflow page depends on, not code shape: that an
 * island compiles Designer-authored DOM as its template, that it stays out of
 * the way when its mount point is on another page, and that Webflow's own
 * runtime nodes survive the mount.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('mountIsland', () => {
  it('compiles the live DOM as its template — no template option anywhere', async () => {
    document.body.innerHTML = `
      <div id="island">
        <span class="count">{{ n }}</span>
        <button v-on:click="n++">inc</button>
      </div>`;

    mountIsland('#island', 'counter', () => ({ n: ref(1) }));
    await flush();

    expect(document.querySelector('.count').textContent).toBe('1');
    document.querySelector('button').click();
    await flush();
    expect(document.querySelector('.count').textContent).toBe('2');
  });

  it('supports derived state inside an island', async () => {
    document.body.innerHTML = `
      <div id="island">
        <span class="total">{{ total }}</span>
        <button v-on:click="seats++">+</button>
      </div>`;

    mountIsland('#island', 'derived', () => {
      const seats = ref(1);
      return { seats, total: computed(() => seats.value * 49) };
    });
    await flush();

    expect(document.querySelector('.total').textContent).toBe('49');
    document.querySelector('button').click();
    await flush();
    expect(document.querySelector('.total').textContent).toBe('98');
  });

  it('skips silently when its mount point is on another page', () => {
    document.body.innerHTML = '<div id="somewhere-else"></div>';
    const setup = vi.fn();

    const app = mountIsland('#not-here', 'absent', setup);

    expect(app).toBeNull();
    expect(setup).not.toHaveBeenCalled();
  });

  it('leaves DOM outside the island untouched', async () => {
    document.body.innerHTML = `
      <div id="island">{{ n }}</div>
      <div id="outside"><span>webflow</span></div>`;

    const before = document.querySelector('#outside span');
    mountIsland('#island', 'scoped', () => ({ n: ref(1) }));
    await flush();

    // Same node object, not an equal one: Webflow's listeners survive only if
    // the node itself survives.
    expect(document.querySelector('#outside span')).toBe(before);
  });

  it("rescues Webflow's lightbox config from the compiler", async () => {
    document.body.innerHTML = `
      <div id="island">
        <span>{{ n }}</span>
        <script class="w-json" type="application/json">{"items":[]}</script>
      </div>`;

    mountIsland('#island', 'lightbox', () => ({ n: ref(1) }));
    await flush();

    const rescued = document.querySelector('#island script.w-json');
    expect(rescued).not.toBeNull();
    expect(rescued.textContent).toBe('{"items":[]}');
  });
});
