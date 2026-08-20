import { describe, it, expect, beforeEach } from 'vitest';
import { useWebflowCMS } from '../src/composables/useWebflowCMS.js';
import { number, bool, list, richText } from '../src/extractors.js';

/**
 * Loop A — the CMS parser against the DOM shapes Webflow actually renders.
 *
 * The nesting tests exist because the previous unscoped implementation merged a
 * nested Collection List's fields into its parent item, last one winning.
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('useWebflowCMS', () => {
  it('groups items by data-field-collection and reads both conventions', () => {
    document.body.innerHTML = `
      <div data-field-collection="beans" data-field-slug="yirgacheffe">
        <span data-field="name">Yirgacheffe Sunrise</span>
      </div>
      <div data-field-collection="beans" data-field-slug="toraja">
        <span data-field="name">Toraja Heights</span>
      </div>`;

    const { collections } = useWebflowCMS();

    expect(collections.value.beans).toHaveLength(2);
    expect(collections.value.beans[0]).toMatchObject({
      slug: 'yirgacheffe',
      name: 'Yirgacheffe Sunrise',
    });
  });

  it('keeps a nested list out of the parent entry and exposes it as an array', () => {
    document.body.innerHTML = `
      <div data-field-collection="beans">
        <span data-field="name">Kivu Shores</span>
        <div data-field-collection="methods">
          <span data-field="name">Aeropress</span>
        </div>
        <div data-field-collection="methods">
          <span data-field="name">V60</span>
        </div>
      </div>`;

    const { collections } = useWebflowCMS();

    // One root item, not three.
    expect(collections.value.beans).toHaveLength(1);
    expect(collections.value.methods).toBeUndefined();

    const [bean] = collections.value.beans;
    // The parent's own name survived — this is the regression that mattered.
    expect(bean.name).toBe('Kivu Shores');
    expect(bean.methods.map((m) => m.name)).toEqual(['Aeropress', 'V60']);
  });

  it('applies extractors, including for fields that are absent', () => {
    document.body.innerHTML = `
      <div data-field-collection="beans">
        <span data-field="price">€ 14,50</span>
        <span data-field="methods">aeropress, v60 , chemex</span>
        <span data-field="notes"><p>Stone fruit &amp; cocoa</p></span>
      </div>`;

    const { collections } = useWebflowCMS({
      extractors: { price: number(), methods: list(), notes: richText(), decaf: bool() },
    });

    const [bean] = collections.value.beans;
    expect(bean.price).toBe(14.5);
    expect(bean.methods).toEqual(['aeropress', 'v60', 'chemex']);
    expect(bean.notes).toBe('<p>Stone fruit &amp; cocoa</p>');
    // Webflow renders nothing for a false Switch, so absence must read as false.
    expect(bean.decaf).toBe(false);
  });


  it('reads the class convention Webflow forces inside Collection Items', () => {
    // No attribute is settable on an element inside a Collection Item, so the
    // marker has to be a class and the value a CMS-bound text.
    document.body.innerHTML = `
      <div class="w-dyn-item">
        <div class="vf-c-beans">
          <div class="vf-f-slug">kivu-shores</div>
          <div class="vf-f-name">Kivu Shores</div>
          <div class="vf-f-roast-level">Medium</div>
          <div class="vf-c-methods">
            <div class="vf-f-name">Aeropress</div>
          </div>
        </div>
      </div>`;

    const { collections } = useWebflowCMS();

    expect(collections.value.beans).toHaveLength(1);
    const [bean] = collections.value.beans;
    expect(bean.slug).toBe('kivu-shores');
    expect(bean.roastLevel).toBe('Medium');
    expect(bean.name).toBe('Kivu Shores');
    expect(bean.methods.map((m) => m.name)).toEqual(['Aeropress']);
  });

  it('mixes class markers and attribute markers in one tree', () => {
    document.body.innerHTML = `
      <div data-field-collection="beans">
        <div class="vf-f-name">Nyeri Peak</div>
        <span data-field="price">15</span>
      </div>`;

    const { collections } = useWebflowCMS({ extractors: { price: number() } });
    expect(collections.value.beans[0]).toMatchObject({ name: 'Nyeri Peak', price: 15 });
  });

  it('ignores an item element with no collection key', () => {
    document.body.innerHTML = `<div data-field-collection=""><span data-field="name">x</span></div>`;
    const { collections } = useWebflowCMS();
    expect(collections.value).toEqual({});
  });
});
