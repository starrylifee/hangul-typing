/* g-base.js — 야구게임 (기획 · 해산물 연합팀)
   game_vibe/20260818105044.pdf 의 규칙과 그림을 그대로 옮겼다.

   기획서 규칙(원문)을 옮긴 자리
     1. 게임을 시작하면 청팀과 백팀으로 나눈다 (팀 배치는 랜덤)   → pickTeam()
     2. 공격할 때 야구공 속도는 랜덤으로 2초~10초                 → FLY_MIN / FLY_MAX
     3. 타자가 오답을 쓰거나 제한시간 안에 못 쓰면 스트라이크
        (볼은 없다)                                              → strike() / wrongInput()
     4. 답을 맞히면 난이도에 따라 안타·2루타·3루타,
        홈런은 1/20 확률                                          → swing() / HOMER
     5. 수비 때 못 쓰면 상대가 안타·2루타·3루타,
        수비가 맞으면 아웃 또는 fly out                            → concede() / defOut()
     6. 낱말은 야구공에 쓰여 있다                                  → .base-ball 안의 낱말
     · 단계별 자리 = 이 앱의 1~7단계                               → DATA.WORD_UPTO[n]

   기획서에 없어서 정한 것 (보고서에도 적었다)
     · 3이닝 (동점이면 최대 6회까지 연장) — 한 판 5~7분
     · 난이도별 안타/2루타/3루타 비율 (HITMIX / CPUMIX)
     · 오답은 한 타석에 한 번 봐준다 — 첫 오타는 "다시!" 만, 두 번째부터 스트라이크
       (한/영 키가 영문일 때는 아예 안 센다)
     · 경기 첫 타석의 첫 공만 제일 느린 구간(8~10초)으로 던진다
     · 홈런 공은 낱말을 2~3타로 짧게 골라 준다 (제일 빠른 공이라서)
   ========================================================= */
