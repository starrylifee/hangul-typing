/* =========================================================
   village-bg.js — 장(챕터)마다 다른 배경
   sky  : 늘 떠 있는 하늘 장식 (해·구름 등, 아이템과 같은 자리표를 쓴다)
   hill : 풀밭 전체를 덮는 능선 — 직선 지평선을 가린다
   path : 광장에서 좌우 화면 밖까지 이어지는 길
   그림 본체(건물·동물)는 village-art*.js 에 있다.
   ========================================================= */
var VILLAGE_BG = (function () {
  'use strict';

  /* ---------- 1장 우리 동네 ---------- */
  var townHill = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 10 Q12 2 26 7 Q40 12 52 6 Q66 0 80 7 Q90 11 100 6 L100 40 L0 40 Z" fill="#a8e6a3"/>'
    + '<path d="M0 18 Q20 12 45 16 Q70 20 100 14 L100 40 L0 40 Z" fill="#98dd93"/>'
    + '<path d="M0 30 Q30 26 60 29 Q80 31 100 28 L100 40 L0 40 Z" fill="#8fd98a"/></svg>';

  var townPath = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 24 Q20 21 38 15 Q48 12 58 14 Q76 17 92 12 Q97 10.8 100 10 L100 14 '
    + 'Q97 14.8 92 16 Q76 21 58 18 Q48 16 40 19 Q22 25 0 26 Z" fill="#e8dcc0" opacity="0.85"/></svg>';

  /* ---------- 2장 바닷가 — 뒤쪽은 바다, 앞쪽은 모래사장 ---------- */
  var seaHill = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 0 L100 0 L100 22 L0 22 Z" fill="#63c6e8"/>'
    + '<path d="M0 8 Q14 5 28 8 Q42 11 56 8 Q70 5 84 8 Q92 10 100 8 L100 22 L0 22 Z" fill="#4fb8de"/>'
    + '<path d="M0 15 Q16 12 32 15 Q48 18 64 15 Q82 12 100 15 L100 22 L0 22 Z" fill="#3fa8d2"/>'
    + '<path d="M0 21 Q12 18 24 21 Q36 24 50 21 Q64 18 78 21 Q90 23 100 21 L100 40 L0 40 Z" fill="#f5e2bd"/>'
    + '<path d="M0 27 Q26 24 52 27 Q76 30 100 27 L100 40 L0 40 Z" fill="#efd8ac"/>'
    + '<g fill="#ffffff" opacity="0.7"><path d="M6 20 q4 -2 8 0" stroke="#fff" stroke-width="0.8" fill="none"/>'
    + '<path d="M40 18 q4 -2 8 0" stroke="#fff" stroke-width="0.8" fill="none"/>'
    + '<path d="M74 20 q4 -2 8 0" stroke="#fff" stroke-width="0.8" fill="none"/></g></svg>';

  var seaPath = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 25 Q22 22 42 17 Q54 14 66 16 Q82 19 100 13 L100 17 '
    + 'Q82 23 66 20 Q54 18 44 21 Q24 26 0 26 Z" fill="#fbf1da" opacity="0.9"/></svg>';

  /* ---------- 3장 숲속 — 겹겹이 늘어선 나무 실루엣 ---------- */
  function firRow(y, h, fill, step, off) {
    var s = '';
    for (var x = off; x < 104; x += step) {
      s += '<path d="M' + x + ' ' + (y - h) + ' L' + (x + step * 0.42) + ' ' + y
        + ' L' + (x - step * 0.42) + ' ' + y + ' Z" fill="' + fill + '"/>';
    }
    return s;
  }
  var forestHill = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 8 Q18 1 34 6 Q52 12 68 5 Q84 -1 100 5 L100 40 L0 40 Z" fill="#4e8f5a"/>'
    + firRow(14, 11, '#3f7a4c', 9, 2)
    + '<path d="M0 14 Q22 9 46 13 Q72 17 100 12 L100 40 L0 40 Z" fill="#5aa068"/>'
    + firRow(21, 9, '#4e8f5a', 11, 6)
    + '<path d="M0 22 Q24 18 50 21 Q76 24 100 20 L100 40 L0 40 Z" fill="#79bd7c"/>'
    + '<path d="M0 31 Q30 27 62 30 Q82 32 100 29 L100 40 L0 40 Z" fill="#8fd98a"/></svg>';

  var forestPath = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 25 Q20 22 36 16 Q48 12 60 15 Q78 19 100 12 L100 16 '
    + 'Q78 23 60 19 Q48 16 38 20 Q22 26 0 26 Z" fill="#c9b48d" opacity="0.85"/></svg>';

  /* ---------- 4장 하늘마을 — 땅이 없다. 구름이 바닥이 된다 ---------- */
  var skyHill = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 16 Q10 8 20 14 Q28 6 40 12 Q52 4 62 12 Q74 6 84 13 Q92 8 100 15 L100 40 L0 40 Z" fill="#e6efff"/>'
    + '<path d="M0 24 Q14 17 28 23 Q42 16 56 23 Q72 17 86 24 Q94 21 100 24 L100 40 L0 40 Z" fill="#d3e4ff"/>'
    + '<path d="M0 33 Q26 28 54 32 Q78 35 100 31 L100 40 L0 40 Z" fill="#c2d8fb"/></svg>';

  var skyPath = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 24 Q22 20 40 15 Q52 12 64 15 Q82 19 100 12 L100 17 '
    + 'Q82 24 64 20 Q52 17 42 20 Q24 25 0 26 Z" fill="#ffffff" opacity="0.75"/></svg>';

  /* ---------- 5장 겨울마을 — 눈 덮인 언덕 ---------- */
  var winterHill = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="height:100%" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 12 L14 2 L26 12 L40 0 L54 12 L68 3 L82 12 L100 5 L100 40 L0 40 Z" fill="#b9c8de"/>'
    + '<path d="M0 12 L14 2 L20 8 L26 12 Z M40 0 L48 7 L54 12 L46 12 Z M68 3 L76 9 L82 12 L74 12 Z" fill="#dbe6f2"/>'
    + '<path d="M0 17 Q22 11 46 16 Q72 21 100 14 L100 40 L0 40 Z" fill="#eef4fb"/>'
    + '<path d="M0 27 Q28 22 58 26 Q80 29 100 25 L100 40 L0 40 Z" fill="#f8fbff"/></svg>';

  var winterPath = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M0 25 Q20 22 38 16 Q50 12 62 15 Q80 19 100 12 L100 16 '
    + 'Q80 23 62 19 Q50 16 40 20 Q22 26 0 26 Z" fill="#dfe9f6" opacity="0.9"/></svg>';

  return {
    town: {
      sky: [
        { key: 'sun', l: 88, t: 6, w: 7 },
        { key: 'cloud', l: 6, t: 8, w: 11 },
        { key: 'cloud', l: 30, t: 4, w: 8 }
      ],
      hill: townHill, path: townPath
    },
    sea: {
      sky: [
        { key: 'sun', l: 12, t: 5, w: 8 },
        { key: 'cloud', l: 44, t: 4, w: 10 },
        { key: 'cloud', l: 74, t: 9, w: 8 }
      ],
      hill: seaHill, path: seaPath
    },
    forest: {
      sky: [
        { key: 'sun', l: 82, t: 5, w: 7 },
        { key: 'cloud', l: 20, t: 5, w: 10 }
      ],
      hill: forestHill, path: forestPath
    },
    sky: {
      sky: [
        { key: 'sun', l: 10, t: 4, w: 8 },
        { key: 'cloud', l: 38, t: 6, w: 12 },
        { key: 'cloud', l: 66, t: 3, w: 9 }
      ],
      hill: skyHill, path: skyPath
    },
    winter: {
      sky: [
        { key: 'cloud', l: 14, t: 6, w: 12 },
        { key: 'cloud', l: 58, t: 4, w: 10 },
        { key: 'cloud', l: 82, t: 10, w: 8 }
      ],
      hill: winterHill, path: winterPath
    }
  };
})();
