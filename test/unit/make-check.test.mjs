import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFindings } from '../../harness/tools/lib/render.mjs';

// hyperframes check --json 결과 → 보고할 findings (make.mjs)
test('checkFindings flattens areas, drops known noise and text covered by trans.fill overlay', () => {
  const chk = {
    ok: false,
    runtime: { findings: [{ severity: 'warning', code: 'console_warning', message: 'Scripts "build/three.js" and "build/three.min.js" are deprecated with r150+' }, { severity: 'error', code: 'http_error', message: '404 loading assets/x.png' }] },
    layout: { findings: [
      { severity: 'error', code: 'text_occluded', selector: '#st1-card', containerSelector: '#mh-fill-st1-1' },
      { severity: 'error', code: 'text_occluded', selector: '#st1-card', containerSelector: '#st1 > div:nth-of-type(4)' },
    ] },
    meta: { note: 'x' },
  };
  const f = checkFindings(chk);
  assert.deepEqual(f.map(x => [x.area, x.code, x.containerSelector]), [['runtime', 'http_error', undefined], ['layout', 'text_occluded', '#st1 > div:nth-of-type(4)']]);
});
