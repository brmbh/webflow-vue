import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../src/cli/init.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webflow-vue-init-'));
});

const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('webflow-vue init', () => {
  it('writes a complete project', () => {
    const { written } = init(dir, { version: '1.2.3' });
    expect(written).toEqual([
      '.gitignore',
      'README.md',
      'package.json',
      'src/main.js',
      'vite.config.js',
      'webflow-vue-bridge.html',
    ]);
  });

  it('names the project after the target directory', () => {
    init(dir, { version: '1.2.3' });
    expect(JSON.parse(read('package.json')).name).toBe(path.basename(dir));
  });

  it('accepts an explicit name', () => {
    init(dir, { version: '1.2.3', name: 'brew-lab' });
    expect(JSON.parse(read('package.json')).name).toBe('brew-lab');
    expect(read('README.md')).toContain('# brew-lab');
  });

  it('pins the dependency to the running CLI version', () => {
    init(dir, { version: '1.2.3' });
    expect(JSON.parse(read('package.json')).dependencies['webflow-vue']).toBe('^1.2.3');
  });

  it('points the bridge at the matching CDN tag', () => {
    init(dir, { version: '1.2.3' });
    expect(read('webflow-vue-bridge.html')).toContain("var WEBFLOW_VUE_VERSION = '1.2.3'");
    expect(read('webflow-vue-bridge.html')).toContain('cdn.jsdelivr.net/npm/webflow-vue@');
  });

  it('leaves no unsubstituted placeholders anywhere', () => {
    const { written } = init(dir, { version: '1.2.3' });
    for (const f of written) {
      expect(read(f), `${f} still carries a placeholder`).not.toMatch(/__[A-Z_]+__/);
    }
  });

  it('externalizes both vue and webflow-vue so the bundle stays app-only', () => {
    init(dir, { version: '1.2.3' });
    const config = read('vite.config.js');
    expect(config).toContain("external: ['vue', 'webflow-vue']");
    expect(config).toContain("globals: { vue: 'Vue', 'webflow-vue': 'WebflowVue' }");
  });

  it('refuses to overwrite an existing project', () => {
    init(dir, { version: '1.2.3' });
    fs.writeFileSync(path.join(dir, 'src', 'main.js'), '// my work');
    expect(() => init(dir, { version: '1.2.3' })).toThrow(/refusing to overwrite/);
    expect(read('src/main.js')).toBe('// my work');
  });

  it('overwrites when forced', () => {
    init(dir, { version: '1.2.3' });
    fs.writeFileSync(path.join(dir, 'src', 'main.js'), '// my work');
    init(dir, { version: '1.2.3', force: true });
    expect(read('src/main.js')).toContain('mountIsland');
  });
});

describe('package metadata', () => {
  it('keeps the exported version in step with package.json', async () => {
    // vitest runs from the project root; import.meta.url is not a file: URL
    // under the jsdom environment.
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    const lib = await import('../src/index.js');
    expect(lib.version).toBe(pkg.version);
  });
});
