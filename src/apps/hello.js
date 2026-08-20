import { ref, computed } from 'vue';
import { mountIsland } from '../mountIsland.js';

/**
 * The whole boilerplate in one screen.
 *
 * No template, no build step for the markup, no props: the Webflow page owns
 * every element and every class. This file only supplies the two values the
 * DOM asks for — `cups` (state) and `grams` (derived).
 */

const GRAMS_PER_CUP = 18;

mountIsland('#vf-hello', 'hello', () => {
  const cups = ref(1);
  const grams = computed(() => cups.value * GRAMS_PER_CUP);
  return { cups, grams };
});
