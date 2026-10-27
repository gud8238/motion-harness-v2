// 효과 카탈로그 로더와 장면 코드의 ② 효과 API 호출 탐지 (gate.mjs 가 사용)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CATALOG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalog.json');   // <플러그인>/harness/catalog.json

export const loadCatalog = () => JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

// 주석(// /* */ <!-- -->)을 같은 길이의 공백으로 치환한다(줄바꿈 유지 → 줄 번호 보존).
// 문자열 안의 // (URL 등)은 주석이 아니다. ' " 는 줄 끝에서 끝나 HTML 본문의 아포스트로피가 뒤를 삼키지 않게 한다.
export function stripComments(code) {
  const out = code.split('');                                  // UTF-16 단위 — code 의 인덱스와 일치
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  const n = code.length;
  let i = 0;
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n && code[i] !== c && !(c !== '`' && code[i] === '\n')) i += code[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && d === '/' && code[i - 1] !== ':') {           // 따옴표 없는 http://… 는 주석이 아니다
      let j = i; while (j < n && code[j] !== '\n') j++;
      blank(i, j); i = j;
    } else if (c === '/' && d === '*') {
      const e = code.indexOf('*/', i + 2), j = e < 0 ? n : e + 2;
      blank(i, j); i = j;
    } else if (c === '<' && code.startsWith('<!--', i)) {
      const e = code.indexOf('-->', i + 4), j = e < 0 ? n : e + 3;
      blank(i, j); i = j;
    } else i++;
  }
  return out.join('');
}

// tier 2 항목의 api 문자열이 나오는 모든 위치. 같은 api 를 여러 id 가 공유하면 ids 에 모두 담는다.
export function findApiCalls(code, catalog) {
  const byApi = new Map();                                                // api 문자열 → 공유하는 id 목록
  for (const e of catalog) if (e.tier === 2) for (const a of e.api) byApi.set(a, [...(byApi.get(a) || []), e.id]);
  const src = stripComments(code), hits = [];
  for (const [api, ids] of byApi) {
    for (let p = src.indexOf(api); p >= 0; p = src.indexOf(api, p + 1)) {
      let line = 1; for (let k = src.indexOf('\n'); k >= 0 && k < p; k = src.indexOf('\n', k + 1)) line++;
      hits.push({ ids: [...ids], api, line, pos: p });
    }
  }
  return hits.sort((a, b) => a.pos - b.pos).map(({ pos, ...h }) => h);
}
