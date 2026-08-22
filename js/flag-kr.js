/* =========================================================
   flag-kr.js — 태극기
   위키미디어의 공식 SVG(Flag_of_South_Korea.svg)와 숫자를 하나씩 맞췄다.
   원본은 viewBox -72 -48 144 96 을 쓰는데, 여기서는 900 × 600 으로 6.25배 키웠다.

   원본 값 → 여기 값
     깃면 144 × 96          → 900 × 600      (가로:세로 = 3:2)
     태극 반지름 24         → 150            (지름이 세로의 1/2)
     태극 속 작은 반지름 12 → 75
     효 길이 24             → 150            (= 태극 반지름)
     효 두께 4              → 25
     효 사이 간격 2         → 12.5           (두께의 절반)
     음효 가운데 틈 2       → 12.5           (반쪽 길이 68.75)
     괘 너비(3효 전체) 16   → 100
     중심에서 괘 가운데 44  → 275            (안쪽 끝 225 = 태극 반지름의 1.5배)

   중요 — 효는 대각선에 **직각**이다.
   원본이 효를 세로 선(v24)으로 그린 뒤 통째로 33.69° 돌리기 때문이다.
   가로 막대로 그려 놓고 돌리면 90° 틀어진 태극기가 된다.

   기울기 33.69° = atan(2/3), 깃면 대각선과 같다.
   왼쪽 위 건(乾) ☰ · 오른쪽 위 감(坎) ☵ · 왼쪽 아래 리(離) ☲ · 오른쪽 아래 곤(坤) ☷
   색은 국가상징 표준색 — 빨강 #CD2E3A · 파랑 #0047A0
   ========================================================= */
var FLAG_KR = (function () {
  'use strict';

  var CX = 450, CY = 300;        // 깃면 한가운데
  var R = 150;                   // 태극 반지름
  var TILT = 33.69006752598;     // atan(2/3)
  var BAR = 150;                 // 효 길이 (= 태극 반지름)
  var TH = 25;                   // 효 두께
  var SP = 12.5;                 // 효 사이 간격
  var MID = 12.5;                // 음효 가운데 틈
  var HALF = (BAR - MID) / 2;    // 음효 반쪽 = 68.75
  var STEP = TH + SP;            // 효 중심 사이 거리 = 37.5
  var MIDX = R + R / 2 + TH * 1.5 + SP;   // 중심에서 괘 가운데 = 275

  var RED = '#CD2E3A', BLUE = '#0047A0', BLACK = '#000000';

  /* 태극 — 공식 SVG 의 파랑 경로를 그대로 옮겼다.
     빨강 원을 먼저 깔고 그 위에 파랑을 덮는다. */
  function taegeuk() {
    var L = CX - R, Rt = CX + R, r = R / 2;
    return '<g transform="rotate(' + TILT + ' ' + CX + ' ' + CY + ')">'
      + '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + RED + '"/>'
      + '<path fill="' + BLUE + '" d="M' + L + ' ' + CY
      + ' A' + R + ' ' + R + ' 0 1 0 ' + Rt + ' ' + CY      // 아래쪽 반원
      + ' A' + r + ' ' + r + ' 0 1 0 ' + CX + ' ' + CY      // 오른쪽 작은 반원은 위로
      + ' A' + r + ' ' + r + ' 0 1 1 ' + L + ' ' + CY       // 왼쪽 작은 반원은 아래로
      + ' Z"/></g>';
  }

  /** 효 하나. x 는 괘 안에서의 자리(대각선 방향), 효 자체는 그 직각으로 뻗는다 */
  function yao(x, solid) {
    var x0 = x - TH / 2;
    if (solid) {
      return '<rect x="' + x0 + '" y="' + (CY - BAR / 2) + '" width="' + TH
        + '" height="' + BAR + '" fill="' + BLACK + '"/>';
    }
    return '<rect x="' + x0 + '" y="' + (CY - BAR / 2) + '" width="' + TH
      + '" height="' + HALF + '" fill="' + BLACK + '"/>'
      + '<rect x="' + x0 + '" y="' + (CY + MID / 2) + '" width="' + TH
      + '" height="' + HALF + '" fill="' + BLACK + '"/>';
  }

  /**
   * 괘 하나.
   * @param side -1 이면 대각선 왼쪽, +1 이면 오른쪽
   * @param rot  그 대각선의 기울기
   * @param pat  효 셋 — true 면 이어진 효(양효). 건곤감리는 모두 대칭이라 순서는 상관없다
   */
  function gua(side, rot, pat) {
    var mid = CX + side * MIDX;
    var s = '';
    for (var i = 0; i < 3; i++) s += yao(mid + (i - 1) * STEP, pat[i]);
    return '<g transform="rotate(' + rot + ' ' + CX + ' ' + CY + ')">' + s + '</g>';
  }

  /** 태극기 한 장. 테두리를 원하면 border 를 true 로 */
  function svg(border) {
    return '<svg viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">'
      + '<rect width="900" height="600" fill="#FFFFFF"/>'
      // 왼쪽 위 건 ☰ · 오른쪽 아래 곤 ☷
      + gua(-1, TILT, [true, true, true])
      + gua(1, TILT, [false, false, false])
      // 왼쪽 아래 리 ☲ · 오른쪽 위 감 ☵
      + gua(-1, -TILT, [true, false, true])
      + gua(1, -TILT, [false, true, false])
      + taegeuk()
      + (border ? '<rect width="900" height="600" fill="none" stroke="#d8dde6" stroke-width="4"/>' : '')
      + '</svg>';
  }

  return { svg: svg, taegeuk: taegeuk };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FLAG_KR;
