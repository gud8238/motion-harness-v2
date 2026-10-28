import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserPath } from '../../harness/tools/_common.mjs';

// playwright Chromium 을 받을 수 없는 환경(컨테이너·사내망): MH_CHROMIUM 은 항상, HyperFrames 브라우저 변수는 기본 실행 파일이 없을 때만
test('browserPath: MH_CHROMIUM first; HYPERFRAMES_BROWSER_PATH only as fallback for a missing executable', () => {
  const missing = new Error("browserType.launch: Executable doesn't exist at /x/chrome");
  assert.equal(browserPath(null, { MH_CHROMIUM: '/a' }), '/a');
  assert.equal(browserPath(null, { HYPERFRAMES_BROWSER_PATH: '/h' }), null);
  assert.equal(browserPath(missing, { HYPERFRAMES_BROWSER_PATH: '/h' }), '/h');
  assert.equal(browserPath(missing, { PRODUCER_HEADLESS_SHELL_PATH: '/p' }), '/p');
  assert.equal(browserPath(new Error('crashed'), { HYPERFRAMES_BROWSER_PATH: '/h' }), null);
  assert.equal(browserPath(missing, {}), null);
});

test('winQuote quotes spaced/special args only on Windows; DATA prefers MH2_DATA over MH_DATA', async () => {
  const { winQuote } = await import('../../harness/tools/_common.mjs');
  assert.equal(winQuote('C:\\Users\\김 선생\\.motion-harness2\\library', true), '"C:\\Users\\김 선생\\.motion-harness2\\library"');
  assert.equal(winQuote('playwright@^1.48.0', true), '"playwright@^1.48.0"');
  assert.equal(winQuote('--depth', true), '--depth');
  assert.equal(winQuote('a b', false), 'a b');
  const { spawnSync } = await import('node:child_process');
  const run = env => spawnSync(process.execPath, ['--input-type=module', '-e', "import('./harness/tools/_common.mjs').then(m => process.stdout.write(m.DATA))"], { encoding: 'utf8', env: { ...process.env, MH2_DATA: '', MH_DATA: '', ...env } }).stdout;
  assert.equal(run({ MH2_DATA: '/x2', MH_DATA: '/x1' }), '/x2');
  assert.equal(run({ MH_DATA: '/x1' }), '/x1');
});
