/* =========================================================
   hangul.js — 두벌식 한글 분해 / 키 시퀀스 / 단계 필터
   전역 객체 HG 로 노출 (file:// 로 열어도 동작하도록 모듈 미사용)
   ========================================================= */
var HG = (function () {
  'use strict';

  /* ---------- 두벌식 키맵 ---------- */
  var KEYMAP = {
    q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ',
    y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
    a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ',
    h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
    z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ',
    b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
    Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ',
    O: 'ㅒ', P: 'ㅖ'
  };

  var JAMO2KEY = {};
  for (var k in KEYMAP) JAMO2KEY[KEYMAP[k]] = k;

  /* ---------- 손가락 배정 ---------- */
  // 0=왼소지 1=왼약지 2=왼중지 3=왼검지 4=오른검지 5=오른중지 6=오른약지 7=오른소지
  var FINGER = {
    q: 0, a: 0, z: 0,
    w: 1, s: 1, x: 1,
    e: 2, d: 2, c: 2,
    r: 3, f: 3, v: 3, t: 3, g: 3, b: 3,
    y: 4, h: 4, n: 4, u: 4, j: 4, m: 4,
    i: 5, k: 5,
    o: 6, l: 6,
    p: 7
  };
  var FINGER_NAME = ['왼손 새끼', '왼손 약지', '왼손 중지', '왼손 검지',
    '오른손 검지', '오른손 중지', '오른손 약지', '오른손 새끼'];

  function fingerOf(key) {
    var lower = key.toLowerCase();
    return FINGER.hasOwnProperty(lower) ? FINGER[lower] : -1;
  }

  /* ---------- 자모 테이블 ---------- */
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
    'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ',
    'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ',
    'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ',
    'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  // 한 키로 못 치는 겹자모 → 기본 자모 두 개
  var COMPOSITE = {
    'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'],
    'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'], 'ㄼ': ['ㄹ', 'ㅂ'],
    'ㄽ': ['ㄹ', 'ㅅ'], 'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'],
    'ㅀ': ['ㄹ', 'ㅎ'], 'ㅄ': ['ㅂ', 'ㅅ'],
    'ㅘ': ['ㅗ', 'ㅏ'], 'ㅙ': ['ㅗ', 'ㅐ'], 'ㅚ': ['ㅗ', 'ㅣ'],
    'ㅝ': ['ㅜ', 'ㅓ'], 'ㅞ': ['ㅜ', 'ㅔ'], 'ㅟ': ['ㅜ', 'ㅣ'],
    'ㅢ': ['ㅡ', 'ㅣ']
  };

  // IME가 연달아 치면 겹자모 한 글자로 붙여 버리는 쌍 (ㄹ+ㅁ→ㄻ, ㅗ+ㅏ→ㅘ …)
  var COMBINE = {};
  for (var cj in COMPOSITE) {
    COMBINE[COMPOSITE[cj][0] + COMPOSITE[cj][1]] = cj;
  }
  function combines(a, b) { return COMBINE.hasOwnProperty(a + b); }

  // IME가 같은 자음을 연달아 치면 쌍자음 한 글자로 합치기도 한다 (ㅂ+ㅂ→ㅃ)
  // 쌍자음 키 → 홑자음 키
  var SSANG_BASE = { Q: 'q', W: 'w', E: 'e', R: 'r', T: 't' };

  var SBASE = 0xAC00, SLAST = 0xD7A3;

  /* ---------- 자모 → 키들 ---------- */
  function jamoToKeys(j) {
    if (COMPOSITE[j]) {
      var parts = COMPOSITE[j], out = [];
      for (var i = 0; i < parts.length; i++) out.push(JAMO2KEY[parts[i]]);
      return out;
    }
    return JAMO2KEY[j] ? [JAMO2KEY[j]] : [];
  }

  /* ---------- 문자 하나 → 키 시퀀스 ----------
     한글 음절이 아니면 그 문자 자체를 하나의 '키'로 취급(공백·문장부호 등) */
  function charToKeys(ch) {
    var code = ch.charCodeAt(0);
    if (code >= SBASE && code <= SLAST) {
      var s = code - SBASE;
      var cho = CHO[Math.floor(s / 588)];
      var jung = JUNG[Math.floor((s % 588) / 28)];
      var jong = JONG[s % 28];
      var keys = jamoToKeys(cho).concat(jamoToKeys(jung));
      if (jong) keys = keys.concat(jamoToKeys(jong));
      return keys;
    }
    if (JAMO2KEY[ch]) return jamoToKeys(ch);            // 낱자 ㄱ, ㅏ …
    if (COMPOSITE[ch]) return jamoToKeys(ch);           // 낱자 ㅘ, ㄺ …
    return [ch];                                        // 공백·기타
  }

  /* ---------- 문자열 → 키 시퀀스 ---------- */
  function textToKeys(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      out = out.concat(charToKeys(text[i]));
    }
    return out;
  }

  /* ---------- 문자열 → 문자별 키 시퀀스(진행 표시용) ---------- */
  function textToKeyGroups(text) {
    var groups = [];
    for (var i = 0; i < text.length; i++) groups.push(charToKeys(text[i]));
    return groups;
  }

  /* ---------- 한/영 구분이 되는 키 목록 ----------
     키만 비교하면 한/영이 영문 상태일 때 'rk' 가 '가' 로 인정된다.
     그 글자가 한글에서 나온 키인지(h)를 같이 들고 다녀야 구분할 수 있다. */
  function charToKeyPairs(ch) {
    var code = ch.charCodeAt(0);
    var i, out = [];
    if (code >= SBASE && code <= SLAST) {
      var keys = charToKeys(ch);
      for (i = 0; i < keys.length; i++) out.push({ k: keys[i], h: true });
      return out;
    }
    if (JAMO2KEY[ch] || COMPOSITE[ch]) {
      var jk = jamoToKeys(ch);
      for (i = 0; i < jk.length; i++) out.push({ k: jk[i], h: true });
      return out;
    }
    return [{ k: ch, h: false }];       // 공백·문장부호·영문 그 자체
  }

  function textToPairGroups(text) {
    var groups = [];
    for (var i = 0; i < text.length; i++) groups.push(charToKeyPairs(text[i]));
    return groups;
  }

  function textToPairs(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) out = out.concat(charToKeyPairs(text[i]));
    return out;
  }

  /* ---------- 자모 분해(표시용) ---------- */
  function decompose(ch) {
    var code = ch.charCodeAt(0);
    if (code >= SBASE && code <= SLAST) {
      var s = code - SBASE;
      var jong = JONG[s % 28];
      var r = [CHO[Math.floor(s / 588)], JUNG[Math.floor((s % 588) / 28)]];
      if (jong) r.push(jong);
      return r;
    }
    return [ch];
  }

  /* ---------- 단계 필터: 텍스트가 허용 키 집합만으로 쳐지는가 ---------- */
  function isTypableWith(text, allowedKeySet) {
    var keys = textToKeys(text);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      // 한글 자모가 아닌 것(공백·마침표·쉼표 등)은 단계 제한을 걸지 않는다
      if (!KEYMAP.hasOwnProperty(key)) continue;
      if (!allowedKeySet[key]) return false;
    }
    return true;
  }

  /* ---------- 텍스트가 쓰는 키 목록 ---------- */
  function usedKeys(text) {
    var keys = textToKeys(text), set = {}, out = [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === ' ') continue;
      if (!set[keys[i]]) { set[keys[i]] = 1; out.push(keys[i]); }
    }
    return out;
  }

  /* =========================================================
     입력 판정 — 목표 키 시퀀스와 현재 입력값을 비교
     ========================================================= */
  /**
   * @param {string} target  목표 문자열
   * @param {string} typed   input 요소의 현재 값(조합 중 포함)
   * @returns {{ok:boolean, matched:number, totalKeys:number,
   *             charDone:number, badFrom:number}}
   *   ok        : 지금까지 입력이 목표의 접두사인가
   *   matched   : 일치한 키 개수
   *   charDone  : 완전히 끝난 글자 수
   *   badFrom   : 틀리기 시작한 글자 인덱스(-1이면 없음)
   */
  function judge(target, typed) {
    var groups = textToPairGroups(target);

    // 목표 키를 한 줄로 펴 두고(글자 번호 g 포함) 포인터 하나로 걷는다
    var flat = [], starts = [], g, q;
    for (g = 0; g < groups.length; g++) {
      starts.push(flat.length);
      for (q = 0; q < groups[g].length; q++) {
        flat.push({ k: groups[g][q].k, h: groups[g][q].h, g: g });
      }
    }

    var tPairs = textToPairs(typed);
    var p = 0, matched = 0, bad = -1, eng = false;
    for (var i = 0; i < tPairs.length; i++) {
      if (p >= flat.length) { bad = groups.length; break; }
      var expect = flat[p];
      var got = tPairs[i];
      if (got.k === expect.k && got.h === expect.h) {
        matched++;
        p++;
        continue;
      }
      // IME가 같은 자음 두 타를 쌍자음 한 글자로 합친 경우(ㅂㅂ→ㅃ) → 두 타로 인정
      var base = SSANG_BASE[got.k];
      if (got.h && expect.h && base && base === expect.k &&
        p + 1 < flat.length && flat[p + 1].h && flat[p + 1].k === base) {
        matched += 2;
        p += 2;
        continue;
      }
      bad = expect.g;
      // 한글을 쳐야 하는데 영문 글자가 들어왔다 = 한/영 키가 영문 상태
      if (expect.h && !got.h && /^[A-Za-z]$/.test(got.k)) eng = true;
      break;
    }

    var charDone, partial;
    if (p >= flat.length) { charDone = groups.length; partial = 0; }
    else { charDone = flat[p].g; partial = p - starts[flat[p].g]; }

    return {
      ok: bad === -1,
      matched: matched,
      totalKeys: flat.length,
      charDone: charDone,
      partial: partial,          // 현재 글자에서 몇 키까지 쳤나
      badFrom: bad,
      engMode: eng,              // 한/영 키를 안 눌렀을 때 true
      complete: bad === -1 && charDone >= groups.length
    };
  }

  /* ---------- 다음에 눌러야 할 키 ---------- */
  function nextKey(target, typed) {
    var groups = textToKeyGroups(target);
    var j = judge(target, typed);
    if (!j.ok) return null;                            // 틀린 상태 → 지워야 함
    if (j.charDone >= groups.length) return null;
    return groups[j.charDone][j.partial];
  }

  /* ---------- 타수 계산 ---------- */
  // 한글 타수 관례: 자판 타건 수 기준. 분당 타수 = 친 키 수 / 경과분
  function calcCPM(keyCount, elapsedMs) {
    if (elapsedMs <= 0) return 0;
    return Math.round(keyCount / (elapsedMs / 60000));
  }

  return {
    KEYMAP: KEYMAP,
    JAMO2KEY: JAMO2KEY,
    FINGER: FINGER,
    FINGER_NAME: FINGER_NAME,
    fingerOf: fingerOf,
    charToKeys: charToKeys,
    textToKeys: textToKeys,
    textToKeyGroups: textToKeyGroups,
    decompose: decompose,
    isTypableWith: isTypableWith,
    combines: combines,
    usedKeys: usedKeys,
    judge: judge,
    nextKey: nextKey,
    calcCPM: calcCPM
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HG;
