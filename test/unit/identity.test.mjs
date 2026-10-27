import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
test('plugin name is motion-harness2', () => {
  const p = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'));
  assert.equal(p.name, 'motion-harness2');
  assert.equal(p.repository, 'https://github.com/gud8238/motion-harness-v2');
  const m = JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  assert.equal(m.name, 'motion-harness2');
  assert.equal(m.plugins[0].name, 'motion-harness2');
});
test('default data dir is ~/.motion-harness2', async () => {
  delete process.env.MH_DATA;
  const { DATA } = await import('../../harness/tools/_common.mjs');
  assert.ok(DATA.endsWith('.motion-harness2'));
});
test('no v1 command prefix left in skills and tools', () => {
  const files = [...fs.readdirSync('skills').map(d => `skills/${d}/SKILL.md`), ...fs.readdirSync('harness/tools').filter(f => f.endsWith('.mjs')).map(f => `harness/tools/${f}`)];
  for (const f of files) assert.ok(!/\/motion-harness:/.test(fs.readFileSync(f, 'utf8')), f);
});
