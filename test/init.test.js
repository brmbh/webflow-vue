import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init } from '../src/cli/init.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vueflow-init-'));
});

const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('vueflow init', () => {
  it('writes a complete project', () => {
    const { written } = init(dir, { version: '1.2.3' });
    expect(written).toEqual([
      '.gitignore',
      'README.md',
      'package.json',
      'src/main.js',
      'vite.config.js',
      'vueflow-bridge.html',
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
    expect(JSON.parse(read('package.json')).dependencies.vueflow).toBe('^1.2.3');
  });

  it('points the bridge at the matching CDN tag', () => {
    init(dir, { version: '1.2.3' });
    expect(read('vueflow-bridge.html')).toContain("var VUEFLOW_VERSION = 'v1.2.3'");
  });

  it('leaves no unsubstituted placeholders anywhere', () => {
    const { written } = init(dir, { version: '1.2.3' });
    for (const f of written) {
      expect(read(f), `${f} still carries a placeholder`).not.toMatch(/__[A-Z_]+__/);
    }
  });

  it('externalizes both vue and vueflow so the bundle stays app-only', () => {
    init(dir, { version: '1.2.3' });
    const config = read('vite.config.js');
    expect(config).toContain("external: ['vue', 'vueflow']");
    expect(config).toContain("globals: { vue: 'Vue', vueflow: 'Vueflow' }");
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
