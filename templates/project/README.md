# __PROJECT_NAME__

A Webflow Vue project: Vue 3 islands mounted on Webflow-rendered DOM.

## Develop

```bash
npm install
npm run dev     # https://localhost:3000 — accept the mkcert certificate prompt
```

Open your Webflow page with `?debug` appended. The bridge loads this dev server
instead of the published bundle, so edits reload live on the real page.

## Ship

```bash
npm run build   # dist/main.js
```

Upload `dist/main.js` to Webflow assets **renamed to `bundle.txt`** (Webflow
rejects `.js`), then put its asset id into `webflow-vue-bridge.html`.

## The bridge

`webflow-vue-bridge.html` goes into the Webflow page's custom code, **page level
only** — site level plus page level mounts Vue twice.

## Writing islands

Islands live in `src/main.js`. The markup lives in Webflow. Both sides have to
agree: whatever the markup references, `setup()` must return.

Rules that are not guessable, and cost real debugging time to find:

- Any element carrying a directive must be a **Custom Element** in Webflow.
- **Long-form directives only** — `v-on:click`, not `@click`.
- **`ref` does not survive publish.** Use `data-vf-ref`.
- A code embed's scripts run at parse time, so an embed must sit **after** every
  island it mounts.

`npx skills add brmbh/webflow-vue` installs the agent skill that knows all of them.
