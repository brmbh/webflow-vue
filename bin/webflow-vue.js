#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '../src/cli/init.js';
import { detectRoute, formatReport, loadPage } from '../src/cli/detect.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '../package.json'), 'utf8'));

const USAGE = `webflow-vue ${pkg.version}

  Vue 3 islands on Webflow-rendered DOM.

Usage
  npx webflow-vue detect <url>   read a published page and report its route
  npx webflow-vue init [dir]     scaffold a webflow-vue project (default: .)

Options
  --json                     detect: print the report as JSON
  --force                    init: overwrite existing files
  --name <name>              init: project name (default: the directory name)
  -h, --help                 show this
  -v, --version              print the version

Run detect before deciding anything. A page already carrying CDN tags is on
route 1 and does not want a project; a page carrying a bridge is on route 2.
Guessing that from the conversation is how an agent scaffolds Vite over a
working two-tag widget.

Not building a project? You may not need one. A single reactive widget can go
straight into Webflow custom code with two script tags — see
https://github.com/brmbh/webflow-vue#quick-start--two-script-tags
`;

function parse(argv) {
  const flags = { force: false, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') flags.force = true;
    else if (a === '--json') flags.json = true;
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

const [command, ...rest] = positional;

async function runDetect(target) {
  if (!target) {
    console.error('detect needs a published page URL\n');
    console.error('  npx webflow-vue detect https://your-site.webflow.io/some-page');
    process.exit(1);
  }
  const html = await loadPage(target, { readFile: (p) => fs.readFileSync(p, 'utf8') });
  const report = detectRoute(html, { url: target });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  // Warnings are findings, not failures — a route-0 page is a normal starting
  // point. Only a page that installed both routes is broken by construction.
  process.exit(report.route === 'mixed' ? 1 : 0);
}

function runInit(dir = '.') {
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
}

try {
  if (command === 'detect') await runDetect(rest[0]);
  else if (command === 'init') runInit(rest[0]);
  else {
    console.error(`unknown command: ${command}\n`);
    console.error(USAGE);
    process.exit(1);
  }
} catch (err) {
  console.error(`webflow-vue ${command} failed: ${err.message}`);
  process.exit(1);
}