(function () {
  'use strict';
  var A = GAMES.api;

  /* ---------- 기획서 수치 (그대로) ---------- */
  var FLY_MIN = 2;                 // 규칙 2 — 공 속도 2초
  var FLY_MAX = 10;                // 규칙 2 — 공 속도 10초
  var HOMER = 1 / 20;              // 규칙 4 — 홈런 1/20
  var STRIKES = 3;                 // 규칙 3 — 삼진 (볼 없음)
  var OUTS = 3;                    // 야구 규칙

  /* ---------- 기획서에 없어서 정한 값 ---------- */
  var INNINGS = 3;                 // 3이닝 — 초등학생이 5~7분에 끝낼 수 있는 길이
  var MAX_INNINGS = 6;             // 동점이면 연장, 6회에서 무승부
  /* 한 이닝은 아웃 3개 또는 타석 6번까지.
     맞히면 무조건 안타라(규칙 4) 잘 치는 아이는 아웃이 안 나와 이닝이 안 끝난다.
     반대로 수비를 못 하는 아이는 점수를 끝없이 내주게 된다. 둘 다 막는 장치다. */
  var MAX_PA = 6;
  /* 난이도별 안타 / 2루타 / 3루타 비율 (홈런 1/20 을 뺀 나머지를 나눈다).
     어려운 난이도일수록 낱말이 어려우니 쳤을 때 더 크게 쳐 준다. */
  var HITMIX = { easy: [75, 20, 5], normal: [60, 28, 12], hard: [45, 33, 22] };
  /* 수비에서 놓쳤을 때 상대가 치는 비율 — 어려울수록 상대도 크게 친다 */
  var CPUMIX = { easy: [80, 15, 5], normal: [70, 22, 8], hard: [55, 30, 15] };
  var DIFFNAME = { easy: '쉬움', normal: '보통', hard: '하드' };
  /* 난이도별로 한 타석에 쓸 낱말 길이(타수) 범위 */
  var DIFFLEN = { easy: [3, 7], normal: [4, 10], hard: [5, 14] };

  var TEAM = {
    blue: { key: 'blue', name: '청팀', c1: '#3b82f6', c2: '#1d4ed8', ink: '#eaf2ff' },
    white: { key: 'white', name: '백팀', c1: '#f4f6fa', c2: '#c8ced9', ink: '#1b2333' }
  };

  /* 공의 종류 — 날아올 때 이미 1루타/2루타/3루타/홈런이 정해져 있다.
     확률은 규칙 4 그대로(HOMER 1/20 → 나머지는 HITMIX·CPUMIX).
     속도는 규칙 2 의 2~10초 범위를 종류별 구간으로 쪼갠 것 — 좋은 공일수록 빨리 지나간다. */
  /* sec  = 공격(내가 칠 때) 도달 시간, dsec = 수비(상대가 친 공) 도달 시간.
     수비가 너무 쉬우면 컴퓨터가 점수를 못 낸다. 상대 타구는 더 빨리 온다. */
  var KIND = {
    h1: { cls: 'k1', bases: 1, label: '1루타', name: '안타!', foe: '상대 안타', sec: [6, 10], dsec: [4, 6.5] },
    h2: { cls: 'k2', bases: 2, label: '2루타', name: '2루타!', foe: '상대 2루타', sec: [4.5, 7], dsec: [3, 4.6] },
    h3: { cls: 'k3', bases: 3, label: '3루타', name: '3루타!', foe: '상대 3루타', sec: [3, 5], dsec: [2.3, 3.4] },
    hr: { cls: 'khr', bases: 4, label: '홈런', name: '홈런!', foe: '상대 홈런', sec: [2, 3.5], dsec: [1.8, 2.6] }
  };
  var G, C;

  /* =========================================================
     그림 — 기획서 3·4쪽을 SVG 로 옮겼다
     ========================================================= */

  /* 야구장 — 초록 잔디 + 주황 다이아몬드 + 베이스 네 개 (기획서 3쪽)
     preserveAspectRatio="none" 이라 viewBox 좌표가 곧 화면의 % 다.
     기획서 그림도 가로로 납작한 다이아몬드라 오히려 그림에 가깝다. */
  function fieldSvg() {
    var s = '<svg class="base-fieldsvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    s += '<defs>' +
      '<linearGradient id="bsGrass" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#8fd14f"/><stop offset="1" stop-color="#4fa32b"/></linearGradient>' +
      '<linearGradient id="bsDirt" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f0a35e"/><stop offset="1" stop-color="#d9762f"/></linearGradient>' +
      '</defs>';
    // 잔디
    s += '<rect x="0" y="0" width="100" height="100" fill="url(#bsGrass)"/>';
    // 크레용으로 세로로 그은 듯한 잔디 결 (기획서 그림의 초록 세로 선)
    for (var i = 0; i < 25; i++) {
      s += '<rect x="' + (i * 4) + '" y="0" width="2" height="100" fill="#ffffff" opacity="' +
        (i % 2 ? '.08' : '.03') + '"/>';
    }
    // 외야 담장
    s += '<path d="M0 16 C26 2 74 2 100 16 L100 0 L0 0 Z" fill="#2f6b3a"/>';
    /* 담장 선 · 베이스 · 타석 · 홈플레이트는 원래 흰색이었다.
       흰 공이 그 위를 지나가면 공이 어디 있는지 안 보였다(검토 지적).
       그림에서 빼지는 않고 대비만 낮춘다 — 공보다 눈에 덜 띄게. */
    s += '<path d="M0 16 C26 2 74 2 100 16" fill="none" stroke="#dcd6bc" stroke-width="1.4" opacity=".75"/>';
    // 주황 다이아몬드(내야) — 바깥 주황, 안쪽 초록이라 베이스 길이 띠로 보인다
    s += '<polygon points="50,6 96,52 50,98 4,52" fill="url(#bsDirt)"/>';
    s += '<polygon points="50,19 81,52 50,85 19,52" fill="url(#bsGrass)" opacity=".95"/>';
    // 마운드
    s += '<ellipse cx="50" cy="46" rx="10" ry="7.5" fill="url(#bsDirt)"/>';
    s += '<rect x="47.5" y="44.5" width="5" height="1.8" rx=".8" fill="#e2dcc2"/>';
    // 홈 주변 흙과 타석
    s += '<ellipse cx="50" cy="90" rx="17" ry="10" fill="url(#bsDirt)"/>';
    s += '<rect x="33" y="83" width="7" height="13" fill="none" stroke="#f7efd8" stroke-width=".8" opacity=".5"/>';
    s += '<rect x="60" y="83" width="7" height="13" fill="none" stroke="#f7efd8" stroke-width=".8" opacity=".5"/>';
    // 베이스 네 개
    s += base3(88, 52) + base3(50, 14) + base3(12, 52);
    // 홈플레이트 (오각형)
    s += '<polygon points="50,94.5 46,91.5 46,88 54,88 54,91.5" fill="#e6dfc6" stroke="#a89c78" stroke-width=".5"/>';
    s += '</svg>';
    return s;
  }
  function base3(x, y) {
    return '<polygon points="' + x + ',' + (y - 4) + ' ' + (x + 4.5) + ',' + y + ' ' +
      x + ',' + (y + 4) + ' ' + (x - 4.5) + ',' + y + '" fill="#e6dfc6" stroke="#a89c78" stroke-width=".6"/>';
  }

  /* ---------- 그림 규칙 (여섯 게임 공통) ----------
     외곽선 #2b241d · 두께 = viewBox 높이의 약 2.4% · linejoin/linecap 은 round · 단색 평면.
     팔다리처럼 "칠하지 않고 굵은 선으로만 그린" 부분은 테두리를 줄 수가 없다.
     그래서 같은 선을 진한 색으로 한 번 더 굵게 깔아(.bol) 외곽선을 만든다.
     굵기는 CSS 의 .bol 규칙이 정한다 — 사람 그림은 viewBox 130 → 3.1 씩 양쪽. */
  function ol(s) { return '<g class="bol">' + s + '</g>' + s; }

  /* 투수 — 기획서 그림의 "가운데 위에서 공을 던지는 사람" */
  function pitcherSvg() {
    var legs = '<path class="bpk" d="M44 78 L36 118"/><path class="bpk" d="M56 78 L66 116"/>' +
      '<path class="bps" d="M36 118 L28 120"/><path class="bps" d="M66 116 L74 118"/>';
    var arms = '<path class="bpa" d="M64 46 C78 40 86 28 84 18"/>' +
      '<path class="bpa" d="M36 48 C26 54 22 64 24 72"/>';
    return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
      '<ellipse cx="50" cy="126" rx="26" ry="4" fill="rgba(0,0,0,.22)"/>' +
      // 다리
      ol(legs) +
      // 몸통(유니폼)
      '<path class="bpj" d="M50 34 C36 34 32 46 32 58 L34 82 L66 82 L68 58 C68 46 64 34 50 34 Z"/>' +
      '<path class="bpn" d="M50 34 L50 82" />' +
      // 던지는 팔 + 공
      ol(arms) +
      '<circle class="bph" cx="24" cy="74" r="5"/>' +
      '<circle cx="86" cy="14" r="6.5" fill="#fdfcf7" stroke="#2b241d" stroke-width="3.1"/>' +
      // 머리 + 모자
      '<circle class="bph" cx="50" cy="22" r="12"/>' +
      '<path class="bpc" d="M38 19 C38 9 62 9 62 19 Z"/>' +
      '<path class="bpc" d="M62 19 L74 21 L62 23 Z"/>' +
      '</svg>';
  }

  /* 타자 — 홈플레이트에 서 있다 (배트를 든 사람) */
  function batterSvg() {
    var legs = '<path class="bpk" d="M45 80 L38 120"/><path class="bpk" d="M57 80 L66 120"/>' +
      '<path class="bps" d="M38 120 L30 122"/><path class="bps" d="M66 120 L74 122"/>';
    var arms = '<path class="bpa" d="M66 50 C76 44 80 34 78 26"/>' +
      '<path class="bpa" d="M36 50 C46 42 60 34 74 30"/>';
    return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
      '<ellipse cx="50" cy="126" rx="24" ry="4" fill="rgba(0,0,0,.22)"/>' +
      ol(legs) +
      '<path class="bpj" d="M50 36 C37 36 33 48 33 60 L35 84 L67 84 L69 60 C69 48 63 36 50 36 Z"/>' +
      ol(arms) +
      /* 배트는 따로 묶어 둔다 — 칠 때 손을 축으로 이 묶음만 돌려서 휘두른다 */
      '<g class="bpbat">' +
      '<path d="M74 30 L96 6" stroke="#2b241d" stroke-width="13.2" stroke-linecap="round" fill="none"/>' +
      '<path d="M74 30 L96 6" stroke="#c98a4b" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<circle cx="98" cy="4" r="4" fill="#2b2f3a" stroke="#2b241d" stroke-width="3.1"/>' +
      '</g>' +
      '<circle class="bph" cx="50" cy="24" r="12"/>' +
      '<path class="bpc" d="M38 21 C38 11 62 11 62 21 Z"/>' +
      '<path class="bpc" d="M38 21 L34 24 L38 25 Z"/>' +
      '</svg>';
  }

  /* 주자 — 루에 서 있는 사람. 투수·타자와 같은 그림체(같은 클래스, 같은 선 굵기)를 쓴다.
     유니폼 색은 CSS 에서 우리 팀(--me1/--me2) / 상대 팀(--you1/--you2) 으로 갈린다. */
  function runnerSvg() {
    // 다리 · 팔은 흔드는 묶음(.rlg / .rar) 안에 외곽선까지 함께 넣는다.
    // 그래야 달릴 때 진한 선과 살색 선이 따로 놀지 않는다.
    var la = '<path class="bpk" d="M45 80 L39 102 L43 122"/><path class="bps" d="M43 122 L34 124"/>';
    var lb = '<path class="bpk" d="M57 80 L68 98 L63 118"/><path class="bps" d="M63 118 L72 121"/>';
    var ab = '<path class="bpa" d="M36 51 C26 57 22 67 25 75"/>';
    var aa = '<path class="bpa" d="M66 51 C76 45 80 35 78 27"/>';
    return '<svg viewBox="0 0 100 130" aria-hidden="true">' +
      '<ellipse cx="50" cy="126" rx="21" ry="4" fill="rgba(0,0,0,.24)"/>' +
      // 다리 — 한 발은 루를 딛고 한쪽 무릎은 살짝 든 "달릴 준비" 자세.
      // 달릴 때는 CSS 가 이 두 묶음을 번갈아 흔든다 (.rlg)
      '<g class="rlg a">' + ol(la) + '</g>' +
      '<g class="rlg b">' + ol(lb) + '</g>' +
      // 몸통(유니폼)
      '<path class="bpj" d="M50 36 C38 36 34 47 34 59 L36 82 L66 82 L68 59 C68 47 62 36 50 36 Z"/>' +
      '<path class="bpn" d="M50 36 L50 82"/>' +
      // 팔 — 뒤로 한 번, 앞으로 한 번 (다리와 엇갈리게 흔든다)
      '<g class="rar b">' + ol(ab) + '</g>' +
      '<g class="rar a">' + ol(aa) + '</g>' +
      // 머리 + 헬멧
      '<circle class="bph" cx="50" cy="24" r="12"/>' +
      '<path class="bpc" d="M38 21 C38 11 62 11 62 21 Z"/>' +
      '<path class="bpc" d="M62 21 L73 23 L62 25 Z"/>' +
      '</svg>';
  }

  /* 야구공 — 낱말이 공에 쓰여 있다 (규칙 6).
     공 색과 실밥 색은 CSS 가 종류(k1/k2/k3/khr)에 따라 바꾼다. */
  function ballSvg() {
    return '<svg class="base-ballsvg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle class="bl-face" cx="50" cy="50" r="46" stroke-width="2"/>' +
      '<path class="bl-seam" d="M22 14 C36 30 36 70 22 86" fill="none" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path class="bl-seam" d="M78 14 C64 30 64 70 78 86" fill="none" stroke-width="3.4" stroke-linecap="round"/>' +
      seams(26, 22, 78) + seams(74, 22, 78) +
      // 홈런 공에서만 보이는 반짝임
      '<g class="bl-spark">' +
      star(12, 16) + star(88, 24) + star(20, 84) + star(84, 78) +
      '</g>' +
      '</svg>';
  }
  function star(x, y) {
    return '<path d="M' + x + ' ' + (y - 9) + ' Q' + (x + 2) + ' ' + (y - 2) + ' ' + (x + 9) + ' ' + y +
      ' Q' + (x + 2) + ' ' + (y + 2) + ' ' + x + ' ' + (y + 9) +
      ' Q' + (x - 2) + ' ' + (y + 2) + ' ' + (x - 9) + ' ' + y +
      ' Q' + (x - 2) + ' ' + (y - 2) + ' ' + x + ' ' + (y - 9) + ' Z" fill="#fff2c0"/>';
  }
  function seams(x, y0, y1) {
    var s = '', n = 7, i, y;
    for (i = 0; i < n; i++) {
      y = y0 + (y1 - y0) * (i / (n - 1));
      var d = x < 50 ? -7 : 7;
      s += '<path class="bl-seam" d="M' + x + ' ' + y + ' l' + d + ' ' + (i < n / 2 ? 4 : -4) +
        '" stroke-width="2" stroke-linecap="round" fill="none"/>';
    }
    return s;
  }

  /* 배트 — 기획서 3쪽 아래쪽에 누워 있는 그 배트 (수비 화면에는 없다) */
  function batSvg() {
    return '<svg class="base-batsvg" viewBox="0 0 220 44" aria-hidden="true">' +
      '<defs><linearGradient id="bsBat" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#e0b076"/><stop offset="1" stop-color="#a9743a"/></linearGradient></defs>' +
      '<path d="M60 22 C60 12 84 6 130 6 L206 6 C216 6 216 38 206 38 L130 38 C84 38 60 32 60 22 Z" fill="url(#bsBat)" stroke="#6d4520" stroke-width="2.5"/>' +
      '<rect x="26" y="15" width="36" height="14" rx="6" fill="#2c2c30" stroke="#141417" stroke-width="2.5"/>' +
      '<path d="M34 15 L34 29 M42 15 L42 29 M50 15 L50 29" stroke="#6d6d75" stroke-width="1.6"/>' +
      '<ellipse cx="20" cy="22" rx="10" ry="12" fill="#3a3a40" stroke="#141417" stroke-width="2.5"/>' +
      '</svg>';
  }

  /* 해 — 기획서 4쪽 왼쪽 위 (노란 동그라미 + 빛살) */
  function sunSvg() {
    var r = '';
    for (var i = 0; i < 12; i++) {
      var a = i * 30 * Math.PI / 180;
      r += '<line class="sray" x1="' + (50 + 34 * Math.cos(a)).toFixed(1) + '" y1="' + (50 + 34 * Math.sin(a)).toFixed(1) +
        '" x2="' + (50 + 47 * Math.cos(a)).toFixed(1) + '" y2="' + (50 + 47 * Math.sin(a)).toFixed(1) + '"/>';
    }
    // 빛살도 진한 선을 밑에 깔아 외곽선을 만든다 (viewBox 100 → 2.4 씩 양쪽)
    return '<svg class="base-sunsvg" viewBox="0 0 100 100" aria-hidden="true"><g class="rays">' +
      ol(r) + '</g>' +
      '<circle cx="50" cy="50" r="29" fill="#ffe14d" stroke="#2b241d" stroke-width="2.4"/></svg>';
  }

  /* 갈색 야구 글러브 — 기획서 4쪽 가운데 (손목에서 팔이 오른쪽 아래로 뻗는다)
     ── 그리는 방법 ─────────────────────────────────────────────
     손가락 네 갈래 · 엄지 · 손바닥 · 뒤꿈치를 각각 그린 뒤 **같은 도형을 두 번** 그린다.
       1차 : 진갈색으로 굵게(테두리 두께만큼 부풀려서)  → 바깥 윤곽선이 생긴다
       2차 : 가죽색으로 원래 크기                        → 부품끼리의 경계선이 덮인다
     이러면 부품을 붙여 놓은 티가 안 나고 "한 덩어리에서 갈라져 나온" 모양이 된다.
     (예전 판은 손가락·엄지를 각각 테두리째 그려서 소시지를 붙여 놓은 것처럼 보였다)
     가죽색 그라데이션은 userSpaceOnUse — 도형이 달라도 빛이 한 방향에서 온다.
     글러브로 읽히게 하는 것 : 위로 뻗은 네 갈래 · 아래 바깥으로 벌어진 엄지 ·
     그 사이(웹)의 격자 가죽끈 · 오목한 포켓 · 손끝을 가로지르는 끈. */
  var GLV = {
    /* [밑동x, 밑동y, 끝x, 끝y, 굵기] — 캡슐 하나가 손가락 하나 */
    F: [[92, 126, 90, 62, 15.5], [110, 120, 114, 52, 16],
        [128, 124, 136, 60, 15.5], [144, 132, 158, 84, 13.5]],
    TH: [74, 168, 26, 100, 16],                 // 엄지 — 아래 바깥(왼쪽)으로 벌어진다
    WEB: 'M36 92 L74 54 L86 76 L74 134 L52 130 Z',   // 엄지와 검지 사이를 메우는 웹
    PALM: [108, 150, 50, 44],
    HEEL: [104, 180, 45, 28],
    POCK: [108, 148, 48, 42]
  };
  function glvCap(a, ex, st) {
    return '<path d="M' + a[0] + ' ' + a[1] + ' L' + a[2] + ' ' + a[3] + '" fill="none" ' +
      'stroke-linecap="round" stroke-width="' + (2 * a[4] + ex) + '"' + st + '/>';
  }
  /** 글러브 덩어리를 한 번 그린다. outline 이면 진갈색으로 부풀려서(=테두리) */
  function glvBody(outline) {
    /* 외곽선 두께 — viewBox 높이(240)의 2.4% = 5.76 을 양쪽에. 형태는 그대로다. */
    var P = GLV, ex = outline ? 11.5 : 0, i, s = '';
    var st = outline ? ' stroke="#2b241d"' : ' stroke="url(#bsGlv)"';
    var fl = outline ? '#2b241d' : 'url(#bsGlv)';
    for (i = 0; i < P.F.length; i++) s += glvCap(P.F[i], ex, st);
    s += glvCap(P.TH, ex, st);
    s += '<path d="' + P.WEB + '" fill="' + fl + '"' + st + ' stroke-width="' + ex + '" stroke-linejoin="round"/>';
    s += '<ellipse cx="' + P.PALM[0] + '" cy="' + P.PALM[1] + '" rx="' + P.PALM[2] + '" ry="' + P.PALM[3] +
      '" fill="' + fl + '"' + st + ' stroke-width="' + ex + '"/>';
    s += '<ellipse cx="' + P.HEEL[0] + '" cy="' + P.HEEL[1] + '" rx="' + P.HEEL[2] + '" ry="' + P.HEEL[3] +
      '" fill="' + fl + '"' + st + ' stroke-width="' + ex + '"/>';
    return s;
  }
  function gloveSvg() {
    var P = GLV;
    return '<svg class="base-glovesvg" viewBox="0 0 200 240" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="bsGlv" gradientUnits="userSpaceOnUse" x1="34" y1="34" x2="160" y2="212">' +
      '<stop offset="0" stop-color="#dd9a55"/><stop offset=".5" stop-color="#b26c2b"/>' +
      '<stop offset="1" stop-color="#844416"/></linearGradient>' +
      '<radialGradient id="bsGlvD" cx="50%" cy="42%" r="58%">' +
      '<stop offset="0" stop-color="#3f1e08" stop-opacity=".46"/>' +
      '<stop offset=".55" stop-color="#3f1e08" stop-opacity=".2"/>' +
      '<stop offset="1" stop-color="#3f1e08" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="bsGlvL" cx="50%" cy="66%" r="56%">' +
      '<stop offset="0" stop-color="#ffdcae" stop-opacity=".32"/>' +
      '<stop offset="1" stop-color="#ffdcae" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      // 팔 — 손목에서 오른쪽 아래로 (기획서 그림)
      '<path d="M132 190 L180 240" stroke="#2b241d" stroke-width="48.5" stroke-linecap="round" fill="none"/>' +
      '<path d="M132 190 L180 240" stroke="#f3c9a0" stroke-width="37" stroke-linecap="round" fill="none"/>' +
      // 하얀 손목 밴드
      '<g transform="rotate(46 152 210)">' +
      '<rect x="128" y="192" width="50" height="36" rx="9" fill="#f8f9fc" stroke="#2b241d" stroke-width="5.8"/>' +
      '<path d="M140 196 L140 224 M152 196 L152 224 M164 196 L164 224" stroke="#d7dde8" stroke-width="2.4"/></g>' +
      glvBody(true) + glvBody(false) +
      // 포켓 — 위는 그늘, 아래는 빛. 오목한 접시로 보이게
      '<ellipse cx="' + P.POCK[0] + '" cy="' + P.POCK[1] + '" rx="' + P.POCK[2] + '" ry="' + P.POCK[3] +
      '" fill="url(#bsGlvD)"/>' +
      '<ellipse cx="' + P.POCK[0] + '" cy="' + (P.POCK[1] + 18) + '" rx="' + (P.POCK[2] - 6) +
      '" ry="' + (P.POCK[3] - 14) + '" fill="url(#bsGlvL)"/>' +
      // 손가락 사이 골 — 얕게 파인 선. 갈라져 나온 것처럼 보이게 한다
      '<g stroke="#2b241d" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".5">' +
      '<path d="M101 68 C101 90 101 106 103 124"/><path d="M122 64 C123 88 123 104 123 122"/>' +
      '<path d="M139 78 C141 98 140 112 139 126"/></g>' +
      // 손끝을 가로지르는 가죽끈
      '<path d="M88 54 C106 42 134 46 156 72" fill="none" stroke="#f0d3a4" stroke-width="3.8" ' +
      'stroke-linecap="round" stroke-dasharray="7 10"/>' +
      // 웹 — 조금 어두운 가죽 판 + 격자로 엮인 가죽끈
      '<path d="M42 94 C44 86 62 66 72 60 C78 58 82 64 82 72 C80 90 76 116 72 128 ' +
      'C70 134 62 132 56 128 C48 122 40 104 42 94 Z" fill="#8a4718" opacity=".4"/>' +
      '<g stroke="#f3d9ae" stroke-width="4.2" stroke-linecap="round" fill="none">' +
      '<path d="M44 96 L78 62 M54 122 L82 84"/>' +
      '<path d="M42 88 L58 106 M52 78 L70 96 M62 68 L80 88 M48 108 L64 124"/></g>' +
      // 뒤꿈치 바느질
      '<g stroke="#f2d6ac" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85">' +
      '<path d="M68 156 C90 174 130 174 152 154" stroke-dasharray="9 8"/>' +
      '<path d="M76 176 C96 188 126 188 146 174" stroke-dasharray="8 8" opacity=".7"/></g>' +
      // 포켓 테와 손끝의 빛
      '<path d="M64 146 C74 182 142 182 152 144" fill="none" stroke="#ffd9a8" stroke-width="5" ' +
      'stroke-linecap="round" opacity=".28"/>' +
      '<path d="M92 60 C112 48 136 54 152 76" fill="none" stroke="#ffe4bd" stroke-width="4" ' +
      'stroke-linecap="round" opacity=".3"/>' +
      '</svg>';
  }

  /* =========================================================
     인트로 — 기획서 3쪽 오른쪽 "시작 화면"
     "단계를 선택하세요 / 1~7단계", "난이도: 쉬움, 보통, 하드"
     ========================================================= */
  /* 첫 화면에 버튼이 열 개(단계 7 + 난이도 3)라 아이가 무엇부터 눌러야 할지 몰랐다.
     그래서 "N단계로 시작" 하나만 크게 놓고, 단계 일곱 개는 접어 둔다.
     난이도는 이름표와 함께 한 줄로 묶었다. 눌러야 할 것은 결국 큰 버튼 하나다. */
  function introHtml() {
    var lv = '', i, d;
    for (i = 1; i <= 7; i++) {
      lv += '<button type="button" class="base-chip" data-lv="' + i + '">' + i + '단계</button>';
    }
    var dk = ['easy', 'normal', 'hard'], df = '';
    for (i = 0; i < dk.length; i++) {
      d = dk[i];
      df += '<button type="button" class="base-chip sm" data-df="' + d + '">' + DIFFNAME[d] + '</button>';
    }
    var me = TEAM[C.mine], you = TEAM[C.cpu];
    return '<div class="base-introbg"></div>' +
      '<div class="gintro-box base-introbox">' +
      '  <p class="gintro-by">학생이 만든 게임 · 기획 해산물 연합팀</p>' +
      '  <h2>야구게임 ⚾</h2>' +
      '  <div class="base-teams">' +
      '    <span class="base-tteam ' + me.key + ' me">나 · ' + me.name + '</span>' +
      '    <span class="base-vs">VS</span>' +
      '    <span class="base-tteam ' + you.key + '">컴퓨터 · ' + you.name + '</span>' +
      '    <em>팀 배치는 랜덤</em>' +
      '  </div>' +
      /* 큰 버튼 — stopPropagation 을 안 하니 누르면 그대로 경기가 시작된다 */
      '  <div class="base-startrow">' +
      '    <button type="button" class="base-bigstart" id="base-go">▶ <b id="base-gotx">1단계</b>로 시작</button>' +
      '    <button type="button" class="base-more" id="base-more">단계 바꾸기 ▾</button>' +
      '  </div>' +
      '  <div class="base-chiprow fold" id="base-lvrow">' + lv + '</div>' +
      '  <div class="base-dfline"><span class="base-selt">난이도</span>' +
      '    <span class="base-chiprow" id="base-dfrow">' + df + '</span></div>' +
      '  <p class="gintro-hint">공마다 <b>1루타 · 2루타 · 3루타 · 홈런</b>이 미리 정해져 날아와요.' +
      '     좋은 공일수록 빨라요 (1루타 6~10초 · 홈런 2~3.5초)<br>' +
      '     공에 적힌 낱말을 치면 그 공대로 진루! 오타는 한 타석에 한 번 봐줘요 (두 번째부터 스트라이크)<br>' +
      '     홈런 공은 스무 번에 한 번! 수비 때 맞히면 아웃, 놓치면 그 공만큼 상대가 진루 · ' + INNINGS + '이닝</p>' +
      '  <p class="gintro-go">엔터를 누르면 경기 시작</p>' +
      '</div>';
  }

  /* =========================================================
     경기장 화면
     ========================================================= */
  function shellHtml() {
    return '' +
      /* ---- 공격 화면 (기획서 3쪽) ---- */
      '<div class="base-att">' +
      fieldSvg() +
      '  <div class="base-runner r1" id="base-r1">' + runnerSvg() + '</div>' +
      '  <div class="base-runner r2" id="base-r2">' + runnerSvg() + '</div>' +
      '  <div class="base-runner r3" id="base-r3">' + runnerSvg() + '</div>' +
      /* 베이스 사이를 달려가는 주자가 잠깐 생겼다 사라지는 자리 */
      '  <div class="base-runlay" id="base-runlay"></div>' +
      '  <div class="base-pitcher" id="base-pitcher">' + pitcherSvg() + '</div>' +
      '  <div class="base-batter">' + batterSvg() + '</div>' +
      '  <div class="base-scorebox" id="base-scorebox"><b id="base-sb-me">0</b><i>:</i><b id="base-sb-you">0</b></div>' +
      '  <div class="base-bat">' + batSvg() + '</div>' +
      '</div>' +
      /* ---- 수비 화면 (기획서 4쪽) ---- */
      '<div class="base-def">' +
      '  <div class="base-sun">' + sunSvg() + '</div>' +
      '  <div class="base-cloud c1"></div><div class="base-cloud c2"></div>' +
      '  <div class="base-glove" id="base-glove">' + gloveSvg() + '</div>' +
      '</div>' +
      /* ---- 공 (두 화면이 같이 쓴다) ---- */
      '<div class="base-ball" id="base-ball">' + ballSvg() +
      '  <span class="base-tag" id="base-tag"></span>' +
      '  <span class="base-word" id="base-word"></span>' +
      '</div>' +
      /* ---- 오른쪽 위 스코어보드 (기획서 4쪽) ---- */
      '<div class="base-board">' +
      '  <div class="base-btable">' +
      '    <div class="row white"><span class="t">백</span><span class="n" id="base-bd-white">0</span></div>' +
      '    <div class="row blue"><span class="t">청</span><span class="n" id="base-bd-blue">0</span></div>' +
      '  </div>' +
      '  <div class="base-bside">' +
      '    <div class="base-inn"><i id="base-inn-ar">▲</i><b id="base-inn-no">1</b><span>회</span>' +
      '      <em id="base-pa">타석 1/' + MAX_PA + '</em></div>' +
      '    <div class="base-onbase"><span class="lb">진루</span>' +
      '      <span class="dia" id="base-d3"></span><span class="dia" id="base-d2"></span><span class="dia" id="base-d1"></span>' +
      '    </div>' +
      '    <div class="base-outs"><span class="lb">아웃</span>' +
      '      <span class="o" id="base-o1"></span><span class="o" id="base-o2"></span><span class="o" id="base-o3"></span>' +
      '    </div>' +
      '    <div class="base-strikes"><span class="lb">스트라이크</span>' +
      '      <span class="s" id="base-s1"></span><span class="s" id="base-s2"></span><span class="s" id="base-s3"></span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="base-half" id="base-half"></div>' +
      /* 첫 오타를 봐줄 때 뜨는 표시 — 스트라이크가 아니라 "다시 쳐" 라는 뜻 */
      '<div class="base-again" id="base-again"><b>다시!</b><span>오타는 한 번 봐줘요</span></div>' +
      '<div class="base-banner" id="base-banner"></div>';
  }

  /* =========================================================
     시작
     ========================================================= */
  function start() {
    // 규칙 1 — 청팀 / 백팀 랜덤 배치
    var mine = Math.random() < 0.5 ? 'blue' : 'white';
    C = {
      mine: mine, cpu: mine === 'blue' ? 'white' : 'blue',
      stage: 1, diff: 'normal',
      inning: 1, top: true,            // top=true 면 우리 공격(초)
      outs: 0, strikes: 0, pa: 0,
      bases: [false, false, false],
      run: { me: 0, cpu: 0 },
      outsDone: 0,
      phase: 'init', wait: 0,
      fly: 0, t: 0, ball: null, used: [], lastWord: '',
      miss: 0, grace: 0, firstPitch: true
    };

    A.prepare('base', introHtml());
    G = A.state();
    G.base = C;
    G.items = [];

    // 앱에서 고른 단계·난이도를 기본값으로
    C.stage = (G.level && G.level.no) || 1;
    C.diff = G.diff && HITMIX[G.diff.id] ? G.diff.id : 'easy';

    var wrap = document.createElement('div');
    wrap.className = 'base-wrap attack';
    wrap.innerHTML = shellHtml();
    A.stage().appendChild(wrap);
    C.wrap = wrap;
    setTeamColors();

    bindIntro();
    showBoard();
    showBall(false);
    updHead();
  }

  /** 인트로의 단계·난이도 버튼 (인트로를 클릭하면 넘어가니 stopPropagation 필수) */
  function bindIntro() {
    var st = A.stage();
    var mark = function (row, attr, val) {
      var bs = row.querySelectorAll('button'), i;
      for (i = 0; i < bs.length; i++) {
        bs[i].classList.toggle('on', bs[i].getAttribute(attr) === String(val));
      }
    };
    var lvRow = st.querySelector('#base-lvrow');
    var dfRow = st.querySelector('#base-dfrow');
    if (!lvRow || !dfRow) return;

    var click = function (row, attr, set) {
      row.addEventListener('click', function (e) {
        var b = e.target;
        while (b && b !== row && b.tagName !== 'BUTTON') b = b.parentNode;
        if (!b || b === row) return;
        e.stopPropagation();
        set(b.getAttribute(attr));
        mark(row, attr, b.getAttribute(attr));
        updHead();
      });
    };
    click(lvRow, 'data-lv', function (v) { C.stage = parseInt(v, 10) || 1; });
    click(dfRow, 'data-df', function (v) { if (HITMIX[v]) C.diff = v; });
    mark(lvRow, 'data-lv', C.stage);
    mark(dfRow, 'data-df', C.diff);

    // "단계 바꾸기" 를 눌러야 일곱 개가 펼쳐진다
    var more = st.querySelector('#base-more');
    if (more) {
      more.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = lvRow.classList.toggle('open');
        more.textContent = open ? '단계 접기 ▴' : '단계 바꾸기 ▾';
      });
    }
  }

  function updHead() {
    var h = A.el('game-lv');
    if (h) {
      h.textContent = C.stage + '단계 · ' + DIFFNAME[C.diff] + ' · 나는 ' + TEAM[C.mine].name;
    }
    var g = A.el('base-gotx');
    if (g) g.textContent = C.stage + '단계';
    /* 최고 기록은 단계·난이도마다 따로 남긴다.
       안 그러면 1단계 쉬움 기록과 7단계 하드 기록이 한 칸에 겹쳐 쓰인다. */
    A.recKey(C.stage + '단계-' + DIFFNAME[C.diff]);
  }

  function setTeamColors() {
    var w = C.wrap;
    w.style.setProperty('--me1', TEAM[C.mine].c1);
    w.style.setProperty('--me2', TEAM[C.mine].c2);
    w.style.setProperty('--meink', TEAM[C.mine].ink);
    w.style.setProperty('--you1', TEAM[C.cpu].c1);
    w.style.setProperty('--you2', TEAM[C.cpu].c2);
    w.style.setProperty('--youink', TEAM[C.cpu].ink);
  }

  /* =========================================================
     낱말 고르기 — 단계별 자리 (DATA.WORD_UPTO) + 공 속도에 맞는 길이
     ========================================================= */
  function pickWord(sec, kind) {
    var pool = (DATA.WORD_UPTO[C.stage] || []).slice();
    if (!pool.length) pool = DATA.WORDS.slice();

    var lim = DIFFLEN[C.diff] || DIFFLEN.normal;
    // 2초짜리 빠른 공에 열 글자 낱말이 나오면 손도 못 대니 공 속도에 길이를 맞춘다
    var byTime = Math.max(3, Math.round(sec * 1.8));
    var lo = lim[0], hi = Math.min(lim[1], byTime);
    if (hi < lo) hi = lo;

    var fit;
    if (kind === 'hr') {
      /* 홈런 공은 제일 빠르다(2~3.5초). 여기에 보통 길이 낱말을 얹으면 스무 번에 한 번뿐인
         기쁨이 스무 번에 한 번뿐인 확정 스트라이크가 된다 — 검토에서 나온 지적이다.
         속도(기획서 수치)는 그대로 두고 낱말만 확실히 짧게 고른다: 2~3타.
         그 단계에 2~3타 낱말이 모자라면 넉넉해질 때까지만 한 타씩 늘린다. */
      hi = 3;
      do {
        fit = pool.filter(function (w) { var n = A.keyLen(w); return n >= 2 && n <= hi; });
        hi++;
      } while (fit.length < 4 && hi <= 6);
      if (!fit.length) fit = pool;
    } else {
      fit = pool.filter(function (w) {
        var n = A.keyLen(w);
        return n >= lo && n <= hi;
      });
      if (fit.length < 6) {
        fit = pool.filter(function (w) { return A.keyLen(w) <= hi + 2; });
      }
      if (!fit.length) fit = pool;
    }

    for (var t = 0; t < 30; t++) {
      var w = fit[Math.floor(Math.random() * fit.length)];
      if (C.used.indexOf(w) < 0) {
        C.used.push(w);
        if (C.used.length > 20) C.used.shift();
        return w;
      }
    }
    return fit[Math.floor(Math.random() * fit.length)];
  }

  /* =========================================================
     한 타석(공 하나) 던지기
     ========================================================= */
  /** 공의 종류를 뽑는다 — 규칙 4 의 확률 그대로 (공격 HITMIX / 수비 CPUMIX) */
  function pickKind() {
    if (Math.random() < HOMER) return 'hr';        // 규칙 4 — 홈런 1/20
    var tbl = C.top ? HITMIX : CPUMIX;
    var mix = tbl[C.diff] || tbl.normal;
    var r = Math.random() * (mix[0] + mix[1] + mix[2]);
    if (r < mix[0]) return 'h1';
    if (r < mix[0] + mix[1]) return 'h2';
    return 'h3';
  }

  /** 공에 종류 옷을 입힌다 — 색 · 딱지 */
  function paintBall(kind) {
    var b = A.el('base-ball');
    if (b) {
      // .foe — 상대가 친 공. 붉은 테두리가 둘려서 내가 칠 공과 한눈에 구분된다
      b.className = 'base-ball' + (b.classList.contains('on') ? ' on' : '') +
        ' ' + KIND[kind].cls + (C.top ? '' : ' foe');
    }
    var t = A.el('base-tag');
    if (t) t.textContent = (C.top ? '' : '상대 ') + KIND[kind].label + ' 공';
  }

  function pitch() {
    /* 새 공 = 새 타석. 앞 타석에서 치던 글자가 남아 있으면 안 된다.
       스트라이크·아웃·이닝 교대 어느 길로 왔든 여기를 반드시 거친다. */
    clearIn(C.lastWord);
    C.lastWord = '';

    /* 한 타석에 오타 한 번은 봐준다 — 타석이 바뀌면 그 기회도 새로 준다 (규칙 3) */
    C.miss = 0;
    C.grace = 0;

    /* 규칙 2 의 "2초~10초" 를 종류별 구간으로 쪼갰다 — 좋은 공일수록 빨리 지나간다 */
    var kind = pickKind();
    // 수비(상대 타구)는 더 빨리 온다 — 안 그러면 컴퓨터가 점수를 못 낸다
    var sec = C.top ? KIND[kind].sec : KIND[kind].dsec;
    C.fly = sec[0] + Math.random() * (sec[1] - sec[0]);
    /* 경기 첫 타석의 첫 공만 제일 느린 구간(8~10초)으로. 랜덤이라 첫 공이 2초로 오면
       아이가 낱말을 읽기도 전에 스트라이크였다. 범위(2~10초)는 기획서 그대로다. */
    if (C.firstPitch) {
      C.firstPitch = false;
      C.fly = 8 + Math.random() * 2;
    }
    C.t = 0;
    C.lane = 30 + Math.random() * 40;      // 수비 때 공이 떨어지는 자리
    var word = pickWord(C.fly, kind);      // 빠른 공일수록 · 홈런 공이면 더 짧은 낱말이 나온다

    var ballEl = A.el('base-ball');
    var wEl = A.el('base-word');
    wEl.className = 'base-word n' + Math.min(7, word.length);
    paintBall(kind);
    var it = {
      word: word, el: ballEl, wEl: wEl, hitKind: kind,
      lock: false, matched: 0, dead: false
    };
    C.ball = it;
    G.items = [it];       // 판정 상태(lock·matched)도 새 항목으로 갈아 끼운다
    C.phase = 'fly';
    showBall(true);
    moveBall(0);
    draw();
  }

  function showBall(on) {
    var b = A.el('base-ball');
    if (b) b.classList.toggle('on', !!on);
  }

  /** 공을 날린다 — 공격이면 마운드에서 홈으로, 수비면 하늘에서 글러브로 */
  function moveBall(p) {
    var b = A.el('base-ball');
    if (!b) return;
    var x, y, sc;
    if (C.top) {
      // 투수의 손(53, 29) 에서 홈플레이트(50, 78) 로
      x = 53 - 3 * p + Math.sin(p * 5) * 1.4;
      y = 29 + 49 * (p * p * 0.6 + p * 0.4);
      /* 처음부터 낱말이 읽혀야 한다 — 예전엔 0.58 배로 시작해 날아오는 내내 글씨가 작았다 */
      sc = 0.74 + 0.4 * p;
    } else {
      // 하늘에서 글러브의 포켓으로 떨어진다.
      // 글러브(left 42%, top 56%, 높이 56vh)의 포켓 한가운데가 경기장의 약 43%,64% —
      // 공 반지름만큼 위인 43%,61% 로 보내면 포켓 안에 얹힌 것처럼 보인다
      x = C.lane + (43 - C.lane) * p;
      y = -8 + 69 * p;
      sc = 0.66 + 0.46 * p;
    }
    b.style.left = x + '%';
    b.style.top = y + '%';
    b.style.setProperty('--sc', sc.toFixed(3));
  }

  /** 입력창을 비운다 — 값만 지우면 안 된다.
      한글 IME 는 입력창을 비운 뒤에 조합 중이던 글자를 뒤늦게 밀어 넣는다.
      그래서 "아" 까지만 치고 스트라이크로 넘어가면 다음 공에 "아" 가 남아 있었다.
      games.js 의 clearInput(직전낱말) 은 그 꼬리 글자를 0.7초간 걸러 내는 장치를 함께 건다.
      빨간 경고 테두리도 여기서 같이 지운다 (오답 뒤 새 공이 빨간 테두리로 시작했다). */
  function clearIn(word) {
    var el = A.el('gamein');
    /* 꼬리로 넘길 것은 "아이가 방금 친 글자" 다.
       낱말을 다 친 경우엔 그게 곧 낱말이고, "아" 까지만 치다 만 경우엔 "아" 다.
       낱말을 넘기면 치다 만 글자는 못 걸러 낸다 — 그게 이번 버그였다. */
    var typed = (el && el.value) || '';
    A.clearInput(typed || word || '');
    if (el) el.style.borderColor = '';
    if (G) G.wasBad = false;
  }

  /* =========================================================
     매 프레임
     ========================================================= */
  function step(dt) {
    if (!C || !G || G.over) return;

    if (C.phase === 'init') { half(true); return; }

    if (C.phase === 'wait') {
      C.wait -= dt;
      if (C.wait <= 0) afterWait();
      return;
    }

    if (C.phase !== 'fly') return;

    C.t += dt;
    var p = C.t / C.fly;
    if (p > 1) p = 1;
    moveBall(p);

    // 규칙 3 — 오답을 쓰면 스트라이크 (한/영 키가 영문 상태면 봐준다)
    if (C.grace > 0) C.grace -= dt;         // 봐준 직후엔 잠깐 안 잰다 (아래 warnTypo 설명)
    else if (C.ball && !C.ball.dead) {
      var v = A.el('gamein').value;
      if (v) {
        var j = HG.judge(C.ball.word, v);
        if (!j.ok && !j.engMode) { wrongInput(); return; }
      }
    }

    if (p >= 1) timeUp();
  }

  /* ---------- 오답 (규칙 3) ----------
     예전엔 한 글자만 틀려도 곧바로 스트라이크였다. 한/영 오류만 봐주고 한글 오타는
     안 봐줬는데, 3학년이 제일 많이 하는 게 바로 그 한글 오타다. 그래서 한 타석에 세 번
     치면 세 번 다 삼진이었다("초보가 아예 못 하는 게임" 1위).
     규칙 3(오답을 쓰면 스트라이크)은 지키되 한 타석에 한 번만 봐준다 —
     첫 오타는 입력창을 비우고 "다시!" 만 띄우고, 두 번째 오타부터 스트라이크다. */
  function wrongInput() {
    if (C.miss === 0) { warnTypo(); return; }
    /* 여기서 먼저 비우면 안 된다 — 아래 strike/concede 가 부르는 endBall() 이
       "방금 친 글자" 를 봐야 한글 조합 잔여 글자를 걸러 낼 수 있다 */
    if (C.top) strike('또 오답! 스트라이크');
    else concede('또 오답! 못 잡았어요');
  }

  /** 첫 오타 — 입력창만 비우고 "다시!" 를 띄운다. 공은 계속 날아온다. */
  function warnTypo() {
    C.miss = 1;
    A.sfx('bad');
    clearIn(C.lastWord);
    /* 비운 직후엔 한글 IME 가 조합 중이던 글자를 뒤늦게 밀어 넣는다.
       그 글자를 또 오답으로 세면 봐준 보람도 없이 바로 스트라이크가 된다.
       0.8초 동안은 재지 않는다 (games.js 의 꼬리 글자 필터가 도는 시간과 같다). */
    C.grace = 0.8;
    var el = A.el('base-again');
    if (el) {
      el.className = 'base-again';
      void el.offsetWidth;              // 애니메이션을 다시 처음부터 돌린다
      el.className = 'base-again on';
    }
  }

  /* ---------- 시간 초과 (규칙 3·5) ---------- */
  function timeUp() {
    if (C.top) strike('못 쳤어요! 스트라이크');
    else concede('공을 놓쳤어요!');
  }

  /* =========================================================
     공격 — 규칙 3·4
     ========================================================= */
  /** 틀렸을 때 화면이 한 번 흔들린다 — 손끝 말고 몸으로 오는 신호가 하나는 있어야 한다 */
  function shake() {
    var st = A.stage();
    if (!st) return;
    st.classList.remove('base-shake');
    void st.offsetWidth;
    st.classList.add('base-shake');
    setTimeout(function () { if (st) st.classList.remove('base-shake'); }, 460);
  }

  function strike(why) {
    endBall();
    A.breakCombo();
    A.sfx('bad');
    shake();
    C.strikes++;
    showBoard();
    if (C.strikes >= STRIKES) {
      banner('삼진 아웃', why + ' · 스트라이크 ' + STRIKES + '개', 'out');
      A.flashItem({ icon: '✖', name: '삼진 아웃!', color: '#ff6b81' });
      addOut();
    } else {
      banner('스트라이크 ' + C.strikes, why + (C.fly < 4 ? ' (빠른 공이었어요)' : ''), 'strike');
      wait(1.0);
    }
  }

  /** 낱말을 다 쳤을 때 — 공격이면 안타 판정, 수비면 아웃 판정 */
  function hit(item) {
    if (!C || !C.ball || item !== C.ball || C.phase !== 'fly') return;
    endBall();
    A.addScore(item.word);
    if (C.top) swing(item);
    else defOut(item);
  }

  /* 규칙 4 — 안타·2루타·3루타·홈런.
     주사위는 공을 던질 때(pickKind) 이미 굴렸다. 여기서는 그 공의 종류를 그대로 쓴다. */
  function swing(item) {
    var kind = item.hitKind || 'h1';
    var K = KIND[kind];
    var bases = K.bases, name = K.name, icon, color;
    if (kind === 'hr') { icon = '💥'; color = '#ffd166'; A.bump(100); }
    else { icon = '⚾'; color = '#6ee7a0'; }
    var got = advance(bases, true);
    C.strikes = 0;
    showBoard();
    banner(name, got > 0 ? (got + '점을 냈어요!') : ('“' + item.word + '” 를 쳤어요'),
      kind === 'hr' ? 'hr' : 'hit');
    if (kind === 'hr') {
      /* 이 게임 최고의 순간 — 스무 번에 한 번뿐이다(규칙 4). 여기만 큰 보상을 쓴다. */
      A.cheer({ icon: '💥', name: '홈런!', sub: '스무 번에 한 번' + (got > 1 ? ' · ' + got + '점' : ''), color: '#ffd166' });
    } else {
      A.sfx('hit');
      A.flashItem({ icon: icon, name: name + (got ? ' +' + got + '점' : ''), color: color });
    }
    swingBat();
    endPa(kind === 'hr' ? 1.9 : 1.35);
  }

  function swingBat() {
    var w = C.wrap;
    if (!w) return;
    w.classList.add('swing');
    setTimeout(function () { if (C.wrap) C.wrap.classList.remove('swing'); }, 520);
  }

  /* =========================================================
     수비 — 규칙 5
     ========================================================= */
  /* 맞히면 아웃 또는 fly out */
  function defOut(item) {
    var fly = Math.random() < 0.5;
    var sub = item.hitKind === 'hr' ? '홈런 공을 잡아냈어요!'
      : (fly ? '뜬공을 글러브로 잡았어요' : '“' + item.word + '” 를 잡아 아웃');
    banner(item.hitKind === 'hr' ? '홈런 저지!' : (fly ? 'fly out!' : '아웃!'), sub, 'out');
    A.sfx('hit');
    A.flashItem({ icon: '🧤', name: fly ? 'fly out! 잡았어요' : '아웃! 잘 잡았어요', color: '#6ee7a0' });
    catchPop();
    addOut();
  }

  /* 못 쓰면 상대가 안타·2루타·3루타·홈런 — 놓친 그 공에 적혀 있던 종류 그대로 */
  function concede(why) {
    var kind = (C.ball && C.ball.hitKind) || 'h1';
    endBall();
    A.breakCombo();
    A.sfx('bad');
    shake();
    var K = KIND[kind];
    var bases = K.bases, name = K.foe;
    var got = advance(bases, false);
    showBoard();
    banner(name, why + (got ? ' · ' + got + '점을 줬어요' : ''), 'bad');
    A.flashItem({ icon: '😣', name: name + (got ? ' -' + got + '점' : ''), color: '#ff6b81' });
    endPa(1.35);
  }

  function catchPop() {
    var g = A.el('base-glove');
    if (!g) return;
    g.classList.add('pop');
    setTimeout(function () { if (g) g.classList.remove('pop'); }, 480);
  }

  /* =========================================================
     주자 · 득점 · 아웃 (야구 규칙 그대로)
     ========================================================= */
  /* 베이스 자리 — 0 은 홈, 1·2·3 은 각 루. 야구장 SVG 의 베이스 좌표와 같다. */
  var BASEPOS = [
    { l: 50, t: 88 }, { l: 88, t: 52 }, { l: 50, t: 14 }, { l: 12, t: 52 }
  ];
  var RUN_SEG = 360;          // 한 베이스를 달리는 데 걸리는 시간(ms)

  function posOf(i) { return BASEPOS[i >= 4 ? 0 : i]; }

  /** 이번 타구로 누가 어디서 어디로 뛰는지 — C.bases 를 바꾸기 전에 뽑아 둔다 */
  function planRun(n) {
    var mv = [], i;
    for (i = 2; i >= 0; i--) {
      if (C.bases[i]) mv.push({ from: i + 1, to: Math.min(4, i + 1 + n) });
    }
    mv.push({ from: 0, to: Math.min(4, n) });      // 타자도 뛴다
    return mv;
  }

  /** 주자를 베이스 하나씩 달리게 한다. 달리는 동안 루에 서 있던 주자는 감춘다. */
  function runRunners(mv) {
    var lay = A.el('base-runlay');
    if (!lay || !mv.length) return;
    lay.innerHTML = '';
    C.wrap.classList.add('running');

    var longest = 0;
    mv.forEach(function (m) {
      var steps = m.to - m.from;
      if (steps <= 0) return;
      if (steps > longest) longest = steps;

      var el = document.createElement('div');
      el.className = 'base-run' + (C.top ? '' : ' foe');
      el.innerHTML = runnerSvg();
      var p0 = posOf(m.from);
      el.style.left = p0.l + '%';
      el.style.top = p0.t + '%';
      lay.appendChild(el);

      var at = m.from;
      var hop = function () {
        if (at >= m.to) {                       // 다 왔다
          if (m.to >= 4) el.classList.add('scored');   // 홈으로 들어온 주자
          setTimeout(function () { el.remove(); }, 160);
          return;
        }
        var was = posOf(at);
        at++;
        var p = posOf(at);
        el.classList.toggle('flip', p.l < was.l);      // 3루·홈 쪽으로 갈 땐 몸을 돌린다
        el.style.left = p.l + '%';
        el.style.top = p.t + '%';
        setTimeout(hop, RUN_SEG);
      };
      setTimeout(hop, 30);
    });

    // 다 뛰고 나면 루에 선 주자를 다시 보여 준다
    C.runTimer = setTimeout(function () {
      if (C.wrap) C.wrap.classList.remove('running');
      if (lay) lay.innerHTML = '';
    }, longest * RUN_SEG + 220);
  }

  function advance(n, mine) {
    var got = 0, i;
    runRunners(planRun(n));
    if (n >= 4) {
      for (i = 0; i < 3; i++) { if (C.bases[i]) got++; C.bases[i] = false; }
      got++;                                  // 타자까지 홈인
    } else {
      for (i = 2; i >= 0; i--) {
        if (!C.bases[i]) continue;
        C.bases[i] = false;
        var to = i + n;
        if (to >= 3) got++;
        else C.bases[to] = true;
      }
      C.bases[n - 1] = true;                  // 타자가 밟은 베이스
    }
    if (mine) C.run.me += got; else C.run.cpu += got;
    return got;
  }

  function addOut() {
    endBall();
    C.outs++;
    C.outsDone++;
    C.strikes = 0;
    showBoard();
    A.progress(C.outsDone / (INNINGS * 2 * OUTS));
    endPa(1.4);
  }

  /** 한 타석이 끝났다 — 아웃 3개거나 타석 6번을 채웠으면 공수 교대 */
  function endPa(sec) {
    C.pa++;
    C.strikes = 0;
    showBoard();
    if (C.outs >= OUTS || C.pa >= MAX_PA) wait(sec + 0.2, 'half');
    else wait(sec);
  }

  function endBall() {
    if (C.ball) { C.lastWord = C.ball.word; C.ball.dead = true; }
    C.ball = null;
    G.items = [];
    C.phase = 'anim';
    showBall(false);
    clearIn(C.lastWord);      // 타석이 끝나는 즉시 한 번, 다음 공에서 한 번 더 비운다
  }

  function wait(sec, next) {
    C.phase = 'wait';
    C.wait = sec;
    C.next = next || 'pitch';
  }
  function afterWait() {
    hideBanner();
    if (C.next === 'half') half(false);
    else pitch();
  }

  /* =========================================================
     이닝 (초 = 우리 공격 / 말 = 우리 수비)
     ========================================================= */
  function half(first) {
    if (!first) {
      if (C.top) { C.top = false; }
      else { C.top = true; C.inning++; }
    }
    C.outs = 0; C.strikes = 0; C.pa = 0;
    C.bases = [false, false, false];

    // 경기 끝났는지
    if (C.inning > INNINGS) {
      if (C.run.me !== C.run.cpu) { finish(); return; }
      if (C.inning > MAX_INNINGS) { finish(); return; }      // 무승부
    }

    C.wrap.classList.toggle('attack', C.top);
    C.wrap.classList.toggle('defense', !C.top);
    showBoard();

    var t = C.inning + '회' + (C.top ? '초' : '말');
    var s = C.top ? '우리 ' + TEAM[C.mine].name + ' 공격' : '우리 ' + TEAM[C.mine].name + ' 수비';
    halfTitle(t, s, C.inning > INNINGS ? '연장전' : '');
    C.phase = 'wait';
    C.wait = 1.7;
    C.next = 'pitch';
  }

  function halfTitle(t, s, extra) {
    var el = A.el('base-half');
    if (!el) return;
    el.innerHTML = '<b>' + A.esc(t) + '</b><span>' + A.esc(s) + '</span>' +
      (extra ? '<em>' + A.esc(extra) + '</em>' : '');
    el.className = 'base-half on';
    setTimeout(function () {
      var e = A.el('base-half');
      if (e) e.className = 'base-half';
    }, 1500);
  }

  function finish() {
    var me = C.run.me, you = C.run.cpu;
    var msg;
    if (me > you) msg = '🏆 ' + TEAM[C.mine].name + ' 승리! ' + me + ' : ' + you;
    else if (me < you) msg = '😢 ' + TEAM[C.cpu].name + ' 에게 졌어요 ' + me + ' : ' + you;
    else msg = '🤝 무승부 ' + me + ' : ' + you;
    A.progress(1);
    A.gameOver(msg, me > you);
  }

  /* =========================================================
     스코어보드 · 배너
     ========================================================= */
  function showBoard() {
    var w = C.run[C.mine === 'white' ? 'me' : 'cpu'];
    var b = C.run[C.mine === 'blue' ? 'me' : 'cpu'];
    txt('base-bd-white', w);
    txt('base-bd-blue', b);
    txt('base-sb-me', C.run.me);
    txt('base-sb-you', C.run.cpu);
    txt('base-inn-no', C.inning);
    txt('base-inn-ar', C.top ? '▲' : '▼');
    txt('base-pa', '타석 ' + Math.min(MAX_PA, C.pa + 1) + '/' + MAX_PA);

    var i;
    for (i = 1; i <= 3; i++) {
      cls('base-d' + i, 'on', C.bases[i - 1]);
      cls('base-o' + i, 'on', C.outs >= i);
      cls('base-s' + i, 'on', C.strikes >= i);
    }
    var bd = C.wrap.querySelector('.base-board');
    if (bd) {
      bd.classList.toggle('mine-white', C.mine === 'white');
      bd.classList.toggle('mine-blue', C.mine === 'blue');
    }
    // 그라운드 위의 주자 — 공격이면 우리 팀 색, 수비면 상대 팀 색으로 갈아입는다
    for (i = 1; i <= 3; i++) {
      cls('base-r' + i, 'on', C.bases[i - 1]);
      cls('base-r' + i, 'foe', !C.top);
    }
  }
  function txt(id, v) { var e = A.el(id); if (e) e.textContent = v; }
  function cls(id, c, on) { var e = A.el(id); if (e) e.classList.toggle(c, !!on); }

  function banner(big, sub, kind) {
    var el = A.el('base-banner');
    if (!el) return;
    el.innerHTML = '<b>' + A.esc(big) + '</b><span>' + A.esc(sub) + '</span>';
    el.className = 'base-banner on ' + kind;
  }
  function hideBanner() {
    var el = A.el('base-banner');
    if (el) el.className = 'base-banner';
  }

  /* ---------- 낱말 표시 갱신 ---------- */
  function draw() {
    if (!C || !C.ball) return;
    C.ball.wEl.innerHTML = A.wordHtml(C.ball);
    var b = A.el('base-ball');
    if (b) b.classList.toggle('lock', !!C.ball.lock);
  }

  GAMES.register('base', {
    name: '야구게임', credit: '해산물 연합팀', icon: '⚾',
    desc: '청팀과 백팀으로 나뉘어 야구를 해요. 공에 적힌 낱말을 치면 안타, 못 치면 스트라이크! 홈런은 스무 번에 한 번.',
    pdf: 'game_vibe/20260818105044.pdf',
    start: start, step: step, hit: hit, draw: draw
  });
})();
