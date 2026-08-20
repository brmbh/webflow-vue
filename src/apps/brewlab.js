import { ref, computed, watch } from 'vue';
import { mountIsland } from '../mountIsland.js';
import { useSharedStore } from '../composables/useSharedStore.js';
import { useWebflowCMS } from '../composables/useWebflowCMS.js';

/**
 * Brew Lab — coffee subscription builder as Vue islands on Webflow.
 * Shared store carries the cart + bean selection across islands AND pages
 * (sessionStorage persistence): add to cart on /brew-lab, the navbar badge
 * on /brew-lab-about still shows it.
 */

const store = useSharedStore('brewlab', { cart: [], selectedSlug: null }, { persist: true });

// Demo assets (Webflow CDN) — swapped by slug/size at render time.
// A production build would move these onto the CMS items; for the wireframe
// they stay a code-level map so the collection schema stays untouched.
const CDN = 'https://cdn.prod.website-files.com/61d44e644e2a5769e18a848c';
const BANNERS = {
  'minas-velvet': `${CDN}/6a746a1e10573c509b69ac17_banner2-minas-velvet.png`,
  'nyeri-peak': `${CDN}/6a746a1e0213f516c0ef9879_banner2-nyeri-peak.png`,
  'tarrazu-bright': `${CDN}/6a746a1f29e36a03dae0ba51_banner2-tarrazu-bright.png`,
  'huila-reserve': `${CDN}/6a746a1f9e6664fca1bcdaeb_banner2-huila-reserve.png`,
  'antigua-stone': `${CDN}/6a746a1fe03932b5908c565f_banner2-antigua-stone.png`,
  'kivu-shores': `${CDN}/6a746a1f364c03703f61a4b3_banner2-kivu-shores.png`,
  'sidamo-dusk': `${CDN}/6a746a20930988014d12f84a_banner2-sidamo-dusk.png`,
  'java-ember': `${CDN}/6a746a2086f952d66bda00b9_banner2-java-ember.png`,
  'apaneca-cloud': `${CDN}/6a746a20ee8c42769dc5e8ba_banner2-apaneca-cloud.png`,
};
const BAGS = {
  '250 g': `${CDN}/6a7465f2c67dec4f65b363fa_brewlab-bag-250g.png`,
  '500 g': `${CDN}/6a7465f26a3f83e346b3fb35_brewlab-bag-500g.png`,
  '1 kg': `${CDN}/6a7465f2e092a358dabf393d_brewlab-bag-1kg.png`,
};

const cms = useWebflowCMS();
const beans = computed(() =>
  (cms.collections.value.beans || []).map((b) => ({ ...b, price: Number(b.price) }))
);
console.log(`[webflow-vue:brewlab] ${beans.value.length} beans parsed from Webflow CMS shell`);

// --- Island: cart badge (navbar, lives on EVERY Brew Lab page) -------------
mountIsland('#vf-cart', 'cart-badge', () => {
  const s = useSharedStore('brewlab');
  const cartCount = computed(() => s.cart.length);
  const cartTotal = computed(() =>
    s.cart.reduce((sum, item) => sum + item.price, 0).toFixed(2)
  );
  return { cartCount, cartTotal };
});

// --- Island: bean grid with reactive facets --------------------------------
mountIsland('#vf-shop', 'shop', () => {
  const s = useSharedStore('brewlab');
  const query = ref('');
  const roasts = ['All', 'Light', 'Medium', 'Dark'];
  const roast = ref('All');
  const setRoast = (r) => (roast.value = r);

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    return beans.value.filter((b) => {
      const roastOk = roast.value === 'All' || b.roastLevel === roast.value;
      const qOk =
        !q ||
        [b.name, b.origin, b.tastingNotes].some((v) => (v || '').toLowerCase().includes(q));
      return roastOk && qOk;
    });
  });

  watch([query, roast], () =>
    console.log(`[webflow-vue:brewlab] filter q="${query.value}" roast=${roast.value} → ${filtered.value.length} beans`)
  );

  const selectedSlug = computed(() => s.selectedSlug);
  const select = (bean) => {
    s.selectedSlug = bean.slug;
    console.log(`[webflow-vue:brewlab] selected "${bean.name}" — configurator + origin islands react`);
  };

  const bannerFor = (bean) => BANNERS[bean.slug] || null;

  return { beans, filtered, query, roasts, roast, setRoast, select, selectedSlug, bannerFor };
});

// --- Island: subscription configurator -------------------------------------
mountIsland('#vf-config', 'configurator', () => {
  const s = useSharedStore('brewlab');
  const bean = computed(() => beans.value.find((b) => b.slug === s.selectedSlug) || null);

  const grinds = ['Whole bean', 'Filter', 'Espresso'];
  const grind = ref('Whole bean');
  const sizes = [
    { label: '250 g', factor: 1 },
    { label: '500 g', factor: 1.8 },
    { label: '1 kg', factor: 3.2 },
  ];
  const size = ref(sizes[0]);
  const freqs = [
    { label: 'One-off', discount: 0 },
    { label: 'Monthly', discount: 10 },
    { label: 'Biweekly', discount: 15 },
  ];
  const freq = ref(freqs[0]);

  const price = computed(() => {
    if (!bean.value) return '0.00';
    return (bean.value.price * size.value.factor * (1 - freq.value.discount / 100)).toFixed(2);
  });

  const addToCart = () => {
    const item = {
      slug: bean.value.slug,
      name: bean.value.name,
      grind: grind.value,
      size: size.value.label,
      freq: freq.value.label,
      price: Number(price.value),
    };
    s.cart.push(item);
    console.log('[webflow-vue:brewlab] addToCart', item, `→ cart size ${s.cart.length}`);
  };

  const bagImg = computed(() => BAGS[size.value.label] || null);

  return { bean, grinds, grind, sizes, size, freqs, freq, price, addToCart, bagImg };
});

// --- Island: origin info from a public API ---------------------------------
mountIsland('#vf-origin', 'origin', () => {
  const s = useSharedStore('brewlab');
  const info = ref(null);
  const loading = ref(false);
  const cache = {};

  watch(
    () => s.selectedSlug,
    async (slug) => {
      const bean = beans.value.find((b) => b.slug === slug);
      const cc = bean && bean.countryCode;
      if (!cc) {
        info.value = null;
        return;
      }
      if (cache[cc]) {
        info.value = cache[cc];
        return;
      }
      loading.value = true;
      info.value = null;
      try {
        const flag = cc
          .toUpperCase()
          .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(bean.origin)}&count=1`
        );
        const geo = (await geoRes.json()).results[0];
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,wind_speed_10m`
        );
        const wx = (await wxRes.json()).current;
        info.value = cache[cc] = {
          flag,
          name: bean.origin,
          temp: Math.round(wx.temperature_2m),
          wind: Math.round(wx.wind_speed_10m),
          timezone: geo.timezone || `${geo.latitude.toFixed(1)}°, ${geo.longitude.toFixed(1)}°`,
        };
        console.log(`[webflow-vue:brewlab] origin weather fetched for ${bean.origin}`, cache[cc]);
      } catch (err) {
        console.error('[webflow-vue:brewlab] origin fetch failed', err);
        info.value = null;
      }
      loading.value = false;
    },
    { immediate: true }
  );

  return { info, loading };
});
