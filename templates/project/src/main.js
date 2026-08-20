import { ref, computed } from 'vue';
import { mountIsland } from 'vueflow';

/**
 * One island per interactive region. Everything outside an island stays
 * untouched Webflow DOM, with Webflow's own runtime intact.
 *
 * An island skips itself when its mount point isn't on the current page, so a
 * single bundle can serve every page of the site.
 *
 * The markup lives in Webflow. This island expects, somewhere on the page:
 *
 *   <div id="counter">                        <- any element with this id
 *     <button v-on:click="cups++">+</button>  <- Custom Element (directives)
 *     <span>{{ cups }} cups = {{ grams }} g</span>
 *   </div>
 */
mountIsland('#counter', 'counter', () => {
  const cups = ref(1);
  const grams = computed(() => cups.value * 18);
  return { cups, grams };
});
