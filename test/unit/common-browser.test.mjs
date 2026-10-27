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
