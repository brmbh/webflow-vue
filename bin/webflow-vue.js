#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../src/cli/init.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '../package.json'), 'utf8'));

const USAGE = `vueflow ${pkg.version}

  Vue 3 islands on Webflow-rendered DOM.

Usage
  npx webflow-vue init [dir]     scaffold a WebflowVue project (default: .)

Options
  --force                    overwrite existing files
  --name <name>              project name (default: the directory name)
  -h, --help                 show this
  -v, --version              print the version

Not building a project? You may not need one. A single reactive widget can go
straight into Webflow custom code with two script tags — see
https://github.com/brmbh/webflow-vue#quick-start--two-script-tags
`;

function parse(argv) {
  const flags = { force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') flags.force = true;
    else if (a === '--name') flags.name = argv[++i];
    else if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '-v' || a === '--version') flags.version = true;
    else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }
  return { flags, positional };
}

const { flags, positional } = parse(process.argv.slice(2));

if (flags.version) {
  console.log(pkg.version);
  process.exit(0);
}
if (flags.help || positional.length === 0) {
  console.log(USAGE);
  process.exit(positional.length === 0 && !flags.help ? 1 : 0);
}

const [command, dir = '.'] = positional;

if (command !== 'init') {
  console.error(`unknown command: ${command}\n`);
  console.error(USAGE);
  process.exit(1);
}

try {
  const { dest, projectName, written } = init(dir, {
    version: pkg.version,
    force: flags.force,
    name: flags.name,
  });
  console.log(`Created ${projectName} in ${dest}\n`);
  for (const f of written) console.log(`  ${f}`);
  console.log(`
Next:

  cd ${dir}
  npm install
  npm run dev

Then paste webflow-vue-bridge.html into your Webflow page's custom code — page
level only — and open the page with ?debug to load this dev server.

Let an agent do the Webflow side:  npx skills add brmbh/webflow-vue`);
} catch (err) {
  console.error(`vueflow init failed: ${err.message}`);
  process.exit(1);
}
