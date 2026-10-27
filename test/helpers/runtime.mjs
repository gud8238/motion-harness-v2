// 브라우저 런타임(클래식 스크립트)을 Node vm 에서 불러오는 테스트 도우미.
// 컨텍스트의 전역 객체가 곧 window 이다: window.X 와 맨 이름 X 가 같은 값 (테스트는 로드 뒤에 W.DNA = … 로 덮어쓸 수 있다).
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const abs = f => (path.isAbsolute(f) ? f : path.join(ROOT, f));
const run = (ctx, file) => { const filename = abs(file); vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx, { filename }); };

// 최소 document 스텁: createElement 만 (캔버스 getContext 는 null)
const makeDocument = () => ({
  createElement: () => ({ style: {}, width: 0, height: 0, getContext: () => null, setAttribute() {}, appendChild() {} }),
  getElementById: () => null,
});

// loadRuntime(['harness/runtime/mh.js', …], { CustomEase, gsap, … }) → window (= vm 전역)
export function loadRuntime(files, globals = {}) {
  const ctx = vm.createContext({ console, document: makeDocument(), ...globals });
  ctx.window = ctx;
  for (const f of files) run(ctx, f);
  return ctx;
}

// loadUMD(file) → UMD 번들의 module.exports (없으면 번들이 새로 붙인 단일 전역)
export function loadUMD(file) {
  const mod = { exports: {} };
  const ctx = vm.createContext({ console, module: mod, exports: mod.exports });
  const before = new Set(Object.keys(ctx));
  run(ctx, file);
  const ex = mod.exports;
  if (ex !== undefined && (typeof ex !== 'object' || ex === null || Object.keys(ex).length)) return ex;
  const fresh = Object.keys(ctx).filter(k => !before.has(k));
  if (fresh.length === 1) return ctx[fresh[0]];
  throw new Error(`UMD 번들에서 내보낸 객체를 찾지 못했습니다: ${file}`);
}
