import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountIsland, mountIslands, unmountIsland } from '../src/mountIsland.js';
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

describe('re-mounting (page-transition safety)', () => {
  it('is a no-op when the same element is mounted twice', () => {
    document.body.innerHTML = '<div id="island"><button v-on:click="n++">go</button><span>{{ n }}</span></div>';
    const setup = () => ({ n: ref(1) });
    const first = mountIsland('#island', 'once', setup);
    const second = mountIsland('#island', 'once', setup);
    expect(second).toBe(first);
    document.querySelector('#island button').click();
    return Promise.resolve().then(() => {
      expect(document.querySelector('#island span').textContent).toBe('2');
    });
  });

  it('mounts a replacement element after its container was swapped', async () => {
    document.body.innerHTML = '<div id="wrap"><div id="island"><span>{{ n }}</span></div></div>';
    mountIsland('#island', 'swap', () => ({ n: ref(1) }));
    expect(document.querySelector('#island span').textContent).toBe('1');

    // What barba/swup do: replace the container's contents wholesale.
    document.querySelector('#wrap').innerHTML = '<div id="island"><span>{{ n }}</span></div>';
    const revived = mountIsland('#island', 'swap', () => ({ n: ref(7) }));
    expect(revived).not.toBeNull();
    expect(document.querySelector('#island span').textContent).toBe('7');
  });

  it('unmountIsland allows a deliberate remount of the same element', () => {
    document.body.innerHTML = '<div id="island"><span>{{ n }}</span></div>';
    mountIsland('#island', 'again', () => ({ n: ref(1) }));
    expect(unmountIsland('#island')).toBe(true);
    document.querySelector('#island').innerHTML = '<span>{{ n }}</span>';
    mountIsland('#island', 'again', () => ({ n: ref(5) }));
    expect(document.querySelector('#island span').textContent).toBe('5');
  });
});

describe('mountIslands (many mount points, one setup)', () => {
  it('mounts every match, not just the first', () => {
    document.body.innerHTML =
      '<div class="card"><span>{{ n }}</span></div>'.repeat(3);
    const apps = mountIslands('.card', 'card', () => ({ n: ref(0) }));
    expect(apps).toHaveLength(3);
    expect([...document.querySelectorAll('.card span')].map((s) => s.textContent))
      .toEqual(['0', '0', '0']);
  });

  it('gives each instance its own state by default', async () => {
    document.body.innerHTML =
      '<div class="card"><button v-on:click="n++">+</button><span>{{ n }}</span></div>'.repeat(2);
    mountIslands('.card', 'card', () => ({ n: ref(0) }));
    document.querySelectorAll('.card button')[0].click();
    await Promise.resolve();
    expect([...document.querySelectorAll('.card span')].map((s) => s.textContent))
      .toEqual(['1', '0']);
  });

  it('passes each element and index to setup', () => {
    document.body.innerHTML =
      '<div class="card" data-price="10"><span>{{ label }}</span></div>' +
      '<div class="card" data-price="25"><span>{{ label }}</span></div>';
    mountIslands('.card', 'card', (el, i) => ({ label: `${i}:${el.dataset.price}` }));
    expect([...document.querySelectorAll('.card span')].map((s) => s.textContent))
      .toEqual(['0:10', '1:25']);
  });

  it('returns an empty array and says so when nothing matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(mountIslands('.nope', 'card', () => ({}))).toEqual([]);
  });

  it('skips elements already mounted, so it is safe to re-run', () => {
    document.body.innerHTML = '<div class="card"><span>{{ n }}</span></div>'.repeat(2);
    const first = mountIslands('.card', 'card', () => ({ n: ref(1) }));
    const second = mountIslands('.card', 'card', () => ({ n: ref(9) }));
    expect(second).toEqual(first);
    expect([...document.querySelectorAll('.card span')].map((s) => s.textContent))
      .toEqual(['1', '1']);
  });
});

describe('mountIsland accepts an element', () => {
  it('mounts when handed a node instead of a selector', () => {
    document.body.innerHTML = '<div class="card"><span>{{ n }}</span></div>';
    const el = document.querySelector('.card');
    expect(mountIsland(el, 'byEl', () => ({ n: ref(4) }))).not.toBeNull();
    expect(document.querySelector('.card span').textContent).toBe('4');
  });
});
