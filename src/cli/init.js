import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(HERE, '../../templates/project');

/** Files whose template name is prefixed to survive npm packing. */
const RENAME = { _package: 'package', _gitignore: '.gitignore' };

function targetName(relative) {
  const base = path.basename(relative);
  if (base === '_package.json') return path.join(path.dirname(relative), 'package.json');
  if (base === '_gitignore') return path.join(path.dirname(relative), '.gitignore');
  return relative;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
  });
}

/**
 * Scaffold a WebflowVue project. Deterministic and idempotent-by-refusal: it never
 * overwrites an existing file unless `force` is set, and reports what it wrote.
 */
export function init(targetDir, { version, force = false, name } = {}) {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error(`template directory missing at ${TEMPLATE}`);
  }
  const dest = path.resolve(targetDir);
  const projectName = name || path.basename(dest) || 'webflow-vue-project';

  const files = walk(TEMPLATE).map((rel) => ({ rel, out: targetName(rel) }));

  const clashes = files
    .map((f) => f.out)
    .filter((out) => fs.existsSync(path.join(dest, out)));
  if (clashes.length && !force) {
    const err = new Error(
      `refusing to overwrite existing file(s): ${clashes.join(', ')}\n` +
        'Re-run with --force to replace them.'
    );
    err.clashes = clashes;
    throw err;
  }

  const written = [];
  for (const { rel, out } of files) {
    const body = fs
      .readFileSync(path.join(TEMPLATE, rel), 'utf8')
      .replaceAll('__PROJECT_NAME__', projectName)
      .replaceAll('__WEBFLOW_VUE_VERSION_EXACT__', version)
      .replaceAll('__WEBFLOW_VUE_VERSION__', `^${version}`);
    const outPath = path.join(dest, out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, body);
    written.push(out);
  }
  return { dest, projectName, written: written.sort() };
}
